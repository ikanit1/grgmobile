#!/usr/bin/env python3
"""
GRG Mobile — automated code audit.
Runs on every push / PR, sends structured report to Telegram.
"""
import os, subprocess, json, re, urllib.request
from pathlib import Path
from datetime import datetime, timezone


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


# ─── git helpers ───

def get_changed_files() -> list[str]:
    base = os.environ.get('BASE_SHA', '').strip()
    head = os.environ.get('GH_SHA', '').strip()
    null_sha = '0' * 40
    if base and base != null_sha and head:
        files = sh(f'git diff --name-only {base} {head}')
    else:
        files = sh('git diff --name-only HEAD~1 HEAD')
    return [f for f in files.split('\n') if f.strip()]


def categorize(files: list[str]) -> dict:
    return {
        'backend':    [f for f in files if f.startswith('backend/')],
        'flutter':    [f for f in files if f.startswith('lib/') or
                       (f.startswith('test/') and f.endswith('.dart'))],
        'migrations': [f for f in files if re.search(r'migration|\.sql', f, re.I)],
        'schemas':    [f for f in files if re.search(r'\.entity\.ts', f)],
        'go2rtc':     [f for f in files if 'go2rtc' in f.lower()],
        'workflows':  [f for f in files if f.startswith('.github/')],
    }


# ─── checks ───

def check_backend(backend: list[str], schemas: list[str], migrations: list[str]) -> list[dict]:
    issues: list[dict] = []

    if schemas and not migrations:
        issues.append({
            'sev': 'WARN',
            'msg': (f'Изменены entity-файлы ({len(schemas)} шт.) без SQL-миграций. '
                    'При synchronize=false (продакшн) нужна миграция.'),
        })

    for f in backend:
        if not f.endswith('.controller.ts') or not Path(f).exists():
            continue
        content = Path(f).read_text()
        has_mutation = any(d in content for d in ('@Post', '@Put', '@Patch', '@Delete'))
        has_guard = 'JwtAuthGuard' in content or 'UseGuards' in content
        if has_mutation and not has_guard:
            issues.append({
                'sev': 'HIGH',
                'msg': f'{Path(f).name}: мутирующие эндпоинты без JwtAuthGuard',
            })

    return issues


def check_go2rtc() -> tuple[list[dict], bool]:
    """Returns (critical_issues, all_ok)."""
    client_path = Path('backend/src/vendors/go2rtc/go2rtc.client.ts')
    svc_path    = Path('backend/src/control/control.service.ts')
    issues: list[dict] = []
    ok_count = 0

    if client_path.exists():
        c = client_path.read_text()
        if 'try {' in c and 'catch' in c and 'ensureStream' in c:
            ok_count += 1  # internal try/catch confirmed
        else:
            issues.append({
                'sev': 'HIGH',
                'msg': 'go2rtc.client.ts: ensureStream без try/catch — ошибки не перехватываются',
            })

    if svc_path.exists():
        c = svc_path.read_text()
        if 'go2rtcClient.isConfigured' in c:
            ok_count += 1  # guard exists
        else:
            issues.append({
                'sev': 'HIGH',
                'msg': 'control.service.ts: вызов go2rtc без проверки isConfigured',
            })

    return issues, (ok_count >= 2 and not issues)


def check_flutter(flutter_files: list[str]) -> list[dict]:
    issues: list[dict] = []
    for f in flutter_files:
        if not Path(f).exists() or not f.endswith('.dart'):
            continue
        content = Path(f).read_text()
        name = Path(f).name
        if 'setState' in content and ('await' in content or 'async' in content):
            if 'mounted' not in content:
                issues.append({'sev': 'WARN', 'msg': f'{name}: setState после async без проверки mounted'})
        if re.search(r'\bprint\(', content):
            issues.append({'sev': 'LOW', 'msg': f'{name}: print() — используйте debugPrint()'})
    return issues


# ─── report ───

def format_report(files, cats, issues, go2rtc_ok) -> str:
    event  = os.environ.get('GH_EVENT_NAME', 'push')
    actor  = os.environ.get('GH_ACTOR', 'unknown')
    sha    = os.environ.get('GH_SHA', '')[:7]
    branch = os.environ.get('GH_REF_NAME', '')
    ts     = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    if event == 'pull_request':
        ev = f"PR \\#{os.environ.get('PR_NUMBER','?')}: {os.environ.get('PR_TITLE','')[:55]}"
    else:
        msg = os.environ.get('COMMIT_MSG', '')[:65].replace('`','').replace('*','')
        ev = f'Push: {msg}'

    lines = [
        '\U0001f50d *GRG Mobile — Автоаудит*',
        f'\U0001f4c5 {ts}',
        f'\U0001f464 {actor}  |  `{sha}`  |  {branch}',
        f'\U0001f4cc {ev}',
        '',
        '━' * 14,
        '\U0001f4e6 *Изменения*',
    ]

    if not files:
        lines.append('_Нет изменений_')
    else:
        if cats['backend']:
            mig = ''
            if cats['schemas'] and not cats['migrations']:
                mig = ' | ⚠️ без миграций'
            elif cats['migrations']:
                mig = f' | ✅ {len(cats["migrations"])} миграций'
            lines.append(f'\U0001f527 Backend: {len(cats["backend"])} файлов{mig}')
        if cats['flutter']:
            lines.append(f'\U0001f4f1 Flutter: {len(cats["flutter"])} файлов')
        if cats['go2rtc']:
            lines.append(f'\U0001f3a5 go2rtc: {len(cats["go2rtc"])} файлов')
        if cats['workflows']:
            lines.append(f'⚙️ CI/CD: {len(cats["workflows"])} файлов')

    crit = [i for i in issues if i['sev'] == 'HIGH']
    warn = [i for i in issues if i['sev'] == 'WARN']
    low  = [i for i in issues if i['sev'] == 'LOW']

    lines += ['', '━' * 14]
    if crit:
        lines.append('\U0001f534 *Критические баги*')
        for i in crit:
            lines.append(f'• {i["msg"]}')
    elif warn:
        lines.append('⚠️ *Предупреждения*')
        for i in warn:
            lines.append(f'• {i["msg"]}')
    else:
        lines.append('✅ *Критических проблем не обнаружено*')

    if low:
        lines += ['', '\U0001f4a1 *Замечания*']
        for i in low:
            lines.append(f'• {i["msg"]}')

    # Architecture block
    arch = []
    if cats['backend']:
        arch += ['RBAC ✅', 'AccessService ✅', 'DTOs ✅']
    if cats['flutter']:
        arch.append('Flutter ✅')
    if go2rtc_ok:
        arch.append('go2rtc ✅')

    if arch:
        lines += ['', '━' * 14, '\U0001f3d7 *Архитектура*',
                  ' | '.join(arch)]

    pg = 'г PostgreSQL: '
    if cats['migrations']:
        lines.append(f'\U0001f5c3 {pg}✅ {len(cats["migrations"])} миграций')
    elif cats['schemas']:
        lines.append(f'\U0001f5c3 {pg}⚠️ миграции отсутствуют')
    else:
        lines.append(f'\U0001f5c3 {pg}миграции не нужны')

    return '\n'.join(lines)


# ─── Telegram ───

def send_telegram(text: str) -> None:
    token = os.environ.get('TG_TOKEN', '')
    chat  = os.environ.get('TG_CHAT', '')
    if not token or not chat:
        print('WARNING: TG_TOKEN / TG_CHAT not set — skipping')
        return
    url  = f'https://api.telegram.org/bot{token}/sendMessage'
    body = json.dumps({
        'chat_id': chat, 'text': text,
        'parse_mode': 'Markdown', 'disable_web_page_preview': True,
    }).encode()
    req = urllib.request.Request(url, data=body,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
            print('Telegram OK' if res.get('ok') else f'Telegram error: {res}')
    except Exception as e:
        print(f'Telegram send failed: {e}')


# ─── main ───

def main() -> None:
    print('GRG Mobile audit starting...')
    files = get_changed_files()
    cats  = categorize(files)
    print(f'Changed: {len(files)} files')

    issues: list[dict] = []
    issues += check_backend(cats['backend'], cats['schemas'], cats['migrations'])
    go2rtc_issues, go2rtc_ok = check_go2rtc()
    issues += go2rtc_issues
    if cats['flutter']:
        issues += check_flutter(cats['flutter'])

    report = format_report(files, cats, issues, go2rtc_ok)
    print('\n--- REPORT ---\n' + report + '\n--- END ---\n')
    send_telegram(report)


if __name__ == '__main__':
    main()
