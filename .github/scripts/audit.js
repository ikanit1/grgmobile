#!/usr/bin/env node
/**
 * GRG Mobile — Automated Audit Script
 * Triggered by GitHub Actions on push / pull_request.
 * Analyses changed files and sends a Telegram report.
 */

const { execSync } = require('child_process');
const https = require('https');

// ── Environment ─────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;
const EVENT_NAME     = process.env.GITHUB_EVENT_NAME  || 'unknown';
const REPO           = process.env.GITHUB_REPOSITORY  || 'unknown/repo';
const REF            = process.env.GITHUB_REF_NAME    || '';
const SHA            = (process.env.GITHUB_SHA        || '').slice(0, 8);
const ACTOR          = process.env.GITHUB_ACTOR       || 'unknown';
const PR_TITLE       = process.env.PR_TITLE           || '';
const PR_NUMBER      = process.env.PR_NUMBER          || '';
const BASE_SHA       = process.env.BASE_SHA           || '';
const HEAD_SHA       = process.env.HEAD_SHA           || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function getChangedFiles() {
  let files = '';
  if (BASE_SHA && HEAD_SHA) {
    files = run(`git diff --name-only ${BASE_SHA} ${HEAD_SHA}`);
  } else {
    files = run('git diff --name-only HEAD~1 HEAD');
  }
  return files ? files.split('\n').filter(Boolean) : [];
}

function fileContains(path, pattern) {
  try {
    const content = run(`git show HEAD:${path} 2>/dev/null || cat ${path} 2>/dev/null`);
    return pattern.test(content);
  } catch {
    return false;
  }
}

function getDiff(path) {
  if (BASE_SHA && HEAD_SHA) {
    return run(`git diff ${BASE_SHA} ${HEAD_SHA} -- "${path}"`);
  }
  return run(`git diff HEAD~1 HEAD -- "${path}"`);
}

// ── Categorise files ─────────────────────────────────────────────────────────
function categorise(files) {
  return {
    backend:    files.filter(f => f.startsWith('backend/')),
    flutter:    files.filter(f => f.startsWith('lib/') || f.endsWith('.dart')),
    migrations: files.filter(f => /migration|\.sql$/i.test(f)),
    entities:   files.filter(f => /\.entity\.ts$/.test(f)),
    schemas:    files.filter(f => /schema|dto/i.test(f) && f.endsWith('.ts')),
    streaming:  files.filter(f => /go2rtc|stream|rtsp|live/i.test(f)),
    modules:    files.filter(f => /\.module\.ts$/.test(f)),
    controllers: files.filter(f => /\.controller\.ts$/.test(f)),
    services:   files.filter(f => /\.service\.ts$/.test(f)),
    workflows:  files.filter(f => f.startsWith('.github/')),
    configs:    files.filter(f => /\.(env|json|yaml|yml)$/.test(f) && !f.startsWith('.github/')),
  };
}

// ── Audit: Backend ────────────────────────────────────────────────────────────
function auditBackend(cat) {
  const issues = [];
  const ok     = [];

  // Migrations
  if (cat.migrations.length > 0) {
    cat.migrations.forEach(f => {
      const diff = getDiff(f);
      if (/DROP TABLE|DROP COLUMN|ALTER COLUMN/i.test(diff)) {
        issues.push(`⚠️ Деструктивная миграция в \`${f}\` (DROP/ALTER — проверь обратную совместимость)`);
      } else {
        ok.push(`✅ Миграция \`${f}\` — только аддитивные изменения`);
      }
    });
  }

  // Entities
  if (cat.entities.length > 0) {
    cat.entities.forEach(f => {
      const diff = getDiff(f);
      const hasColumnChange = /@Column|@PrimaryGeneratedColumn|@ManyToOne|@OneToMany|@ManyToMany/.test(diff);
      const hasMigration    = cat.migrations.length > 0;
      if (hasColumnChange && !hasMigration) {
        issues.push(`⚠️ Изменена схема сущности \`${f}\`, но миграция не найдена (только synchronize:true спасёт в dev)`);
      } else if (hasColumnChange) {
        ok.push(`✅ Сущность \`${f}\` изменена — сопровождается миграцией`);
      }
    });
  }

  // Module imports check
  if (cat.services.length > 0) {
    cat.services.forEach(f => {
      const diff = getDiff(f);
      // New injectable service added — check module wiring
      if (/\+.*@Injectable/.test(diff)) {
        const hasModuleChange = cat.modules.length > 0;
        if (!hasModuleChange) {
          issues.push(`⚠️ Новый @Injectable в \`${f}\`, но .module.ts не изменён — возможна UnknownDependenciesException`);
        } else {
          ok.push(`✅ Новый сервис \`${f}\` — модуль обновлён`);
        }
      }
    });
  }

  // Controllers — auth guard check
  if (cat.controllers.length > 0) {
    cat.controllers.forEach(f => {
      const diff = getDiff(f);
      const newRoutes = (diff.match(/^\+.*@(Get|Post|Put|Patch|Delete)\(/gm) || []).length;
      if (newRoutes > 0) {
        const hasGuard = /@UseGuards|@Roles|JwtAuthGuard/.test(diff);
        if (!hasGuard) {
          issues.push(`⚠️ ${newRoutes} новых маршрутов в \`${f}\` без явных guard-декораторов — проверь авторизацию`);
        } else {
          ok.push(`✅ Новые маршруты в \`${f}\` защищены guard-ами`);
        }
      }
    });
  }

  // Access control pattern
  cat.backend.filter(f => f.endsWith('.service.ts')).forEach(f => {
    const diff = getDiff(f);
    if (/\+.*find(All|One|Many)/.test(diff) && !/findAllForUser|findByIdForUser|accessService/.test(diff)) {
      issues.push(`⚠️ Новый find-запрос в \`${f}\` — убедись, что используется фильтрация по пользователю (RBAC)`);
    }
  });

  return { issues, ok };
}

// ── Audit: Flutter ────────────────────────────────────────────────────────────
function auditFlutter(cat) {
  const issues = [];
  const ok     = [];

  cat.flutter.forEach(f => {
    const diff = getDiff(f);

    // API calls without error handling
    if (/BackendClient\.|http\.get|http\.post|dio\./.test(diff)) {
      if (!/(try\s*\{|\.catchError|onError)/.test(diff)) {
        issues.push(`⚠️ HTTP-вызов в \`${f}\` без try/catch или catchError`);
      } else {
        ok.push(`✅ HTTP-вызов в \`${f}\` обёрнут в обработчик ошибок`);
      }
    }

    // Navigator without mounted check
    if (/Navigator\.(push|pop|pushReplacement)/.test(diff) && !/mounted/.test(diff)) {
      issues.push(`⚠️ Navigator вызывается в \`${f}\` без проверки mounted (утечка контекста)`);
    }

    // Hardcoded API URLs
    if (/["']https?:\/\/[^'"]+["']/.test(diff) && !/ApiConfig|localhost/.test(diff)) {
      issues.push(`⚠️ Захардкоженный URL в \`${f}\` — используй ApiConfig`);
    }

    // setState in async without mounted
    if (/setState\(/.test(diff) && /async/.test(diff) && !/mounted/.test(diff)) {
      issues.push(`⚠️ setState после await в \`${f}\` без проверки mounted`);
    }
  });

  // Check pubspec for new dependencies
  if (cat.configs.some(f => f === 'pubspec.yaml')) {
    ok.push(`ℹ️ pubspec.yaml изменён — запусти flutter pub get перед тестированием`);
  }

  return { issues, ok };
}

// ── Audit: Streaming / go2rtc ─────────────────────────────────────────────────
function auditStreaming(cat) {
  const issues = [];
  const ok     = [];

  cat.streaming.forEach(f => {
    const diff = getDiff(f);

    // WebSocket / stream error handling
    if (/WebSocket|ws\.connect|go2rtc/.test(diff)) {
      if (!/(onError|on\('error'|try\s*\{|catch)/.test(diff)) {
        issues.push(`🔴 WebSocket/stream в \`${f}\` — отсутствует обработка ошибок подключения`);
      } else {
        ok.push(`✅ WebSocket/stream в \`${f}\` имеет обработчик ошибок`);
      }
    }

    // Credential exposure in URLs
    if (/rtsp:\/\//.test(diff) && /password|passwd|pwd/.test(diff)) {
      issues.push(`🔴 RTSP URL в \`${f}\` содержит учётные данные в открытом виде`);
    }

    // go2rtc endpoint — timeout check
    if (/go2rtc|\/api\/streams/.test(diff) && !/timeout|TimeoutException/.test(diff)) {
      issues.push(`⚠️ go2rtc эндпоинт в \`${f}\` без таймаута запроса`);
    }

    // Reconnection logic
    if (/disconnect|close\(\)/.test(diff) && !/reconnect|retry/.test(diff)) {
      ok.push(`ℹ️ \`${f}\` — закрытие стрима без логики реконнекта (приемлемо для ручного управления)`);
    }
  });

  return { issues, ok };
}

// ── Security quick-scan ───────────────────────────────────────────────────────
function securityScan(files) {
  const issues = [];

  files.forEach(f => {
    const diff = getDiff(f);

    // Secrets in code
    if (/password\s*=\s*["'][^"']{4,}["']|secret\s*=\s*["'][^"']{4,}["']/i.test(diff) &&
        !/(process\.env|\.env|secrets\.)/.test(diff)) {
      issues.push(`🔴 Секрет или пароль в коде \`${f}\` — используй process.env / GitHub Secrets`);
    }

    // SQL injection risk
    if (/query\(.*\$\{/.test(diff) || /createQueryBuilder.*where.*\$\{/.test(diff)) {
      issues.push(`🔴 Возможная SQL-инъекция в \`${f}\` — используй параметризованные запросы`);
    }

    // eval / exec with user input
    if (/eval\(|exec\(.*req\.|execSync\(.*req\./.test(diff)) {
      issues.push(`🔴 Небезопасное использование eval/exec с пользовательскими данными в \`${f}\``);
    }
  });

  return issues;
}

// ── Architecture conformance ──────────────────────────────────────────────────
function archCheck(cat, allFiles) {
  const notes = [];

  // app.module.ts modified without module file change could mean manual wiring
  if (allFiles.includes('backend/src/app.module.ts') && cat.modules.length === 0) {
    notes.push(`ℹ️ app.module.ts изменён напрямую — предпочтительно выносить в отдельный *.module.ts`);
  }

  // New vendor file without integration in devices/control service
  const newVendorFiles = cat.backend.filter(f => f.includes('/vendors/'));
  if (newVendorFiles.length > 0) {
    const controlOrDeviceTouched = allFiles.some(f => f.includes('/control/') || f.includes('/devices/'));
    if (!controlOrDeviceTouched) {
      notes.push(`ℹ️ Новые файлы вендора (${newVendorFiles[0]}), но control/devices не изменены — vendor подключён к роутингу?`);
    }
  }

  // Direct credential usage check
  cat.backend.forEach(f => {
    const diff = getDiff(f);
    if (/username.*password|password.*username/.test(diff) && !/CredentialsService|decrypt/.test(diff)) {
      notes.push(`⚠️ \`${f}\` работает с учётными данными напрямую — используй CredentialsService`);
    }
  });

  return notes;
}

// ── Build report ──────────────────────────────────────────────────────────────
function buildReport(allFiles) {
  const cat        = categorise(allFiles);
  const backend    = auditBackend(cat);
  const flutter    = auditFlutter(cat);
  const streaming  = auditStreaming(cat);
  const security   = securityScan(allFiles);
  const arch       = archCheck(cat, allFiles);

  const allIssues = [
    ...security,
    ...backend.issues,
    ...flutter.issues,
    ...streaming.issues,
    ...arch,
  ];
  const allOk = [...backend.ok, ...flutter.ok, ...streaming.ok];

  const criticalCount = allIssues.filter(i => i.startsWith('🔴')).length;
  const warnCount     = allIssues.filter(i => i.startsWith('⚠️')).length;

  const statusEmoji = criticalCount > 0 ? '🚨' : warnCount > 0 ? '⚠️' : '✅';
  const statusText  = criticalCount > 0
    ? `КРИТИЧЕСКИЕ ПРОБЛЕМЫ (${criticalCount})`
    : warnCount > 0
    ? `Предупреждения (${warnCount})`
    : 'Всё чисто';

  const header = EVENT_NAME === 'pull_request'
    ? `${statusEmoji} *Аудит PR #${PR_NUMBER}* — ${escapeMarkdown(PR_TITLE)}`
    : `${statusEmoji} *Аудит push* в \`${escapeMarkdown(REF)}\``;

  const lines = [
    header,
    `📦 Репо: \`${REPO}\`  |  Автор: @${ACTOR}  |  SHA: \`${SHA}\``,
    `🏷 Статус: *${statusText}*`,
    '',
    `📂 *Изменено файлов:* ${allFiles.length}`,
  ];

  if (cat.backend.length)    lines.push(`  • Backend NestJS: ${cat.backend.length}`);
  if (cat.flutter.length)    lines.push(`  • Flutter: ${cat.flutter.length}`);
  if (cat.migrations.length) lines.push(`  • Миграции SQL: ${cat.migrations.length}`);
  if (cat.entities.length)   lines.push(`  • Сущности: ${cat.entities.length}`);
  if (cat.streaming.length)  lines.push(`  • Стриминг/go2rtc: ${cat.streaming.length}`);

  if (allIssues.length > 0) {
    lines.push('', '─────────────────────────');
    lines.push('🔍 *Найденные проблемы:*');
    allIssues.slice(0, 15).forEach(i => lines.push(i));
    if (allIssues.length > 15) lines.push(`... и ещё ${allIssues.length - 15} предупреждений`);
  }

  if (allOk.length > 0) {
    lines.push('', '─────────────────────────');
    lines.push('🟢 *Проверки пройдены:*');
    allOk.slice(0, 8).forEach(i => lines.push(i));
  }

  if (allIssues.length === 0 && allOk.length === 0) {
    lines.push('', 'ℹ️ Специфичных паттернов для аудита не обнаружено.');
  }

  lines.push('', `_Аудит выполнен автоматически · GRG Mobile CI_`);

  return lines.join('\n');
}

function escapeMarkdown(str) {
  return (str || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ── Send Telegram message ─────────────────────────────────────────────────────
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id:    TELEGRAM_CHAT,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (!parsed.ok) {
          reject(new Error(`Telegram API error: ${JSON.stringify(parsed)}`));
        } else {
          resolve(parsed);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 GRG Mobile Audit starting…');

  const changedFiles = getChangedFiles();
  console.log(`Changed files (${changedFiles.length}):`, changedFiles);

  if (changedFiles.length === 0) {
    console.log('No changed files detected — skipping audit.');
    return;
  }

  const report = buildReport(changedFiles);
  console.log('\n── REPORT ──\n', report);

  await sendTelegram(report);
  console.log('✅ Report sent to Telegram.');
}

main().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
