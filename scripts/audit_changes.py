#!/usr/bin/env python3
"""
GRG Mobile — automated code audit script.
Runs on GitHub Actions (push / pull_request), analyses changed files,
and sends a report to Telegram.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime

TELEGRAM_TOKEN   = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
EVENT_NAME       = os.environ.get("GITHUB_EVENT_NAME", "unknown")
GITHUB_REF       = os.environ.get("GITHUB_REF", "")
GITHUB_SHA       = os.environ.get("GITHUB_SHA", "")
GITHUB_ACTOR     = os.environ.get("GITHUB_ACTOR", "")
BASE_REF         = os.environ.get("GITHUB_BASE_REF", "")   # set only for PRs
GITHUB_REPO      = os.environ.get("GITHUB_REPOSITORY", "")


# ─── git helpers ─────────────────────────────────────────────────────────────

def _run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout.strip()


def get_changed_files():
    if BASE_REF:                                      # pull_request
        return _run(["git", "diff", "--name-only", f"origin/{BASE_REF}...HEAD"]).splitlines()
    else:                                             # push
        out = _run(["git", "diff", "--name-only", "HEAD~1", "HEAD"])
        return out.splitlines() if out else []


def get_diff_content(files):
    if not files:
        return ""
    target = files[:30]                               # cap to avoid huge diffs
    if BASE_REF:
        return _run(["git", "diff", f"origin/{BASE_REF}...HEAD", "--"] + target)
    return _run(["git", "diff", "HEAD~1", "HEAD", "--"] + target)


# ─── audit sections ──────────────────────────────────────────────────────────

def audit_backend(files, diff):
    be = [f for f in files if f.startswith("backend/")]
    if not be:
        return None

    issues, info = [], []

    entity_files    = [f for f in be if f.endswith(".entity.ts")]
    migration_files = [f for f in be if "migration" in f.lower() or f.endswith(".sql")]
    service_files   = [f for f in be if "service.ts" in f]
    controller_files= [f for f in be if "controller.ts" in f]
    module_files    = [f for f in be if "module.ts" in f]

    # Schema changes without migrations
    if entity_files and not migration_files:
        issues.append(
            "⚠️ Entity-файлы изменены без миграций — `synchronize:true` "
            "может молча сломать prod-схему. Добавьте SQL-миграцию."
        )

    if migration_files:
        info.append(f"✅ Миграции присутствуют: {', '.join(migration_files)}")

    # Hardcoded credentials
    if re.search(r'password\s*[:=]\s*["\'][^"\']{3,}["\']', diff):
        issues.append(
            "🔴 Возможны credentials в открытом виде — "
            "использовать `CredentialsService.encrypt()`."
        )

    # synchronize:true without NODE_ENV guard
    if "synchronize: true" in diff and "NODE_ENV" not in diff:
        issues.append(
            "⚠️ `synchronize: true` без проверки `NODE_ENV` — "
            "опасно для production-базы."
        )

    # Missing module import pattern
    if any("forwardRef" not in diff and s in diff for s in ["UnknownDependenciesException"]):
        issues.append("🔴 Признаки `UnknownDependenciesException` — проверьте импорты в `app.module.ts`.")

    # New controllers without @UseGuards
    for f in controller_files:
        snippet = _extract_file_diff(diff, f)
        if "@Controller" in snippet and "@UseGuards" not in snippet and "JwtAuthGuard" not in snippet:
            issues.append(f"⚠️ Контроллер `{f}` без `@UseGuards(JwtAuthGuard)` — проверьте защиту эндпоинтов.")

    summary = (
        f"📦 *Backend (NestJS)*: {len(be)} файл(ов)\n"
        + (f"  • Entities: {len(entity_files)}\n"    if entity_files     else "")
        + (f"  • Services: {len(service_files)}\n"   if service_files    else "")
        + (f"  • Controllers: {len(controller_files)}\n" if controller_files else "")
        + (f"  • Modules: {len(module_files)}\n"     if module_files     else "")
        + (f"  • Migrations: {len(migration_files)}\n" if migration_files else "")
    )
    return {"summary": summary, "issues": issues, "info": info}


def audit_flutter(files, diff):
    fl = [f for f in files if f.startswith("lib/")]
    if not fl:
        return None

    issues, info = [], []

    screen_files  = [f for f in fl if "screen" in f]
    widget_files  = [f for f in fl if "widget" in f]
    service_files = [f for f in fl if "service" in f]
    api_files     = [f for f in fl if f.startswith("lib/api/")]
    model_files   = [f for f in fl if "model" in f]

    # Hardcoded IPs
    if re.search(r"http://\d{1,3}(?:\.\d{1,3}){3}", diff):
        issues.append(
            "⚠️ Захардкоженный IP в Flutter-коде — "
            "используйте `ApiConfig.load()` / shared preferences."
        )

    # Excessive null force-unwrap
    force_count = diff.count("!.")
    if force_count > 8:
        issues.append(
            f"⚠️ Много force-unwrap (`!.`): {force_count} вхождений — "
            "риск null-pointer на runtime."
        )

    # Screens outside screens/
    for f in fl:
        if "Screen" in f and "screens/" not in f and "widget" not in f.lower():
            issues.append(f"⚠️ Screen-виджет вне `screens/`: `{f}`")

    # Direct HTTP calls without BackendClient
    if re.search(r"http\.get\(|http\.post\(|Dio\(\)", diff):
        issues.append(
            "⚠️ Прямые HTTP-вызовы вне `BackendClient` — "
            "нарушает централизованный JWT-flow."
        )

    summary = (
        f"📱 *Flutter*: {len(fl)} файл(ов)\n"
        + (f"  • Screens: {len(screen_files)}\n"   if screen_files  else "")
        + (f"  • Widgets: {len(widget_files)}\n"   if widget_files  else "")
        + (f"  • Services: {len(service_files)}\n" if service_files else "")
        + (f"  • API-client: {len(api_files)}\n"   if api_files     else "")
        + (f"  • Models: {len(model_files)}\n"     if model_files   else "")
    )
    return {"summary": summary, "issues": issues, "info": info}


def audit_streaming(files, diff):
    keywords = ("stream", "rtsp", "go2rtc", "live", "control")
    relevant = [f for f in files if any(k in f.lower() for k in keywords)]

    streaming_in_diff = any(
        k in diff.lower() for k in ("go2rtc", "live-url", "rtsp", "liveurl", "getstream")
    )

    if not relevant and not streaming_in_diff:
        return None

    issues, info = [], []

    # Error handling check
    new_endpoints = re.findall(r"@(Get|Post|Put|Delete)\(['\"].*(?:live|stream|rtsp).*['\"]\)", diff)
    for ep in new_endpoints:
        ctx_idx = diff.find(ep)
        window  = diff[max(0, ctx_idx - 50): ctx_idx + 400]
        if "try" not in window and "catch" not in window:
            issues.append(
                f"🔴 Эндпоинт `{ep}` без try/catch — "
                "ошибки go2rtc/RTSP не будут корректно возвращены клиенту."
            )

    # Check for missing timeout on RTSP calls
    if ("rtsp" in diff.lower() or "go2rtc" in diff.lower()) and "timeout" not in diff.lower():
        issues.append(
            "⚠️ RTSP/go2rtc-вызовы без явного timeout — "
            "зависший стрим может заблокировать поток."
        )

    if not issues:
        info.append("✅ Streaming-эндпоинты: обработка ошибок выглядит корректно.")

    summary = f"🎥 *Streaming / go2rtc*: {len(relevant)} файл(ов) затронуто\n"
    return {"summary": summary, "issues": issues, "info": info}


# ─── helper ──────────────────────────────────────────────────────────────────

def _extract_file_diff(diff, filename):
    """Return the diff chunk for a specific file."""
    marker = f"b/{filename}"
    idx = diff.find(marker)
    if idx == -1:
        return ""
    end = diff.find("\ndiff --git", idx + 1)
    return diff[idx: end if end != -1 else idx + 3000]


# ─── Telegram ─────────────────────────────────────────────────────────────────

def send_telegram(text):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in environment")
        sys.exit(1)

    url  = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    body = json.dumps({
        "chat_id":    TELEGRAM_CHAT_ID,
        "text":       text[:4096],           # Telegram message limit
        "parse_mode": "Markdown",
    }).encode()

    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        if not result.get("ok"):
            print(f"Telegram API error: {result}")
            sys.exit(1)
    except Exception as exc:
        print(f"Failed to reach Telegram: {exc}")
        sys.exit(1)


# ─── main ────────────────────────────────────────────────────────────────────

def main():
    files = get_changed_files()
    if not files:
        msg = f"🔍 *GRG Mobile Audit*\nСобытие `{EVENT_NAME}`: изменённых файлов не найдено."
        print(msg)
        send_telegram(msg)
        return

    diff = get_diff_content(files)

    branch    = GITHUB_REF.replace("refs/heads/", "").replace("refs/pull/", "PR#")
    sha_short = GITHUB_SHA[:7] if GITHUB_SHA else "unknown"
    now       = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    be_audit  = audit_backend(files, diff)
    fl_audit  = audit_flutter(files, diff)
    st_audit  = audit_streaming(files, diff)

    other = [
        f for f in files
        if not f.startswith("backend/") and not f.startswith("lib/")
    ]

    # ── assemble report ──
    report  = "🔍 *GRG Mobile — Аудит кода*\n"
    report += "━━━━━━━━━━━━━━━━━━━━\n"
    report += f"📌 Событие:  `{EVENT_NAME}`\n"
    report += f"🌿 Ветка:    `{branch}`\n"
    report += f"👤 Автор:    `{GITHUB_ACTOR}`\n"
    report += f"🔑 Коммит:  `{sha_short}`\n"
    report += f"📁 Файлов:   {len(files)}\n"
    report += f"🕐 Время:    {now}\n"
    report += "━━━━━━━━━━━━━━━━━━━━\n\n"

    all_issues, all_info = [], []

    for audit in (be_audit, fl_audit, st_audit):
        if audit:
            report += audit["summary"] + "\n"
            all_issues.extend(audit["issues"])
            all_info.extend(audit["info"])

    if other:
        report += f"📄 *Прочие файлы*: {len(other)}\n\n"

    report += "━━━━━━━━━━━━━━━━━━━━\n"

    if all_issues:
        report += f"⚠️ *Проблемы ({len(all_issues)})*:\n"
        for iss in all_issues:
            report += f"• {iss}\n"
        report += "\n"

    if all_info:
        report += "✅ *Замечания*:\n"
        for item in all_info:
            report += f"• {item}\n"
        report += "\n"

    if not all_issues and not all_info:
        report += "✅ Критических проблем не обнаружено.\n\n"

    critical = any("🔴" in i for i in all_issues)
    if critical:
        report += "🚨 *Статус: ТРЕБУЕТ ВНИМАНИЯ*"
    elif all_issues:
        report += "⚠️ *Статус: ЕСТЬ ЗАМЕЧАНИЯ*"
    else:
        report += "✅ *Статус: OK*"

    print(report)
    send_telegram(report)


if __name__ == "__main__":
    main()
