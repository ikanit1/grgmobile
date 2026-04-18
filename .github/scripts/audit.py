#!/usr/bin/env python3
"""
GRG Mobile — automated repository audit script.
Analyses changed files and builds a structured report.
"""
import os
import sys
import re
import subprocess
import json
import http.client
import urllib.parse
from pathlib import Path
from typing import Optional

# ── helpers ────────────────────────────────────────────────────────────────────

def run(cmd: list[str], cwd: str = ".") -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.stdout.strip()


def read_file(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def get_changed_files(base_sha: str, head_sha: str) -> list[str]:
    raw = run(["git", "diff", "--name-only", base_sha, head_sha])
    return [f for f in raw.splitlines() if f.strip()]


def get_file_diff(path: str, base_sha: str, head_sha: str) -> str:
    return run(["git", "diff", base_sha, head_sha, "--", path])

# ── categorisation ─────────────────────────────────────────────────────────────

def classify(files: list[str]) -> dict[str, list[str]]:
    cats: dict[str, list[str]] = {
        "backend": [],
        "flutter": [],
        "streaming": [],
        "ci": [],
        "docs": [],
        "other": [],
    }
    for f in files:
        if re.search(r"^backend/", f):
            cats["backend"].append(f)
        if re.search(r"^lib/|^test/|pubspec|\.dart$", f):
            cats["flutter"].append(f)
        if re.search(r"go2rtc|rtsp|stream|live[-_]?url|hls", f, re.I):
            cats["streaming"].append(f)
        if re.search(r"^\.github/", f):
            cats["ci"].append(f)
        if re.search(r"\.(md|pdf|html|txt)$", f, re.I):
            cats["docs"].append(f)
        if f not in (
            cats["backend"] + cats["flutter"] + cats["streaming"] + cats["ci"] + cats["docs"]
        ):
            cats["other"].append(f)
    return cats

# ── backend checks ─────────────────────────────────────────────────────────────

MIGRATION_PATTERNS = [
    r"CREATE TABLE",
    r"ALTER TABLE",
    r"DROP TABLE",
    r"ADD COLUMN",
    r"DROP COLUMN",
    r"CREATE INDEX",
    r"migrations/",
    r"\.migration\.ts$",
    r"migrate-",
]

CREDENTIAL_RISK = [
    r"password\s*=\s*['\"][^'\"]{4,}",
    r"secret\s*=\s*['\"][^'\"]{4,}",
    r"apiKey\s*=\s*['\"][^'\"]{4,}",
]

ERROR_HANDLING_PATTERNS = [
    r"try\s*\{",
    r"catch\s*\(",
    r"\.catch\(",
    r"HttpException",
    r"@Catch",
    r"throw new",
]


def check_backend(files: list[str], base_sha: str, head_sha: str) -> dict:
    issues: list[str] = []
    info: list[str] = []
    migrations_found: list[str] = []
    schema_changes: list[str] = []

    for f in files:
        diff = get_file_diff(f, base_sha, head_sha)
        content = read_file(f)

        # Migration / schema detection
        for p in MIGRATION_PATTERNS:
            if re.search(p, f + "\n" + diff, re.I):
                migrations_found.append(f)
                break

        # Entity / schema files
        if re.search(r"\.entity\.ts$|schema\.ts$", f):
            schema_changes.append(f)

        # Hardcoded credentials in diff additions
        added_lines = "\n".join(l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for p in CREDENTIAL_RISK:
            if re.search(p, added_lines, re.I):
                issues.append(f"⚠️ Возможные хардкод-credentials в `{f}`")
                break

        # Module imports: new service injection without module import
        if re.search(r"providers.*Service|inject.*Service", diff, re.I):
            info.append(f"ℹ️ Изменения в инжекции сервисов: `{f}` — проверь app.module.ts")

        # Missing error handling in controllers
        if re.search(r"@Controller|@Get|@Post|@Put|@Delete", content):
            added_methods = re.findall(r"\+\s*async\s+\w+\(", diff)
            if added_methods:
                has_error_handling = any(re.search(p, diff) for p in ERROR_HANDLING_PATTERNS)
                if not has_error_handling:
                    issues.append(f"⚠️ Новые методы в контроллере без try/catch: `{f}`")

        # synchronize:true in production config
        if re.search(r"synchronize\s*:\s*true", added_lines):
            issues.append(f"🔴 КРИТИЧНО: `synchronize: true` в `{f}` — опасно для prod-БД!")

    if migrations_found:
        info.append(f"📋 Миграции/DDL изменены: {', '.join(set(migrations_found))}")
    if schema_changes:
        info.append(f"🗂 Схемы сущностей изменены: {', '.join(schema_changes)}")

    return {"issues": issues, "info": info}


# ── flutter checks ─────────────────────────────────────────────────────────────

SCREEN_DIR = r"^lib/screens/"
WIDGET_DIR = r"^lib/widgets/"
SERVICE_DIR = r"^lib/services/"
API_DIR = r"^lib/api/"

FLUTTER_ISSUES_PATTERNS = [
    (r"http\.get\(|http\.post\(|dio\.get\(|dio\.post\(", "Прямой HTTP-вызов вне BackendClient"),
    (r"print\(", "print() вместо логгера"),
    (r"TODO|FIXME|HACK", "Незакрытые TODO/FIXME/HACK"),
]


def check_flutter(files: list[str], base_sha: str, head_sha: str) -> dict:
    issues: list[str] = []
    info: list[str] = []

    new_screens = [f for f in files if re.search(SCREEN_DIR, f)]
    new_widgets = [f for f in files if re.search(WIDGET_DIR, f)]
    changed_api = [f for f in files if re.search(API_DIR, f)]
    changed_services = [f for f in files if re.search(SERVICE_DIR, f)]

    if new_screens:
        info.append(f"📱 Новые/изменённые экраны: {', '.join(new_screens)}")
    if new_widgets:
        info.append(f"🧩 Виджеты изменены: {', '.join(new_widgets)}")
    if changed_api:
        info.append(f"🌐 API-клиент изменён: {', '.join(changed_api)}")
    if changed_services:
        info.append(f"⚙️ Сервисы изменены: {', '.join(changed_services)}")

    for f in files:
        diff = get_file_diff(f, base_sha, head_sha)
        added = "\n".join(l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for pattern, description in FLUTTER_ISSUES_PATTERNS:
            if re.search(pattern, added, re.I):
                issues.append(f"⚠️ {description}: `{f}`")

        # pubspec: new dependency
        if f == "pubspec.yaml":
            new_deps = re.findall(r"^\+\s+(\w[\w_-]+):", diff, re.M)
            if new_deps:
                info.append(f"📦 Новые зависимости в pubspec: {', '.join(new_deps)}")

    return {"issues": issues, "info": info}


# ── streaming checks ───────────────────────────────────────────────────────────

STREAM_ERROR_REQUIRED = [
    r"try\s*\{",
    r"catch\s*\(",
    r"\.catch\(",
    r"onError",
    r"HttpException",
    r"throw",
]


def check_streaming(files: list[str], base_sha: str, head_sha: str) -> dict:
    issues: list[str] = []
    info: list[str] = []

    for f in files:
        diff = get_file_diff(f, base_sha, head_sha)
        content = read_file(f)
        added = "\n".join(l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))

        # New endpoint methods
        new_endpoints = re.findall(r"@(Get|Post|Put)\(['\"]([^'\"]*(?:stream|live|rtsp|hls|go2rtc)[^'\"]*)['\"]", content, re.I)
        if new_endpoints:
            info.append(f"🎥 Стриминг-эндпоинт в `{f}`: {new_endpoints}")

        # go2rtc URL construction – check for error handling
        if re.search(r"go2rtc|rtsp://|\.m3u8|live-url|liveUrl", added, re.I):
            has_error = any(re.search(p, diff) for p in STREAM_ERROR_REQUIRED)
            if not has_error:
                issues.append(f"🔴 Стриминг-код без обработки ошибок: `{f}`")

        # Unvalidated user input in URL
        if re.search(r"req\.params\.|req\.query\.|@Param\(|@Query\(", added):
            if re.search(r"rtsp://|go2rtc|stream", added, re.I):
                issues.append(f"⚠️ Пользовательский ввод в стриминг-URL без валидации: `{f}`")

    return {"issues": issues, "info": info}


# ── report builder ─────────────────────────────────────────────────────────────

def build_report(
    event_name: str,
    ref: str,
    actor: str,
    commit_msg: str,
    files: list[str],
    cats: dict,
    results: dict,
) -> str:
    event_icon = "🔀" if "pull_request" in event_name else "📤"
    lines = [
        f"{event_icon} *GRG Mobile — Аудит репозитория*",
        f"Событие: `{event_name}` | Ветка/PR: `{ref}`",
        f"Автор: `{actor}`",
        f"Коммит: _{commit_msg[:80]}_",
        f"Изменено файлов: *{len(files)}*",
        "",
    ]

    # Summary per category
    cat_labels = {
        "backend": "🗄 Backend (NestJS)",
        "flutter": "📱 Flutter",
        "streaming": "🎥 Стриминг (go2rtc)",
        "ci": "⚙️ CI/CD",
        "docs": "📄 Документация",
        "other": "📁 Прочее",
    }
    for cat, label in cat_labels.items():
        if cats.get(cat):
            lines.append(f"{label}: {len(cats[cat])} файл(ов)")

    lines.append("")

    # Findings per domain
    all_issues: list[str] = []
    all_info: list[str] = []
    for domain in ("backend", "flutter", "streaming"):
        r = results.get(domain, {})
        all_issues.extend(r.get("issues", []))
        all_info.extend(r.get("info", []))

    if all_issues:
        lines.append("*🚨 Обнаруженные проблемы:*")
        lines.extend(all_issues)
        lines.append("")

    if all_info:
        lines.append("*ℹ️ Информация об изменениях:*")
        lines.extend(all_info)
        lines.append("")

    if not all_issues and not all_info:
        lines.append("✅ Критических проблем не обнаружено.")
    elif not all_issues:
        lines.append("✅ Критических проблем не обнаружено.")
    else:
        lines.append(f"*Итог:* найдено {len(all_issues)} проблем(а/ы), требующих внимания.")

    return "\n".join(lines)


# ── telegram sender ────────────────────────────────────────────────────────────

def send_telegram(token: str, chat_id: str, text: str) -> bool:
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }).encode("utf-8")

    conn = http.client.HTTPSConnection("api.telegram.org")
    conn.request(
        "POST",
        f"/bot{token}/sendMessage",
        body=payload,
        headers={"Content-Type": "application/json"},
    )
    resp = conn.getresponse()
    body = resp.read().decode()
    conn.close()

    if resp.status != 200:
        print(f"Telegram error {resp.status}: {body}", file=sys.stderr)
        return False
    return True


# ── entrypoint ─────────────────────────────────────────────────────────────────

def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    base_sha = os.environ.get("BASE_SHA", "HEAD~1")
    head_sha = os.environ.get("HEAD_SHA", "HEAD")
    event_name = os.environ.get("GITHUB_EVENT_NAME", "push")
    ref = os.environ.get("GITHUB_REF_NAME", "unknown")
    actor = os.environ.get("GITHUB_ACTOR", "unknown")
    commit_msg = os.environ.get("COMMIT_MESSAGE", "")

    if not token or not chat_id:
        print("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set", file=sys.stderr)
        sys.exit(1)

    files = get_changed_files(base_sha, head_sha)
    if not files:
        print("No changed files detected.")
        return

    cats = classify(files)

    results = {
        "backend": check_backend(cats["backend"], base_sha, head_sha) if cats["backend"] else {},
        "flutter": check_flutter(cats["flutter"], base_sha, head_sha) if cats["flutter"] else {},
        "streaming": check_streaming(cats["streaming"], base_sha, head_sha) if cats["streaming"] else {},
    }

    report = build_report(event_name, ref, actor, commit_msg, files, cats, results)
    print("=== REPORT ===")
    print(report)

    ok = send_telegram(token, chat_id, report)
    if not ok:
        sys.exit(1)
    print("Report sent to Telegram.")


if __name__ == "__main__":
    main()
