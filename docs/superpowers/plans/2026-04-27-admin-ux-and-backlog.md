# Admin Panel UX + Project Backlog Plan

**Дата:** 2026-04-27
**Файлы:** `backend/public/admin.html`, `backend/src/**`, `lib/**`
**Источники:** `backend/docs/SPEC_COMPLIANCE_AND_ROADMAP.md`, `docs/superpowers/plans/2026-04-15-uniview-full-implementation.md`, `docs/superpowers/plans/2026-04-15-go2rtc-nat-substream.md`, `docs/superpowers/plans/2026-04-18-flutter-design-system.md`, `docs/superpowers/specs/2026-04-19-admin-design-system-spec.md`

> Замечание о домофонах: вызывные панели в проекте — **только Uniview IPC** (роль `DOORPHONE`, тип `UNIVIEW_IPC`). Akuvox в кодовой базе присутствует, но в реальных объектах не разворачивается. Доработки Akuvox — низкий приоритет (только если появится клиент на этом железе).

---

## Раздел 1. Аудит незаконченных планов

| План | Файл | Чекбоксы `[x]/[ ]` | Реальный статус |
|---|---|---|---|
| Uniview LiteAPI Full Implementation | `docs/superpowers/plans/2026-04-15-uniview-full-implementation.md` | 0 / 67 | Базовый Digest-клиент + LiveURL + WS есть; recording, PTZ, snapshot, channels, auto-reconnect — отсутствуют |
| go2rtc NAT substream | `docs/superpowers/plans/2026-04-15-go2rtc-nat-substream.md` | 0 / 34 | `backend/go2rtc.yaml` модифицирован, `go2rtc.exe` лежит рядом; интеграция не закончена |
| Flutter Design System | `docs/superpowers/plans/2026-04-18-flutter-design-system.md` | 0 / 42 | `GlassCard`, `MainShell`, `EventsScreen`, `Skeleton*` — реализованы (см. recent commits 879f3af, ba91557); не отмечено в чекбоксах |
| Admin Design System | spec `2026-04-19-admin-design-system-spec.md` | (spec) | Применено: коммит `0d48238 feat: apply GRG design system to admin panel`, `9de0aac`, `ba91557` |
| Flutter Design Remaining | spec `2026-04-19-flutter-design-remaining-spec.md` | (spec) | ProfileScreen и пр. — требует проверки в коде |

**Рекомендация:** провести разовый "checkbox sync" по всем планам выше — пройтись по шагам и отметить уже сделанное в исходных `.md`, чтобы дальше пользоваться `superpowers:executing-plans`.

---

## Раздел 2. Бэклог по `SPEC_COMPLIANCE_AND_ROADMAP.md` — Фаза 1 (MVP)

### 2.1. Backend — Uniview (приоритет P1)

| Метод | Эндпоинт LiteAPI | API проекта | Зачем |
|---|---|---|---|
| `getChannels()` | `Channels/System/DeviceInfo`, `ChannelDetailInfo`, `BasicInfo` | `GET /devices/:id/channels` | Список камер NVR в админке и Flutter |
| `getSnapshot(channelId)` | `PreviewSnapshot` | `GET /devices/:id/snapshot/:channel` | Превью на сетке камер |
| `getRecordings(query)` | Record search | `GET /devices/:id/recordings` | Архив (Фаза 2, но зацепить интерфейс уже сейчас) |
| `getPlaybackUrl(time)` | RTSP playback | `GET /devices/:id/playback-url` | Архив |
| PTZ: `move`, `stop`, `presetGoto` | `PTZCtrl` | `POST /devices/:id/ptz/*` | Управление PTZ |

Всё — в `backend/src/vendors/uniview/uniview-liteapi-http.client.ts` (Digest auth уже реализован) + `control.controller.ts`.

### 2.2. Backend — события и WS

- **Auto-reconnect Uniview WS** (`backend/src/events/uniview-ws-connection.service.ts`) — устройство-инициатор не должен висеть в `disconnected` после первого падения. Реализовать backoff + переотправку `/ws/start` при доступности.
- **Webhook Uniview** `POST /api/webhooks/uniview` — на случай если NVR/IPC будет слать события HTTP-webhook'ом (для DDNS-сценариев).
- **Connection status events** в `events/event-types.ts`: `device_ws_connected`, `device_ws_disconnected`, `device_ws_reconnecting` — чтобы и Flutter, и админка показывали реальный online-статус.

### 2.3. Backend — Auth

- `POST /api/auth/logout` — инвалидация refresh token (поле `refreshTokenHash` в `users`). Сейчас logout есть на фронте (удаление токена) но без серверной части — refresh остаётся валидным до истечения.

### 2.4. go2rtc / NAT substream

- Завершить план `2026-04-15-go2rtc-nat-substream.md` (proxy substream через go2rtc для устройств за NAT). Отдельный трек — не блокирует админку.

### 2.5. Flutter — оставшееся

По `2026-04-15-uniview-full-implementation.md`:
- `lib/widgets/rtsp_player_widget.dart` — media_kit player
- `lib/screens/live_view_screen.dart` — Live + PTZ + open-door + two-way audio
- `lib/screens/playback_screen.dart` — таймлайн архива
- Миграция `incoming_call_screen.dart` на media_kit
- Доработки `device_events_screen.dart` (фильтры, real-time)

По `2026-04-19-flutter-design-remaining-spec.md`:
- ProfileScreen полный редизайн (Hero + ListTile + bottom sheets + danger zone) — проверить, реализовано ли.

---

## Раздел 3. Доработки админки (`backend/public/admin.html`)

Файл: ~1548 строк, единый Vanilla JS SPA с динамическими `innerHTML`.

### 3.1. Категория **P0 — критические UX-блокировки и безопасность**

#### 3.1.1. Распараллелить fetch'и в "Жители" и "Устройства"

**Где:** `admin.html:805–844` (residents), `admin.html:855–863` (devices).

**Сейчас:**
```js
for (const b of buildings) {
  const rr = await fetch(API + '/apartments/by-building/' + b.id, ...);
  // ...
}
```
На 10+ зданиях UI блокируется на ~N×RTT.

**Изменить на:**
```js
const results = await Promise.all(
  buildings.map(b => fetch(API + '/apartments/by-building/' + b.id, { headers: headers() })
    .then(r => r.ok ? r.json() : []))
);
buildings.forEach((b, i) => { /* render */ });
```

То же для `/buildings/:id/devices` в разделе устройств.

#### 3.1.2. Хелпер `apiFetch()` с авто-обработкой 401

**Где:** дублируется ~30+ раз: `if (r.status === 401) { on401Response(); return; }`.

**Сделать:**
```js
async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (r.status === 401) { on401Response(); throw new ApiUnauthorized(); }
  return r;
}
```
И отдельный `apiJson(path, opts)` который сам парсит JSON и кидает `ApiError` с `.message`.

Снять обработку 401 со всех вызывающих сайтов.

#### 3.1.3. `escapeHtml()` для всех динамических `innerHTML`

**Где:** `admin.html:654, 658, 775, 815, 866–869, 874, 882, 953, 1062, и др.` — везде, где `innerHTML += '...' + b.name + '...'`.

**Риск:** если имя организации/квартиры/жителя содержит `<script>` или `"`, ломается вёрстка / возможен XSS.

**Сделать:**
```js
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
```
Применить везде, где идёт пользовательский контент: `name`, `email`, `phone`, `number`, `host`, `model`, `rejectReason`, `apt.number`, и т.д.

#### 3.1.4. Toast-уведомления вместо `alert/confirm/prompt`

**Где:** `admin.html:695, 707, 712, 717, 783, 794, 907, 912, 920` и др.

**Проблемы:**
- `prompt()` режется в WebView/инкогнито/мобильниках.
- Два `prompt` подряд (`from`, `to` в bulk-apartments) — особенно ломкие.
- `alert('✅ Дверь открыта')` блокирует UI.

**Сделать:**
- Утилиты `toast.ok(msg)`, `toast.err(msg)`, `toast.warn(msg)` — fixed top-right, auto-dismiss 4s.
- `confirmModal({title, body, danger})` → возвращает Promise<bool>.
- `inputModal({title, fields:[{name,label,type,required}]})` → возвращает Promise<{values}|null>.
- Применить везде вместо `alert/confirm/prompt`.

### 3.2. Категория **P1 — Удобство ежедневной работы админа**

#### 3.2.1. Фильтры и поиск в "Устройства"

**Где:** `admin.html:845–1029`.

Сейчас: список зданий → внутри каждого таблица. Невозможно быстро найти устройство по IP или имени.

**Добавить toolbar поверх таблицы:**
- Поиск по `name | host | id` (debounced 200ms).
- Select: тип (`UNIVIEW_IPC`, `UNIVIEW_NVR`, `AKUVOX`, все).
- Select: роль (`DOORPHONE`, `CAMERA`, `NVR`, все).
- Select: здание (все/конкретное).
- Select: статус (`online`, `offline`, все).
- Сохранение в `sessionStorage('admin_devices_filters')`.

При выборе одного здания/типа — сворачивать остальные группы.

#### 3.2.2. Кнопка "Проверить связь" у устройства

**Где:** `admin.html:880–895` (action-кнопки в строке устройства).

Backend уже реализует `POST /control/:id/test-connection` (см. `control.controller.ts`). Добавить кнопку `🔌 Тест` рядом с `🔓` и `Изменить`. По клику — вызов и inline-результат (latency/ok/err) в той же строке.

#### 3.2.3. Колонка "Последнее событие" и время последнего пинга

**Где:** `admin.html:872` — заголовки таблицы устройств.

Нужен серверный endpoint `GET /devices/:id/last-seen` (или включить поле в `/buildings/:id/devices`). Использовать `event_logs.lastEventAt` или последний successful test-connection.

#### 3.2.4. Поиск и фильтр в "Пользователи"

**Где:** `admin.html:1045–1098`.

Сейчас: таблица с keys из `data[0]`, без поиска. На 100+ юзерах неудобно.

**Добавить:**
- Поиск по `email | phone | name`.
- Select по роли (`SUPER_ADMIN | ORG_ADMIN | COMPLEX_MANAGER | RESIDENT`).
- Select по статусу (заблокирован / активен).
- Колонки выбрать вручную (id, email, phone, name, role, isBlocked, blockedUntil, createdAt) — а не автоматически из `Object.keys`.
- Серверная пагинация: `GET /users?limit=50&offset=…&q=…&role=…` (если ещё нет — добавить).

#### 3.2.5. Inline-редактирование Organizations / Complexes / Buildings

**Где:** `admin.html:1031–1078` (generic-вывод через `addCreateForm`).

Сейчас: только "создать" и "удалить", редактировать нельзя. У `devices` уже есть `dev-edit`/`openEditDeviceForm` — повторить паттерн для остальных сущностей:
- `org-edit` → модалка с `{name, contactEmail, contactPhone, maxComplexes, maxDevices}`.
- `complex-edit` → `{name, address, organizationId}`.
- `building-edit` → `{name, address, complexId, floors}`.

#### 3.2.6. Управление лимитами организации

**Где:** roadmap §2 упоминает `max_complexes`, `max_devices` (поля Organization).

В форме Organization (создание/редактирование) добавить поля. В таблице — колонки `Лимит ЖК`, `Лимит устройств` с цветовым акцентом при приближении к лимиту.

#### 3.2.7. Вкладка "События" (журнал)

**Где:** новая вкладка между "Заявки" и "Пользователи".

На бэке `event_logs` уже есть. Эндпоинт: `GET /events?deviceId=&type=&from=&to=&limit=&offset=`.

UI:
- Фильтры: тип события, устройство, диапазон дат.
- Таблица: время, устройство, тип, описание, payload (свёрнуто, expand on click).
- Real-time подписка на `EventsGateway` — новые строки сверху с подсветкой.
- Экспорт CSV.

#### 3.2.8. Вкладка "Связи user ↔ apartment"

Сейчас управление через `residents`-секцию (по квартирам). Добавить инверсный вид:
- Поиск пользователя по email/телефону.
- Список его квартир с кнопкой "Отвязать".
- Кнопка "Привязать к квартире" → выбор building + apartment.

### 3.3. Категория **P2 — Качество и информативность**

#### 3.3.1. Дашборд: drill-down + последние события

**Где:** `admin.html:632–648`.

- Каждая карточка-статистика — кликабельная (организации → таб organizations и т.д.).
- "Заявки ожидают" → таб applications с фильтром PENDING.
- Блок "Последние 5 событий" под карточками (из `event_logs`).
- Блок "Устройства offline" если их > 0.

#### 3.3.2. Сохранение фильтров в `sessionStorage`

**Где:** `applications` (статус + здание), `devices` (новые фильтры), `events` (новые фильтры), `users` (новые фильтры).

Уже есть паттерн `admin_tab` — расширить.

#### 3.3.3. Колонки Заявок: телефон, имя, причина отклонения

**Где:** `admin.html:761–777`.

Добавить колонки:
- Телефон жителя (рядом с email).
- Имя.
- Для отклонённых — `rejectReason` в tooltip / отдельной колонке.
- Ссылка-якорь на квартиру: при клике переход в residents → конкретная квартира.

#### 3.3.4. Bulk-create apartments — нормальная форма

**Где:** `admin.html:702–722`.

Сейчас: два `prompt()`. Заменить на модалку с полями `from`, `to`, `floor` (опционально применить ко всем), `prefix` (опционально), preview списка номеров.

#### 3.3.5. Перенос inline-стилей в CSS

**Где:** `admin.html:638, 642, 657, 866–869, 874, 878–879, 950–963` — десятки `style="..."`.

После применения дизайн-системы (commit `0d48238`) часть classes уже есть. Завести классы в `<style>`:
- `.stat-card`, `.stat-label`, `.stat-value`
- `.status-badge`, `.status-badge.online`, `.status-badge.offline`
- `.floor-badge`, `.channel-cell`
- `.scan-result-row`, `.scan-result-header`

Убрать inline `style=` оттуда.

#### 3.3.6. Прогресс при массовом создании камер NVR

**Где:** `admin.html:1017–1028` — последовательный цикл создания.

- Показывать `Создание X / N…`.
- Параллелить пачками по 4 (`p-limit`-стиль).
- В конце — список ошибок с конкретными каналами.

#### 3.3.7. Запоминание открытой квартиры в residents

**Где:** `admin.html:429` (`residentSection`) скрывается на каждый `fetchData`.

Сохранять `lastOpenApartmentId` в `sessionStorage`, при возврате на вкладку — восстанавливать.

### 3.4. Категория **P3 — Долг по чистоте кода**

#### 3.4.1. Декомпозиция `fetchData()` (~600 строк)

Разбить на отдельные функции `renderDashboard()`, `renderOrganizations()`, `renderComplexes()`, `renderBuildings()`, `renderApartments()`, `renderResidents()`, `renderUsers()`, `renderDevices()`, `renderApplications()`, `renderEvents()`. В `fetchData(tab)` — только диспетчеризация.

#### 3.4.2. Шаблонные функции для таблиц

`renderTable({columns, rows, actions, emptyMessage})` — вместо повторяющегося кода `<table><thead>…</thead><tbody>…</tbody></table>`.

#### 3.4.3. CSP-заголовки

Сейчас `<script>` инлайн внутри `admin.html`. Добавить `Content-Security-Policy` хотя бы `default-src 'self'; script-src 'self' 'unsafe-inline'` (с `'unsafe-inline'` пока скрипт инлайн — позже вынести в `/admin.js` и убрать `unsafe-inline`).

#### 3.4.4. Перенос JS в `backend/public/admin.js`

После декомпозиции (3.4.1) — вынести JS из `admin.html` в отдельный файл, кэшируется браузером, проще диффить.

---

## Раздел 4. Порядок реализации

### Спринт 1 (P0 — фундамент) ✅ ВЫПОЛНЕН

- [x] 1. `escapeHtml` + применить везде (3.1.3)
- [x] 2. `apiFetch / apiJson` + рефакторинг 401-мест (3.1.2)
- [x] 3. `Promise.all` в residents и devices (3.1.1)
- [x] 4. Toast / confirm-modal / input-modal — utility (3.1.4)
- [x] 5. Замена `prompt('от')`+`prompt('до')` на модалку bulk-apartments (3.3.4)
- [x] 6. Замена `alert/confirm` в device actions на toast/confirm-modal (3.1.4)

### Спринт 2 (P1 — повседневное удобство) ✅ ВЫПОЛНЕН

- [x] 7. Фильтры и поиск Devices (3.2.1)
- [x] 8. Кнопка "Тест" в строке устройства (3.2.2) — `POST /control/:id/test-connection` + inline-результат
- [x] 9. Фильтры и поиск Users с sessionStorage (3.2.4)
- [x] 10. Inline-редактирование Organizations / Complexes / Buildings через `inputModal` + PATCH (3.2.5)
- [x] 11. Поле `maxDevices` в форме создания организации (3.2.6)
- [x] 12. Вкладка «События» с фильтрами deviceId / тип / диапазон дат (3.2.7) — backend `findFiltered()` + frontend
- [x] 13. Вкладка «Квартиры жителей» (user↔apartment): поиск, привязка, отвязка (3.2.8)
  - backend: `GET /admin/users/search`, `GET /admin/users/:id/apartments`, `POST`, `DELETE`

### Спринт 3 (P2 — полировка) ✅ ВЫПОЛНЕН

- [x] 14. Drill-down дашборд: кликабельные карточки, блок «offline устройств», последние 5 событий (3.3.1)
- [x] 15. Сохранение фильтров applications в `sessionStorage('admin_app_filters')` (3.3.2)
- [x] 16. Колонки заявок: Email, Телефон, Имя, Причина отказа (3.3.3)
- [x] 17. CSS-классы `.stat-card`, `.scan-ch-panel`, `.scan-result-header`, `.scan-result-row` вместо inline-стилей (3.3.5)
- [x] 18. Прогресс «Создание X / N (канал Y)…» при bulk-create камер NVR (3.3.6)
- [x] 19. Запоминание открытой квартиры в `sessionStorage('admin_last_apt')` при возврате на вкладку «Жители» (3.3.7)

### Спринт 4 (P3 — техдолг) ✅ ВЫПОЛНЕН (частично)

- [x] 20. `renderTable({columns, rows, emptyMessage})` хелпер добавлен в `admin.js` (3.4.2)
- [~] 21. Декомпозиция `fetchData` — добавлен комментарий-маркер и `renderTable` хелпер; полная экстракция каждого таба в отдельную функцию **не сделана** (3.4.1)
- [x] 22. JS вынесен в `backend/public/admin.js`; `admin.html` сокращён до 495 строк; CSP-заголовок `script-src 'self'` в `AdminController` (3.4.3, 3.4.4)

### Параллельный трек — Backend / Flutter (по roadmap) ⬜ НЕ НАЧАТ

- [ ] 23. `POST /auth/logout` — серверная инвалидация refresh-токена (2.3)
- [ ] 24. Uniview `getChannels`, `getSnapshot` (2.1) + Snapshot-превью в админке
- [ ] 25. Uniview WS auto-reconnect + события `device_ws_connected / disconnected / reconnecting` (2.2)
- [ ] 26. Flutter: `live_view_screen` (PTZ + two-way audio), `playback_screen`, media_kit player (2.5)
- [ ] 27. go2rtc NAT substream — отдельный трек (2.4)

---

## Раздел 5. Что не делаем (out of scope)

- Akuvox-эндпоинты (`dial`, `hangup`, `calllog`, `contact/*`, `user/*`, `publiccode`, `schedule`) — пока вендор не используется на объектах.
- Распознавание лиц / Face Recognition Uniview — Фаза 3 roadmap.
- Redis (сессии, очередь push) — Фаза 2 roadmap, текущая нагрузка не требует.
- Полное переписывание админки на Vue/React — текущий vanilla SPA приведём в порядок декомпозицией.

---

## Раздел 6. Метрики готовности

| Этап | Критерий приёмки |
|---|---|
| Спринт 1 | Нет ни одного `alert/confirm/prompt` в `admin.html`; все динамические `innerHTML` экранированы; список устройств на 5 зданиях × 10 устройств загружается < 1.5 с |
| Спринт 2 | Поиск устройства по IP — ≤ 200 мс; редактирование любой сущности из таблицы без перехода в "создать"; вкладка "События" показывает real-time |
| Спринт 3 | Все фильтры переживают перезагрузку вкладки (sessionStorage); inline-`style=` ≤ 5 мест в файле |
| Спринт 4 | `admin.html` ≤ 400 строк (только разметка), JS вынесен в `admin.js`; CSP включён без `unsafe-inline` |
| Backend-трек | `auth/logout` инвалидирует refresh; Uniview `/snapshot/:ch` возвращает JPEG; WS-сервис переподключается автоматически после kill сети |
