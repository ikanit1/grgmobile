#!/usr/bin/env node
/**
 * Builds audit report from environment variables set by the workflow
 * and sends it to Telegram via Bot API.
 */
const https = require('https');
const fs = require('fs');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set as GitHub Secrets');
  process.exit(1);
}

const {
  EVENT_NAME,
  REPO,
  BRANCH,
  COMMIT_SHA,
  COMMIT_MSG,
  ACTOR,
  PR_NUMBER,
  HAS_BACKEND,
  HAS_FLUTTER,
  HAS_STREAMING,
  TS_ERRORS,
  TS_OUTPUT,
  MIGRATION_OUTPUT,
  FLUTTER_ISSUES,
  FLUTTER_OUTPUT,
  STREAMING_OUTPUT,
} = process.env;

// Changed files list
let changedFiles = [];
try {
  changedFiles = fs.readFileSync('/tmp/changed_files.txt', 'utf8').trim().split('\n').filter(Boolean);
} catch (_) {}

// ── Build report ─────────────────────────────────────────────────────────────
const shortSha = (COMMIT_SHA || '').slice(0, 7);
const eventIcon = EVENT_NAME === 'pull_request' ? '🔀 Pull Request' : '📦 Push';
const prInfo = PR_NUMBER ? ` #${PR_NUMBER}` : '';

const lines = [];
lines.push(`🔍 *Авто-аудит GRG Mobile*`);
lines.push(`${eventIcon}${prInfo} → \`${BRANCH}\``);
lines.push(`👤 ${escMd(ACTOR || 'unknown')} | \`${shortSha}\``);
if (COMMIT_MSG) {
  lines.push(`💬 ${escMd(truncate(COMMIT_MSG, 80))}`);
}
lines.push(`📁 Изменено файлов: ${changedFiles.length}`);
lines.push('');

// Backend
if (HAS_BACKEND === 'true') {
  const tsErr = parseInt(TS_ERRORS || '0', 10);
  const tsIcon = tsErr === 0 ? '✅' : '❌';
  lines.push(`*Backend (NestJS)*`);
  lines.push(`${tsIcon} TypeScript: ${tsErr === 0 ? 'ошибок нет' : `${tsErr} строк ошибок`}`);

  if (MIGRATION_OUTPUT) {
    const migLines = MIGRATION_OUTPUT.trim().split('\n');
    const summary = migLines.find(l => l.includes('Summary')) || migLines[0] || '';
    const hasCritical = migLines.some(l => l.includes('❌'));
    const hasWarning = migLines.some(l => l.includes('⚠️'));
    const migIcon = hasCritical ? '❌' : hasWarning ? '⚠️' : '✅';
    lines.push(`${migIcon} Схема/миграции: ${escMd(truncate(summary, 100))}`);
    if (hasCritical || hasWarning) {
      const details = migLines.filter(l => l.includes('❌') || l.includes('⚠️')).slice(0, 5);
      details.forEach(d => lines.push(`  ${escMd(d.trim())}`));
    }
  }

  if (tsErr > 0 && TS_OUTPUT) {
    lines.push(`\`\`\``);
    lines.push(truncate(TS_OUTPUT, 300));
    lines.push(`\`\`\``);
  }
  lines.push('');
}

// Flutter
if (HAS_FLUTTER === 'true') {
  const flutterIssues = parseInt(FLUTTER_ISSUES || '0', 10);
  const flutterIcon = flutterIssues === 0 ? '✅' : flutterIssues < 5 ? '⚠️' : '❌';
  lines.push(`*Flutter*`);
  lines.push(`${flutterIcon} Анализ: ${flutterIssues === 0 ? 'нет замечаний' : `${flutterIssues} предупреждений`}`);

  if (flutterIssues > 0 && FLUTTER_OUTPUT) {
    lines.push(`\`\`\``);
    lines.push(truncate(FLUTTER_OUTPUT, 300));
    lines.push(`\`\`\``);
  }
  lines.push('');
}

// Streaming
if (HAS_STREAMING === 'true') {
  lines.push(`*Видеостриминг (go2rtc/RTSP)*`);
  if (STREAMING_OUTPUT) {
    const sLines = STREAMING_OUTPUT.trim().split('\n');
    const hasCritical = sLines.some(l => l.includes('❌'));
    const hasWarning = sLines.some(l => l.includes('⚠️'));
    const sIcon = hasCritical ? '❌' : hasWarning ? '⚠️' : '✅';
    const summary = sLines.find(l => l.includes('Summary')) || sLines[0] || 'OK';
    lines.push(`${sIcon} ${escMd(truncate(summary, 100))}`);
    if (hasCritical || hasWarning) {
      sLines.filter(l => l.includes('❌') || l.includes('⚠️')).slice(0, 5)
        .forEach(d => lines.push(`  ${escMd(d.trim())}`));
    }
  } else {
    lines.push(`✅ Изменений в стриминге нет`);
  }
  lines.push('');
}

// What changed (top files)
if (changedFiles.length > 0) {
  lines.push(`*Изменённые файлы (до 10)*`);
  changedFiles.slice(0, 10).forEach(f => lines.push(`  • \`${escMd(f)}\``));
  if (changedFiles.length > 10) lines.push(`  _... и ещё ${changedFiles.length - 10} файлов_`);
  lines.push('');
}

// Overall verdict
const allOk =
  (HAS_BACKEND !== 'true' || (parseInt(TS_ERRORS || '0', 10) === 0)) &&
  (HAS_FLUTTER !== 'true' || (parseInt(FLUTTER_ISSUES || '0', 10) === 0));

lines.push(allOk
  ? `🟢 *Итог: критических проблем не обнаружено*`
  : `🔴 *Итог: обнаружены проблемы — требуется проверка*`);

const message = lines.join('\n');

// ── Send to Telegram ─────────────────────────────────────────────────────────
sendTelegram(message);

function sendTelegram(text) {
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text: text.slice(0, 4096), // Telegram max message length
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      const parsed = JSON.parse(data);
      if (parsed.ok) {
        console.log('Telegram report sent successfully');
      } else {
        console.error('Telegram API error:', parsed.description);
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Failed to send Telegram message:', e.message);
    process.exit(1);
  });

  req.write(body);
  req.end();
}

function escMd(str) {
  // Escape Markdown v1 special chars (*, _, `, [)
  return (str || '').replace(/([*_`\[])/g, '\\$1');
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : str || '';
}
