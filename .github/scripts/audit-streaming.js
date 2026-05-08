#!/usr/bin/env node
/**
 * Streaming audit: checks go2rtc endpoints and RTSP/live-url handlers
 * for correct error handling.
 */
const fs = require('fs');
const path = require('path');

const BACKEND_SRC = path.join(process.cwd(), 'backend', 'src');

const issues = [];
const warnings = [];

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full, ext));
    else if (!ext || entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}

const tsFiles = walk(BACKEND_SRC, '.ts').filter(f => !f.endsWith('.spec.ts'));

for (const file of tsFiles) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');

  const isStreamingFile =
    /go2rtc|live.?url|rtsp|stream/i.test(src) &&
    (rel.includes('control') || rel.includes('go2rtc') || rel.includes('vendor'));

  if (!isStreamingFile) continue;

  // Check: async methods calling go2rtc/RTSP without try/catch
  const asyncMethods = src.match(/async\s+\w+[^{]*\{[^}]*(?:go2rtc|getRtsp|liveUrl|stream)[^}]*}/gs) || [];
  for (const method of asyncMethods) {
    if (!method.includes('try') && !method.includes('catch')) {
      warnings.push(`[STREAMING] Async streaming call without try/catch in ${rel}`);
      break;
    }
  }

  // Check: HTTP calls to go2rtc without timeout
  if (src.includes('go2rtc') && src.includes('HttpService') && !src.includes('timeout')) {
    warnings.push(`[STREAMING] go2rtc HTTP call without timeout config in ${rel}`);
  }

  // Check: live URL service/client without error handling (skip DTOs and controllers that delegate)
  const isServiceOrClient = rel.includes('.service.') || rel.includes('.client.') || rel.includes('vendor');
  if (isServiceOrClient && /liveUrl|live_url|rtspUrl/i.test(src)) {
    if (!src.includes('catch') && !src.includes('HttpException') && !src.includes('throw')) {
      issues.push(`[STREAMING] Live URL generation with no error propagation in ${rel}`);
    }
  }

  // Check: RTSP credentials exposed in response
  if (/rtsp:\/\/.*password|rtsp:\/\/.*passwd/i.test(src)) {
    issues.push(`[SECURITY] Possible RTSP URL with credentials exposed in response: ${rel}`);
  }

  // Check: go2rtc path config missing fallback
  if (src.includes('go2rtc') && src.includes('url') && !src.includes('fallback') && !src.includes('|| ')) {
    warnings.push(`[STREAMING] go2rtc URL construction without fallback in ${rel}`);
  }
}

// Also check Flutter streaming code
const FLUTTER_LIB = path.join(process.cwd(), 'lib');
const dartFiles = walk(FLUTTER_LIB, '.dart').filter(f =>
  /stream|video|rtsp|player/i.test(f)
);

for (const file of dartFiles) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');

  if (src.includes('VideoPlayerController') && !src.includes('catchError') && !src.includes('onError')) {
    warnings.push(`[FLUTTER] VideoPlayerController without error handler in ${rel}`);
  }

  if (src.includes('dispose') === false && src.includes('VideoPlayerController')) {
    warnings.push(`[FLUTTER] VideoPlayerController may not be disposed in ${rel}`);
  }
}

// ── Print report ────────────────────────────────────────────────────────────
console.log(`Streaming audit: checked ${tsFiles.length} TS files, ${dartFiles.length} Flutter stream files`);

if (issues.length) {
  console.log(`\nCRITICAL ISSUES (${issues.length}):`);
  issues.forEach(i => console.log(' ❌ ' + i));
} else {
  console.log('\n✅ No critical streaming issues');
}

if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`);
  warnings.forEach(w => console.log(' ⚠️  ' + w));
} else {
  console.log('✅ No streaming warnings');
}

console.log(`\nSummary: ${issues.length} critical, ${warnings.length} warnings`);

process.exit(issues.length > 0 ? 1 : 0);
