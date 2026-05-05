#!/usr/bin/env python3
"""
Automated repository audit script for GRG Mobile.
Analyzes changed files, checks for common issues, sends report to Telegram.
Usage: python audit.py <event_name> <ref> <commit_sha> <actor>
"""

import os
import sys
import subprocess
import requests
import json
import re
from pathlib import Path

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "unknown/repo")
RUN_URL = os.environ.get("GITHUB_SERVER_URL", "https://github.com") + "/" + REPO + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", "0")


def get_changed_files(base_sha: str, head_sha: str) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", f"{base_sha}..{head_sha}"],
            capture_output=True, text=True, check=True
        )
        return [f for f in result.stdout.strip().split("\n") if f]
    except Exception:
        # Fallback: diff against parent commit
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
                capture_output=True, text=True, check=True
            )
            return [f for f in result.stdout.strip().split("\n") if f]
        except Exception:
            return []


def categorize_files(files: list[str]) -> dict:
    cats = {
        "backend_entities": [],
        "backend_migrations": [],
        "backend_controllers": [],
        "backend_services": [],
        "backend_modules": [],
        "backend_go2rtc": [],
        "backend_vendors": [],
        "backend_other": [],
        "flutter_screens": [],
        "flutter_widgets": [],
        "flutter_services": [],
        "flutter_other": [],
        "docs": [],
        "ci": [],
        "other": [],
    }
    for f in files:
        if f.startswith(".github/"):
            cats["ci"].append(f)
        elif f.startswith("backend/src/vendors/go2rtc/"):
            cats["backend_go2rtc"].append(f)
        elif f.startswith("backend/src/vendors/"):
            cats["backend_vendors"].append(f)
        elif "entity.ts" in f or "entities/" in f:
            cats["backend_entities"].append(f)
        elif "migration" in f.lower() and f.startswith("backend/"):
            cats["backend_migrations"].append(f)
        elif f.endswith(".controller.ts"):
            cats["backend_controllers"].append(f)
        elif f.endswith(".service.ts"):
            cats["backend_services"].append(f)
        elif f.endswith(".module.ts") or f == "backend/src/app.module.ts":
            cats["backend_modules"].append(f)
        elif f.startswith("backend/"):
            cats["backend_other"].append(f)
        elif f.startswith("lib/screens/"):
            cats["flutter_screens"].append(f)
        elif f.startswith("lib/widgets/"):
            cats["flutter_widgets"].append(f)
        elif f.startswith("lib/services/"):
            cats["flutter_services"].append(f)
        elif f.startswith("lib/"):
            cats["flutter_other"].append(f)
        elif f.startswith("docs/") or f.endswith(".md"):
            cats["docs"].append(f)
        else:
            cats["other"].append(f)
    return {k: v for k, v in cats.items() if v}


def check_entity_without_migration(entities: list[str], migrations: list[str]) -> list[str]:
    if entities and not migrations:
        return entities
    return []


def check_go2rtc_error_handling(go2rtc_files: list[str]) -> list[str]:
    issues = []
    for f in go2rtc_files:
        if not Path(f).exists():
            continue
        content = Path(f).read_text(errors="ignore")
        # Check if try/catch present for HTTP calls
        if ("await firstValueFrom" in content or "this.http." in content) and "catch" not in content:
            issues.append(f"{f}: HTTP calls without catch block")
        # Check if error is logged
        if "catch" in content and "logger" not in content.lower() and "console" not in content:
            issues.append(f"{f}: errors caught but not logged")
    return issues


def check_controllers_guards(controllers: list[str]) -> list[str]:
    issues = []
    for f in controllers:
        if not Path(f).exists():
            continue
        content = Path(f).read_text(errors="ignore")
        # Each controller should have JwtAuthGuard or be explicitly public
        if "@Controller" in content and "@UseGuards(JwtAuthGuard)" not in content and "@Public()" not in content:
            # Check class-level guard
            if "UseGuards" not in content:
                issues.append(f"{f}: controller may lack JWT auth guard")
    return issues


def check_flutter_null_safety(screens: list[str]) -> list[str]:
    issues = []
    for f in screens:
        if not Path(f).exists():
            continue
        content = Path(f).read_text(errors="ignore")
        # Look for force-unwrap patterns that could crash
        risky = re.findall(r'\w+!\.\w+', content)
        if len(risky) > 5:
            issues.append(f"{f}: {len(risky)} forced null unwraps (!.) — review for NPE risk")
    return issues


def check_credentials_exposure(files: list[str]) -> list[str]:
    issues = []
    sensitive_patterns = [
        (r'password\s*=\s*["\'][^"\']{4,}["\']', "hardcoded password"),
        (r'secret\s*=\s*["\'][^"\']{8,}["\']', "hardcoded secret"),
        (r'token\s*=\s*["\'][A-Za-z0-9_\-]{20,}["\']', "hardcoded token"),
    ]
    for f in files:
        if not Path(f).exists():
            continue
        if any(f.endswith(ext) for ext in [".ts", ".dart", ".js", ".py"]):
            content = Path(f).read_text(errors="ignore")
            for pattern, label in sensitive_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    issues.append(f"{f}: possible {label}")
    return issues


def build_report(
    event: str, ref: str, commit: str, actor: str,
    files: list[str], cats: dict, issues: list[str]
) -> str:
    backend_count = sum(len(v) for k, v in cats.items() if k.startswith("backend"))
    flutter_count = sum(len(v) for k, v in cats.items() if k.startswith("flutter"))
    go2rtc_count = len(cats.get("backend_go2rtc", []))

    lines = [
        f"\U0001f50d *GRG Mobile — Аудит репозитория*",
        f"",
        f"\U0001f4cc *Событие:* `{event}` → `{ref}`",
        f"\U0001f464 *Автор:* {actor}",
        f"\U0001f516 *Коммит:* `{commit[:8]}`",
        f"\U0001f4c1 *Изменённых файлов:* {len(files)}",
        f"",
    ]

    if backend_count:
        lines.append(f"\U0001f5a5️ *Backend (NestJS):* {backend_count} файл(ов)")
        if cats.get("backend_entities"):
            lines.append(f"  • Сущности БД: {', '.join(Path(f).name for f in cats['backend_entities'])}")
        if cats.get("backend_migrations"):
            lines.append(f"  • Миграции: {', '.join(Path(f).name for f in cats['backend_migrations'])}")
        if cats.get("backend_controllers"):
            lines.append(f"  • Контроллеры: {', '.join(Path(f).name for f in cats['backend_controllers'])}")
        if cats.get("backend_services"):
            lines.append(f"  • Сервисы: {', '.join(Path(f).name for f in cats['backend_services'])}")
        if cats.get("backend_modules"):
            lines.append(f"  • Модули: {', '.join(Path(f).name for f in cats['backend_modules'])}")

    if go2rtc_count:
        lines.append(f"\U0001f4f9 *go2rtc (видеостриминг):* {go2rtc_count} файл(ов)")
        for f in cats.get("backend_go2rtc", []):
            lines.append(f"  • {Path(f).name}")

    if flutter_count:
        lines.append(f"\U0001f4f1 *Flutter:* {flutter_count} файл(ов)")
        if cats.get("flutter_screens"):
            lines.append(f"  • Экраны: {', '.join(Path(f).name for f in cats['flutter_screens'])}")
        if cats.get("flutter_widgets"):
            lines.append(f"  • Виджеты: {', '.join(Path(f).name for f in cats['flutter_widgets'])}")

    lines.append("")

    if issues:
        lines.append(f"⚠️ *Обнаружено проблем: {len(issues)}*")
        for issue in issues[:10]:
            lines.append(f"  ❗ {issue}")
        if len(issues) > 10:
            lines.append(f"  ... и ещё {len(issues) - 10}")
    else:
        lines.append("✅ *Критических проблем не обнаружено*")

    lines.append("")

    arch_ok = True
    arch_notes = []

    if cats.get("backend_entities") and not cats.get("backend_migrations"):
        arch_ok = False
        arch_notes.append("⚠️ Изменены сущности БД без миграций (при production БД нужны миграции)")

    if cats.get("backend_go2rtc"):
        arch_notes.append("ℹ️ go2rtc клиент изменён — проверьте GO2RTC_URL и GO2RTC_PUBLIC_URL в .env")

    if cats.get("backend_modules"):
        arch_notes.append("ℹ️ Изменены модули NestJS — проверьте корректность импортов в app.module.ts")

    if arch_notes:
        lines.append("\U0001f4d0 *Замечания по архитектуре:*")
        for note in arch_notes:
            lines.append(f"  {note}")
    elif arch_ok:
        lines.append("\U0001f4d0 *Соответствие архитектуре:* ✅ ОК"
)

    lines.append("")
    lines.append(f"\U0001f517 [Посмотреть workflow]({RUN_URL})")

    return "\n".join(lines)


def send_telegram(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }, timeout=30)
    if not resp.ok:
        print(f"Telegram error: {resp.status_code} {resp.text}", file=sys.stderr)
        return False
    return True


def main():
    event = os.environ.get("GITHUB_EVENT_NAME", "push")
    ref = os.environ.get("GITHUB_REF_NAME", "unknown")
    commit = os.environ.get("GITHUB_SHA", "unknown")
    actor = os.environ.get("GITHUB_ACTOR", "unknown")
    base_sha = os.environ.get("BASE_SHA", "HEAD~1")
    head_sha = os.environ.get("HEAD_SHA", "HEAD")

    files = get_changed_files(base_sha, head_sha)
    cats = categorize_files(files)

    issues = []

    entity_issues = check_entity_without_migration(
        cats.get("backend_entities", []),
        cats.get("backend_migrations", [])
    )
    issues.extend([f"Entity changed without migration: {f}" for f in entity_issues])

    issues.extend(check_go2rtc_error_handling(cats.get("backend_go2rtc", [])))
    issues.extend(check_controllers_guards(cats.get("backend_controllers", [])))
    issues.extend(check_flutter_null_safety(
        cats.get("flutter_screens", []) + cats.get("flutter_widgets", [])
    ))

    all_code_files = files
    issues.extend(check_credentials_exposure(all_code_files))

    report = build_report(event, ref, commit, actor, files, cats, issues)
    print(report)
    print("\n--- Sending to Telegram ---")

    if send_telegram(report):
        print("✅ Report sent to Telegram")
    else:
        print("❌ Failed to send to Telegram")
        sys.exit(1)


if __name__ == "__main__":
    main()
