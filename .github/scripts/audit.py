#!/usr/bin/env python3
"""
GRG Mobile — Automated Code Audit Script
Triggered by GitHub Actions on push/pull_request events.
Analyzes diffs and generates a structured Russian-language report.
"""

import os
import subprocess
import sys
import re
from datetime import datetime, timezone
from pathlib import Path


def run_cmd(cmd: str) -> str:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip()


def get_base_sha() -> str:
    event = os.environ.get('GITHUB_EVENT_NAME', 'push')
    base_ref = os.environ.get('GITHUB_BASE_REF', '')

    if event == 'pull_request' and base_ref:
        base = run_cmd(f"git merge-base HEAD origin/{base_ref}")
        if base:
            return base

    prev = run_cmd("git rev-parse HEAD~1 2>/dev/null")
    if prev and len(prev) == 40:
        return prev

    return run_cmd("git rev-parse HEAD")


def get_changed_files(base_sha: str) -> list:
    output = run_cmd(f"git diff --name-only {base_sha} HEAD")
    return [f for f in output.split('\n') if f.strip()]


def get_diff(base_sha: str, path: str = '') -> str:
    if path:
        return run_cmd(f"git diff {base_sha} HEAD -- {path}")
    return run_cmd(f"git diff {base_sha} HEAD")


def get_file_content(path: str) -> str:
    return run_cmd(f"git show HEAD:{path} 2>/dev/null")


def is_new_file(base_sha: str, path: str) -> bool:
    result = run_cmd(f"git show {base_sha}:{path} 2>&1")
    return 'fatal' in result or 'exists' not in result and result == ''


# ─── Backend: Entities ────────────────────────────────────────────────────────

def check_entities(files: list, base_sha: str) -> dict:
    issues, info = [], []
    targets = [f for f in files if f.endswith('.entity.ts') and 'backend/' in f]

    for f in targets:
        fname = Path(f).name
        content = get_file_content(f)
        diff = get_diff(base_sha, f)

        if not content:
            continue

        # Must have @Entity decorator
        if '@Entity' not in content:
            issues.append(f'❌ {fname}: отсутствует @Entity() декоратор')

        # New nullable columns without default
        nullable_no_default = re.findall(
            r'@Column\(.*nullable:\s*true.*\)(?!.*default)',
            content
        )
        if nullable_no_default and '+@Column' in diff:
            issues.append(
                f'⚠️ {fname}: {len(nullable_no_default)} nullable-поля без default — '
                'может сломать существующие строки при синхронизации'
            )

        # Detect added columns
        added_cols = re.findall(r'^\+\s+(\w+)(?:!|[?:]).*Column', diff, re.MULTILINE)
        if added_cols:
            info.append(f'📋 {fname}: новые поля → {", ".join(added_cols[:6])}')
        else:
            info.append(f'📋 {fname}: изменена схема сущности')

        # Warn about removing columns (could break prod)
        removed_cols = re.findall(r'^-\s+@Column', diff, re.MULTILINE)
        if removed_cols:
            issues.append(
                f'⚠️ {fname}: удалены {len(removed_cols)} @Column — '
                'требуется миграция, иначе сломается prod'
            )

    return {'files': targets, 'issues': issues, 'info': info}


# ─── Backend: Migrations ──────────────────────────────────────────────────────

def check_migrations(files: list, base_sha: str) -> dict:
    issues, info = [], []
    targets = [
        f for f in files
        if ('migration' in f.lower() or 'Migration' in f) and 'backend/' in f
    ]

    for f in targets:
        fname = Path(f).name
        content = get_file_content(f)
        if not content:
            continue

        # Naming convention: should start with timestamp (13 digits)
        if not re.match(r'\d{13}', fname):
            issues.append(
                f'⚠️ {fname}: нестандартное имя миграции '
                '(ожидается формат <timestamp>-<description>.ts)'
            )

        # Must have async up()
        if 'async up(' not in content:
            issues.append(f'❌ {fname}: отсутствует метод up()')

        # Should have async down() for rollback
        if 'async down(' not in content:
            issues.append(
                f'⚠️ {fname}: отсутствует метод down() — '
                'откат невозможен'
            )

        # Dangerous DDL without transaction
        dangerous = re.findall(r'DROP\s+(?:TABLE|COLUMN|INDEX)', content, re.IGNORECASE)
        if dangerous:
            issues.append(
                f'🔥 {fname}: обнаружены опасные DDL-операции: '
                f'{", ".join(set(dangerous)[:3])}'
            )

        info.append(f'🔄 Миграция: {fname}')

    return {'files': targets, 'issues': issues, 'info': info}


# ─── Backend: Controllers & Security ─────────────────────────────────────────

def check_controllers(files: list, base_sha: str) -> dict:
    issues, info = [], []
    targets = [f for f in files if f.endswith('.controller.ts') and 'backend/' in f]

    for f in targets:
        fname = Path(f).name
        content = get_file_content(f)
        diff = get_diff(base_sha, f)
        if not content:
            continue

        # New HTTP method decorators added
        new_routes = re.findall(
            r'^\+\s+@(Get|Post|Put|Patch|Delete)\(',
            diff, re.MULTILINE
        )

        if new_routes:
            info.append(f'🌐 {fname}: новых роутов +{len(new_routes)} '
                        f'({", ".join(set(new_routes)[:5])})')

        # Controller-level guard check
        has_class_guard = bool(
            re.search(r'@UseGuards\(JwtAuthGuard\)\s*\n@Controller', content)
        )

        if new_routes and not has_class_guard:
            # Check individual route guards
            guarded_routes = re.findall(r'@UseGuards\(', content)
            if len(guarded_routes) < len(new_routes):
                issues.append(
                    f'🔒 {fname}: не все роуты защищены @UseGuards(JwtAuthGuard) — '
                    'проверь защиту новых эндпоинтов'
                )

        # Access control pattern
        if new_routes and 'accessService' not in content and 'findAllForUser' not in content:
            if 'admin' not in fname.lower():
                issues.append(
                    f'🔓 {fname}: нет паттерна accessService/findAllForUser — '
                    'возможна утечка данных между тенантами'
                )

    return {'files': targets, 'issues': issues, 'info': info}


# ─── Backend: go2rtc & Streaming ─────────────────────────────────────────────

def check_go2rtc(files: list, base_sha: str) -> dict:
    issues, info = [], []
    keywords = ['go2rtc', 'live-url', 'getLiveUrl', 'ensureStream',
                'getHlsUrl', 'getRtspProxyUrl', 'control.service',
                'control.controller', 'stream', 'rtsp']
    targets = [
        f for f in files
        if any(kw in f for kw in keywords) and 'backend/' in f
        and f.endswith('.ts')
    ]

    for f in targets:
        fname = Path(f).name
        content = get_file_content(f)
        diff = get_diff(base_sha, f)
        if not content or not diff:
            continue

        # New async functions should handle errors
        new_fns = re.findall(r'^\+\s+async (\w+)\(', diff, re.MULTILINE)
        for fn_name in new_fns:
            fn_body_match = re.search(
                rf'async {re.escape(fn_name)}\([^)]*\)[^{{]*{{(.*?)(?=\n  \w|\n}})',
                content, re.DOTALL
            )
            if fn_body_match:
                body = fn_body_match.group(1)
                if 'try {' not in body and 'catch' not in body:
                    issues.append(
                        f'⚠️ {fname}.{fn_name}(): нет try/catch — '
                        'необработанное исключение уронит запрос'
                    )

        # URL methods must be null-checked at call sites
        url_calls = re.findall(
            r'^\+.*\.(getHlsUrl|getRtspProxyUrl)\(', diff, re.MULTILINE
        )
        if url_calls:
            null_checks = re.findall(
                r'(?:=== null|!== null|\?\?|if \(.*Url|\?\.)',
                diff
            )
            if not null_checks:
                issues.append(
                    f'⚠️ {fname}: вызов URL-метода без проверки null — '
                    'если go2rtc не настроен, клиент получит null'
                )

        info.append(f'📹 {fname}: изменения видеостриминга')

    return {'files': targets, 'issues': issues, 'info': info}


# ─── Flutter ──────────────────────────────────────────────────────────────────

def check_flutter(files: list, base_sha: str) -> dict:
    issues, info = [], []
    targets = [f for f in files if f.startswith('lib/') and f.endswith('.dart')]

    # Expected directory layout
    screen_dirs = {'lib/screens'}
    widget_dirs = {'lib/widgets'}
    service_dirs = {'lib/services'}

    for f in targets:
        parts = Path(f).parts  # e.g. ('lib', 'screens', 'home_screen.dart')
        fname = Path(f).name
        parent = str(Path(f).parent)
        content = get_file_content(f)
        if not content:
            continue

        is_screen = (
            'Screen' in fname or 'Page' in fname or
            ('Scaffold(' in content and 'build(' in content)
        )
        is_widget = (
            ('StatelessWidget' in content or 'StatefulWidget' in content)
            and not is_screen
        )
        is_service = fname.endswith('_service.dart') or 'Service' in fname

        # Structure checks
        if is_screen and parent not in screen_dirs:
            issues.append(
                f'📁 {f}: экран вне lib/screens/ '
                f'(текущее место: {parent}/)'
            )
        elif is_widget and parent not in widget_dirs and parent not in screen_dirs:
            if len(parts) == 2:  # root lib/
                issues.append(f'📁 {f}: виджет в корне lib/, ожидается lib/widgets/')
        elif is_service and parent not in service_dirs:
            issues.append(
                f'📁 {f}: сервис вне lib/services/ '
                f'(текущее место: {parent}/)'
            )

        # Deprecated BackendClient usage patterns
        diff = get_diff(base_sha, f)
        if '+import' in diff and 'backend_client' in diff:
            info.append(f'🔗 {fname}: подключает BackendClient')

        label = '📱 Экран' if is_screen else ('🧩 Виджет' if is_widget else '📄 Файл')
        info.append(f'{label}: {f}')

    return {'files': targets, 'issues': issues, 'info': info}


# ─── Report builder ───────────────────────────────────────────────────────────

def generate_report() -> str:
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    event = os.environ.get('GITHUB_EVENT_NAME', 'push')
    repo = os.environ.get('REPO_NAME', 'unknown')
    actor = os.environ.get('ACTOR', 'unknown')
    sha_full = os.environ.get('GITHUB_SHA', '')
    sha = sha_full[:7] if sha_full else 'unknown'
    ref = os.environ.get('GITHUB_REF', '').replace('refs/heads/', '').replace('refs/pull/', 'PR #')
    pr_num = os.environ.get('PR_NUMBER', '')

    base_sha = get_base_sha()
    changed = get_changed_files(base_sha)

    if not changed or changed == ['']:
        return (
            f'<b>🔍 GRG Mobile — Аудит кода</b>\n'
            f'📅 {now}\n'
            f'Нет изменённых файлов для анализа.'
        )

    entities = check_entities(changed, base_sha)
    migrations = check_migrations(changed, base_sha)
    controllers = check_controllers(changed, base_sha)
    go2rtc = check_go2rtc(changed, base_sha)
    flutter = check_flutter(changed, base_sha)

    all_issues = (
        entities['issues'] + migrations['issues'] +
        controllers['issues'] + go2rtc['issues'] + flutter['issues']
    )
    critical = [i for i in all_issues if i.startswith('❌') or i.startswith('🔥')]
    warnings = [i for i in all_issues if i not in critical]

    event_label = f'PR #{pr_num}' if pr_num else f'push → {ref}'
    if critical:
        status = '❌ КРИТИЧЕСКИЕ ПРОБЛЕМЫ'
    elif warnings:
        status = '⚠️ ЕСТЬ ПРЕДУПРЕЖДЕНИЯ'
    else:
        status = '✅ ПРОБЛЕМ НЕ НАЙДЕНО'

    lines = [
        f'<b>🔍 GRG Mobile — Аудит кода</b>',
        f'📅 {now}',
        f'👤 {actor} | {event_label} | <code>{sha}</code>',
        f'📂 Файлов изменено: {len(changed)}',
        f'',
        f'<b>Статус: {status}</b>',
    ]

    # Backend section
    backend_info = entities['info'] + migrations['info'] + controllers['info']
    backend_files = entities['files'] + migrations['files'] + controllers['files']
    if backend_files:
        lines.append(f'\n<b>🔧 Backend (NestJS) — {len(backend_files)} файл(ов)</b>')
        for item in backend_info[:8]:
            lines.append(f'  {item}')

    # Streaming section
    if go2rtc['files']:
        lines.append(f'\n<b>📹 Видеостриминг (go2rtc)</b>')
        for item in go2rtc['info']:
            lines.append(f'  {item}')

    # Flutter section
    if flutter['files']:
        lines.append(f'\n<b>📱 Flutter — {len(flutter["files"])} файл(ов)</b>')
        shown = [i for i in flutter['info'] if not i.startswith('📄')][:6]
        for item in shown:
            lines.append(f'  {item}')
        if len(flutter['files']) > 6:
            lines.append(f'  ... и ещё {len(flutter["files"]) - 6} файлов')

    # Issues section
    if critical:
        lines.append(f'\n<b>❌ Критические проблемы ({len(critical)})</b>')
        for issue in critical:
            lines.append(f'  {issue}')

    if warnings:
        lines.append(f'\n<b>⚠️ Предупреждения ({len(warnings)})</b>')
        for issue in warnings[:6]:
            lines.append(f'  {issue}')
        if len(warnings) > 6:
            lines.append(f'  ... и ещё {len(warnings) - 6}')

    # Changed files summary
    lines.append(f'\n<b>📝 Изменённые файлы</b>')
    for f in changed[:12]:
        lines.append(f'  • <code>{f}</code>')
    if len(changed) > 12:
        lines.append(f'  ... и ещё {len(changed) - 12}')

    lines.append(f'\n<i>Репозиторий: {repo}</i>')

    return '\n'.join(lines)


if __name__ == '__main__':
    try:
        report = generate_report()
        print(report)
    except Exception as e:
        import traceback
        print(
            f'<b>❌ Ошибка аудита</b>\n'
            f'<code>{type(e).__name__}: {e}</code>\n'
            f'<pre>{traceback.format_exc()[-600:]}</pre>'
        )
        sys.exit(1)
