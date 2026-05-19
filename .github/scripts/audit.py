#!/usr/bin/env python3
"""
Auto-audit script for GRG Mobile repository.
Analyzes changed files and generates a report for Telegram.
"""

import os
import sys
import json
import re
import subprocess
from pathlib import Path
from typing import List, Dict, Tuple

REPO_ROOT = Path(os.environ.get("GITHUB_WORKSPACE", "."))

EVENT_NAME = os.environ.get("GITHUB_EVENT_NAME", "push")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
REF = os.environ.get("GITHUB_REF_NAME", "")
SHA = os.environ.get("GITHUB_SHA", "")[:8]
ACTOR = os.environ.get("GITHUB_ACTOR", "unknown")
PR_NUMBER = os.environ.get("PR_NUMBER", "")
PR_TITLE = os.environ.get("PR_TITLE", "")

CHANGED_FILES_PATH = Path("changed_files.txt")


def get_changed_files() -> List[str]:
    if CHANGED_FILES_PATH.exists():
        return [
            f.strip()
            for f in CHANGED_FILES_PATH.read_text().splitlines()
            if f.strip()
        ]
    return []


def categorize_files(files: List[str]) -> Dict[str, List[str]]:
    cats: Dict[str, List[str]] = {
        "backend": [],
        "flutter": [],
        "go2rtc": [],
        "migrations": [],
        "entities": [],
        "ci": [],
        "other": [],
    }
    for f in files:
        fl = f.lower()
        if f.startswith("backend/"):
            cats["backend"].append(f)
            if re.search(r"migration|migrate|\.sql", fl):
                cats["migrations"].append(f)
            if re.search(r"\.entity\.ts$", fl):
                cats["entities"].append(f)
        elif f.startswith("lib/") or f.startswith("test/") or fl in ("pubspec.yaml", "pubspec.lock", "analysis_options.yaml"):
            cats["flutter"].append(f)
        elif re.search(r"go2rtc|stream|rtsp|webrtc|hls", fl):
            cats["go2rtc"].append(f)
        elif f.startswith(".github/"):
            cats["ci"].append(f)
        else:
            cats["other"].append(f)
    return cats


def read_file_safe(path: str) -> str:
    try:
        return (REPO_ROOT / path).read_text(errors="replace")
    except Exception:
        return ""


# ─── Backend checks ────────────────────────────────────────────────────────────

def check_migration_files(files: List[str]) -> List[str]:
    issues = []
    for f in files:
        content = read_file_safe(f)
        if not content:
            continue
        if re.search(r"DROP\s+TABLE|TRUNCATE", content, re.IGNORECASE):
            issues.append(f"⚠️ <b>{f}</b>: содержит DROP/TRUNCATE — проверьте перед применением")
        if "ALTER TABLE" in content.upper() and "NOT NULL" in content.upper() and "DEFAULT" not in content.upper():
            issues.append(f"⚠️ <b>{f}</b>: NOT NULL без DEFAULT может сломать существующие строки")
        if not re.search(r"(up|down|revert|rollback)", content, re.IGNORECASE):
            issues.append(f"ℹ️ <b>{f}</b>: не найден rollback-блок (down migration)")
    return issues


def check_entity_files(files: List[str]) -> List[str]:
    issues = []
    for f in files:
        content = read_file_safe(f)
        if not content:
            continue
        if "@Column(" in content and "nullable" not in content and "default" not in content:
            pass
        if re.search(r"@Column\(\s*\)\s*\n\s*\w+\s*:", content):
            issues.append(f"ℹ️ <b>{f}</b>: новые @Column без явного типа — TypeORM может вывести тип неправильно")
        if "@ManyToMany" in content and "JoinTable" not in content:
            issues.append(f"⚠️ <b>{f}</b>: @ManyToMany без @JoinTable на одной стороне")
        if re.search(r"synchronize\s*[:=]\s*true", content):
            issues.append(f"⚠️ <b>{f}</b>: synchronize:true в entity/config — не использовать в продакшене")
    return issues


def check_backend_files(files: List[str]) -> List[str]:
    issues = []
    for f in files:
        content = read_file_safe(f)
        if not content:
            continue
        if re.search(r"(password|secret|token|key)\s*[:=]\s*['\"][^'\"]{6,}['\"]", content, re.IGNORECASE):
            if not re.search(r"(process\.env|\.env|example|test|mock|placeholder|your_)", content, re.IGNORECASE):
                issues.append(f"🔴 <b>{f}</b>: возможная утечка секрета/пароля в коде")
        if re.search(r"findAll\(|find\(\{", content) and "@Req()" not in content and "AccessService" not in content:
            if re.search(r"@Get\(|@Post\(|@Put\(|@Delete\(|@Patch\(", content):
                issues.append(f"ℹ️ <b>{f}</b>: контроллер с query без явной проверки AccessService")
        if "UnknownDependenciesException" in content:
            issues.append(f"⚠️ <b>{f}</b>: упоминание UnknownDependenciesException — возможно незакрытая зависимость")
        new_providers = re.findall(r"providers:\s*\[([^\]]+)\]", content)
        new_imports_mod = re.findall(r"imports:\s*\[([^\]]+)\]", content)
        if new_providers and not new_imports_mod:
            pass
        if re.search(r"\.query\([^,)]*\$\{", content):
            issues.append(f"🔴 <b>{f}</b>: возможная SQL-инъекция через template literal в query()")
        if re.search(r"res\.json\(|res\.send\(", content) and "XSS" not in content:
            pass
    return issues


# ─── Flutter checks ─────────────────────────────────────────────────────────────

def check_flutter_files(files: List[str]) -> List[str]:
    issues = []
    known_dirs = {"api", "models", "screens", "services", "theme", "widgets"}
    for f in files:
        content = read_file_safe(f)
        if not content:
            continue
        parts = Path(f).parts
        if len(parts) >= 3 and parts[0] == "lib":
            top_dir = parts[1]
            if top_dir not in known_dirs and not f.endswith("main.dart"):
                issues.append(f"ℹ️ <b>{f}</b>: файл в незнакомой директории lib/{top_dir}/ — проверьте структуру")
        if "http.get(" in content or "http.post(" in content:
            if "BackendClient" not in content and "backend_client" not in content:
                issues.append(f"ℹ️ <b>{f}</b>: прямой HTTP-вызов без BackendClient — нарушение архитектуры")
        if re.search(r"catch\s*\(\w+\)\s*\{\s*\}", content):
            issues.append(f"ℹ️ <b>{f}</b>: пустой catch-блок — ошибки могут потеряться")
        if "print(" in content and "debugPrint(" not in content:
            issues.append(f"ℹ️ <b>{f}</b>: использование print() вместо debugPrint()")
        if re.search(r"(password|token|secret)\s*=\s*['\"][^'\"]{4,}['\"]", content, re.IGNORECASE):
            issues.append(f"🔴 <b>{f}</b>: возможный хардкод секрета в Dart-коде")
    return issues


# ─── go2rtc / streaming checks ──────────────────────────────────────────────────

def check_go2rtc_files(files: List[str]) -> List[str]:
    issues = []
    for f in files:
        content = read_file_safe(f)
        if not content:
            continue
        if re.search(r"go2rtc|rtsp|webrtc|hls", content, re.IGNORECASE):
            if not re.search(r"try\s*\{|\.catch\(|error\s*handler|onError|catch\s*\(", content, re.IGNORECASE):
                issues.append(f"⚠️ <b>{f}</b>: стриминг-код без явной обработки ошибок")
            if re.search(r"(rtsp|rtmp)://[^\s'\"]+", content):
                url_match = re.search(r"(rtsp|rtmp)://[^\s'\"]+", content)
                if url_match:
                    url = url_match.group(0)
                    if re.search(r":[^@/]+@", url):
                        issues.append(f"⚠️ <b>{f}</b>: RTSP URL содержит credentials в plaintext")
            if "timeout" not in content.lower():
                issues.append(f"ℹ️ <b>{f}</b>: нет таймаута для стримингового соединения")
    return issues


# ─── Report builder ─────────────────────────────────────────────────────────────

def build_report(
    files: List[str],
    cats: Dict[str, List[str]],
    issues: List[str],
) -> str:
    lines = []

    event_emoji = "🔀" if EVENT_NAME == "pull_request" else "🚀"
    if EVENT_NAME == "pull_request":
        header = f"{event_emoji} <b>Аудит PR #{PR_NUMBER}</b>"
        if PR_TITLE:
            header += f"\n📝 {PR_TITLE}"
    else:
        header = f"{event_emoji} <b>Аудит push</b>"

    lines.append(header)
    lines.append(f"📦 <code>{REPO}</code> → <code>{REF}</code> ({SHA})")
    lines.append(f"👤 Автор: <b>{ACTOR}</b>")
    lines.append("")

    if not files:
        lines.append("ℹ️ Изменённых файлов не обнаружено.")
        return "\n".join(lines)

    lines.append(f"📋 <b>Изменено файлов: {len(files)}</b>")

    if cats["backend"]:
        lines.append(f"\n🖥 <b>Backend (NestJS) — {len(cats['backend'])} файл(ов):</b>")
        for f in cats["backend"][:10]:
            lines.append(f"  • <code>{f}</code>")
        if len(cats["backend"]) > 10:
            lines.append(f"  … и ещё {len(cats['backend']) - 10}")

    if cats["flutter"]:
        lines.append(f"\n📱 <b>Flutter — {len(cats['flutter'])} файл(ов):</b>")
        for f in cats["flutter"][:10]:
            lines.append(f"  • <code>{f}</code>")
        if len(cats["flutter"]) > 10:
            lines.append(f"  … и ещё {len(cats['flutter']) - 10}")

    if cats["go2rtc"]:
        lines.append(f"\n🎥 <b>Стриминг (go2rtc/RTSP) — {len(cats['go2rtc'])} файл(ов):</b>")
        for f in cats["go2rtc"]:
            lines.append(f"  • <code>{f}</code>")

    if cats["other"]:
        lines.append(f"\n📁 <b>Прочие файлы — {len(cats['other'])}:</b>")
        for f in cats["other"][:5]:
            lines.append(f"  • <code>{f}</code>")
        if len(cats["other"]) > 5:
            lines.append(f"  … и ещё {len(cats['other']) - 5}")

    lines.append("")
    if issues:
        lines.append(f"🔍 <b>Найдено замечаний: {len(issues)}</b>")
        critical = [i for i in issues if i.startswith("🔴")]
        warnings = [i for i in issues if i.startswith("⚠️")]
        info = [i for i in issues if i.startswith("ℹ️")]

        if critical:
            lines.append("\n🔴 <b>Критические:</b>")
            for i in critical:
                lines.append(f"  {i}")
        if warnings:
            lines.append("\n⚠️ <b>Предупреждения:</b>")
            for i in warnings:
                lines.append(f"  {i}")
        if info:
            lines.append("\nℹ️ <b>Информационные:</b>")
            for i in info[:5]:
                lines.append(f"  {i}")
            if len(info) > 5:
                lines.append(f"  … и ещё {len(info) - 5}")
    else:
        lines.append("✅ <b>Критических замечаний не обнаружено</b>")

    lines.append("")
    if cats["migrations"] or cats["entities"]:
        lines.append("🗄 <b>Схема БД:</b>")
        if cats["migrations"]:
            lines.append(f"  • Миграции: {len(cats['migrations'])} файл(ов)")
        if cats["entities"]:
            lines.append(f"  • Entities: {len(cats['entities'])} файл(ов)")
        db_issues = [i for i in issues if any(f in i for f in cats["migrations"] + cats["entities"])]
        if db_issues:
            lines.append("  ⚠️ Требуется ручная проверка миграций")
        else:
            lines.append("  ✅ Явных проблем не выявлено")

    lines.append("")
    arch_ok = True
    arch_notes = []
    http_violations = [i for i in issues if "BackendClient" in i]
    sql_injections = [i for i in issues if "SQL-инъекция" in i]
    secrets_leak = [i for i in issues if "секрет" in i.lower() or "утечка" in i.lower()]

    if sql_injections or secrets_leak:
        arch_ok = False
        arch_notes.append("🔴 Обнаружены критические нарушения безопасности")
    if http_violations:
        arch_ok = False
        arch_notes.append("⚠️ Прямые HTTP-вызовы без BackendClient")

    if arch_ok and not arch_notes:
        lines.append("🏗 <b>Архитектура:</b> ✅ Изменения соответствуют структуре проекта")
    else:
        lines.append("🏗 <b>Архитектура:</b> ⚠️ Есть отклонения:")
        for n in arch_notes:
            lines.append(f"  {n}")

    return "\n".join(lines)


def main():
    files = get_changed_files()
    cats = categorize_files(files)

    issues: List[str] = []
    issues += check_migration_files(cats["migrations"])
    issues += check_entity_files(cats["entities"])
    issues += check_backend_files(cats["backend"])
    issues += check_flutter_files(cats["flutter"])
    issues += check_go2rtc_files(cats["go2rtc"] + [
        f for f in cats["backend"] + cats["flutter"]
        if re.search(r"go2rtc|stream|rtsp", f.lower())
    ])

    report = build_report(files, cats, issues)

    print(report)

    output_path = Path("audit_report.txt")
    output_path.write_text(report, encoding="utf-8")

    if len(report) > 4000:
        report = report[:3900] + "\n\n…(отчёт обрезан, см. Actions)"

    sys.exit(0)


if __name__ == "__main__":
    main()
