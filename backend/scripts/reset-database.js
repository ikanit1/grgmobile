/**
 * Очистка всех данных в БД (таблицы остаются).
 * Запуск из корня backend: node scripts/reset-database.js
 * Для SQLite: перед запуском остановите backend (npm run start:dev), иначе файл может быть заблокирован.
 * Для продакшена ожидается DB_TYPE=postgres в .env.
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const usePostgres = process.env.DB_TYPE === 'postgres';

// Порядок: сначала таблицы с внешними ключами (дочерние), потом родительские
const TABLES_SQLITE = [
  'apartment_applications',
  'user_apartments',
  'event_logs',
  'devices',
  'apartments',
  'buildings',
  'residential_complexes',
  'users',
  'organizations',
];

function resetSqlite() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'data', 'doorphone.sqlite');
  if (!fs.existsSync(dbPath)) {
    console.log('SQLite файл не найден:', dbPath);
    console.log('База создаётся при первом запуске backend. Нечего очищать.');
    return;
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  for (const table of TABLES_SQLITE) {
    try {
      db.exec(`DELETE FROM ${table}`);
      const count = db.prepare(`SELECT changes()`).get();
      if (count['changes()'] > 0) console.log(`  ${table}: удалено ${count['changes()']} записей`);
    } catch (e) {
      console.warn(`  ${table}:`, e.message);
    }
  }
  db.pragma('foreign_keys = ON');
  db.close();
  console.log('База SQLite очищена.');
}

function resetPostgres() {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'doorphone',
  });
  client.connect()
    .then(() => {
      const tables = [...TABLES_SQLITE];
      return tables.reduce((p, table) => p.then(() => client.query(`DELETE FROM ${table}`)), Promise.resolve());
    })
    .then(() => { client.end(); console.log('База PostgreSQL очищена.'); })
    .catch((e) => { client.end(); console.error(e); process.exit(1); });
}

if (usePostgres) {
  resetPostgres();
} else {
  resetSqlite();
}
