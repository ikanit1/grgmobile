# Admin Camera Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить кнопку «▶» в строку каждого Uniview-устройства в админке; по клику — модальное окно с HLS-плеером (hls.js); для домофонов — кнопка «Открыть дверь» внутри модала.

**Architecture:** Только фронтенд — бэкенд не меняется. `GET /api/devices/:id/live-url` уже возвращает `hlsUrl`. В `admin.html` добавляем hls.js CDN и разметку модала; в `admin.js` — функции `openCameraModal` / `closeCameraModal`, кнопку в `renderDeviceRow` и обработчики кликов.

**Tech Stack:** Vanilla JS, hls.js (CDN), существующий дизайн-токены GRG (`var(--grg-*)` CSS-переменные).

**Spec:** `docs/superpowers/specs/2026-05-01-admin-camera-viewer-design.md`

---

## File Map

### Modify:
- `backend/public/admin.html` — hls.js `<script>`, CSS для модала, HTML-разметка `#cameraModal`
- `backend/public/admin.js` — модульное состояние, `openCameraModal()`, `closeCameraModal()`, кнопка `dev-view` в `renderDeviceRow`, делегированные обработчики

---

## Task 1: HTML — hls.js CDN + CSS + разметка модала

**Files:**
- Modify: `backend/public/admin.html`

- [ ] **Step 1: Добавить hls.js CDN в `<head>`**

В `backend/public/admin.html` найти строку `<head>` (строка 3). Добавить hls.js сразу после открывающего тега `<head>`:

```html
<head>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
```

- [ ] **Step 2: Добавить CSS для camera-modal**

В `backend/public/admin.html` найти блок `/* ── Modal ── */` (строка ~30) и добавить после блока `.modal-actions { ... }` (после строки ~44):

```css
    /* ── Camera modal ── */
    #cameraModal { z-index: 9000; }
    #cameraVideo { width: 100%; max-height: 60vh; border-radius: 8px; background: #000; display: block; }
    #cameraLoading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 8px; }
    #cameraLiveBadge { position: absolute; top: 8px; right: 8px; background: rgba(220,30,30,0.18); border: 1px solid rgba(220,30,30,0.4); border-radius: 4px; padding: 2px 8px; font-size: 11px; color: #ff5555; }
    #cameraOpenDoor { width: 100%; background: linear-gradient(135deg, var(--grg-primary), #5a4fd6); color: #fff; border: none; border-radius: 8px; padding: 0.625rem; font-size: 13px; font-weight: 600; cursor: pointer; }
    #cameraOpenDoor:hover { opacity: 0.9; }
```

- [ ] **Step 3: Добавить разметку `#cameraModal` перед `</body>`**

В `backend/public/admin.html` найти строку `  <div id="toastContainer"></div>` (строка ~473) и добавить **перед ней**:

```html
  <div id="cameraModal" class="modal-backdrop" style="display:none;" onclick="if(event.target===this)closeCameraModal()">
    <div class="modal-box" style="max-width:640px;width:100%;gap:0.75rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="modal-title" id="cameraModalTitle"></div>
          <div style="font-size:12px;color:var(--grg-ink-400);margin-top:2px;" id="cameraModalSubtitle"></div>
        </div>
        <button type="button" id="cameraModalClose" class="secondary" style="padding:0.25rem 0.5rem;font-size:16px;line-height:1;">✕</button>
      </div>
      <div style="position:relative;">
        <video id="cameraVideo" autoplay muted playsinline></video>
        <div id="cameraLoading"><span style="color:var(--grg-ink-400);font-size:13px;">⏳ Подключение...</span></div>
        <div id="cameraLiveBadge" style="display:none;">● LIVE</div>
      </div>
      <div id="cameraError" style="display:none;color:var(--grg-danger);font-size:13px;text-align:center;padding:0.5rem;"></div>
      <button type="button" id="cameraOpenDoor" style="display:none;">🔓 Открыть дверь</button>
    </div>
  </div>
```

- [ ] **Step 4: Проверить что admin.html открывается без ошибок**

```bash
# Открыть http://localhost:3000/api/admin в браузере
# Убедиться что DevTools > Console не показывает ошибок
# Убедиться что hls.js загружен: в Console ввести typeof Hls → должно быть "function"
```

- [ ] **Step 5: Commit**

```bash
git add backend/public/admin.html
git commit -m "feat(admin): add camera modal HTML structure + hls.js CDN"
```

---

## Task 2: JS — функции openCameraModal и closeCameraModal

**Files:**
- Modify: `backend/public/admin.js`

- [ ] **Step 1: Добавить модульное состояние и функцию `openCameraModal`**

В `backend/public/admin.js` найти строку `document.addEventListener('DOMContentLoaded'` (строка ~1) и добавить **перед ней** (в глобальной области видимости):

```js
let _hlsInstance = null;
let _cameraDeviceId = null;

async function openCameraModal(deviceId, name, host, role) {
  _cameraDeviceId = deviceId;
  const modal    = document.getElementById('cameraModal');
  const video    = document.getElementById('cameraVideo');
  const errorEl  = document.getElementById('cameraError');
  const loadingEl= document.getElementById('cameraLoading');
  const liveBadge= document.getElementById('cameraLiveBadge');
  const doorBtn  = document.getElementById('cameraOpenDoor');

  document.getElementById('cameraModalTitle').textContent = name;
  document.getElementById('cameraModalSubtitle').textContent = host;
  errorEl.style.display   = 'none';
  errorEl.textContent     = '';
  loadingEl.style.display = 'flex';
  liveBadge.style.display = 'none';
  video.src               = '';
  doorBtn.style.display   = role === 'DOORPHONE' ? 'block' : 'none';

  if (_hlsInstance) { _hlsInstance.destroy(); _hlsInstance = null; }
  modal.style.display = 'flex';

  try {
    const data = await apiJson('/devices/' + deviceId + '/live-url');
    if (!data.hlsUrl) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'go2rtc не доступен — HLS URL не получен';
      errorEl.style.display = 'block';
      return;
    }
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      _hlsInstance = new Hls({ lowLatencyMode: true });
      _hlsInstance.loadSource(data.hlsUrl);
      _hlsInstance.attachMedia(video);
      _hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
        loadingEl.style.display = 'none';
        liveBadge.style.display = 'block';
        video.play().catch(function() {});
      });
      _hlsInstance.on(Hls.Events.ERROR, function(event, errData) {
        if (errData.fatal) {
          loadingEl.style.display = 'none';
          errorEl.textContent = 'Не удалось подключиться к камере';
          errorEl.style.display = 'block';
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.hlsUrl;
      video.addEventListener('loadedmetadata', function() {
        loadingEl.style.display = 'none';
        liveBadge.style.display = 'block';
        video.play().catch(function() {});
      }, { once: true });
      video.addEventListener('error', function() {
        loadingEl.style.display = 'none';
        errorEl.textContent = 'Не удалось подключиться к камере';
        errorEl.style.display = 'block';
      }, { once: true });
    } else {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Браузер не поддерживает HLS';
      errorEl.style.display = 'block';
    }
  } catch (e) {
    if (e instanceof ApiUnauthorized) return;
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Ошибка: ' + e.message;
    errorEl.style.display = 'block';
  }
}

function closeCameraModal() {
  const video = document.getElementById('cameraVideo');
  video.pause();
  video.src = '';
  if (_hlsInstance) { _hlsInstance.destroy(); _hlsInstance = null; }
  _cameraDeviceId = null;
  document.getElementById('cameraModal').style.display = 'none';
}
```

- [ ] **Step 2: Убедиться что `ApiUnauthorized` определён выше в файле**

```bash
grep -n "class ApiUnauthorized\|ApiUnauthorized" backend/public/admin.js | head -5
# Ожидаем: class ApiUnauthorized определён в начале файла до DOMContentLoaded
```

- [ ] **Step 3: Проверить в браузере что функции доступны глобально**

```
# DevTools Console:
typeof openCameraModal   → "function"
typeof closeCameraModal  → "function"
```

- [ ] **Step 4: Commit**

```bash
git add backend/public/admin.js
git commit -m "feat(admin): add openCameraModal/closeCameraModal functions"
```

---

## Task 3: JS — интеграция: кнопка в таблице + обработчики событий

**Files:**
- Modify: `backend/public/admin.js`

- [ ] **Step 1: Добавить кнопку `dev-view` в `renderDeviceRow`**

В `backend/public/admin.js` найти функцию `renderDeviceRow` (~строка 826). Найти строку:

```js
                  '<button type="button" class="dev-edit secondary" data-device-id="' + d.id + '">Изменить</button> ' +
```

Добавить **перед ней** кнопку просмотра (только для Uniview-устройств):

```js
                  (d.type && d.type.startsWith('UNIVIEW') ? '<button type="button" class="dev-view secondary" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" data-device-host="' + esc(d.host || '') + '" data-device-role="' + esc(d.role || '') + '" title="Смотреть видео">▶</button> ' : '') +
```

Результат в этом месте должен выглядеть так:

```js
                '<td>' +
                  (d.type && d.type.startsWith('UNIVIEW') ? '<button type="button" class="dev-view secondary" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" data-device-host="' + esc(d.host || '') + '" data-device-role="' + esc(d.role || '') + '" title="Смотреть видео">▶</button> ' : '') +
                  '<button type="button" class="dev-edit secondary" data-device-id="' + d.id + '">Изменить</button> ' +
```

- [ ] **Step 2: Добавить обработчик `dev-view` в делегированный click-handler**

В `backend/public/admin.js` найти блок делегированного обработчика на `#devTableArea` (~строка 922). Найти:

```js
            if (btn.classList.contains('dev-edit')) {
              openEditDeviceForm(Number(btn.dataset.deviceId), buildings);
              return;
            }
```

Добавить **перед ним**:

```js
            if (btn.classList.contains('dev-view')) {
              openCameraModal(
                Number(btn.dataset.deviceId),
                btn.dataset.deviceName || ('#' + btn.dataset.deviceId),
                btn.dataset.deviceHost || '',
                btn.dataset.deviceRole || ''
              );
              return;
            }
```

- [ ] **Step 3: Добавить обработчики `#cameraModalClose` и `#cameraOpenDoor`**

В `backend/public/admin.js` найти конец блока `DOMContentLoaded` (~строка 1655):

```js
    document.getElementById('logoutBtn').addEventListener('click', logout);
```

Добавить **после этой строки** (перед `fetchHealth()`):

```js
    document.getElementById('cameraModalClose').addEventListener('click', closeCameraModal);
    document.getElementById('cameraOpenDoor').addEventListener('click', async function() {
      if (!_cameraDeviceId) return;
      if (!(await confirmModal({ title: 'Открыть дверь?' }))) return;
      try {
        const r = await apiFetch('/control/' + _cameraDeviceId + '/open-door', { method: 'POST' });
        const d = await r.json().catch(function() { return {}; });
        if (r.ok) toast.ok('✅ Дверь открыта'); else toast.err('❌ Ошибка: ' + (d.message || r.statusText));
      } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err('❌ Ошибка: ' + e.message); }
    });
```

- [ ] **Step 4: Ручное тестирование в браузере**

```
1. Открыть http://localhost:3000/api/admin → войти → вкладка «Устройства»
2. Убедиться что у каждого Uniview-устройства появилась кнопка «▶»
3. Нажать «▶» на любой камере:
   - Открывается модал с «⏳ Подключение...»
   - Через 2-5с появляется видео и badge «● LIVE»
   - Кнопка «Открыть дверь» отсутствует (для CAMERA/NVR)
4. Нажать «▶» на домофоне (role=DOORPHONE):
   - Видео + кнопка «🔓 Открыть дверь» под плеером
5. Нажать «🔓 Открыть дверь» → подтверждение → toast «✅ Дверь открыта»
6. Закрыть модал кнопкой ✕ → видео останавливается
7. Закрыть модал кликом на тёмный оверлей → видео останавливается
8. Открыть DevTools Console — убедиться что нет JS-ошибок
```

- [ ] **Step 5: Commit**

```bash
git add backend/public/admin.js
git commit -m "feat(admin): camera live view — button in device table + modal handlers"
```

---

## Self-Review

**Spec coverage:**
- ✅ Кнопка «▶» для всех Uniview-устройств (UNIVIEW_IPC, UNIVIEW_NVR) — Task 3 Step 1
- ✅ Модальное окно с hls.js — Task 1, Task 2
- ✅ «Открыть дверь» только для DOORPHONE — Task 2 Step 1 (`role === 'DOORPHONE'`)
- ✅ Закрытие по ✕ и по клику на оверлей — Task 1 Step 3 (`onclick="...closeCameraModal()"`), Task 3 Step 3
- ✅ `video.pause()` + `hls.destroy()` при закрытии — Task 2 Step 1 (`closeCameraModal`)
- ✅ Обработка ошибки если `hlsUrl` отсутствует — Task 2 Step 1
- ✅ Нативный HLS для Safari — Task 2 Step 1 (`canPlayType`)
- ✅ Стиль GRG (переменные `var(--grg-*)`) — Task 1 Step 2-3

**Placeholder scan:** ни одного TBD / TODO / "implement later"

**Type consistency:** `_cameraDeviceId` используется в Task 2 (установка) и Task 3 Step 3 (чтение) — тип `number | null`, согласовано.
