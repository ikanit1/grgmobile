#!/usr/bin/env python3
"""
GRG Mobile — автоматический аудит изменений репозитория.
Анализирует backend (NestJS), Flutter и go2rtc-файлы, отправляет отчёт в Telegram.
"""
import os
import json
import re
import subprocess
from urllib import request as url_request
from urllib.error import URLError

# ── Окружение ─────────────────────────────────────────────────────────────────
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID   = os.environ["TELEGRAM_CHAT_ID"]
EVENT     = os.environ.get("GITHUB_EVENT_NAME", "push")
ACTOR     = os.environ.get("GITHUB_ACTOR", "unknown")
REPO      = os.environ.get("GITHUB_REPOSITORY", "")
SHA_FULL  = os.environ.get("GITHUB_SHA", "")
SHA       = SHA_FULL[:8]
REF       = os.environ.get("GITHUB_REF_NAME", "")
PR_TITLE  = os.environ.get("PR_TITLE", "")
PR_NUM    = os.environ.get("PR_NUMBER", "")


def h(text: str) -> str:
    """Экранирование для Telegram HTML."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def read_file(path: str) -> str:
    try:
        return open(path, encoding="utf-8", errors="ignore").read()
    except Exception:
        return ""


# ── Список изменённых файлов ───────────────────────────────────────────────────
changed_raw = os.environ.get("CHANGED_FILES", "")
changed = [f.strip() for f in changed_raw.splitlines() if f.strip()]

# ── Категоризация ─────────────────────────────────────────────────────────────
backend   = [f for f in changed if f.startswith("backend/")]
flutter   = [f for f in changed if (
    f.startswith("lib/") or f.startswith("test/") or "pubspec" in f
)]
streaming = [f for f in changed if re.search(
    r"(go2rtc|stream|rtsp|video|camera)", f, re.IGNORECASE
)]
migrations = [f for f in backend if re.search(
    r"(migration|\.sql$|entity\.ts$|schema\.ts$)", f, re.IGNORECASE
)]

issues: list[str] = []

# ── Аудит backend (NestJS / PostgreSQL) ───────────────────────────────────────
for f in backend:
    if not os.path.isfile(f):
        continue
    content = read_file(f)
    if not content:
        continue

    # SQL-миграции
    if f.endswith(".sql") or "migration" in f.lower():
        if re.search(r"\bDROP\s+TABLE\b", content, re.IGNORECASE):
            issues.append(f"🚨 <code>{h(f)}</code> — DROP TABLE: риск потери данных!")
        if re.search(r"\bDROP\s+COLUMN\b", content, re.IGNORECASE):
            issues.append(f"⚠️ <code>{h(f)}</code> — DROP COLUMN: необратимое изменение схемы")
        if re.search(r"\bNOT NULL\b", content, re.IGNORECASE) and \
                not re.search(r"\bDEFAULT\b", content, re.IGNORECASE):
            issues.append(f"⚠️ <code>{h(f)}</code> — NOT NULL без DEFAULT (сбой на существующих данных)")

    # TypeORM entity
    if f.endswith("entity.ts"):
        if "@Entity" not in content:
            issues.append(f"⚠️ <code>{h(f)}</code> — отсутствует декоратор @Entity()")
        if "@PrimaryGeneratedColumn" not in content and "@PrimaryColumn" not in content:
            issues.append(f"⚠️ <code>{h(f)}</code> — нет первичного ключа")

    # NestJS controller — проверка guards
    if f.endswith("controller.ts"):
        if not re.search(r"@UseGuards|@Public\s*\(|JwtAuthGuard", content):
            issues.append(f"🔓 <code>{h(f)}</code> — контроллер без @UseGuards (открытые эндпоинты!)")

    # Hardcoded secrets
    if re.search(r'(?:password|secret|token)\s*[:=]\s*["\'][^"\']{8,}["\']', content, re.IGNORECASE):
        if "example" not in f.lower() and ".env" not in f.lower() and "test" not in f.lower():
            issues.append(f"🚨 <code>{h(f)}</code> — возможен hardcoded секрет/пароль!")

    # Credentials service — проверка шифрования
    if "credential" in f.lower() and f.endswith(".ts"):
        if "password" in content.lower() and not re.search(
                r"encrypt|decrypt|AES|cipher", content, re.IGNORECASE):
            issues.append(f"⚠️ <code>{h(f)}</code> — работа с паролями без шифрования")

# ── Аудит Flutter (Dart) ──────────────────────────────────────────────────────
for f in flutter:
    if not os.path.isfile(f) or not f.endswith(".dart"):
        continue
    content = read_file(f)
    if not content:
        continue

    # Null-force операторы
    bang_count = len(re.findall(r"(?<![!=<>!])!(?![=])", content))
    if bang_count > 20:
        issues.append(
            f"⚠️ <code>{h(f)}</code> — {bang_count} null-force (!) операторов (риск NPE)"
        )

    # HTTP без TLS
    http_links = re.findall(
        r"http://(?!localhost|127\.0\.0\.1|10\.\d|192\.168|0\.0\.0\.0)", content
    )
    if http_links:
        issues.append(f"⚠️ <code>{h(f)}</code> — HTTP без TLS ({len(http_links)} ссылок)")

    # API-ключи
    if re.search(r'(?:apiKey|api_key|token)\s*=\s*["\'][A-Za-z0-9_\-]{20,}["\']', content):
        issues.append(f"🚨 <code>{h(f)}</code> — возможен hardcoded API-ключ!")

    # Структура: проверка соответствия папок
    if f.startswith("lib/screens/") and not re.search(r"class \w+Screen|class \w+Page", content):
        issues.append(f"ℹ️ <code>{h(f)}</code> — файл в lib/screens/ без класса *Screen/*Page")

# ── Аудит видеостриминга (go2rtc) ─────────────────────────────────────────────
for f in streaming:
    if not os.path.isfile(f):
        continue
    content = read_file(f)
    if not content:
        continue

    if not re.search(r"\btry\b|\bcatch\b|\berror\b|\bError\b|\bexception\b|\bException\b", content):
        issues.append(f"🚨 <code>{h(f)}</code> — нет обработки ошибок для стриминга!")
    if not re.search(r"timeout|Timeout|TIMEOUT", content):
        issues.append(f"⚠️ <code>{h(f)}</code> — нет таймаута соединения (риск зависания)")
    if not re.search(r"reconnect|retry|Retry|backoff|reconnect", content, re.IGNORECASE):
        issues.append(f"ℹ️ <code>{h(f)}</code> — нет логики переподключения стрима")

# ── Формирование отчёта ───────────────────────────────────────────────────────
lines: list[str] = []

if EVENT == "pull_request":
    lines.append(f"🔍 <b>Аудит Pull Request #{h(PR_NUM)}</b>")
    lines.append(f"📌 <i>{h(PR_TITLE)}</i>")
else:
    result = subprocess.run(
        ["git", "log", "-1", "--pretty=%s"], capture_output=True, text=True
    )
    commit_msg = h(result.stdout.strip()[:80])
    lines.append("🔍 <b>Аудит Push</b>")
    lines.append(f"📝 <i>{commit_msg}</i>")

lines.append(f"👤 {h(ACTOR)}  |  🌿 <code>{h(REF)}</code>  |  🔑 <code>{h(SHA)}</code>")
lines.append("")

if not changed:
    lines.append("<i>Нет отслеживаемых изменений</i>")
else:
    lines.append(f"📊 Изменено файлов: <b>{len(changed)}</b>")
    lines.append("")

    if backend:
        lines.append(f"🗄 <b>Backend (NestJS)</b> — {len(backend)} файл(ов)")
        for f in backend[:6]:
            lines.append(f"  • <code>{h(f)}</code>")
        if len(backend) > 6:
            lines.append(f"  <i>...и ещё {len(backend) - 6}</i>")
        if migrations:
            lines.append(
                f"  ⚠️ <b>Миграции/схемы:</b> {len(migrations)} файл(ов) — требует проверки"
            )

    if flutter:
        lines.append(f"📱 <b>Flutter (Dart)</b> — {len(flutter)} файл(ов)")
        for f in flutter[:6]:
            lines.append(f"  • <code>{h(f)}</code>")
        if len(flutter) > 6:
            lines.append(f"  <i>...и ещё {len(flutter) - 6}</i>")

    if streaming:
        lines.append(f"🎥 <b>Видеостриминг (go2rtc)</b> — {len(streaming)} файл(ов)")
        for f in streaming:
            lines.append(f"  • <code>{h(f)}</code>")

    other = [f for f in changed if f not in backend and f not in flutter and f not in streaming]
    if other:
        lines.append(f"📄 <b>Прочие файлы</b> — {len(other)} шт.")

lines.append("")

if issues:
    lines.append(f"❌ <b>Замечания ({len(issues)}):</b>")
    for issue in issues[:12]:
        lines.append(issue)
    if len(issues) > 12:
        lines.append(f"<i>...ещё {len(issues) - 12} замечаний</i>")
    lines.append("")
    lines.append("⚡ <b>Рекомендуется проверить перед мержем!</b>")
else:
    lines.append("✅ <b>Критических замечаний не найдено</b>")
    lines.append("<i>Изменения соответствуют архитектуре проекта.</i>")

lines.append("")
lines.append(
    f'<a href="https://github.com/{REPO}/commit/{SHA_FULL}">🔗 Открыть коммит на GitHub</a>'
)

text = "\n".join(lines)

# ── Отправка в Telegram ────────────────────────────────────────────────────────
payload = json.dumps({
    "chat_id": CHAT_ID,
    "text": text,
    "parse_mode": "HTML",
    "disable_web_page_preview": False,
}).encode()

req = url_request.Request(
    f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with url_request.urlopen(req, timeout=20) as resp:
        result = json.loads(resp.read())
        if result.get("ok"):
            print("✅ Отчёт успешно отправлен в Telegram")
        else:
            print(f"❌ Ошибка Telegram API: {result}")
            raise SystemExit(1)
except URLError as e:
    print(f"❌ Сетевая ошибка при отправке в Telegram: {e}")
    raise SystemExit(1)
