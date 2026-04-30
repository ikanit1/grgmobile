# Admin Camera Viewer — Design Spec

**Дата:** 2026-05-01
**Файлы:** `backend/public/admin.js`, `backend/public/admin.html`
**Бэкенд:** без изменений — endpoint `GET /api/devices/:id/live-url` уже реализован

---

## Цель

Добавить просмотр живого видео с камер и домофонов прямо в админ-панели, не покидая вкладку «Устройства».

---

## UX

### Триггер

В каждой строке устройства типа `UNIVIEW_IPC`, `UNIVIEW_NVR` (и дочерних NVR-каналов) появляется кнопка **«▶»** рядом с существующими action-кнопками.

- NVR-parent: кнопка «▶» открывает поток первого канала (channel 1)
- NVR-субкамера: кнопка «▶» открывает поток своего канала
- DOORPHONE: кнопка «▶» + внутри модала кнопка «Открыть дверь»
- CAMERA: только кнопка «▶», без управления

### Модальное окно `#cameraModal`

Поверх страницы, центровано. Структура:

```
┌─────────────────────────────────────┐
│ 📷 Название устройства        [✕]   │
│ IP · канал                          │
├─────────────────────────────────────┤
│                                     │
│          <video> HLS                │  ← hls.js
│                            ● LIVE   │
│                                     │
├─────────────────────────────────────┤
│  [🔓 Открыть дверь]  ← только DOORPHONE
└─────────────────────────────────────┘
```

- Закрытие: кнопка ✕ или клик на оверлей
- При закрытии: `video.pause()`, `hls.destroy()` — освобождаем ресурсы
- Ошибка загрузки потока: inline-сообщение «Не удалось подключиться к камере»

---

## Технический поток

```
Клик «▶» в строке устройства
  → openCameraModal(deviceId, deviceName, host, channelId, role)
  → GET /api/devices/:id/live-url?channel=<channelId>   [с JWT]
  → { hlsUrl, rtspUrl, ... }
  → Hls.js.loadSource(hlsUrl)
  → video.play()
```

Если `hlsUrl` отсутствует в ответе (go2rtc не настроен) — показать сообщение «go2rtc не доступен».

---

## Изменения в файлах

### `backend/public/admin.html`

1. Добавить в `<head>`: `<script src="https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js"></script>`
2. Добавить перед `</body>` разметку модала `#cameraModal`:

```html
<div id="cameraModal" style="display:none;" ...>
  <div id="cameraModalBox" ...>
    <div id="cameraModalHeader">...</div>
    <video id="cameraVideo" autoplay muted playsinline ...></video>
    <div id="cameraError" style="display:none;">...</div>
    <button id="cameraOpenDoor" style="display:none;">🔓 Открыть дверь</button>
  </div>
</div>
```

### `backend/public/admin.js`

1. **`renderDevicesTab`** — добавить кнопку `<button class="dev-view" data-device-id="..." data-device-name="..." data-device-host="..." data-channel-id="..." data-device-role="...">▶</button>` в строку каждого Uniview-устройства.

2. **`openCameraModal(deviceId, name, host, channelId, role)`**:
   - Показывает модал, ставит спиннер
   - Вызывает `apiJson('/devices/' + deviceId + '/live-url' + (channelId ? '?channel=' + channelId : ''))`
   - Инициализирует `Hls.js` или нативный HLS (`video.canPlayType('application/vnd.apple.mpegurl')`)
   - Показывает кнопку «Открыть дверь» только если `role === 'DOORPHONE'`

3. **`closeCameraModal()`**:
   - `video.pause()`
   - `hls.destroy()` если был создан
   - Скрывает модал

4. **Делегирование событий** (в существующем `document.addEventListener('click', ...)` блоке):
   - `.dev-view` → `openCameraModal(...)`
   - `#cameraModal` (оверлей) → `closeCameraModal()`
   - `#cameraModalClose` → `closeCameraModal()`
   - `#cameraOpenDoor` → вызов `POST /devices/:id/open-door` + toast

---

## Стиль модала

Следует дизайн-системе GRG (из `admin.js`):
- Фон: `rgba(0,0,0,0.7)` оверлей
- Бокс: `background: var(--grg-surface)`, `border: 1px solid var(--grg-border)`, `border-radius: 12px`
- Кнопка «Открыть дверь»: `background: linear-gradient(135deg, var(--grg-primary), ...)`, полная ширина
- Видео: `width: 100%`, `max-height: 60vh`, `border-radius: 8px`, `background: #000`

---

## Ограничения / out of scope

- PTZ управление — не реализуется
- WebRTC вместо HLS — не реализуется (HLS через go2rtc достаточно)
- Несколько камер одновременно — не реализуется (один модал)
- Снапшот/превью до старта плеера — не реализуется
