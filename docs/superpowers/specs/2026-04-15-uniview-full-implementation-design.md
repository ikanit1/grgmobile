# Uniview LiteAPI — Полная реализация (Phase 2 + Flutter)

**Дата:** 2026-04-15
**Подход:** RTSP-центричный (медиа напрямую устройство ↔ мобилка, backend только сигналинг)
**Платформы:** Android + iOS
**Устройства:** Uniview IPC, Uniview/EVO NVR, Uniview вызывные панели (общий LiteAPI протокол)

---

## 1. Общая архитектура

```
┌─────────────────┐         ┌──────────────────┐        ┌────────────────┐
│  Uniview IPC    │◄─RTSP──►│  Flutter App      │        │  NestJS Backend│
│  Uniview NVR    │         │  (Android/iOS)    │◄─REST─►│                │
│  EVO панели     │         │                   │◄─WS───►│  (Socket.IO)   │
└───────┬─────────┘         └──────────────────┘        └───────┬────────┘
        │                                                        │
        │  LiteAPI HTTP (Digest)                                │
        │  LiteAPI WebSocket (events)                           │
        └───────────────────────────────────────────────────────┘
```

### Два независимых канала:

1. **Медиа-канал** (устройство ↔ мобилка напрямую)
   - RTSP live view — `media_kit` в Flutter
   - RTSP playback — URL от NVR через LiteAPI
   - RTSP backchannel — двусторонний звук для домофона

2. **Сигнальный канал** (устройство → backend → мобилка)
   - Устройство пушит событие → Backend WebSocket → FCM push → мобилка
   - Мобилка → Backend REST → устройство (открыть дверь, PTZ, запрос записей)

**Принцип: Backend никогда не проксирует видео/аудио.**

---

## 2. Backend — новые эндпоинты и сервисы

### 2.1 Recording / Playback (NVR)

Новые методы в `UniviewLiteapiHttpClient`:

| Метод | LiteAPI endpoint | Назначение |
|-------|-----------------|------------|
| `getRecordings(device, channelId, from, to)` | `GET /Channels/{id}/Media/Video/Streams/Recording` | Список записей за период |
| `getPlaybackUrl(device, channelId, recordId)` | `GET /Channels/{id}/Media/Video/Streams/Playback` | RTSP URL воспроизведения |
| `getRecordingTimeline(device, channelId, date)` | `GET /Channels/{id}/Media/Video/Streams/RecordingTimeline` | Таймлайн записей за день |

Новые REST-эндпоинты в `ControlController`:

- `GET /api/devices/:id/recordings?channelId=&from=&to=`
- `GET /api/devices/:id/playback-url?channelId=&recordId=`
- `GET /api/devices/:id/recording-timeline?channelId=&date=`

### 2.2 PTZ Control

Новые методы в `UniviewLiteapiHttpClient`:

| Метод | LiteAPI endpoint | Назначение |
|-------|-----------------|------------|
| `getPtzCapabilities(device, channelId)` | `GET /Channels/{id}/PTZ/Capabilities` | Поддерживает ли камера PTZ |
| `ptzMove(device, channelId, direction, speed)` | `PUT /Channels/{id}/PTZ/Direction` | Движение |
| `ptzStop(device, channelId)` | `PUT /Channels/{id}/PTZ/Direction` (speed=0) | Остановка |
| `getPtzPresets(device, channelId)` | `GET /Channels/{id}/PTZ/Presets` | Список предустановок |
| `gotoPreset(device, channelId, presetId)` | `PUT /Channels/{id}/PTZ/Presets/{presetId}/Goto` | Перейти к предустановке |

Новые REST-эндпоинты:

- `GET /api/devices/:id/ptz/capabilities?channelId=`
- `POST /api/devices/:id/ptz/move` body: `{channelId, direction, speed}`
- `POST /api/devices/:id/ptz/stop` body: `{channelId}`
- `GET /api/devices/:id/ptz/presets?channelId=`
- `POST /api/devices/:id/ptz/goto-preset` body: `{channelId, presetId}`

### 2.3 WebSocket auto-reconnect

Улучшения в `UniviewWsConnectionService`:

- Exponential backoff: 1с → 2с → 4с → ... → 60с max
- Переподписка на события после реконнекта
- Статус соединения (connected/reconnecting/disconnected) → EventsGateway для UI
- Heartbeat ping каждые 30с для детекции обрыва

### 2.4 Intercom Call Flow

```
Кнопка звонка на панели
    → панель пушит событие (EventType: "DoorBell" / "CallIncoming")
    → Backend UniviewWsConnectionService принимает
    → Backend находит жителей: device → building → apartments → users
    → FCM push с payload: {deviceId, channelId, eventType, snapshotUrl}
    → Flutter показывает full-screen incoming call
    → Житель нажимает "Ответить":
        → Flutter запрашивает GET /api/devices/:id/live-url
        → Открывает RTSP стрим + backchannel audio
    → Житель нажимает "Открыть":
        → POST /api/devices/:id/open-door
    → Житель нажимает "Отклонить":
        → закрывает экран
```

---

## 3. Flutter — экраны и компоненты

### 3.1 RtspPlayerWidget

Общий переиспользуемый виджет:

- Принимает RTSP URL, показывает видео через `media_kit`
- Управление: play/pause, полноэкранный режим, mute
- Индикатор загрузки и ошибки соединения
- Опциональный backchannel audio (для домофона)
- Опциональные оверлеи (PTZ-кнопки, snapshot)

### 3.2 IncomingCallScreen

Full-screen экран входящего вызова:

- Триггер: FCM push notification с `data: {type: "incoming_call", deviceId, snapshotUrl}`
- "Ответить" → переход на LiveViewScreen с активным аудио
- "Открыть дверь" → `POST /open-door` + визуальное подтверждение
- "Отклонить" → закрытие экрана
- Таймаут 60 сек → автоматическое закрытие
- Background: FCM high-priority + `flutter_callkeep` / `flutter_incoming_call`

### 3.3 LiveViewScreen

- RTSP видео через `RtspPlayerWidget`
- Кнопка микрофона — RTSP backchannel (two-way audio)
- Кнопка открытия двери
- Кнопка снапшота — сохранение кадра локально
- PTZ-контролы (джойстик) — если устройство поддерживает PTZ
- Полноэкранный режим

### 3.4 PlaybackScreen (записи NVR)

- Выбор даты через DatePicker
- Таймлайн — визуальная полоса записей за день (из `recording-timeline`)
- Список записей с временем начала/конца и длительностью
- Нажатие на запись → RTSP playback через `RtspPlayerWidget`
- Прогресс-бар воспроизведения

### 3.5 EventsScreen (история событий)

- Данные из `GET /api/devices/:id/events` + Socket.IO для real-time
- Фильтры по типу события и дате
- Типы: входящий вызов, дверь открыта, движение, тревога
- Нажатие на событие → снапшот или переход к записи

### 3.6 Навигация

```
HomeScreen (список зданий/устройств)
  └── DeviceInfoBackendScreen (информация об устройстве)
        ├── LiveViewScreen (live + двусторонний звук + PTZ)
        ├── PlaybackScreen (записи NVR)
        └── EventsScreen (история событий)

IncomingCallScreen — показывается поверх всего из любого состояния
```

### 3.7 Flutter-сервисы

| Сервис | Назначение |
|--------|-----------|
| `EventsSocketService` (существует) | Socket.IO подключение, подписка на события |
| `PushNotificationService` | FCM init, обработка push, показ IncomingCallScreen |
| `MediaService` | Управление media_kit, lifecycle плеера |

---

## 4. Зависимости

### Backend (package.json)

Новых пакетов не требуется. Используются существующие: `axios`, `ws`, `@nestjs/websockets`, `firebase-admin`.

### Flutter (pubspec.yaml)

| Пакет | Назначение |
|-------|-----------|
| `media_kit` + `media_kit_video` | RTSP-плеер (libmpv) |
| `media_kit_libs_android_video` | Нативные библиотеки Android |
| `media_kit_libs_ios_video` | Нативные библиотеки iOS |
| `flutter_callkeep` или `flutter_incoming_call` | Нативный экран входящего вызова |
| `wakelock_plus` | Не гасить экран при просмотре видео |

Существующие и переиспользуемые: `firebase_messaging`, `socket_io_client`, `shared_preferences`.

---

## 5. Обработка ошибок

| Ситуация | Поведение |
|----------|----------|
| Устройство недоступно (timeout) | "Устройство не в сети", retry через 5с |
| RTSP стрим оборвался | `media_kit` auto-reconnect + индикатор |
| WebSocket обрыв (backend ↔ устройство) | Exponential backoff, статус в UI через Socket.IO |
| FCM push не дошёл | Fallback: Socket.IO событие, если приложение открыто |
| PTZ не поддерживается | `capabilities` → false → кнопки скрыты |
| NVR нет записей за период | Пустой таймлайн, сообщение "Нет записей" |
| open-door failed | Toast "Не удалось открыть дверь", лог в EventLog |

---

## 6. Безопасность

- Все REST-вызовы через JWT (существующая реализация)
- RTSP URL содержит credentials — не кешировать, не логировать
- RTSP URL без TTL — запрашивать каждый раз при открытии стрима
- FCM push payload — только `deviceId` и `eventType`, без credentials
- PTZ / open-door — проверка через `AccessService` (доступ к зданию)

---

## 7. Тестирование

**Backend:**
- Unit-тесты: новые методы `UniviewLiteapiHttpClient` (mock HTTP)
- E2E: `POST /ptz/move`, `GET /recordings`, `GET /playback-url` — mock-устройство
- Расширение существующих: `uniview-liteapi-http.client.spec.ts`

**Flutter:**
- Widget-тесты: `IncomingCallScreen`, `RtspPlayerWidget` (без реального стрима)
- Integration: ручное тестирование с реальными устройствами

---

## 8. Что уже реализовано (не трогаем)

- `UniviewLiteapiHttpClient`: getLiveUrl, openDoor, triggerRelay, getSystemInfo, getEvents, getChannels, getChannelDetail, getChannelInfo, getSnapshot
- `UniviewLiteapiWsClient`: connect, subscribeEvents, event callbacks
- `UniviewWsConnectionService`: per-device connections, event broadcast, push
- `ControlController`: live-url, open-door, info, events, ws-connect, ws-disconnect, channels, snapshot
- Digest auth helper
- Webhook receiver для Uniview
- Event types: UNIVIEW_DOOR_OPEN, UNIVIEW_MOTION, UNIVIEW_ALARM, UNIVIEW_TAMPER
- AccessService RBAC
- CredentialsService AES-256 encryption
