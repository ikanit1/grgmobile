/**
 * Регистрация пользователя через HTTP /api/auth/register из Node-скрипта.
 * Запуск из папки backend:
 *   node scripts/register-user.js <email> <name> <password>
 */

const axios = require('axios');

async function main() {
  const [, , email, name, password] = process.argv;
  if (!email || !password) {
    console.error('Использование: node scripts/register-user.js <email> <name> <password>');
    process.exit(1);
  }

  try {
    const res = await axios.post('http://localhost:3000/api/auth/register', {
      email,
      name,
      password,
    });
    console.log('Пользователь зарегистрирован:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    if (e.response) {
      console.error('Ошибка регистрации:', e.response.status, e.response.data);
    } else {
      console.error('Ошибка регистрации:', e.message);
    }
    process.exit(1);
  }
}

main();

