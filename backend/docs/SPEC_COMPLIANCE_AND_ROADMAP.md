# Соответствие ТЗ и план реализации (GRG Mobile)

Документ сопоставляет текущий проект (Flutter + NestJS) с полным ТЗ мультитенантного приложения для ЖК (Akuvox + Uniview) и задаёт поэтапный план реализации без смены стека.

---

## 1. Стек: ТЗ vs текущий проект

| Компонент | По ТЗ | В проекте | Решение |
|-----------|-------|-----------|---------|
| Мобильное приложение | React Native (Expo/bare), TypeScript | **Flutter**, Dart | Оставляем Flutter: уже есть экраны, API-клиент, push, видео. ТЗ по экранам и сценариям переносим на Flutter. |
| Backend | Node.js + Express/Fastify | **NestJS** (Node.js) | Оставляем NestJS: структура модулей, guards, TypeORM уже соответствуют ТЗ (JWT, прокси к устройствам, WebSocket). |
| БД | PostgreSQL, мультитенант | **PostgreSQL**, TypeORM, иерархия org → complex → building → apartment, row-level по ролям | Соответствует. |
| Кэш/очереди | Redis (сессии, push-очередь) | **In-memory** (CacheModule), Redis не используется | Фаза 2: при росте нагрузки добавить Redis для сессий и очереди push. |
| WebSocket | Ретрансляция событий | **Socket.IO** (`/api/ws/events`), JWT, комнаты по device/house | Соответствует. |
| Авторизация | JWT + Refresh Token | **JWT** (access), **refresh** (хранится hash в users), логин/логаут | Соответствует. |

---

## 2. Мультитенантная архитектура: ТЗ vs проект

| ТЗ | В проекте | Статус |
|----|-----------|--------|
| SUPER_ADMIN → BUILDING_MANAGER → TENANT | **SUPER_ADMIN** → **ORG_ADMIN** / **COMPLEX_MANAGER** → **RESIDENT** | Роли есть; BUILDING_MANAGER по смыслу близок к COMPLEX_MANAGER (один уровень до зданий). |
| tenant_id → apartment_id → device_ids | **user_apartments** (user ↔ apartment); устройства привязаны к **building**; доступ к device через здание квартиры | Изоляция по жильцам есть. Привязка: user → apartments → buildings → devices. |
| Жилец видит только свои домофоны/камеры | AccessService: RESIDENT видит здания, где есть его user_apartments → устройства этих зданий | Реализовано. |

Дополнительно в проекте: уровень **организации** (УК) и **жилого комплекса** (ЖК), лимиты (max_complexes, max_devices), заявки на привязку к квартире (apartment_applications).

---

## 3. Блок 1: Akuvox (Linux API)

Базовый URL в проекте: `http://<device_ip>:<httpPort>/api/` (и `/fcgi/do` для openDoor). Учётные данные: Basic Auth, при необходимости — из зашифрованного credentials в БД.

| Раздел ТЗ | Эндпоинты ТЗ | В проекте | Действие |
|-----------|--------------|-----------|----------|
| Видеозвонок / домофония | call/status, dial, hangup, SIP/RTP | **getCallStatus**; открытие двери; вебхук входящего вызова → push | Добавить: **dial**, **hangup** (прокси в AkuvoxClient + control). SIP/видео с панели — через текущий RTSP live-url и FCM/incoming call экран. |
| Замок / реле | relay/get, status, trig, set | **openDoor** (fcgi/do); **getRelayStatus** | Добавить: **relay/get**, **relay/trig** (alias к openDoor или отдельно по API), **relay/set** при необходимости. |
| Журнал доступа | doorlog/get, calllog/get, doorlog/clear | **getDoorLog** | Добавить: **getCallLog**, **doorlog/clear** (опционально, по правам). |
| Пользователи / ключи | user/get, add, set, del, import; publiccode | Синхронизация квартир через **user/clear**, **user/add** (X912) в akuvox_config.py | Добавить в AkuvoxClient: **user/get**, **user/set**, **user/del**, **publiccode/get**, **publiccode/set**; импорт — по необходимости. |
| Контакты | contact/get, add, set, del | **contact/clear**, **contact/add** в скрипте (R20/R25); user API для X912 | Добавить в AkuvoxClient: **contact/get**, **contact/set**, **contact/del** для админки/управления. |
| Расписание | schedule/get, add, set, del | Нет | Фаза 2: методы в AkuvoxClient + при необходимости API/экран. |
| Система | system/info, status, reboot; sip/status | **getSystemInfo** (system/info) | Добавить: **system/status**, **sip/status**; reboot — только для админ-ролей. |
| Входы / датчики | input/status, set | Нет | Фаза 2 при необходимости. |

---

## 4. Блок 2: Uniview NVR + IPC (LiteAPI v5)

В проекте: базовый URL `http://<host>:<port>/LAPI/V1.0`, Digest-аутентификация (RFC 2617) при 401 уже реализована в `uniview-liteapi-http.client.ts` (buildDigestHeader, parseWwwAuthenticate).

| Раздел ТЗ | В проекте | Действие |
|-----------|------------|----------|
| Информация об устройстве | **getSystemInfo** (System/Equipment) | При необходимости расширить путём/полями. |
| Каналы (камеры) | Нет отдельно | Добавить: Channels/System/DeviceInfo, ChannelDetailInfo, BasicInfo для экрана списка камер. |
| Live View | **getLiveUrl** (LiveViewURL), Main/Sub stream | Готово. |
| Запись / воспроизведение | Нет | Фаза 2: Record за период, RTSP playback с временем — эндпоинты в клиенте + API прокси. |
| Снапшот | Нет | Добавить: **PreviewSnapshot** (или аналог) в HTTP-клиент + GET /devices/uniview/:id/snapshot/:ch. |
| PTZ | Нет | Фаза 2: PTZCtrl, Capabilities, Presets. |
| Подписка на события | Uniview **WebSocket** (LiteAPI WS): подписка, события в EventsGateway | ТЗ предполагает HTTP webhook от NVR на backend; сейчас события идут по WS с устройства. При появлении webhook Uniview — принять POST /webhook/uniview и ретранслировать в WebSocket. |
| Детектор движения, распознавание лиц, аналитика | Нет | Фазы 2–3: Rule/WeekPlan/LinkageAction; PeopleLibraries; Face Recognition; Smart-правила по ТЗ. |
| Хранилище / расписание записи | Нет | Фаза 2 при необходимости. |

---

## 5. Блок 3: Экраны мобильного приложения

ТЗ предполагает 8 экранов. Текущие экраны Flutter сопоставлены ниже; недостающие — в плане.

| Экраны ТЗ | Текущий экран / заметка | Действие |
|-----------|--------------------------|----------|
| 1. Dashboard | **HomeScreen**: здания → устройства, открыть дверь, видео, события | Добавить плитки онлайн/офлайн, последние 5 тревог, счётчик уведомлений. |
| 2. Домофон (Intercom) | **IncomingCallScreen** (входящий вызов + видео, ответ/открыть); **DoorControlBackendScreen** (видео + открыть) | Добавить исходящий вызов (dial), историю вызовов (calllog). |
| 3. Камеры | Переход к устройству → live (DoorControlBackendScreen); для Uniview — тот же live-url | Отдельный экран «Камеры»: сетка превью (снапшоты), tap → fullscreen RTSP; PTZ — фаза 2. |
| 4. Архив (Playback) | Нет | Фаза 2: выбор камеры/даты, таймлайн, воспроизведение записи. |
| 5. События и тревоги | **DeviceEventsScreen** (лента по устройству) | Расширить: фильтры, превью кадра; подписка на WebSocket по нескольким устройствам; push уже есть. |
| 6. Управление доступом | В админке — жители квартир; на панели — через Akuvox user/contact | Экран/подэкран: список жильцов с ключами (из Akuvox user/get), журнал doorlog; временный код — publiccode/set. |
| 7. Лица (Face Recognition) | Нет | Фаза 3: библиотеки лиц Uniview, журнал проходов, поиск по фото. |
| 8. Настройки | **SettingsScreen**, **ProfileScreen** | Добавить: управление устройствами (уже есть add_device), настройки уведомлений; админ — управление жильцами (есть в админке). |

---

## 6. Блок 4: Backend-архитектура

| Сервис по ТЗ | В проекте | Действие |
|--------------|-----------|----------|
| Auth: login, refresh, logout | **AuthController**: login, register, refresh; JWT + refresh hash в users | Добавить явный **logout** (инвалидация refresh token). |
| Device Proxy: все запросы к Akuvox/Uniview через backend | **ControlController** + **AkuvoxClient** / **UniviewLiteapiHttpClient**; credentials в БД (encrypted) | Соответствует. Расширить прокси: call/dial, hangup, relay/get, calllog, snapshot, и т.д. |
| Webhook Uniview | Нет (события идут по LiteAPI WebSocket) | Добавить **POST /api/webhooks/uniview** и ретрансляцию в WebSocket при появлении такого сценария у заказчика. |
| Push | **IncomingCallService**, **PushService** (FCM), при вебхуке Akuvox | Соответствует. Redis-очередь — фаза 2 при масштабировании. |
| Схема БД: tenants, users, devices, user_devices, events | **organizations, residential_complexes, buildings, apartments, users, user_apartments, devices, event_logs** | Иерархия богаче (УК, ЖК); нет отдельной таблицы tenants (роль «жилец» + user_apartments). Таблица событий (event_logs) есть. |

---

## 7. Блоки 5–7: Real-time, безопасность, edge cases

- **Real-time**: WebSocket `/api/ws/events`, подписка по deviceId/houseId, Akuvox webhook → event_log + push; Uniview WS → EventsGateway. Redis Pub/Sub — фаза 2.
- **Безопасность**: Digest для Uniview есть; Basic для Akuvox; credentials AES-256 в БД; JWT + refresh; RBAC в AccessService; rate limit на open-door — есть.
- **Offline / edge**: сообщения об ошибках устройства; кэш снапшотов и retry можно усилить в приложении (фаза 2).

---

## 8. Приоритет реализации (MVP → Full)

### Фаза 1 (MVP) — максимально опираться на текущий код

1. **Backend (Akuvox)**  
   - В **AkuvoxClient** добавить: **getCallLog**, **dial**, **hangup**, **getRelayList** (relay/get), **relayTrig** (если отличается от openDoor), при необходимости **contact/get**, **user/get**.  
   - В **ControlController** (или отдельном Akuvox-контроллере): прокси для call/dial, call/hangup, calllog, relay/get, relay/trig.

2. **Backend (Uniview)**  
   - В **UniviewLiteapiHttpClient** добавить: **getChannels** (DeviceInfo / ChannelDetailInfo), **getSnapshot(channelId)** (PreviewSnapshot).  
   - В **ControlController** или devices: **GET /devices/:id/channels**, **GET /devices/:id/snapshot/:channel** (только для Uniview).

3. **Backend общее**  
   - **POST /auth/logout** — инвалидация refresh token в БД.

4. **Мобильное приложение (Flutter)**  
   - **Dashboard**: статус онлайн/офлайн устройств (по test-connection или последнему событию), блок «Последние события» (5 записей), счётчик непрочитанных.  
   - **Домофон**: экран истории вызовов (GET calllog через backend); кнопка «Позвонить на панель» (dial) + hangup.  
   - **Камеры**: отдельный экран — список каналов Uniview + Akuvox (если несколько потоков); превью через снапшот (Uniview) или заглушка; по tap — полноэкранное видео (текущий live-url).

5. **Документация**  
   - В **backend/README** или **BACKEND.md** кратко перечислить новые эндпоинты Akuvox/Uniview и ссылку на этот документ.

### Фаза 2

- Akuvox: contact/set, contact/del; user/set, user/del; publiccode; schedule/get, add, set, del; system/status, sip/status; doorlog/clear (admin).  
- Uniview: запись за период (Record), воспроизведение по времени; PTZ (если есть PTZ-камеры).  
- Мобильное приложение: экран «Архив» (выбор камеры, дата, таймлайн, воспроизведение); экран «Управление доступом» (жильцы, ключи, doorlog, временный код); расширенные фильтры событий.  
- Redis (опционально): кэш сессий, очередь push при высокой нагрузке.

### Фаза 3

- Uniview: распознавание лиц (PeopleLibraries, Face Recognition, PassRecord, SearchByImage); умная аналитика (детекции по ТЗ).  
- Мобильное приложение: экран «Лица» (админ); аналитика проходимости; мультиобъект (несколько ЖК) уже есть через организации/комплексы.

---

## 9. Итог

- **Стек**: сохраняем Flutter и NestJS; требования ТЗ по функционалу и архитектуре выполняем в этом стеке.  
- **Мультитенантность и роли**: соответствуют ТЗ; номенклатура ролей и уровней (УК, ЖК) в проекте шире.  
- **Akuvox**: база есть (openDoor, system info, doorlog, call status, live URL, вебхуки, provisioning); добавить в первую очередь: calllog, dial, hangup, relay/get (и при необходимости trig/set), далее — user/contact/publiccode/schedule.  
- **Uniview**: база есть (Digest, live URL, open door, system info, WebSocket событий); добавить: каналы, снапшот; затем запись, PTZ, события по webhook (если потребуется).  
- **Экраны**: Dashboard, Домофон, Камеры, События, Настройки — доработать и унифицировать с ТЗ; Архив, Управление доступом, Лица — по фазам 2–3.  
- **Backend**: Auth (добавить logout), Device Proxy (расширить методами выше), WebSocket без изменений; Redis и webhook Uniview — по необходимости.

Этот документ можно использовать как единый ориентир для реализации ТЗ поверх текущей кодовой базы без переписывания на React Native и без замены NestJS на Express/Fastify.
