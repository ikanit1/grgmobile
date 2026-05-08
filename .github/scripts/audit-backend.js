#!/usr/bin/env node
/**
 * Backend audit: checks NestJS entities, migration hints, and schema concerns.
 */
const fs = require('fs');
const path = require('path');

const BACKEND_SRC = path.join(process.cwd(), 'backend', 'src');

const issues = [];
const warnings = [];
const ok = [];

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

// 1. Entity files — look for dangerous schema patterns
const entityFiles = walk(BACKEND_SRC, '.entity.ts');
for (const file of entityFiles) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');

  if (src.includes('synchronize: true') && src.includes('production')) {
    issues.push(`[ENTITY] synchronize:true with production hint in ${rel}`);
  }

  // Plain-text credential fields (deprecated pattern)
  const plainCredMatch = src.match(/\bpassword\b.*@Column|@Column.*\bpassword\b/g);
  if (plainCredMatch && !src.includes('credentials') && !rel.includes('user.entity')) {
    warnings.push(`[ENTITY] Possible plain-text credential column in ${rel}`);
  }

  // Nullable check on foreign keys
  const fkWithoutNullable = src.match(/@ManyToOne\([^)]*\)\s*\n[^@]*@Column\b(?![^)]*nullable)/g);
  if (fkWithoutNullable) {
    warnings.push(`[ENTITY] ManyToOne FK column may need nullable:true in ${rel}`);
  }

  ok.push(`[ENTITY] Scanned: ${rel}`);
}

// 2. Migration SQL files
const migrationFiles = walk(path.join(process.cwd(), 'backend'), '.sql')
  .concat(walk(path.join(process.cwd(), 'backend'), '.migration.ts'));

for (const file of migrationFiles) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');

  if (/DROP\s+TABLE/i.test(src) && !/IF\s+EXISTS/i.test(src)) {
    issues.push(`[MIGRATION] DROP TABLE without IF EXISTS in ${rel}`);
  }
  if (/ALTER\s+TABLE.*ADD\s+COLUMN.*NOT\s+NULL/i.test(src) && !/DEFAULT/i.test(src)) {
    warnings.push(`[MIGRATION] ADD COLUMN NOT NULL without DEFAULT — will fail on non-empty table: ${rel}`);
  }
  if (/DELETE\s+FROM/i.test(src) && !/WHERE/i.test(src)) {
    issues.push(`[MIGRATION] DELETE FROM without WHERE (full table wipe) in ${rel}`);
  }
  ok.push(`[MIGRATION] Scanned: ${rel}`);
}

// 3. Module imports — check that top-level feature modules are in app.module.ts
const moduleFiles = walk(BACKEND_SRC, '.module.ts');
const appModule = path.join(BACKEND_SRC, 'app.module.ts');
const appSrc = fs.existsSync(appModule) ? fs.readFileSync(appModule, 'utf8') : '';

// Only check top-level modules that should always be in app.module.ts
const requiredTopLevel = ['EventsModule', 'UsersModule', 'AuthModule'];
for (const mod of requiredTopLevel) {
  if (appSrc && !appSrc.includes(mod)) {
    warnings.push(`[MODULE] ${mod} may be missing from app.module.ts imports`);
  }
}

// 4. Controller endpoints — ensure @UseGuards on sensitive routes
const controllerFiles = walk(BACKEND_SRC, '.controller.ts');
for (const file of controllerFiles) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');

  const postRoutes = (src.match(/@Post\b/g) || []).length;
  const deleteRoutes = (src.match(/@Delete\b/g) || []).length;
  const guardCount = (src.match(/@UseGuards\b/g) || []).length;

  if ((postRoutes + deleteRoutes) > 0 && guardCount === 0) {
    issues.push(`[SECURITY] No @UseGuards on controller with POST/DELETE routes: ${rel}`);
  }
}

// ── Print report ────────────────────────────────────────────────────────────
console.log(`Backend audit: ${entityFiles.length} entities, ${migrationFiles.length} migrations, ${controllerFiles.length} controllers`);

if (issues.length) {
  console.log(`\nCRITICAL ISSUES (${issues.length}):`);
  issues.forEach(i => console.log(' ❌ ' + i));
} else {
  console.log('\n✅ No critical issues found');
}

if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`);
  warnings.forEach(w => console.log(' ⚠️  ' + w));
} else {
  console.log('✅ No warnings');
}

console.log(`\nSummary: ${issues.length} critical, ${warnings.length} warnings`);

process.exit(issues.length > 0 ? 1 : 0);
