/**
 * Прямое обновление роли пользователя в БД PostgreSQL.
 * Запуск из папки backend:
 *   node scripts/set-role.js <email> <role>
 * Пример:
 *   node scripts/set-role.js nick040731@gmail.com SUPER_ADMIN
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');

async function main() {
  const [, , email, role] = process.argv;
  if (!email || !role) {
    console.error('Использование: node scripts/set-role.js <email> <role>');
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'doorphone',
  });

  try {
    await client.connect();
    const res = await client.query(
      "UPDATE users SET role = $2 WHERE email = $1",
      [email, role],
    );
    if (res.rowCount === 0) {
      console.error('Пользователь с таким email не найден:', email);
      process.exit(1);
    }
    console.log(`Роль ${role} выдана пользователю: ${email}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();

