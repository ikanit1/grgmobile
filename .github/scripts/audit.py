"""
Automated audit script for grgmobile repository.
Triggered on every push/PR. Analyzes changed files and sends Telegram report.
"""

import os
import re
import sys
from pathlib import Path
import requests

# ── Environment ─────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
CHANGED_FILES_PATH = os.environ.get("CHANGED_FILES_PATH", "/tmp/changed_files.txt")
EVENT_DESC = os.environ.get("EVENT_DESC", "Unknown event")
AUTHOR = os.environ.get("AUTHOR", "unknown")
BRANCH = os.environ.get("BRANCH", "unknown")
SHA = os.environ.get("SHA", "unknown")
REPO = os.environ.get("REPO", "unknown/repo")
EVENT_NAME = os.environ.get("EVENT_NAME", "push")
RUN_URL = os.environ.get("RUN_URL", "")

WORKSPACE = Path(os.environ.get("GITHUB_WORKSPACE", "."))


# ── File categorization ──────────────────────────────────────────────────────
def load_changed_files() -> list[str]:
    try:
        with open(CHANGED_FILES_PATH) as f:
            return [l.strip() for l in f if l.strip()]
    except FileNotFoundError:
        return []


def categorize_files(files: list[str]) -> dict:
    cats = {
        "backend": [],
        "flutter": [],
        "go2rtc": [],
        "migrations": [],
        "env_config": [],
        "github_actions": [],
        "other": [],
    }
    for f in files:
        if f.startswith("backend/src/") or f.startswith("backend/scripts/"):
            cats["backend"].append(f)
            if "migrat" in f.lower() or f.endswith(".sql"):
                cats["migrations"].append(f)
        elif f.startswith("lib/") or f.endswith(".dart") or f == "pubspec.yaml":
            cats["flutter"].append(f)
        elif "go2rtc" in f.lower() or "mediamtx" in f.lower():
            cats["go2rtc"].append(f)
        elif f.endswith(".env") or f.endswith(".env.example") or "docker-compose" in f:
            cats["env_config"].append(f)
        elif f.startswith(".github/"):
            cats["github_actions"].append(f)
        else:
            cats["other"].append(f)
    return cats


# ── Backend checks ───────────────────────────────────────────────────────────
MIGRATION_PATTERNS = [
    (r"synchronize\s*:\s*true", "⚠️ TypeORM synchronize:true — не использовать в продакшн"),
    (r"dropSchema\s*:\s*true", "🚨 dropSchema:true — удалит все таблицы!"),
]
SCHEMA_PATTERNS = [
    (r"@Column\(\s*\)\s*\n\s+\w+\s*:", "⚠️ Колонка без явного типа — уточни тип в @Column"),
    (r"password\s*:\s*string(?!\s*\/\/.*encrypted)", "⚠️ Поле 'password' без пометки encrypted — проверь шифрование"),
    (r"@Column\(\)\s*\n.*credentials\s*:", "⚠️ Поле 'credentials' без @Column({type:'text'}) — риск усечения"),
]
SECURITY_PATTERNS = [
    (r"console\.log\(.*password", "🔐 console.log с паролем — утечка credentials"),
    (r"console\.log\(.*token", "🔐 console.log с токеном — утечка credentials"),
    (r"\.exec\(req\.", "🚨 Возможная инъекция через req — проверь санитизацию"),
    (r"eval\s*\(", "🚨 eval() — критическая уязвимость"),
]

def check_backend_files(files: list[str]) -> list[str]:
    issues = []
    for rel_path in files:
        full = WORKSPACE / rel_path
        if not full.exists() or not full.suffix in (".ts", ".js", ".sql"):
            continue
        try:
            content = full.read_text(errors="ignore")
        except Exception:
            continue

        for pattern, msg in MIGRATION_PATTERNS + SCHEMA_PATTERNS + SECURITY_PATTERNS:
            if re.search(pattern, content):
                issues.append(f"  {msg}\n    → `{rel_path}`")

    for rel_path in files:
        if rel_path.endswith(".entity.ts"):
            full = WORKSPACE / rel_path
            if not full.exists():
                continue
            content = full.read_text(errors="ignore")
            if "@Entity" not in content:
                issues.append(f"  ⚠️ Entity-файл без @Entity() декоратора\n    → `{rel_path}`")
            if "@PrimaryGeneratedColumn" not in content and "@PrimaryColumn" not in content:
                issues.append(f"  ⚠️ Entity без Primary Key\n    → `{rel_path}`")

    for rel_path in files:
        if rel_path.endswith(".controller.ts"):
            full = WORKSPACE / rel_path
            if not full.exists():
                continue
            content = full.read_text(errors="ignore")
            if "@Controller" in content and "@UseGuards" not in content:
                issues.append(f"  ⚠️ Controller без @UseGuards — возможен открытый доступ\n    → `{rel_path}`")

    return issues


# ── Flutter checks ───────────────────────────────────────────────────────────
FLUTTER_PATTERNS = [
    (r"http://(?!localhost|127\.0\.0\.1|10\.\d|192\.168)", "⚠️ Hardcoded http:// URL — используй ApiConfig"),
    (r"print\(.*password", "🔐 print() с паролем"),
    (r"\.toString\(\).*token", "⚠️ Токен в toString() — риск логирования"),
]

def check_flutter_files(files: list[str]) -> list[str]:
    issues = []
    for rel_path in files:
        full = WORKSPACE / rel_path
        if not full.exists() or not full.suffix == ".dart":
            continue
        try:
            content = full.read_text(errors="ignore")
        except Exception:
            continue

        for pattern, msg in FLUTTER_PATTERNS:
            if re.search(pattern, content):
                issues.append(f"  {msg}\n    → `{rel_path}`")

        if "Screen" in rel_path or "Page" in rel_path or "screen" in rel_path:
            if not rel_path.startswith("lib/screens/") and not rel_path.startswith("lib/widgets/"):
                issues.append(
                    f"  ⚠️ Screen/Page вне lib/screens/ — нарушение структуры\n    → `{rel_path}`"
                )

        if "http.get(" in content or "http.post(" in content:
            if "BackendClient" not in content and "import 'package:http" in content:
                issues.append(
                    f"  ⚠️ Прямое использование http вместо BackendClient (JWT не добавится)\n    → `{rel_path}`"
                )

    return issues


# ── go2rtc / streaming checks ────────────────────────────────────────────────
STREAM_PATTERNS = [
    (r"go2rtc|mediamtx|rtsp|live.url|liveUrl|live_url", None),
]

def check_go2rtc_files(files: list[str]) -> list[str]:
    issues = []
    for rel_path in files:
        full = WORKSPACE / rel_path
        if not full.exists():
            continue
        try:
            content = full.read_text(errors="ignore")
        except Exception:
            continue

        is_streaming = any(
            re.search(p, content, re.IGNORECASE)
            for p, _ in STREAM_PATTERNS
        )
        if not is_streaming:
            continue

        suffix = full.suffix
        if suffix in (".ts", ".dart"):
            has_error_handling = (
                "try" in content and ("catch" in content or ".catch(" in content)
            )
            has_status_check = bool(re.search(r"statusCode|status\s*[!=]=|StatusCode\.", content))

            if not has_error_handling:
                issues.append(
                    f"  🚨 Streaming-эндпоинт без try/catch — нет обработки ошибок\n    → `{rel_path}`"
                )
            if not has_status_check and suffix == ".ts":
                issues.append(
                    f"  ⚠️ Streaming-эндпоинт без проверки HTTP статуса ответа\n    → `{rel_path}`"
                )

        if suffix in (".yaml", ".yml"):
            if "go2rtc" in rel_path.lower() or "mediamtx" in rel_path.lower():
                if "auth" not in content.lower() and "password" not in content.lower():
                    issues.append(
                        f"  ⚠️ Конфиг стриминга без секции аутентификации — возможен открытый доступ\n    → `{rel_path}`"
                    )

    return issues


# ── Architecture compliance ──────────────────────────────────────────────────
def check_architecture(cats: dict) -> list[str]:
    notes = []

    new_modules = [
        f for f in cats["backend"]
        if f.endswith(".module.ts") and "app.module.ts" not in f
    ]
    if new_modules:
        app_module = WORKSPACE / "backend/src/app.module.ts"
        if app_module.exists():
            app_content = app_module.read_text(errors="ignore")
            for mod_file in new_modules:
                mod_name = Path(mod_file).stem.replace(".module", "")
                class_name = "".join(w.capitalize() for w in mod_name.split("-")) + "Module"
                if class_name not in app_content:
                    notes.append(
                        f"  ⚠️ {class_name} не найден в app.module.ts — не забудь зарегистрировать\n    → `{mod_file}`"
                    )

    for f in cats["backend"]:
        if not f.endswith(".service.ts"):
            continue
        full = WORKSPACE / f
        if not full.exists():
            continue
        content = full.read_text(errors="ignore")
        if "CredentialsService" in content and "CredentialsModule" not in content:
            module_file = WORKSPACE / f.replace(".service.ts", ".module.ts")
            if module_file.exists():
                mod_content = module_file.read_text(errors="ignore")
                if "CredentialsModule" not in mod_content:
                    notes.append(
                        f"  ⚠️ Service использует CredentialsService но модуль не импортирует CredentialsModule\n    → `{f}`"
                    )

    for f in cats["backend"]:
        if not f.endswith(".controller.ts"):
            continue
        full = WORKSPACE / f
        if not full.exists():
            continue
        content = full.read_text(errors="ignore")
        if "@Get()" in content or "@Post()" in content:
            if "accessService" not in content and "AccessService" not in content:
                if any(kw in content for kw in ("userId", "user.id", "@Req()", "RequestUser")):
                    notes.append(
                        f"  ⚠️ Controller работает с данными пользователя без AccessService\n    → `{f}`"
                    )

    return notes


# ── Report builder ───────────────────────────────────────────────────────────
def build_report(
    cats: dict,
    backend_issues: list[str],
    flutter_issues: list[str],
    go2rtc_issues: list[str],
    arch_notes: list[str],
    all_files: list[str],
) -> str:
    total = len(all_files)
    critical = sum(
        1 for i in backend_issues + flutter_issues + go2rtc_issues
        if "🚨" in i
    )
    warnings = sum(
        1 for i in backend_issues + flutter_issues + go2rtc_issues + arch_notes
        if "⚠️" in i
    )

    event_icon = "🔀" if EVENT_NAME == "pull_request" else "📦"
    status_icon = "🚨 КРИТИЧНО" if critical > 0 else ("⚠️ Предупреждения" if warnings > 0 else "✅ Всё чисто")

    lines = [
        f"{event_icon} *Аудит репозитория: {REPO}*",
        f"",
        f"*Событие:* {EVENT_DESC}",
        f"*Автор:* {AUTHOR} | *Ветка:* `{BRANCH}` | `{SHA}`",
        f"*Статус:* {status_icon}",
        f"",
        f"📂 *Изменено файлов: {total}*",
    ]

    summary_parts = []
    if cats["backend"]:
        summary_parts.append(f"Backend: {len(cats['backend'])}")
    if cats["flutter"]:
        summary_parts.append(f"Flutter: {len(cats['flutter'])}")
    if cats["go2rtc"]:
        summary_parts.append(f"go2rtc: {len(cats['go2rtc'])}")
    if cats["migrations"]:
        summary_parts.append(f"Миграции: {len(cats['migrations'])}")
    if cats["env_config"]:
        summary_parts.append(f"Конфиги: {len(cats['env_config'])}")
    if summary_parts:
        lines.append("  " + " | ".join(summary_parts))

    if cats["backend"]:
        lines.append(f"")
        lines.append(f"🔧 *Backend (NestJS/PostgreSQL)*")
        if cats["migrations"]:
            lines.append(f"  📋 Миграции/схемы изменены: {len(cats['migrations'])} файл(ов)")
        if backend_issues:
            lines.append(f"  Найдено проблем: {len(backend_issues)}")
            for issue in backend_issues[:5]:
                lines.append(issue)
            if len(backend_issues) > 5:
                lines.append(f"  ... и ещё {len(backend_issues) - 5} проблем")
        else:
            lines.append("  ✅ Проблем не найдено")

    if cats["flutter"]:
        lines.append(f"")
        lines.append(f"📱 *Flutter UI*")
        if flutter_issues:
            lines.append(f"  Найдено проблем: {len(flutter_issues)}")
            for issue in flutter_issues[:5]:
                lines.append(issue)
            if len(flutter_issues) > 5:
                lines.append(f"  ... и ещё {len(flutter_issues) - 5} проблем")
        else:
            lines.append("  ✅ Структура соответствует проекту")

    if cats["go2rtc"]:
        lines.append(f"")
        lines.append(f"📹 *Видеостриминг (go2rtc/mediamtx)*")
        if go2rtc_issues:
            lines.append(f"  Найдено проблем: {len(go2rtc_issues)}")
            for issue in go2rtc_issues[:5]:
                lines.append(issue)
        else:
            lines.append("  ✅ Обработка ошибок реализована")

    if arch_notes:
        lines.append(f"")
        lines.append(f"🏗 *Архитектурные замечания*")
        for note in arch_notes[:5]:
            lines.append(note)
        if len(arch_notes) > 5:
            lines.append(f"  ... и ещё {len(arch_notes) - 5} замечаний")

    lines.append(f"")
    if critical > 0:
        lines.append(f"❗ *Критических: {critical} | Предупреждений: {warnings}*")
    elif warnings > 0:
        lines.append(f"ℹ️ Предупреждений: {warnings}")

    if RUN_URL:
        lines.append(f"[🔗 Открыть Action]({RUN_URL})")

    return "\n".join(lines)


# ── Telegram sender ──────────────────────────────────────────────────────────
def send_telegram(text: str) -> bool:
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set", file=sys.stderr)
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        resp.raise_for_status()
        print(f"Telegram report sent. Message ID: {resp.json().get('result', {}).get('message_id')}")
        return True
    except requests.RequestException as e:
        print(f"ERROR sending Telegram message: {e}", file=sys.stderr)
        if "parse" in str(e).lower() or (hasattr(e, 'response') and e.response is not None and e.response.status_code == 400):
            plain_payload = {**payload, "parse_mode": None, "text": text.replace("*", "").replace("`", "")}
            try:
                resp2 = requests.post(url, json=plain_payload, timeout=15)
                resp2.raise_for_status()
                print("Sent as plain text fallback.")
                return True
            except Exception as e2:
                print(f"Fallback also failed: {e2}", file=sys.stderr)
        return False


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    all_files = load_changed_files()

    if not all_files:
        print("No changed files detected, skipping audit.")
        msg = (
            f"📦 *Аудит: {REPO}*\n"
            f"Событие: {EVENT_DESC}\n"
            f"Автор: {AUTHOR} | Ветка: `{BRANCH}`\n"
            f"ℹ️ Изменённых файлов не обнаружено"
        )
        send_telegram(msg)
        return

    cats = categorize_files(all_files)

    backend_issues = check_backend_files(cats["backend"]) if cats["backend"] else []
    flutter_issues = check_flutter_files(cats["flutter"]) if cats["flutter"] else []
    go2rtc_issues = check_go2rtc_files(cats["go2rtc"] + cats["backend"]) if (cats["go2rtc"] or cats["backend"]) else []
    arch_notes = check_architecture(cats) if cats["backend"] else []

    report = build_report(cats, backend_issues, flutter_issues, go2rtc_issues, arch_notes, all_files)

    print("=" * 60)
    print(report)
    print("=" * 60)

    success = send_telegram(report)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
