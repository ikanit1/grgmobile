/**
 * Выдать пользователю роль SUPER_ADMIN по email.
 * Запуск: node scripts/make-super-admin.js <email>
 * Пример: node scripts/make-super-admin.js admin@example.com
 * Для продакшена ожидается DB_TYPE=postgres в .env.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const email = process.argv[2];
if (!email) {
  console.log('Использование: node scripts/make-super-admin.js <email>');
  process.exit(1);
}

const usePostgres = process.env.DB_TYPE === 'postgres';

function runSqlite() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'data', 'doorphone.sqlite');
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    console.error('База не найдена:', dbPath);
    process.exit(1);
  }
  const db = new Database(dbPath);
  const r = db.prepare("UPDATE users SET role = 'SUPER_ADMIN' WHERE email = ?").run(email);
  db.close();
  if (r.changes === 0) {
    console.log('Пользователь с таким email не найден:', email);
    process.exit(1);
  }
  console.log('Роль SUPER_ADMIN выдана пользователю:', email);
}

function runPostgres() {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'doorphone',
  });
  client.connect()
    .then(() => client.query("UPDATE users SET role = 'SUPER_ADMIN' WHERE email = $1", [email]))
    .then((res) => {
      client.end();
      if (res.rowCount === 0) {
        console.log('Пользователь с таким email не найден:', email);
        process.exit(1);
      }
      console.log('Роль SUPER_ADMIN выдана пользователю:', email);
    })
    .catch((e) => { client.end(); console.error(e); process.exit(1); });
}

if (usePostgres) runPostgres();
else runSqlite();
