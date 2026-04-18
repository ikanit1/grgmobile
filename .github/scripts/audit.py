#!/usr/bin/env python3
"""Automated code audit for GRG Mobile repository.

Triggered by GitHub Actions on every push/pull_request.
Checks NestJS backend migrations, Flutter UI structure,
and go2rtc streaming error handling, then sends a Telegram report.
"""

import os
import re
import sys
import requests
from pathlib import Path
from typing import List, Dict

# ── Environment ──────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '')
EVENT_NAME = os.environ.get('EVENT_NAME', 'push')
REPO = os.environ.get('REPO', 'unknown/repo')
BRANCH = os.environ.get('BRANCH', '')
COMMIT_SHA = os.environ.get('COMMIT_SHA', '')[:7]
COMMIT_MESSAGE = os.environ.get('COMMIT_MESSAGE', '').split('\n')[0][:80]
PR_NUMBER = os.environ.get('PR_NUMBER', '')
ACTOR = os.environ.get('ACTOR', '')
SERVER_URL = os.environ.get('SERVER_URL', 'https://github.com')

REPO_ROOT = Path('.')
CHANGED_FILES_PATH = '/tmp/changed_files.txt'


# ── File collection ───────────────────────────────────────────────────────────

def read_changed_files() -> List[str]:
    try:
        with open(CHANGED_FILES_PATH) as f:
            return [line.strip() for line in f if line.strip()]
    except OSError:
        return []


def categorize(files: List[str]) -> Dict[str, List[str]]:
    cats: Dict[str, List[str]] = {
        'backend': [],
        'flutter': [],
        'migrations': [],
        'entities': [],
        'streaming': [],
        'config': [],
    }
    for f in files:
        if f.startswith('backend/'):
            cats['backend'].append(f)
            if re.search(r'migration', f, re.I) or '/migrations/' in f:
                cats['migrations'].append(f)
            if f.endswith('.entity.ts'):
                cats['entities'].append(f)
        if f.startswith('lib/') or f.endswith('.dart'):
            cats['flutter'].append(f)
        if re.search(r'go2rtc|mediamtx|rtsp|live.url|streaming', f, re.I):
            cats['streaming'].append(f)
        if f.endswith(('.yaml', '.yml', '.json', '.env', '.env.example')):
            cats['config'].append(f)
    return cats


# ── Checks ───────────────────────────────────────────────────────────────────

def _read(path: str) -> str:
    try:
        return (REPO_ROOT / path).read_text(encoding='utf-8', errors='ignore')
    except OSError:
        return ''


def check_migrations(entities: List[str], migrations: List[str]) -> List[str]:
    """Entity changed but no migration file present → warn."""
    if entities and not migrations:
        names = ', '.join(Path(f).stem.replace('.entity', '') for f in entities[:3])
        suffix = f' + ещё {len(entities) - 3}' if len(entities) > 3 else ''
        return [f'⚠️ Изменены сущности ({names}{suffix}), файлы миграций не найдены']
    return []


def check_backend_async(backend_files: List[str]) -> List[str]:
    """Service/client async methods should have try/catch."""
    issues = []
    targets = [f for f in backend_files
               if f.endswith(('.service.ts', '.client.ts'))
               and 'spec' not in f]
    for fpath in targets:
        content = _read(fpath)
        if not content:
            continue
        has_async = bool(re.search(r'async\s+\w+\s*\(', content))
        has_guard = any(x in content for x in ('try {', 'try{', '.catch('))
        if has_async and not has_guard:
            name = Path(fpath).name
            issues.append(f'⚠️ {name}: async методы без try/catch')
    return issues


def check_streaming_errors(files: List[str]) -> List[str]:
    """go2rtc/streaming calls must be wrapped in error handling."""
    issues = []
    streaming_kw = ('go2rtc', 'ensureStream', 'liveUrl', 'live-url', 'Go2rtcClient')
    error_kw = ('try {', 'try{', 'catch', '.catch(', 'HttpException',
                 'BadGatewayException', 'ServiceUnavailableException')
    for fpath in files:
        if not fpath.endswith('.ts'):
            continue
        content = _read(fpath)
        if not content:
            continue
        if not any(kw in content for kw in streaming_kw):
            continue
        if not any(kw in content for kw in error_kw):
            name = Path(fpath).name
            issues.append(f'⚠️ {name}: стриминг-вызовы без обработки ошибок')
    return issues


def check_flutter(flutter_files: List[str]) -> List[str]:
    """Basic Flutter safety checks."""
    issues = []
    for fpath in flutter_files:
        if not fpath.endswith('.dart'):
            continue
        content = _read(fpath)
        if not content:
            continue
        name = Path(fpath).name
        # setState without mounted guard
        if 'StatefulWidget' in content and 'setState' in content \
                and 'mounted' not in content:
            issues.append(f'⚠️ {name}: setState без проверки mounted')
        # async initState without mounted
        if 'initState' in content and 'async' in content \
                and 'mounted' not in content:
            issues.append(f'⚠️ {name}: async в initState без проверки mounted')
        # API calls without error handling
        if ('BackendClient' in content or 'http.' in content) \
                and 'catch' not in content and 'try' not in content:
            issues.append(f'⚠️ {name}: HTTP-вызовы без обработки ошибок')
    return issues


def collect_new_endpoints(backend_files: List[str]) -> List[str]:
    endpoints = []
    for fpath in [f for f in backend_files if f.endswith('.controller.ts')]:
        content = _read(fpath)
        if not content:
            continue
        for method, route in re.findall(
            r'@(Get|Post|Put|Patch|Delete)\([\'"]?([^\'")\s]*)[\'"]?\)',
            content
        ):
            endpoints.append(f'  {method.upper():6} /{route.lstrip("/")}')
    return endpoints


def collect_entity_summary(entity_files: List[str]) -> List[str]:
    summaries = []
    for fpath in entity_files:
        content = _read(fpath)
        if not content:
            continue
        cols = len(re.findall(r'@Column\(', content))
        rels = len(re.findall(r'@(ManyToOne|OneToMany|ManyToMany|OneToOne)\(', content))
        name = Path(fpath).stem.replace('.entity', '')
        summaries.append(f'  📦 {name}: {cols} колонок, {rels} связей')
    return summaries


# ── Report builder ────────────────────────────────────────────────────────────

def build_report(
    changed: List[str],
    cats: Dict[str, List[str]],
    issues: List[str],
    endpoints: List[str],
    entity_summary: List[str],
) -> str:
    lines = []

    # Header
    if EVENT_NAME == 'pull_request':
        lines.append(f'🔀 *PR #{PR_NUMBER}* — `{REPO}`')
    else:
        lines.append(f'📤 *Push* → `{BRANCH}` — `{REPO}`')
    if COMMIT_MESSAGE:
        lines.append(f'📋 {COMMIT_MESSAGE}')
    lines.append(f'👤 {ACTOR} | 🔖 `{COMMIT_SHA}`')

    # Change summary
    lines.append('')
    lines.append('📊 *Сводка изменений:*')
    if cats['backend']:
        lines.append(f'  🖥 Backend (NestJS): {len(cats["backend"])} файлов')
    if cats['flutter']:
        lines.append(f'  📱 Flutter: {len(cats["flutter"])} файлов')
    if cats['streaming']:
        lines.append(f'  🎥 Стриминг: {len(cats["streaming"])} файлов')
    if cats['config']:
        lines.append(f'  ⚙️ Конфиги: {len(cats["config"])} файлов')
    if not any(cats[k] for k in ('backend', 'flutter', 'streaming', 'config')):
        lines.append(f'  📄 Прочие файлы: {len(changed)}')

    # PostgreSQL / entity section
    if entity_summary:
        lines.append('')
        lines.append('🗄 *Схемы БД (TypeORM entities):*')
        lines.extend(entity_summary[:5])
        if cats['migrations']:
            lines.append(f'  ✅ Файлы миграций: {len(cats["migrations"])}')
        else:
            lines.append('  ❌ Файлы миграций не найдены!')

    # New endpoints
    if endpoints:
        lines.append('')
        lines.append('🔌 *Эндпоинты в изменённых контроллерах:*')
        lines.extend(endpoints[:10])
        if len(endpoints) > 10:
            lines.append(f'  … и ещё {len(endpoints) - 10}')

    # Issues
    critical = [i for i in issues if '❌' in i]
    warnings = [i for i in issues if '⚠️' in i]

    if critical:
        lines.append('')
        lines.append('❌ *Критические проблемы:*')
        lines.extend(critical[:5])
    if warnings:
        lines.append('')
        lines.append('⚠️ *Предупреждения:*')
        lines.extend(warnings[:7])

    # Verdict
    lines.append('')
    if not issues:
        lines.append('✅ *Итог: проблем не обнаружено*')
    elif critical:
        lines.append(
            f'🔴 *Итог: {len(critical)} критических, {len(warnings)} предупреждений*'
        )
    else:
        lines.append(f'🟡 *Итог: {len(warnings)} предупреждений*')

    lines.append(f'📁 Всего изменено файлов: {len(changed)}')

    return '\n'.join(lines)


# ── Telegram sender ───────────────────────────────────────────────────────────

def send_telegram(text: str) -> bool:
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured', file=sys.stderr)
        return False

    url = f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage'
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': text,
        'parse_mode': 'Markdown',
        'disable_web_page_preview': True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=30)
        data = resp.json()
        if data.get('ok'):
            print('Telegram: message sent successfully')
            return True
        print(f'Telegram API error: {data}', file=sys.stderr)
        return False
    except Exception as exc:
        print(f'Telegram request failed: {exc}', file=sys.stderr)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    changed = read_changed_files()
    cats = categorize(changed)

    issues: List[str] = []

    if cats['backend']:
        issues += check_migrations(cats['entities'], cats['migrations'])
        issues += check_backend_async(cats['backend'])
        issues += check_streaming_errors(cats['backend'])

    if cats['flutter']:
        issues += check_flutter(cats['flutter'])

    endpoints = collect_new_endpoints(cats['backend'])
    entity_summary = collect_entity_summary(cats['entities'])

    report = build_report(changed, cats, issues, endpoints, entity_summary)

    print('=== AUDIT REPORT ===')
    print(report)
    print('====================')

    ok = send_telegram(report)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
