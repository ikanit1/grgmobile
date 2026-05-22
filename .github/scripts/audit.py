#!/usr/bin/env python3
"""Automated code audit for GRG Mobile repository."""

import os
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path


def get_changed_files():
    event = os.environ.get('GITHUB_EVENT_NAME', 'push')

    if event == 'pull_request':
        base = os.environ.get('PR_BASE_SHA', '')
        head = os.environ.get('PR_HEAD_SHA', '')
    else:
        base = os.environ.get('GITHUB_BEFORE', '')
        head = os.environ.get('GITHUB_SHA', '')

    if not base or base == '0000000000000000000000000000000000000000':
        result = subprocess.run(
            ['git', 'show', '--name-only', '--format=', 'HEAD'],
            capture_output=True, text=True
        )
    else:
        result = subprocess.run(
            ['git', 'diff', '--name-only', base, head],
            capture_output=True, text=True
        )

    return [f for f in result.stdout.strip().split('\n') if f]


def read_file(path):
    try:
        return Path(path).read_text(errors='ignore') if Path(path).exists() else ''
    except Exception:
        return ''


def analyze_backend(files):
    info, issues = [], []
    backend_files = [f for f in files if f.startswith('backend/')]
    if not backend_files:
        return None, []

    migration_files = [f for f in backend_files if 'migration' in f.lower()]
    entity_files = [f for f in backend_files if f.endswith('.entity.ts')]
    module_files = [f for f in backend_files if f.endswith('.module.ts') and 'app.module' not in f]
    app_module_changed = 'backend/src/app.module.ts' in backend_files
    schema_files = [f for f in backend_files if 'schema' in f.lower() and f.endswith('.sql')]

    # New modules without app.module.ts update
    if module_files and not app_module_changed:
        names = ', '.join(Path(f).name for f in module_files)
        issues.append(f"⚠️ Новые модули ({names}) — app.module.ts не изменён, возможно модули не зарегистрированы")

    # Entity changes without migrations
    if entity_files and not migration_files:
        names = ', '.join(Path(f).stem for f in entity_files)
        issues.append(f"⚠️ Изменены сущности TypeORM ({names}), но файлы миграций не найдены")

    # Check credential handling in entity files
    for f in entity_files:
        content = read_file(f)
        if ('password' in content or 'username' in content) and 'credentials' not in f.lower():
            if 'CredentialsService' not in content and 'encrypt' not in content.lower():
                issues.append(f"⚠️ {Path(f).name}: поля credentials без шифрования через CredentialsService")

    # Check SQL migration files for up/down pattern
    for f in migration_files:
        content = read_file(f)
        if content and 'down' not in content.lower() and f.endswith('.ts'):
            issues.append(f"⚠️ {Path(f).name}: миграция без метода down() — откат невозможен")

    # Access control check in controllers
    ctrl_files = [f for f in backend_files if f.endswith('.controller.ts')]
    for f in ctrl_files:
        content = read_file(f)
        if '@Get' in content or '@Post' in content or '@Put' in content or '@Delete' in content:
            if '@UseGuards' not in content and 'JwtAuthGuard' not in content:
                issues.append(f"⚠️ {Path(f).name}: эндпоинты без @UseGuards(JwtAuthGuard) — проверьте защиту маршрутов")

    info.append(f"📁 Backend файлов: {len(backend_files)}")
    if entity_files:
        info.append(f"📋 Сущности: {', '.join(Path(f).stem for f in entity_files)}")
    if migration_files:
        info.append(f"✅ Миграции: {', '.join(Path(f).name for f in migration_files)}")
    if schema_files:
        info.append(f"🗄️ SQL-схемы: {', '.join(Path(f).name for f in schema_files)}")
    if ctrl_files:
        info.append(f"🔌 Контроллеры: {', '.join(Path(f).stem for f in ctrl_files)}")

    return info, issues


def analyze_flutter(files):
    info, issues = [], []
    flutter_files = [f for f in files if f.startswith('lib/') or f == 'pubspec.yaml']
    if not flutter_files:
        return None, []

    screen_files = [f for f in flutter_files if '/screens/' in f]
    widget_files = [f for f in flutter_files if '/widgets/' in f]
    model_files = [f for f in flutter_files if '/models/' in f]
    service_files = [f for f in flutter_files if '/services/' in f]
    api_files = [f for f in flutter_files if '/api/' in f]

    # Files in lib/ root (outside expected subdirs)
    allowed_root = {'main.dart', 'firebase_options.dart'}
    for f in flutter_files:
        if f.startswith('lib/') and f.endswith('.dart') and f.count('/') == 1:
            if Path(f).name not in allowed_root:
                issues.append(f"⚠️ {f}: файл в корне lib/ — рекомендуется screens/, widgets/, models/ или services/")

    # Check null safety and force-unwrap usage
    for f in flutter_files:
        if not f.endswith('.dart'):
            continue
        content = read_file(f)
        if not content:
            continue
        force_unwraps = content.count('!.')
        if force_unwraps > 8:
            issues.append(f"⚠️ {Path(f).name}: {force_unwraps} использований '!.' — проверьте null safety")
        # Check for hardcoded IPs or tokens
        if 'http://' in content and ('192.168.' in content or '10.0.' in content):
            issues.append(f"⚠️ {Path(f).name}: возможный хардкод IP-адреса в коде")

    # pubspec.yaml changes
    if 'pubspec.yaml' in flutter_files:
        content = read_file('pubspec.yaml')
        info.append("📦 pubspec.yaml изменён — проверьте совместимость зависимостей")

    info.append(f"📱 Flutter файлов: {len(flutter_files)}")
    if screen_files:
        info.append(f"🖥️ Экраны: {', '.join(Path(f).stem for f in screen_files)}")
    if widget_files:
        info.append(f"🧩 Виджеты: {', '.join(Path(f).stem for f in widget_files)}")
    if model_files:
        info.append(f"📊 Модели: {', '.join(Path(f).stem for f in model_files)}")
    if service_files:
        info.append(f"⚙️ Сервисы: {', '.join(Path(f).stem for f in service_files)}")
    if api_files:
        info.append(f"🌐 API клиенты: {', '.join(Path(f).stem for f in api_files)}")

    return info, issues


def analyze_go2rtc(files):
    info, issues = [], []
    streaming_files = []

    keywords = ('go2rtc', 'rtsp', 'live-url', 'liveurl', 'live_url', 'livestream')

    for f in files:
        content = read_file(f)
        if not content:
            continue
        if any(kw in content.lower() for kw in keywords):
            streaming_files.append(f)

    if not streaming_files:
        return None, []

    for f in streaming_files:
        content = read_file(f)
        if not content:
            continue

        if f.endswith('.ts') or f.endswith('.js'):
            # Missing try/catch
            if 'try' not in content or 'catch' not in content:
                issues.append(f"⚠️ {Path(f).name}: go2rtc/RTSP вызовы без try/catch")
            # Missing HTTP error propagation
            if 'throw' not in content and 'HttpException' not in content:
                issues.append(f"⚠️ {Path(f).name}: нет выброса HTTP-исключений при ошибках стриминга")
            # Timeout check
            if 'timeout' not in content.lower():
                issues.append(f"⚠️ {Path(f).name}: нет таймаута для go2rtc/RTSP запросов")

    info.append(f"🎥 Файлы со стримингом: {', '.join(Path(f).name for f in streaming_files)}")
    return info, issues


def send_telegram(text, token, chat_id):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true',
    }).encode('utf-8')
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"Telegram error: {e}")
        return False


def main():
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')
    event = os.environ.get('GITHUB_EVENT_NAME', 'push')
    ref = os.environ.get('GITHUB_REF', '')
    sha = os.environ.get('GITHUB_SHA', '')[:7]
    actor = os.environ.get('ACTOR', 'unknown')
    repo = os.environ.get('REPO', '')
    pr_title = os.environ.get('PR_TITLE', '')
    pr_number = os.environ.get('PR_NUMBER', '')

    if not token or not chat_id:
        print("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping report")
        return

    changed = get_changed_files()
    if not changed:
        print("No changed files")
        return

    backend_info, backend_issues = analyze_backend(changed)
    flutter_info, flutter_issues = analyze_flutter(changed)
    go2rtc_info, go2rtc_issues = analyze_go2rtc(changed)

    all_issues = backend_issues + flutter_issues + go2rtc_issues
    branch = ref.replace('refs/heads/', '').replace('refs/pull/', 'PR/')

    lines = ['<b>🔍 Аудит GRG Mobile</b>', '']

    if event == 'pull_request':
        lines += [f'<b>Событие:</b> Pull Request #{pr_number}', f'<b>Заголовок:</b> {pr_title}']
    else:
        lines += [f'<b>Событие:</b> Push', f'<b>Ветка:</b> {branch}']

    lines += [
        f'<b>Коммит:</b> <code>{sha}</code>',
        f'<b>Автор:</b> {actor}',
        f'<b>Репозиторий:</b> {repo}',
        f'<b>Изменено файлов:</b> {len(changed)}',
        '',
    ]

    if backend_info:
        lines.append('<b>🖥️ Backend (NestJS / PostgreSQL):</b>')
        lines += [f'  {i}' for i in backend_info]
        lines.append('')

    if flutter_info:
        lines.append('<b>📱 Flutter UI:</b>')
        lines += [f'  {i}' for i in flutter_info]
        lines.append('')

    if go2rtc_info:
        lines.append('<b>🎥 Видеостриминг (go2rtc/RTSP):</b>')
        lines += [f'  {i}' for i in go2rtc_info]
        lines.append('')

    if all_issues:
        lines.append(f'<b>🚨 Найдено проблем: {len(all_issues)}</b>')
        lines += [f'  {i}' for i in all_issues]
        lines.append('')
        lines.append('<b>Соответствие архитектуре:</b> ⚠️ Требует внимания')
    else:
        lines.append('<b>✅ Критических проблем не обнаружено</b>')
        lines.append('<b>Соответствие архитектуре:</b> ✅ Соответствует')

    report = '\n'.join(lines)
    if len(report) > 4000:
        report = report[:3970] + '\n\n<i>... отчёт обрезан (превышен лимит)</i>'

    ok = send_telegram(report, token, chat_id)
    print("Report sent." if ok else "Failed to send report.")


if __name__ == '__main__':
    main()
