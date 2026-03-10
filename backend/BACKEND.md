# Backend: API управления домофонами (Multi-Tenant)

Документация по работе бэкенда для мобильного приложения домофонов. Стек: **NestJS**, **PostgreSQL**, **TypeORM**, **JWT**, **Socket.IO**.

---

## 1. Назначение

Бэкенд выступает прослойкой между приложением (Flutter) и устройствами:

- Приложение обращается только к REST API и WebSocket бэкенда.
- Бэкенд по типу устройства (Akuvox / Uniview IPC / Uniview NVR) вызывает нужный протокол (Akuvox Linux API, LiteAPI HTTP, LiteAPI WebSocket).

Поддерживается **мультитенантность**: организации (УК) → жилые комплексы → здания → квартиры; пользователи с ролями и доступом только к своим ресурсам.

**Архитектура и сценарии (роли, подключение устройств, плацдарм):** см. [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).  
**Полная спецификация (иерархия, алгоритмы, матрица доступов, чек-листы, сценарий звонка):** см. [docs/FULL_SYSTEM_SPEC.md](docs/FULL_SYSTEM_SPEC.md).

---

## 2. Структура проекта

```
backend/
├── src/
│   ├── app.module.ts          # Корневой модуль, подключение БД и модулей
│   ├── main.ts                 # Точка входа, порт из PORT или 3000
│   ├── auth/                   # Авторизация: логин, регистрация, JWT
│   ├── users/                  # Пользователи и привязка к квартирам (user_apartments)
│   ├── access/                 # Проверка доступа по ролям и зданиям
│   ├── organizations/          # Управляющие компании (УК)
│   ├── residential-complexes/  # Жилые комплексы
│   ├── buildings/              # Здания/подъезды
│   ├── apartments/             # Квартиры
│   ├── houses/                 # Совместимость: /houses = здания (buildings)
│   ├── devices/                # Устройства (домофоны, камеры, NVR)
│   ├── control/                # Управление: открытие двери, live-url, события, WS
│   ├── discovery/              # ONVIF-поиск устройств по зданию
│   ├── events/                 # WebSocket событий + журнал событий (event_logs)
│   ├── credentials/            # Шифрование учётных данных устройств (AES-256)
│   └── vendors/                # Клиенты к устройствам
│       ├── akuvox/             # Akuvox Linux API
│       └── uniview/             # Uniview LiteAPI HTTP + WebSocket
├── scripts/
│   ├── migrate-to-multitenant.sql   # Миграция houses → buildings
│   ├── migrate-to-multitenant.md    # Как запустить миграцию
│   └── create-db-windows.md         # Создание БД на Windows
├── .env.example
├── package.json
└── BACKEND.md                  # Этот файл
```

Префикс всех REST-маршрутов: **`/api`** (например, `POST /api/auth/login`).

**Просмотр и настройка:**
- **Swagger UI** — `http://localhost:3000/docs` — документация API и отправка запросов (можно указать JWT в Authorize).
- **Админ-панель** — `http://localhost:3000/api/admin` — вход по логину/паролю, просмотр настроек (БД, порт), таблицы организаций, ЖК, зданий, пользователей, устройств.
- **Health** — `GET /api/health` — статус, тип БД, порт (без авторизации).

---

## 3. База данных

Для **продакшена и масштабирования** рекомендуется **PostgreSQL**. Тип БД задаётся переменной `DB_TYPE` в `.env` (`postgres` или `sqlite`). Создание БД PostgreSQL — см. [scripts/create-db-windows.md](scripts/create-db-windows.md). Скрипты `reset-database.js` и `make-super-admin.js` поддерживают обе БД; для продакшена ожидается `DB_TYPE=postgres`.

### 3.1 Иерархия мультитенанта

| Таблица | Описание |
|--------|----------|
| **organizations** | УК: id (UUID), name, subscription_plan, max_complexes |
| **residential_complexes** | ЖК: organization_id, name, address, timezone, settings (JSONB) |
| **buildings** | Здания/подъезды: complex_id, name, address |
| **apartments** | Квартиры: building_id, number, floor |
| **users** | Пользователи: phone, email, name, password_hash, role, organization_id?, complex_id? |
| **user_apartments** | Связь пользователь–квартира: user_id, apartment_id, role (owner/resident/guest), access_level, valid_until |
| **devices** | Устройства: building_id, name, type, role, host, порты, username/password или credentials (JSONB) |
| **event_logs** | Журнал событий: device_id, event_type, data (JSONB), created_at |

Устройство привязано к **зданию** (building), а не к дому (house). Эндпоинты `/houses` возвращают те же здания для совместимости со старым клиентом.

### 3.2 Роли пользователей (UserRole)

| Роль | Доступ |
|------|--------|
| **SUPER_ADMIN** | Все организации, комплексы, здания, устройства |
| **ORG_ADMIN** | Только своя организация (organization_id) |
| **COMPLEX_MANAGER** | Только свой ЖК (complex_id) |
| **RESIDENT** | Только здания, в которых есть квартиры из user_apartments |

Проверка доступа выполняется в **AccessService** и используется во всех API (здания, устройства, открытие двери, live-url, события, discovery).

### 3.3 Устройства (Device)

- **type**: `AKUVOX` | `UNIVIEW_IPC` | `UNIVIEW_NVR` | `OTHER`
- **role**: `DOORPHONE` | `CAMERA` | `NVR`
- **Учётные данные**: либо поля `username`/`password`, либо зашифрованный JSON в **credentials** (расшифровка через CredentialsService).

---

## 4. Авторизация

- **POST /api/auth/register** — регистрация. Тело: `email?`, `phone?`, `name?`, `password` (минимум 6 символов). Нужен хотя бы email или phone.
- **POST /api/auth/login** — вход. Тело: `login` (email или телефон), `password`.

В ответ возвращается JWT и краткие данные пользователя (id, name, role, organizationId, complexId). Токен передаётся в заголовке: `Authorization: Bearer <token>`.

JWT payload: `sub` (id пользователя), `role`, `organization_id`, `complex_id`. Стратегия JWT загружает пользователя из БД и кладёт в `req.user` объект с полями id, role, organizationId, complexId, email, phone, name.

Все маршруты управления (здания, устройства, открытие двери и т.д.) защищены **JwtAuthGuard**; без валидного токена доступ запрещён.

---

## 5. REST API (кратко)

Базовый URL: `http://localhost:3000/api` (или другой хост/порт из `PORT`).

### 5.1 Авторизация (без токена)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /auth/login | Вход: `{ "login": "...", "password": "..." }` |
| POST | /auth/register | Регистрация: `{ "email"?, "phone"?, "name"?, "password" }` |

### 5.2 Мультитенант (с токеном)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /organizations | Список организаций (по роли) |
| GET | /organizations/:id | Одна организация |
| POST | /organizations | Создать организацию (SUPER_ADMIN). Тело: name, subscriptionPlan?, maxComplexes?, inn?, contactEmail?, contactPhone?, maxDevices? |
| PATCH | /organizations/:id | Обновить организацию (в т.ч. inn, contactEmail, contactPhone, maxDevices). Лимит maxDevices проверяется при добавлении устройства |
| GET | /complexes | Список ЖК (по роли) |
| GET | /complexes/by-organization/:orgId | ЖК по организации |
| GET | /complexes/:id | Один ЖК |
| POST | /complexes | Создать ЖК. Тело: organizationId, name, address?, timezone?. Проверка max_complexes |
| PATCH | /complexes/:id | Обновить ЖК |
| GET | /buildings | Список зданий (доступных пользователю) |
| GET | /buildings/:id | Одно здание |
| POST | /buildings | Создать здание. Тело: complexId, name, address? |
| PATCH | /buildings/:id | Обновить здание |
| GET | /buildings/:id/devices | Устройства здания |
| POST | /buildings/:id/devices | Ручное добавление устройства. Тело: name, host, type, role, username?, password?, httpPort?, rtspPort?. Проверка лимита организации (maxDevices) |
| POST | /buildings/:id/apartments/import | Импорт квартир: файл CSV/Excel или JSON `{ "apartments": [ { "number", "floor"? }, ... ] }`. До 1000 строк |
| POST | /buildings/:id/residents/import | Импорт жителей: файл CSV/Excel или JSON `{ "residents": [ { "apartmentNumber", "email"? \| "phone"?,"name"?,"role"? }, ... ] }`. До 1000 строк |
| GET | /apartments/by-building/:buildingId | Квартиры здания |
| GET | /apartments/:id | Одна квартира |
| POST | /apartments | Создать квартиру. Тело: buildingId, number, floor? |
| PATCH | /apartments/:id | Обновить квартиру |
| GET | /apartments/:apartmentId/residents | Жители квартиры (user_apartments) |
| POST | /apartments/:apartmentId/residents | Добавить жителя. Тело: userId? \| email? \| phone?, role?, validUntil? |
| DELETE | /apartments/:apartmentId/residents/:userId | Удалить привязку жителя к квартире |
| POST | /apartments/:apartmentId/apply | Житель (RESIDENT): подать заявку на привязку к квартире |
| GET | /apartments/applications | УК/Super Admin: список заявок. Query: buildingId?, complexId?, organizationId?, status? |
| PATCH | /apartments/applications/:id | УК/Super Admin: одобрить/отклонить заявку. Тело: status (APPROVED \| REJECTED), rejectReason? |
| GET | /users/me/applications | Житель: свои заявки на привязку |

### 5.3 Дома (совместимость)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /houses | То же, что /buildings |
| GET | /houses/:id/devices | Устройства здания (id = building id) |

### 5.4 Устройства и управление

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /devices/:id | Данные устройства (если есть доступ к его зданию) |
| POST | /devices/:id/open-door | Открыть дверь. Тело: `{ "relayId"?: number }` |
| GET | /devices/:id/live-url | URL потока. Query: `channel?`, `stream?` |
| GET | /devices/:id/info | Информация с устройства (system info) |
| GET | /devices/:id/events | События (с устройства + из БД). Query: `from?`, `to?`, `limit?` |
| POST | /devices/:id/ws-connect | Запуск LiteAPI WebSocket для Uniview (push событий) |
| POST | /devices/:id/ws-disconnect | Остановка WebSocket |
| POST | /devices/:id/events | Событие от устройства/шлюза. Тело: `{ type: "incoming_call", apartmentId?, apartmentNumber?, snapshotUrl? }`. Сохранение в event_log; при incoming_call — поиск жителей и вызов PushService (заглушка). Rate limit на open-door: до 20 запросов в минуту на пользователя |

### 5.5 Админ (Super Admin)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /admin/impersonate | Только SUPER_ADMIN. Тело: `{ "userId": "uuid" }`. Возвращает JWT от имени указанного пользователя |

### 5.6 Discovery (ONVIF)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /houses/:id/discover-onvif | Запуск поиска по зданию (id = building id) |
| GET | /houses/:id/discover-onvif/result | Результаты поиска |
| POST | /houses/:id/devices | Добавить устройство по результатам поиска. Тело: host, type, username?, password?, role |

---

## 6. WebSocket (события в реальном времени)

- **URL**: тот же хост, путь **`/api/ws/events`** (Socket.IO).
- **Сообщение подписки**: событие `subscribe`, тело: `{ "houseId"?: number, "deviceId"?: number }`.
  - Если передан `deviceId` — комната `device:&lt;id&gt;`.
  - Если передан `houseId` — комната `house:&lt;id&gt;` (фактически это id здания).
  - Иначе — комната `all`.
- Сервер шлёт события в комнату с именем **`event`** и payload: `{ time, type, source, payload }`.

События приходят при открытии двери (через бэкенд) и при получении данных от Uniview по LiteAPI WebSocket (если для устройства вызван `ws-connect`).

---

## 7. Устройства и протоколы

- **Akuvox**: HTTP Basic, Akuvox Linux API (relay, system info, doorlog, live RTSP URL).
- **Uniview IPC/NVR**: LiteAPI HTTP с Digest-авторизацией; пути по документации LiteAPI (System/Equipment, LiveViewURL, IO/Outputs и т.д.).
- **Uniview WebSocket**: отдельный клиент LiteAPI Over WebSocket; подписка на события, проброс в EventsGateway и запись в **event_logs**.

Учётные данные устройств при наличии поля **credentials** расшифровываются через **CredentialsService** (AES-256-GCM); иначе используются **username** и **password**.

---

## 8. Журнал событий (event_logs)

- При **открытии двери** через API в журнал пишется запись: `event_type: "door_open"`, в data — relayId, userId, success.
- События, приходящие с Uniview по WebSocket, тоже сохраняются в **event_logs**.
- **GET /api/devices/:id/events** отдаёт объединённый список: события с устройства (Akuvox doorlog / Uniview) + записи из **event_logs**, с пагинацией по времени (from, to, limit).

---

## 9. Запуск и конфигурация

### 9.1 База данных: SQLite (по умолчанию) или PostgreSQL

- **По умолчанию** используется **SQLite**: база создаётся сама в файле `backend/data/doorphone.sqlite`. PostgreSQL устанавливать не нужно. В `.env` задайте `DB_TYPE=sqlite` или не указывайте `DB_TYPE`.
- Для **PostgreSQL** в `.env` укажите `DB_TYPE=postgres` и параметры подключения (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME). Базу `doorphone` нужно создать вручную или скриптом `scripts/create-db.ps1`.

### 9.2 Переменные окружения

Скопировать `.env.example` в `.env` и при необходимости задать:

- **DB_HOST**, **DB_PORT**, **DB_USERNAME**, **DB_PASSWORD**, **DB_NAME** — подключение к PostgreSQL.
- **JWT_SECRET** — секрет для подписи JWT.
- **CREDENTIALS_ENCRYPTION_KEY** — ключ 32 символа для шифрования credentials устройств (если не задан, используется dev-ключ).
- **PORT** — порт API (по умолчанию 3000).

### 9.3 Установка и запуск

```bash
cd backend
npm install
# Для существующей БД с таблицей houses — выполнить миграцию (см. scripts/migrate-to-multitenant.md)
npm run start:dev   # режим разработки
# или
npm run build && npm start
```

Для новой БД таблицы создаются автоматически (`synchronize: true`). Для БД, где ещё есть таблица **houses**, перед первым запуском нового кода нужно выполнить **scripts/migrate-to-multitenant.sql**.

### 9.5 Ошибка подключения к БД (PostgreSQL)

Если при старте появляется ошибка вроде «Unable to connect to the database» или сообщение о том, что пользователь "postgres" не прошёл проверку подлинности (в консоли Windows может отображаться кракозябрами):

1. **Пароль** — в `.env` в `DB_PASSWORD` должен быть тот пароль, который задан для пользователя PostgreSQL (не обязательно `postgres`).
2. **Служба** — убедитесь, что служба PostgreSQL запущена (например, `Get-Service *postgres*` в PowerShell).
3. **База** — база `doorphone` должна существовать (см. **scripts/create-db-windows.md**, **scripts/create-db.ps1**).
4. **Проверка вручную** — подключитесь к БД через `psql` или pgAdmin с теми же хостом, пользователем и паролем, что указаны в `.env`.

### 9.4 Первый пользователь

Встроенного пользователя admin/admin нет. Первого пользователя нужно создать через **POST /api/auth/register** (email или телефон + пароль). Роль по умолчанию — **RESIDENT**. Для доступа ко всем зданиям/устройствам в БД пользователю нужно выдать роль **SUPER_ADMIN** и при необходимости задать organization_id/complex_id для ORG_ADMIN/COMPLEX_MANAGER.

---

## 10. Интеграция с приложением (Flutter)

1. **Авторизация**: после входа сохранять токен и передавать в заголовке `Authorization: Bearer <token>` во всех запросах.
2. **Список «домов»**: **GET /api/houses** или **GET /api/buildings** — список зданий, к которым у пользователя есть доступ.
3. **Устройства здания**: **GET /api/houses/:id/devices** (id — идентификатор здания).
4. **Управление**: **POST /api/devices/:id/open-door**, **GET /api/devices/:id/live-url**, **GET /api/devices/:id/events** и т.д.
5. **События в реальном времени**: подключение к WebSocket `/api/ws/events`, подписка через событие `subscribe` с `houseId` и/или `deviceId`, приём сообщений с именем `event`.

Логин в API — по полю **login** (email или телефон), а не по полю **username**.

---

## 11. Дополнительные материалы

- **SYSTEM_DESIGN.md** — роли, иерархия, сценарии подключения устройств, плацдарм платформы.
- **scripts/create-db-windows.md** — создание БД PostgreSQL на Windows.
- **scripts/migrate-to-multitenant.md** — порядок выполнения миграции с houses на buildings.
- Документация производителей: Akuvox Linux API, LiteAPI for IPC/NVR (HTTP и WebSocket) — пути и форматы запросов соответствуют этим документам; в коде есть отсылки к разделам.
