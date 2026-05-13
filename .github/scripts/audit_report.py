#!/usr/bin/env python3
"""Automatic code audit for GRG Mobile repository."""

import os
import re
import sys
import requests

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '')


def send_telegram(message: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print('ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set')
        return False
    url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
    if len(message) > 4000:
        message = message[:3950] + '\n\n<i>... сообщение обрезано</i>'
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': message,
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        data = resp.json()
        if data.get('ok'):
            print('Telegram report sent successfully')
            return True
        print(f'Telegram API error: {data}')
        return False
    except Exception as exc:
        print(f'Failed to send Telegram message: {exc}')
        return False


def get_changed_files() -> list:
    raw = os.environ.get('CHANGED_FILES', '')
    return [f.strip() for f in raw.splitlines() if f.strip()]


def read_file(path: str) -> str:
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except Exception:
        return ''


# ── Backend (NestJS) audit ─────────────────────────────────────────────────

def audit_backend(files: list) -> tuple:
    backend = [f for f in files if f.startswith('backend/')]
    if not backend:
        return [], []

    issues = []

    migration_files  = [f for f in backend if 'migration' in f.lower() or f.endswith('.sql')]
    entity_files     = [f for f in backend if '/entities/' in f and f.endswith('.ts')]
    controller_files = [f for f in backend if 'controller' in f.lower() and f.endswith('.ts')]
    service_files    = [f for f in backend if 'service' in f.lower() and f.endswith('.ts')]

    for fpath in migration_files:
        content = read_file(fpath)
        upper = content.upper()
        if 'DROP TABLE' in upper and 'IF EXISTS' not in upper:
            issues.append(f'⚠️ <code>{fpath}</code>: DROP TABLE без IF EXISTS — риск ошибки')
        if re.search(r'\bDELETE FROM\b', upper) and 'WHERE' not in upper:
            issues.append(f'⚠️ <code>{fpath}</code>: DELETE FROM без WHERE — удалит все строки')
        if 'ALTER TABLE' in upper and 'NOT NULL' in upper and 'DEFAULT' not in upper:
            issues.append(f'⚠️ <code>{fpath}</code>: ADD NOT NULL колонка без DEFAULT — упадёт на prod')

    for fpath in entity_files:
        content = read_file(fpath)
        if not content:
            continue
        if '@Entity' not in content:
            issues.append(f'⚠️ <code>{fpath}</code>: Entity-файл без декоратора @Entity()')
        if 'password' in content.lower() and 'select: false' not in content:
            issues.append(f'⚠️ <code>{fpath}</code>: Поле password без select: false — утечка хеша')
        if 'credentials' in content.lower() and 'encrypt' not in content.lower() and '@Column' in content:
            issues.append(f'⚠️ <code>{fpath}</code>: Поле credentials без шифрования — используйте CredentialsService')

    for fpath in controller_files:
        content = read_file(fpath)
        if not content:
            continue
        if '@Controller' in content and '@UseGuards' not in content and 'auth' not in fpath.lower():
            issues.append(f'⚠️ <code>{fpath}</code>: Контроллер без @UseGuards — нет JWT-защиты')

    for fpath in service_files:
        content = read_file(fpath)
        if not content:
            continue
        if ('username' in content and 'password' in content
                and 'CredentialsService' not in content
                and 'vendor' not in fpath
                and 'auth' not in fpath.lower()):
            issues.append(f'⚠️ <code>{fpath}</code>: Прямые username/password без CredentialsService')

    return backend, issues


# ── Flutter audit ──────────────────────────────────────────────────────────

def audit_flutter(files: list) -> tuple:
    flutter = [f for f in files if f.startswith('lib/')]
    if not flutter:
        return [], []

    issues = []

    screen_files  = [f for f in flutter if '/screens/' in f and f.endswith('.dart')]
    widget_files  = [f for f in flutter if '/widgets/' in f and f.endswith('.dart')]
    service_files = [f for f in flutter if '/services/' in f and f.endswith('.dart')]
    api_files     = [f for f in flutter if '/api/' in f and f.endswith('.dart')]

    for fpath in screen_files + widget_files:
        content = read_file(fpath)
        if not content:
            continue
        if 'await ' in content:
            has_try   = 'try {' in content or 'try{' in content
            has_catch = '.catchError' in content or 'on Exception' in content or 'catch (' in content
            if not has_try and not has_catch:
                issues.append(f'⚠️ <code>{fpath}</code>: async без try/catch')
        if 'await ' in content and 'Navigator' in content and 'mounted' not in content:
            issues.append(f'⚠️ <code>{fpath}</code>: Navigator после await без проверки mounted')
        if 'setState' in content and 'await ' in content and 'mounted' not in content:
            issues.append(f'⚠️ <code>{fpath}</code>: setState после await без проверки mounted')

    for fpath in api_files + service_files:
        content = read_file(fpath)
        if not content:
            continue
        if ('http.' in content or 'dio.' in content or 'BackendClient' in content):
            if 'try' not in content and 'catchError' not in content:
                issues.append(f'⚠️ <code>{fpath}</code>: HTTP-запросы без обработки ошибок')

    return flutter, issues


# ── Streaming / go2rtc audit ───────────────────────────────────────────────

def audit_streaming(files: list) -> tuple:
    keywords = ('stream', 'rtc', 'rtsp', 'video', 'live', 'camera', 'go2rtc')
    streaming = [f for f in files if any(kw in f.lower() for kw in keywords)]
    if not streaming:
        return [], []

    issues = []

    for fpath in streaming:
        content = read_file(fpath)
        if not content:
            continue
        if fpath.endswith('.ts'):
            has_endpoint = any(d in content for d in ('@Get(', '@Post(', '@Put(', '@Delete('))
            has_errors   = 'try {' in content or 'catch' in content or 'HttpException' in content
            if has_endpoint and not has_errors:
                issues.append(f'⚠️ <code>{fpath}</code>: Стриминг-эндпоинт без обработки ошибок')
            if 'rtsp://' in content.lower() and 'catch' not in content:
                issues.append(f'⚠️ <code>{fpath}</code>: RTSP URL без обработки ошибок соединения')
            if 'go2rtc' in content.lower() and 'timeout' not in content.lower():
                issues.append(f'⚠️ <code>{fpath}</code>: go2rtc вызов без timeout')
        if fpath.endswith('.dart'):
            if 'rtsp' in content.lower() and 'try' not in content and 'catchError' not in content:
                issues.append(f'⚠️ <code>{fpath}</code>: RTSP-стрим без обработки ошибок')

    return streaming, issues


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    event     = os.environ.get('GITHUB_EVENT_NAME', 'push')
    repo      = os.environ.get('GITHUB_REPOSITORY', 'ikanit1/grgmobile')
    ref       = os.environ.get('GITHUB_REF_NAME', 'unknown')
    sha       = os.environ.get('GITHUB_SHA', '')[:8]
    actor     = os.environ.get('GITHUB_ACTOR', 'unknown')
    run_id    = os.environ.get('GITHUB_RUN_ID', '')
    pr_title  = os.environ.get('PR_TITLE', '')
    pr_number = os.environ.get('PR_NUMBER', '')
    run_url   = f'https://github.com/{repo}/actions/runs/{run_id}'

    changed = get_changed_files()

    if not changed:
        send_telegram(
            f'<b>\U0001f50d GRG Mobile — аудит</b>\n'
            f'Событие: <code>{event}</code> | Ветка: <code>{ref}</code>\n'
            f'Изменённые файлы не обнаружены.'
        )
        return

    backend_files,   backend_issues   = audit_backend(changed)
    flutter_files,   flutter_issues   = audit_flutter(changed)
    streaming_files, streaming_issues = audit_streaming(changed)

    all_issues = backend_issues + flutter_issues + streaming_issues

    if all_issues:
        status_icon = '\U0001f534'
        status_text = f'НАЙДЕНЫ ПРОБЛЕМЫ ({len(all_issues)})'
    else:
        status_icon = '✅'
        status_text = 'ВСЁ В ПОРЯДКЕ'

    if event == 'pull_request' and pr_number:
        event_line = f'Pull Request <b>#{pr_number}</b>: {pr_title}'
    else:
        event_line = f'Push → <code>{ref}</code>'

    lines = [
        f'<b>{status_icon} GRG Mobile — Аудит кода</b>',
        f'<b>Статус:</b> {status_text}',
        f'<b>Событие:</b> {event_line}',
        f'<b>Коммит:</b> <code>{sha}</code>  <b>Автор:</b> {actor}',
        '',
        '<b>\U0001f4c2 Изменённые файлы:</b>',
    ]

    def append_files(label, flist):
        lines.append(f'  {label} — {len(flist)} файл(ов)')
        for fp in flist[:5]:
            lines.append(f'    · <code>{fp}</code>')
        if len(flist) > 5:
            lines.append(f'    · ... и ещё {len(flist) - 5}')

    if backend_files:
        append_files('\U0001f527 NestJS/Backend', backend_files)
    if flutter_files:
        append_files('\U0001f4f1 Flutter', flutter_files)
    if streaming_files:
        append_files('\U0001f4f9 Стриминг/go2rtc', streaming_files)
    other = [f for f in changed
             if f not in backend_files + flutter_files + streaming_files]
    if other:
        lines.append(f'  \U0001f4c4 Прочие — {len(other)} файл(ов)')

    if all_issues:
        lines.append('')
        lines.append('<b>⚠️ Обнаруженные проблемы:</b>')
        for issue in all_issues[:12]:
            lines.append(issue)
        if len(all_issues) > 12:
            lines.append(f'  <i>... и ещё {len(all_issues) - 12} проблем(ы)</i>')
    else:
        lines.append('')
        lines.append('Критических проблем не обнаружено. Архитектура соответствует проекту.')

    lines.append('')
    lines.append(f'<a href="{run_url}">\U0001f4cb Детали CI-запуска</a>')

    message = '\n'.join(lines)
    print(message)
    print()

    if not send_telegram(message):
        sys.exit(1)


if __name__ == '__main__':
    main()
