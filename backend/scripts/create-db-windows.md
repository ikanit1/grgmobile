# Создание базы doorphone на Windows

## Вариант 1: PostgreSQL установлен, но не в PATH

Откройте **cmd** или **PowerShell** от имени администратора и выполните (подставьте свою версию PostgreSQL вместо `16`):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres doorphone
```

Или через **psql**:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE doorphone;"
```

Типичные пути:
- `C:\Program Files\PostgreSQL\16\bin\`
- `C:\Program Files\PostgreSQL\15\bin\`

## Вариант 2: Добавить PostgreSQL в PATH

1. Панель управления → Система → Дополнительные параметры → Переменные среды.
2. В **Path** добавьте путь к папке `bin`, например:  
   `C:\Program Files\PostgreSQL\16\bin`
3. Перезапустите терминал, затем:

```powershell
createdb -U postgres doorphone
```

## Вариант 3: Через pgAdmin

1. Запустите **pgAdmin**.
2. Подключитесь к серверу (localhost, пользователь postgres).
3. ПКМ по **Databases** → Create → Database.
4. Имя: `doorphone` → Save.

## Вариант 4: Docker (если установлен Docker Desktop)

```powershell
docker run -d --name postgres-doorphone -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=doorphone -p 5432:5432 postgres:16
```

После этого в `.env` укажите:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=doorphone
```

## Проверка

Подключение к базе:

```powershell
psql -U postgres -d doorphone -c "\dt"
```

Если команда не найдена, используйте полный путь к `psql.exe` (см. Вариант 1).
