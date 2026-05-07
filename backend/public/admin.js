    'use strict';
    const API = '/api';

    let _hlsInstance = null;
    let _cameraDeviceId = null;

    async function openCameraModal(deviceId, name, host, role) {
      _cameraDeviceId = deviceId;
      const modal     = document.getElementById('cameraModal');
      const video     = document.getElementById('cameraVideo');
      const errorEl   = document.getElementById('cameraError');
      const loadingEl = document.getElementById('cameraLoading');
      const liveBadge = document.getElementById('cameraLiveBadge');
      const doorBtn   = document.getElementById('cameraOpenDoor');

      document.getElementById('cameraModalTitle').textContent    = name;
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
          errorEl.textContent     = 'go2rtc не доступен — HLS URL не получен';
          errorEl.style.display   = 'block';
          return;
        }
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          // Pre-warm: fetch master manifest so go2rtc starts ffmpeg before hls.js tries to load segments.
          // The /api/stream.m3u8 call blocks until the first HLS segment is ready (~3s cold start).
          let playlistUrl = data.hlsUrl;
          try {
            const warmResp = await fetch(data.hlsUrl);
            if (warmResp.ok) {
              const manifestText = await warmResp.text();
              const match = manifestText.match(/^(hls\/playlist\.m3u8\S*)/m);
              if (match) {
                playlistUrl = new URL(match[1], data.hlsUrl).href;
              }
            }
          } catch (_) { /* best-effort — fall back to master manifest URL */ }

          _hlsInstance = new Hls({ lowLatencyMode: true });
          _hlsInstance.loadSource(playlistUrl);
          _hlsInstance.attachMedia(video);
          _hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
            loadingEl.style.display = 'none';
            liveBadge.style.display = 'block';
            video.play().catch(function() {});
          });
          _hlsInstance.on(Hls.Events.ERROR, function(event, errData) {
            if (errData.fatal) {
              loadingEl.style.display = 'none';
              errorEl.textContent     = 'Не удалось подключиться к камере';
              errorEl.style.display   = 'block';
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
            errorEl.textContent     = 'Не удалось подключиться к камере';
            errorEl.style.display   = 'block';
          }, { once: true });
        } else {
          loadingEl.style.display = 'none';
          errorEl.textContent     = 'Браузер не поддерживает HLS';
          errorEl.style.display   = 'block';
        }
      } catch (e) {
        if (e instanceof ApiUnauthorized) return;
        loadingEl.style.display = 'none';
        errorEl.textContent     = 'Ошибка: ' + e.message;
        errorEl.style.display   = 'block';
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

    /**
     * T21: Generic table renderer.
     * @param {object} opts
     * @param {Array<{key:string, label:string, render?:function}>} opts.columns
     * @param {Array<object>} opts.rows
     * @param {string} [opts.emptyMessage]
     * @returns {string} HTML string
     */
    function renderTable({ columns, rows, emptyMessage = 'Нет записей.' }) {
      if (!rows || !rows.length) return '<p style="color:var(--grg-ink-400);">' + esc(emptyMessage) + '</p>';
      let html = '<div style="overflow-x:auto;"><table><thead><tr>';
      columns.forEach(col => { html += '<th>' + esc(col.label) + '</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
          const val = typeof col.render === 'function'
            ? col.render(row)
            : esc(row[col.key] != null ? String(row[col.key]) : '');
          html += '<td>' + val + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      return html;
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    class ApiUnauthorized extends Error {}

    async function apiFetch(path, opts = {}) {
      const { headers: extraHeaders, ...rest } = opts;
      const r = await fetch(API + path, {
        ...rest,
        headers: { ...headers(), ...(extraHeaders || {}) },
      });
      if (r.status === 401) { on401Response(); throw new ApiUnauthorized(); }
      return r;
    }

    async function apiJson(path, opts = {}) {
      const r = await apiFetch(path, opts);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || r.statusText);
      return data;
    }

    const toast = {
      _show(msg, type) {
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        const c = document.getElementById('toastContainer');
        if (c) c.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      },
      ok(msg)   { this._show(msg, 'ok'); },
      err(msg)  { this._show(msg, 'err'); },
      warn(msg) { this._show(msg, 'warn'); },
    };

    function confirmModal({ title, body = '', danger = false }) {
      return new Promise(resolve => {
        const bd = document.createElement('div');
        bd.className = 'modal-backdrop';
        bd.innerHTML =
          '<div class="modal-box">' +
            '<div class="modal-title">' + esc(title) + '</div>' +
            (body ? '<div class="modal-body">' + esc(body) + '</div>' : '') +
            '<div class="modal-actions">' +
              '<button type="button" class="secondary" id="_mCancel">Отмена</button>' +
              '<button type="button" class="' + (danger ? 'danger' : '') + '" id="_mOk">Подтвердить</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(bd);
        bd.querySelector('#_mOk').onclick    = () => { bd.remove(); resolve(true); };
        bd.querySelector('#_mCancel').onclick = () => { bd.remove(); resolve(false); };
        bd.onclick = e => { if (e.target === bd) { bd.remove(); resolve(false); } };
      });
    }

    function inputModal({ title, fields = [] }) {
      return new Promise(resolve => {
        const fieldsHtml = fields.map(f =>
          '<div class="field">' +
            '<label for="_mf_' + esc(f.name) + '">' + esc(f.label) + '</label>' +
            '<input id="_mf_' + esc(f.name) + '" type="' + esc(f.type || 'text') + '"' +
              ' placeholder="' + esc(f.placeholder || '') + '"' +
              ' value="' + esc(String(f.default ?? '')) + '"' +
              (f.required ? ' required' : '') + '>' +
          '</div>'
        ).join('');
        const bd = document.createElement('div');
        bd.className = 'modal-backdrop';
        bd.innerHTML =
          '<div class="modal-box">' +
            '<div class="modal-title">' + esc(title) + '</div>' +
            '<form id="_mForm" style="flex-direction:column;align-items:stretch;gap:0.75rem;">' +
              fieldsHtml +
              '<div class="modal-actions">' +
                '<button type="button" class="secondary" id="_mCancel">Отмена</button>' +
                '<button type="submit">Продолжить</button>' +
              '</div>' +
            '</form>' +
          '</div>';
        document.body.appendChild(bd);
        bd.querySelector('#_mForm').onsubmit = e => {
          e.preventDefault();
          const values = {};
          fields.forEach(f => { values[f.name] = bd.querySelector('#_mf_' + f.name).value; });
          bd.remove();
          resolve(values);
        };
        bd.querySelector('#_mCancel').onclick = () => { bd.remove(); resolve(null); };
        bd.onclick = e => { if (e.target === bd) { bd.remove(); resolve(null); } };
      });
    }

    let token = localStorage.getItem('doorphone_token');
    let currentUser = null;

    const tabIcons = {
      dashboard:     '◈',
      organizations: '⬡',
      complexes:     '⊕',
      buildings:     '▣',
      apartments:    '⊟',
      residents:     '⊜',
      users:         '○',
      devices:       '⊛',
      applications:  '⊠',
      events:        '◎',
      user_apt:      '⊗',
    };

    function parseJwt(t) {
      try {
        const base64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
      } catch (e) { return null; }
    }

    function setUserFromToken() {
      if (!token) { currentUser = null; return; }
      const p = parseJwt(token);
      if (p) currentUser = { id: p.sub, role: p.role, organizationId: p.organization_id, complexId: p.complex_id };
    }

    function showMsg(el, text, isErr) {
      if (!el) return;
      el.textContent = text;
      el.className = 'msg ' + (isErr ? 'err' : 'ok');
      el.style.display = 'block';
    }

    async function fetchHealth() {
      try {
        const r = await fetch(API + '/health');
        const d = await r.json();
        document.getElementById('health').innerHTML =
          '<strong>Статус:</strong> ' + d.status + ' &nbsp;|&nbsp; <strong>БД:</strong> ' + d.dbType + ' &nbsp;|&nbsp; <strong>Порт:</strong> ' + d.port;
      } catch (e) {
        document.getElementById('health').innerHTML = '<span style="color:var(--error)">Нет связи с сервером</span>';
      }
    }

    async function auth() {
      const login = document.getElementById('login').value.trim();
      const password = document.getElementById('password').value;
      const msgEl = document.getElementById('loginMsg');
      try {
        const r = await fetch(API + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, password }),
        });
        const d = await r.json();
        if (r.ok) {
          token = d.token || d.access_token || null;
          if (!token || !String(token).trim()) {
            showMsg(msgEl, 'Ошибка: сервер не вернул токен.', true);
            return;
          }
          localStorage.setItem('doorphone_token', token);
          currentUser = d.user ? { id: d.user.id, role: d.user.role, organizationId: d.user.organizationId, complexId: d.user.complexId } : null;
          if (!currentUser) setUserFromToken();
          showMsg(msgEl, 'Вход выполнен.', false);
          onTokenReady();
        } else {
          showMsg(msgEl, d.message || 'Ошибка входа', true);
        }
      } catch (e) {
        showMsg(msgEl, 'Сеть: ' + e.message, true);
      }
    }

    function buildTabsByRole() {
      const role = currentUser && currentUser.role;
      const hint = document.getElementById('roleHint');
      const tabBar = document.getElementById('tabBar');
      tabBar.innerHTML = '';
      if (role === 'RESIDENT') {
        hint.textContent = 'Роль: Житель. Используйте мобильное приложение.';
        document.getElementById('dataContent').textContent = 'Для управления домофонами используйте мобильное приложение.';
        return;
      }
      hint.textContent = 'Роль: ' + (role || '—');
      const tabs = [];
      if (role === 'SUPER_ADMIN') {
        tabs.push({ tab: 'dashboard',     label: 'Дашборд' });
        tabs.push({ tab: 'organizations', label: 'Организации' });
        tabs.push({ tab: 'complexes',     label: 'ЖК' });
        tabs.push({ tab: 'buildings',     label: 'Здания' });
        tabs.push({ tab: 'apartments',    label: 'Квартиры' });
        tabs.push({ tab: 'residents',     label: 'Жители' });
        tabs.push({ tab: 'users',         label: 'Пользователи' });
        tabs.push({ tab: 'devices',       label: 'Устройства' });
        tabs.push({ tab: 'applications',  label: 'Заявки' });
        tabs.push({ tab: 'events',         label: 'События' });
        tabs.push({ tab: 'user_apt',       label: 'Квартиры жителей' });
      } else if (role === 'ORG_ADMIN' || role === 'COMPLEX_MANAGER') {
        tabs.push({ tab: 'dashboard',    label: 'Дашборд' });
        tabs.push({ tab: 'complexes',    label: 'ЖК' });
        tabs.push({ tab: 'buildings',    label: 'Здания' });
        tabs.push({ tab: 'apartments',   label: 'Квартиры' });
        tabs.push({ tab: 'devices',      label: 'Устройства' });
        tabs.push({ tab: 'residents',    label: 'Жители' });
        tabs.push({ tab: 'applications', label: 'Заявки' });
        tabs.push({ tab: 'events',       label: 'События' });
        tabs.push({ tab: 'user_apt',     label: 'Квартиры жителей' });
      }
      tabs.forEach(({ tab, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-nav-item';
        btn.dataset.tab = tab;
        btn.innerHTML = '<span class="nav-dot"></span><span class="nav-icon">' + (tabIcons[tab] || '·') + '</span><span>' + label + '</span>';
        tabBar.appendChild(btn);
      });
      tabBar.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.addEventListener('click', function() {
          tabBar.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          document.getElementById('pageTitle').textContent = this.querySelector('span:last-child').textContent;
          try { sessionStorage.setItem('admin_tab', this.dataset.tab); } catch (e) {}
          fetchData(this.dataset.tab);
        });
      });
      if (tabs.length) {
        let activeTab = tabs[0].tab;
        try {
          const saved = sessionStorage.getItem('admin_tab');
          if (saved && tabs.some(t => t.tab === saved)) activeTab = saved;
        } catch (e) {}
        const activeBtn = Array.from(tabBar.querySelectorAll('.sidebar-nav-item')).find(b => b.dataset.tab === activeTab) || tabBar.querySelector('.sidebar-nav-item');
        if (activeBtn) {
          activeBtn.classList.add('active');
          document.getElementById('pageTitle').textContent = activeBtn.querySelector('span:last-child').textContent;
          fetchData(activeBtn.dataset.tab);
        }
      }
    }

    function onTokenReady() {
      setUserFromToken();
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appShell').style.display = 'flex';
      document.getElementById('userInfo').textContent = currentUser ? ('Роль: ' + currentUser.role) : 'Токен сохранён';
      buildTabsByRole();
    }

    function logout() {
      token = null;
      currentUser = null;
      localStorage.removeItem('doorphone_token');
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('dataContent').textContent = 'Выберите раздел';
      document.getElementById('tabBar').innerHTML = '';
      document.getElementById('residentSection').style.display = 'none';
      document.getElementById('loginMsg').style.display = 'none';
      document.getElementById('pageTitle').textContent = 'Панель управления';
    }

    function handle401() {
      logout();
      const msgEl = document.getElementById('loginMsg');
      showMsg(msgEl, 'Сессия истекла. Войдите снова.', true);
    }

    function on401Response() {
      if (token && String(token).trim()) handle401();
      else { document.getElementById('dataContent').textContent = 'Сначала войдите.'; }
    }

    const headers = () => ({ Authorization: 'Bearer ' + (token || localStorage.getItem('doorphone_token') || '') });

    // ─── Tab dispatcher (T21: each tab handled by named renderX() defined inside fetchData)
    async function fetchData(tab) {
      token = token || localStorage.getItem('doorphone_token');
      const content = document.getElementById('dataContent');
      const createSection = document.getElementById('createSection');
      createSection.style.display = 'none';
      document.getElementById('residentSection').style.display = 'none';

      content.textContent = 'Загрузка…';
      if (!token || !String(token).trim()) { content.textContent = 'Сначала войдите.'; return; }
      try {
        async function renderDashboard() {
          const [s, evResult] = await Promise.all([
            apiJson('/admin/dashboard'),
            apiJson('/events?limit=5').catch(() => ({ items: [] })),
          ]);
          const recentEvents = (evResult.items || evResult || []).slice(0, 5);

          function statCard(label, val, targetTab) {
            const clickAttr = targetTab ? ' data-goto="' + targetTab + '" role="button" tabindex="0"' : '';
            return '<li class="stat-card"' + clickAttr + '><div class="stat-label">' + label + '</div><div class="stat-value">' + val + '</div></li>';
          }

          let html = '<div class="card"><h2>Сводка</h2><ul class="stat-cards">';
          if (s.organizations != null) html += statCard('Организации', s.organizations, 'organizations');
          html += statCard('ЖК', s.complexes ?? 0, 'complexes');
          html += statCard('Здания', s.buildings ?? 0, 'buildings');
          const offlineCount = s.devicesOffline ?? 0;
          const devVal = (s.devices ?? 0) +
            ' <span style="font-size:13px;color:var(--grg-success);">↑' + (s.devicesOnline ?? 0) + '</span>' +
            (offlineCount > 0 ? ' <span style="font-size:13px;color:var(--grg-danger);">↓' + offlineCount + '</span>' : '');
          html += statCard('Устройства', devVal, 'devices');
          html += statCard('Жители', s.residents ?? 0, 'residents');
          html += statCard('Заявки ожидают', s.applicationsPending ?? 0, 'applications');
          html += '</ul>';

          if (offlineCount > 0) {
            html += '<div style="margin-bottom:1rem;padding:0.6rem 1rem;background:rgba(220,53,69,.1);border:1px solid rgba(220,53,69,.3);border-radius:6px;color:var(--grg-danger);">' +
              '⚠ Устройств offline: <strong>' + offlineCount + '</strong>. <a href="#" data-goto="devices">Перейти к устройствам →</a></div>';
          }

          html += '<h3 style="margin:0 0 0.5rem;font-size:11px;color:var(--grg-ink-300);text-transform:uppercase;letter-spacing:.06em;">Последние события</h3>';
          if (!recentEvents.length) {
            html += '<p class="meta">Нет событий.</p>';
          } else {
            html += '<table><thead><tr><th>Время</th><th>Тип</th><th>Устройство</th></tr></thead><tbody>';
            recentEvents.forEach(ev => {
              html += '<tr><td style="white-space:nowrap;">' + esc(ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—') + '</td>' +
                '<td><span class="badge">' + esc(ev.eventType || '') + '</span></td>' +
                '<td>' + esc(ev.deviceId ? '#' + ev.deviceId : '—') + '</td></tr>';
            });
            html += '</tbody></table><a href="#" data-goto="events" style="font-size:12px;display:block;margin-top:0.5rem;">Все события →</a>';
          }
          html += '</div>';

          content.innerHTML = html;
          content.querySelectorAll('[data-goto]').forEach(el => {
            el.addEventListener('click', function(e) {
              e.preventDefault();
              const btn = document.getElementById('tabBar').querySelector('[data-tab="' + this.dataset.goto + '"]');
              if (btn) btn.click();
            });
          });
        }

        async function renderApartments() {
          const buildings = await apiJson('/buildings');
          const buildingOpts = Array.isArray(buildings) ? buildings.map(function(b) { return '<option value="' + b.id + '">' + esc(b.name || b.id) + '</option>'; }).join('') : '';
          let html = '<div class="card" style="margin-bottom:1rem;"><h2>Создать квартиру</h2><form id="formCreateAptTop"><label for="aptBuildingIdTop">Здание</label> <select id="aptBuildingIdTop">' + buildingOpts + '</select> <input id="aptNumberTop" placeholder="Номер квартиры" required> <input id="aptFloorTop" type="number" placeholder="Этаж"> <input id="aptExtensionTop" placeholder="Расширение (SIP/номер монитора)"> <button type="submit">Создать</button></form><div id="createAptMsgTop" class="msg" style="display:none;"></div><p class="meta" style="margin-top:0.75rem;">Для Akuvox: номера квартир должны совпадать с номерами в вебхуке. Расширение — SIP-номер монитора.</p></div>';
          html += '<p>Квартиры по зданиям. Выберите здание или импортируйте квартиры (CSV/Excel):</p><ul style="margin-top:0.5rem;">';
          for (const b of buildings) {
            html += '<li style="margin-bottom:0.375rem;"><a href="#" data-load-apartments="' + b.id + '">' + esc(b.name || 'Здание ' + b.id) + '</a> &nbsp;<button type="button" class="import-apartments-btn secondary" data-building-id="' + b.id + '">Импорт квартир</button> <button type="button" class="bulk-apartments-btn secondary" data-building-id="' + b.id + '" data-building-name="' + esc(b.name || b.id) + '">Создать диапазон</button></li>';
          }
          html += '</ul><div id="apartmentsList" style="margin-top:1rem;"></div>';
          content.innerHTML = html;
          (function() {
            const form = document.getElementById('formCreateAptTop');
            const msgEl = document.getElementById('createAptMsgTop');
            function showMsg(el, text, isErr) { el.textContent = text; el.style.display = 'block'; el.className = 'msg' + (isErr ? ' err' : ' ok'); }
            form.addEventListener('submit', async function(e) {
              e.preventDefault();
              const body = { buildingId: parseInt(document.getElementById('aptBuildingIdTop').value, 10), number: document.getElementById('aptNumberTop').value.trim() };
              const fl = document.getElementById('aptFloorTop').value; if (fl) body.floor = parseInt(fl, 10);
              const ext = document.getElementById('aptExtensionTop').value.trim(); if (ext) body.extension = ext;
              try {
                const req = await apiFetch('/apartments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = await req.json().catch(function() { return {}; });
                if (req.ok) { showMsg(msgEl, 'Квартира создана.', false); fetchData('apartments'); form.reset(); } else { showMsg(msgEl, d.message || req.statusText, true); }
              } catch (err) { if (!(err instanceof ApiUnauthorized)) showMsg(msgEl, err.message, true); }
            });
          })();
          content.querySelectorAll('[data-load-apartments]').forEach(a => {
            a.addEventListener('click', async function(e) { e.preventDefault(); await loadApartmentsByBuilding(Number(this.dataset.loadApartments)); });
          });
          content.querySelectorAll('.import-apartments-btn').forEach(btn => {
            btn.addEventListener('click', function() {
              const bid = this.dataset.buildingId;
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls';
              input.onchange = async function() {
                if (!input.files || !input.files[0]) return;
                const fd = new FormData();
                fd.append('file', input.files[0]);
                try {
                  const r = await apiFetch('/buildings/' + bid + '/apartments/import', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
                  const d = r.ok ? await r.json() : await r.json().catch(() => ({}));
                  if (r.ok) { toast.ok('Импорт выполнен: ' + (d.imported != null ? d.imported + ' записей' : JSON.stringify(d))); fetchData('apartments'); }
                  else toast.err(d.message || r.statusText);
                } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              };
              input.click();
            });
          });
          content.querySelectorAll('.bulk-apartments-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
              const bid = this.dataset.buildingId;
              const vals = await inputModal({
                title: 'Создать диапазон квартир',
                fields: [
                  { name: 'from', label: 'Номер первой квартиры (от)', type: 'number', default: '1', required: true, placeholder: '1' },
                  { name: 'to',   label: 'Номер последней квартиры (до)', type: 'number', default: '50', required: true, placeholder: '50' },
                ]
              });
              if (!vals) return;
              const from = parseInt(vals.from, 10);
              const to   = parseInt(vals.to, 10);
              if (isNaN(from) || isNaN(to) || from < 1 || to > 500 || from > to) {
                toast.err('Укажите числа от 1 до 500, «от» не больше «до».');
                return;
              }
              try {
                const r = await apiFetch('/buildings/' + bid + '/apartments/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ from, to }),
                });
                const d = r.ok ? await r.json() : await r.json().catch(() => ({}));
                if (r.ok) { toast.ok('Создано квартир: ' + (d.created ?? 0) + (d.skipped ? ', пропущено (уже есть): ' + d.skipped : '')); fetchData('apartments'); }
                else toast.err(d.message || r.statusText);
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
            });
          });
          addCreateForm('apartments');
        }

        async function renderApplications() {
          // T15: restore saved filters
          let appFilters = {};
          try { appFilters = JSON.parse(sessionStorage.getItem('admin_app_filters') || '{}'); } catch (_) {}

          const buildings = await apiFetch('/buildings').then(r => r.ok ? r.json() : []).catch(() => []);
          const st = appFilters.status || 'PENDING';
          const bid = appFilters.buildingId || '';

          const buildingOpts = '<option value="">— все здания —</option>' + buildings.map(b => '<option value="' + b.id + '"' + (String(b.id) === String(bid) ? ' selected' : '') + '>' + esc(b.name || b.id) + '</option>').join('');
          let urlPath = '/apartments/applications?';
          if (st) urlPath += 'status=' + encodeURIComponent(st);
          if (bid) urlPath += '&buildingId=' + encodeURIComponent(bid);
          const list = await apiJson(urlPath);

          let html = '<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;">';
          html += '<label for="applicationsStatusFilter">Статус</label> <select id="applicationsStatusFilter">' +
            '<option value="PENDING"' + (st === 'PENDING' ? ' selected' : '') + '>Ожидают</option>' +
            '<option value="APPROVED"' + (st === 'APPROVED' ? ' selected' : '') + '>Одобрены</option>' +
            '<option value="REJECTED"' + (st === 'REJECTED' ? ' selected' : '') + '>Отклонены</option>' +
            '</select> <label for="applicationsBuildingFilter">Здание</label> <select id="applicationsBuildingFilter">' + buildingOpts + '</select> ' +
            '<button type="button" id="applicationsRefreshBtn">Обновить</button></div>';

          if (list.length === 0) {
            html += '<p style="color:var(--grg-ink-400);">Нет заявок.</p>';
          } else {
            // T16: extra columns — phone, name, rejectReason
            html += '<table><thead><tr><th>ID</th><th>Квартира</th><th>Здание</th><th>Email</th><th>Телефон</th><th>Имя</th><th>Статус</th><th>Дата</th><th>Причина отказа</th><th>Действия</th></tr></thead><tbody>';
            list.forEach(app => {
              const apt = app.apartment || {};
              const b = (apt.building || {});
              const u = app.user || {};
              const reqDate = app.requestedAt ? new Date(app.requestedAt).toLocaleString() : '—';
              let actions = '';
              if (app.status === 'PENDING') {
                actions = '<button type="button" class="app-approve secondary" data-id="' + app.id + '">Одобрить</button> ' +
                  '<button type="button" class="app-reject danger" data-id="' + app.id + '">Отклонить</button>';
              } else {
                actions = '—';
              }
              const rejectReason = app.rejectReason
                ? '<span title="' + esc(app.rejectReason) + '">' + esc(app.rejectReason.length > 30 ? app.rejectReason.slice(0, 30) + '…' : app.rejectReason) + '</span>'
                : '—';
              html += '<tr>' +
                '<td><code>' + esc(String(app.id)) + '</code></td>' +
                '<td>' + esc(apt.number || apt.id) + '</td>' +
                '<td>' + esc(b.name || b.id) + '</td>' +
                '<td>' + esc(u.email || '—') + '</td>' +
                '<td>' + esc(u.phone || '—') + '</td>' +
                '<td>' + esc(u.name || '—') + '</td>' +
                '<td>' + esc(app.status) + '</td>' +
                '<td>' + reqDate + '</td>' +
                '<td>' + rejectReason + '</td>' +
                '<td>' + actions + '</td></tr>';
            });
            html += '</tbody></table>';
          }
          content.innerHTML = html;

          function saveAppFiltersAndRefresh() {
            const stEl = document.getElementById('applicationsStatusFilter');
            const bidEl = document.getElementById('applicationsBuildingFilter');
            try { sessionStorage.setItem('admin_app_filters', JSON.stringify({ status: stEl ? stEl.value : '', buildingId: bidEl ? bidEl.value : '' })); } catch (_) {}
            fetchData('applications');
          }
          document.getElementById('applicationsRefreshBtn').addEventListener('click', saveAppFiltersAndRefresh);
          document.getElementById('applicationsStatusFilter').addEventListener('change', saveAppFiltersAndRefresh);
          document.getElementById('applicationsBuildingFilter').addEventListener('change', saveAppFiltersAndRefresh);

          content.querySelectorAll('.app-approve').forEach(btn => {
            btn.addEventListener('click', async function() {
              const id = this.dataset.id;
              try {
                const r = await apiFetch('/apartments/applications/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) });
                if (r.ok) fetchData('applications'); else { const d = await r.json(); toast.err(d.message || r.statusText); }
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
            });
          });
          content.querySelectorAll('.app-reject').forEach(btn => {
            btn.addEventListener('click', async function() {
              const id = this.dataset.id;
              const vals = await inputModal({ title: 'Отклонить заявку', fields: [{ name: 'reason', label: 'Причина (необязательно)', placeholder: '' }] });
              const reason = vals ? vals.reason : null;
              if (reason === null) return;
              try {
                const r = await apiFetch('/apartments/applications/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REJECTED', rejectReason: reason || undefined }) });
                if (r.ok) fetchData('applications'); else { const d = await r.json(); toast.err(d.message || r.statusText); }
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
            });
          });
        }

        async function renderEvents() {
          // Load devices list for filter dropdown
          const buildings = await apiJson('/buildings').catch(() => []);
          const devicesByBuilding = await Promise.all(
            buildings.map(b => apiFetch('/buildings/' + b.id + '/devices').then(r => r.ok ? r.json() : []).catch(() => []))
          );
          const allDevs = [];
          buildings.forEach((b, i) => devicesByBuilding[i].forEach(d => allDevs.push({ ...d, buildingName: b.name })));

          // Restore saved filters
          let evFilters = {};
          try { evFilters = JSON.parse(sessionStorage.getItem('admin_events_filters') || '{}'); } catch (_) {}

          const devOpts = '<option value="">Все устройства</option>' + allDevs.map(d => '<option value="' + d.id + '"' + (String(d.id) === String(evFilters.deviceId || '') ? ' selected' : '') + '>' + esc(d.name || '#' + d.id) + ' (' + esc(d.buildingName || '') + ')</option>').join('');

          const eventTypes = ['door_opened', 'incoming_call', 'device_online', 'device_offline', 'user_created', 'user_deleted', 'user_blocked', 'user_unblocked'];
          const typeOpts = '<option value="">Все типы</option>' + eventTypes.map(t => '<option value="' + t + '"' + (t === (evFilters.type || '') ? ' selected' : '') + '>' + t + '</option>').join('');

          let html = '<div class="card"><h2>Журнал событий</h2>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">' +
            '<select id="evDeviceFilter">' + devOpts + '</select>' +
            '<select id="evTypeFilter">' + typeOpts + '</select>' +
            '<input id="evFromFilter" type="datetime-local" title="С" value="' + esc(evFilters.from || '') + '" style="width:170px;">' +
            '<input id="evToFilter" type="datetime-local" title="По" value="' + esc(evFilters.to || '') + '" style="width:170px;">' +
            '<button type="button" id="evApplyBtn">Применить</button>' +
            '<button type="button" class="secondary" id="evResetBtn">Сбросить</button>' +
            '</div>' +
            '<div id="evTableArea">Загрузка…</div>' +
            '</div>';
          content.innerHTML = html;

          async function loadEvents() {
            const deviceId = document.getElementById('evDeviceFilter').value;
            const type = document.getElementById('evTypeFilter').value;
            const from = document.getElementById('evFromFilter').value;
            const to = document.getElementById('evToFilter').value;
            try { sessionStorage.setItem('admin_events_filters', JSON.stringify({ deviceId, type, from, to })); } catch (_) {}

            let url = '/events?limit=100';
            if (deviceId) url += '&deviceId=' + encodeURIComponent(deviceId);
            if (type) url += '&type=' + encodeURIComponent(type);
            if (from) url += '&from=' + encodeURIComponent(new Date(from).toISOString());
            if (to) url += '&to=' + encodeURIComponent(new Date(to).toISOString());

            const area = document.getElementById('evTableArea');
            area.textContent = 'Загрузка…';
            try {
              const result = await apiJson(url);
              const items = result.items || result; // backwards compat
              if (!items.length) { area.innerHTML = '<p style="color:var(--grg-ink-400);">Нет событий.</p>'; return; }
              let t = '<table><thead><tr><th>ID</th><th>Устройство</th><th>Тип</th><th>Данные</th><th>Время</th></tr></thead><tbody>';
              items.forEach(ev => {
                const devName = (allDevs.find(d => d.id === ev.deviceId) || {}).name || (ev.deviceId ? '#' + ev.deviceId : '—');
                const dataStr = ev.data ? JSON.stringify(ev.data) : '';
                const shortData = dataStr.length > 80 ? dataStr.slice(0, 77) + '...' : dataStr;
                t += '<tr>' +
                  '<td><code>' + esc(String(ev.id)) + '</code></td>' +
                  '<td>' + esc(devName) + '</td>' +
                  '<td><span class="badge">' + esc(ev.eventType || '') + '</span></td>' +
                  '<td title="' + esc(dataStr) + '" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(shortData) + '</td>' +
                  '<td style="white-space:nowrap;">' + esc(ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—') + '</td>' +
                  '</tr>';
              });
              t += '</tbody></table>';
              if (result.total > items.length) {
                t += '<p class="meta" style="margin-top:0.5rem;">Показано ' + items.length + ' из ' + result.total + ' событий</p>';
              }
              area.innerHTML = t;
            } catch (e) { if (!(e instanceof ApiUnauthorized)) area.textContent = 'Ошибка: ' + e.message; }
          }

          document.getElementById('evApplyBtn').addEventListener('click', loadEvents);
          document.getElementById('evResetBtn').addEventListener('click', function() {
            document.getElementById('evDeviceFilter').value = '';
            document.getElementById('evTypeFilter').value = '';
            document.getElementById('evFromFilter').value = '';
            document.getElementById('evToFilter').value = '';
            loadEvents();
          });
          loadEvents();
        }

        async function renderUserApt() {
          content.innerHTML = '<div class="card"><h2>Квартиры жителей</h2>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">' +
            '<input id="uaSearch" type="text" placeholder="Email или телефон пользователя" style="width:280px;">' +
            '<button type="button" id="uaSearchBtn">Найти</button>' +
            '</div>' +
            '<div id="uaArea"><p style="color:var(--grg-ink-400);">Введите email или телефон, чтобы найти пользователя.</p></div>' +
            '</div>';

          async function loadUserApts(query) {
            const area = document.getElementById('uaArea');
            area.textContent = 'Поиск…';
            try {
              // Search users filtered by query
              const users = await apiJson('/admin/users/search?q=' + encodeURIComponent(query));
              if (!users.length) { area.innerHTML = '<p style="color:var(--grg-ink-400);">Пользователи не найдены.</p>'; return; }

              let html = '';
              for (const u of users) {
                const apts = await apiJson('/admin/users/' + u.id + '/apartments').catch(() => []);
                html += '<div class="card" style="margin-bottom:1rem;" data-user-id="' + esc(u.id) + '">' +
                  '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.75rem;">' +
                  '<strong>' + esc(u.name || '—') + '</strong>' +
                  '<span style="color:var(--grg-ink-400);font-size:0.85em;">' + esc(u.email || u.phone || '') + '</span>' +
                  '<span class="badge">' + esc(u.role) + '</span>' +
                  '</div>';
                if (apts.length === 0) {
                  html += '<p style="color:var(--grg-ink-400);margin:0 0 0.5rem;">Нет привязанных квартир.</p>';
                } else {
                  html += '<table style="margin-bottom:0.75rem;"><thead><tr><th>Квартира</th><th>Этаж</th><th>Здание</th><th>Роль</th><th></th></tr></thead><tbody>';
                  apts.forEach(a => {
                    html += '<tr>' +
                      '<td>' + esc(a.number) + '</td>' +
                      '<td>' + (a.floor != null ? esc(String(a.floor)) : '—') + '</td>' +
                      '<td>' + esc(a.buildingAddress || '#' + a.buildingId) + '</td>' +
                      '<td>' + esc(a.role) + '</td>' +
                      '<td><button type="button" class="ua-unlink secondary" data-user-id="' + esc(u.id) + '" data-apt-id="' + esc(String(a.apartmentId)) + '" style="padding:0.2rem 0.6rem;font-size:0.8em;">Отвязать</button></td>' +
                      '</tr>';
                  });
                  html += '</tbody></table>';
                }
                html += '<button type="button" class="ua-link-btn" data-user-id="' + esc(u.id) + '">+ Привязать квартиру</button>';
                html += '</div>';
              }
              area.innerHTML = html;

              area.querySelectorAll('.ua-unlink').forEach(btn => {
                btn.addEventListener('click', async function() {
                  const uid = this.dataset.userId, aptId = this.dataset.aptId;
                  const ok = await confirmModal({ title: 'Отвязать квартиру?', danger: true });
                  if (!ok) return;
                  try {
                    await apiJson('/admin/users/' + uid + '/apartments/' + aptId, { method: 'DELETE' });
                    toast.ok('Квартира отвязана');
                    loadUserApts(document.getElementById('uaSearch').value.trim());
                  } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
                });
              });

              area.querySelectorAll('.ua-link-btn').forEach(btn => {
                btn.addEventListener('click', async function() {
                  const uid = this.dataset.userId;
                  const vals = await inputModal({ title: 'Привязать квартиру', fields: [
                    { name: 'apartmentId', label: 'ID квартиры', type: 'number', required: true },
                    { name: 'role', label: 'Роль (resident/owner/guest)', type: 'text', value: 'resident' },
                  ]});
                  if (!vals) return;
                  try {
                    await apiJson('/admin/users/' + uid + '/apartments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apartmentId: Number(vals.apartmentId), role: vals.role || 'resident' }) });
                    toast.ok('Квартира привязана');
                    loadUserApts(document.getElementById('uaSearch').value.trim());
                  } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
                });
              });
            } catch (e) { if (!(e instanceof ApiUnauthorized)) area.textContent = 'Ошибка: ' + e.message; }
          }

          document.getElementById('uaSearchBtn').addEventListener('click', function() {
            const q = document.getElementById('uaSearch').value.trim();
            if (!q) { toast.warn('Введите email или телефон'); return; }
            loadUserApts(q);
          });
          document.getElementById('uaSearch').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('uaSearchBtn').click();
          });
        }

        async function renderResidents() {
          const buildings = await apiJson('/buildings');
          let html = '<p style="margin-bottom:1rem;">Выберите здание, затем квартиру — чтобы добавить/удалить жителя. Либо импортируйте жителей по зданию:</p>';
          const aptsByBuilding = await Promise.all(
            buildings.map(b =>
              apiFetch('/apartments/by-building/' + b.id)
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
            )
          );
          buildings.forEach((b, i) => {
            const apts = aptsByBuilding[i];
            html += '<div style="margin-bottom:0.75rem;"><strong>' + esc(b.name || b.id) + '</strong>: ';
            apts.forEach(a => { html += '<a href="#" data-apt-id="' + esc(String(a.id)) + '" data-apt-name="' + esc(a.number || a.id) + '" style="margin-right:0.5rem;">' + esc(a.number || a.id) + '</a>'; });
            html += ' &nbsp;<button type="button" class="import-residents-btn secondary" data-building-id="' + esc(String(b.id)) + '" data-building-name="' + esc(b.name || b.id) + '">Импорт жителей</button></div>';
          });
          content.innerHTML = html;
          content.querySelectorAll('[data-apt-id]').forEach(a => {
            a.addEventListener('click', function(e) { e.preventDefault(); showResidents(Number(this.dataset.aptId), this.dataset.aptName); });
          });
          content.querySelectorAll('.import-residents-btn').forEach(btn => {
            btn.addEventListener('click', function() {
              const bid = this.dataset.buildingId;
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls';
              input.onchange = async function() {
                if (!input.files || !input.files[0]) return;
                const fd = new FormData();
                fd.append('file', input.files[0]);
                try {
                  const r = await apiFetch('/buildings/' + bid + '/residents/import', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
                  const d = r.ok ? await r.json() : await r.json().catch(() => ({}));
                  if (r.ok) { toast.ok('Импорт выполнен: ' + (d.imported != null ? d.imported + ' записей' : JSON.stringify(d))); fetchData('residents'); }
                  else toast.err(d.message || r.statusText);
                } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              };
              input.click();
            });
          });
          // T19: restore last open apartment
          try {
            const savedApt = JSON.parse(sessionStorage.getItem('admin_last_apt') || 'null');
            if (savedApt && savedApt.id) showResidents(savedApt.id, savedApt.name || '');
          } catch (_) {}
        }

        // ── Device Drawer ──────────────────────────────────────────────────────
        let _drawerBuildings = [];
        let _drawerEditId = null;

        function openDeviceDrawer(buildings, editDevice, defaultBuildingId) {
          _drawerBuildings = buildings;
          _drawerEditId = editDevice ? editDevice.id : null;
          const drawer = document.getElementById('deviceDrawer');
          const overlay = document.getElementById('deviceDrawerOverlay');
          const title = document.getElementById('drawerTitle');
          const saveBtn = document.getElementById('drawerSaveBtn');
          title.innerHTML = (editDevice
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--grg-purple-300)" stroke-width="2.5"><path d="M3 21l3.5-1 11-11L14 5.5 3 16.5 3 21z"/></svg> Редактировать устройство'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--grg-purple-300)" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Добавить устройство');
          saveBtn.textContent = editDevice ? 'Сохранить' : 'Добавить';
          // Select tab
          const tabs = document.querySelectorAll('#drawerTabs .drawer-tab');
          let activeType = 'UNIVIEW_NVR', activeRole = 'NVR';
          if (editDevice) { activeType = editDevice.type || 'UNIVIEW_NVR'; activeRole = editDevice.role || 'NVR'; }
          tabs.forEach(t => {
            t.classList.toggle('on', t.dataset.dtype === activeType && t.dataset.drole === activeRole);
          });
          renderDrawerBody(activeType, activeRole, editDevice, defaultBuildingId);
          drawer.classList.add('open');
          overlay.style.display = '';
          document.getElementById('drawerCloseBtn').onclick = closeDeviceDrawer;
          tabs.forEach(t => {
            t.onclick = function() {
              tabs.forEach(x => x.classList.remove('on'));
              t.classList.add('on');
              renderDrawerBody(t.dataset.dtype, t.dataset.drole, null, defaultBuildingId);
            };
          });
        }

        function closeDeviceDrawer() {
          document.getElementById('deviceDrawer').classList.remove('open');
          document.getElementById('deviceDrawerOverlay').style.display = 'none';
          _drawerEditId = null;
        }

        function renderDrawerBody(dtype, drole, editDevice, defaultBuildingId) {
          const body = document.getElementById('drawerBody');
          const isNvr = drole === 'NVR';
          const buildingOpts = _drawerBuildings.map(b =>
            '<option value="' + b.id + '"' + (editDevice ? (b.id === editDevice.buildingId ? ' selected' : '') : (defaultBuildingId && b.id === defaultBuildingId ? ' selected' : '')) + '>' + esc(b.name || b.id) + '</option>'
          ).join('');
          body.innerHTML =
            '<div class="drawer-field"><label>Здание</label><select id="dw-building">' + buildingOpts + '</select></div>' +
            '<div class="drawer-field"><label>Имя устройства</label><input id="dw-name" placeholder="Например: NVR-подъезд-3" value="' + esc(editDevice ? (editDevice.name || '') : '') + '"></div>' +
            '<div class="drawer-field-row">' +
              '<div class="drawer-field"><label>Host (IP)</label><input id="dw-host" placeholder="192.168.10.100" value="' + esc(editDevice ? (editDevice.host || '') : '') + '"></div>' +
              '<div class="drawer-field"><label>HTTP порт</label><input id="dw-http" type="number" value="' + (editDevice && editDevice.httpPort != null ? editDevice.httpPort : 80) + '"></div>' +
            '</div>' +
            '<div class="drawer-field-row">' +
              '<div class="drawer-field"><label>Логин</label><input id="dw-user" value="' + esc(editDevice && editDevice.username ? String(editDevice.username) : '') + '"></div>' +
              '<div class="drawer-field"><label>Пароль</label><input id="dw-pass" type="password" placeholder="' + (editDevice ? 'Не менять' : '••••••••') + '"></div>' +
            '</div>' +
            '<div class="drawer-field-row">' +
              '<div class="drawer-field"><label>RTSP порт</label><input id="dw-rtsp" type="number" value="' + (editDevice && editDevice.rtspPort != null ? editDevice.rtspPort : 554) + '"></div>' +
              '<div class="drawer-field"><label>Этаж</label><input id="dw-floor" type="number" placeholder="пусто = все" value="' + (editDevice && editDevice.floor != null ? editDevice.floor : '') + '" title="пусто — видят все; число — только этот этаж"></div>' +
            '</div>' +
            (!isNvr ? '<div class="drawer-field-row"><div class="drawer-field"><label>Канал</label><input id="dw-ch" type="number" value="' + (editDevice && editDevice.defaultChannel != null ? editDevice.defaultChannel : 1) + '"></div><div class="drawer-field"><label>Поток</label><input id="dw-stream" placeholder="main" value="' + esc(editDevice && editDevice.defaultStream ? String(editDevice.defaultStream) : 'main') + '"></div></div>' : '') +
            '<div class="drawer-field"><label>Свой RTSP URL (необяз.)</label><input id="dw-rtsp-url" placeholder="rtsp://192.168.1.100:554/live" value="' + esc(editDevice && editDevice.customRtspUrl ? String(editDevice.customRtspUrl) : '') + '"></div>' +
            (isNvr && !editDevice ? '<div class="drawer-hint"><div class="h-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg> После добавления NVR</div><p>Нажмите «Синхр. камеры» — каналы NVR станут устройствами автоматически.</p></div>' : '') +
            (editDevice ? '<div style="margin-top:12px;border-top:1px solid var(--grg-border);padding-top:12px;"><div style="font-size:11px;font-weight:600;color:var(--grg-text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">OSD / Подпись на видео</div><div class="drawer-field"><input id="dw-osd-name" value="' + esc(editDevice.name || '') + '" placeholder="Название для OSD" style="width:100%;"></div><button type="button" id="dw-apply-osd-btn" class="secondary" style="margin-top:6px;">Применить OSD</button></div>' : '') +
            (editDevice ? '<div style="margin-top:10px;"><div style="font-size:11px;font-weight:600;color:var(--grg-text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Реле / Замок</div><div class="drawer-field-row"><div class="drawer-field"><label>Реле №</label><input id="dw-relay-id" type="number" value="1" min="1" max="8" style="width:60px;"></div><div class="drawer-field"><label>Время открытия (сек)</label><input id="dw-relay-dur" type="number" value="3" min="1" max="30" style="width:70px;"></div></div><button type="button" id="dw-apply-relay-btn" class="secondary" style="margin-top:6px;">Применить реле</button></div>' : '') +
            (editDevice ? '<div style="margin-top:10px;"><div style="font-size:11px;font-weight:600;color:var(--grg-text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Изображение</div><div class="drawer-field" style="flex-direction:row;align-items:center;gap:8px;"><input type="checkbox" id="dw-wdr-enabled" style="width:16px;height:16px;cursor:pointer;"><label for="dw-wdr-enabled" style="cursor:pointer;margin:0;">Улучшение картинки (WDR)</label></div><button type="button" id="dw-apply-wdr-btn" class="secondary" style="margin-top:6px;">Применить</button></div>' : '') +
            '<div id="drawerMsgEl"></div>';
          const osdBtn = document.getElementById('dw-apply-osd-btn');
          if (osdBtn) {
            osdBtn.onclick = async function() {
              const nameInput = document.getElementById('dw-osd-name');
              const channelName = (nameInput ? nameInput.value : '').trim() || undefined;
              try {
                const r = await apiFetch('/devices/' + _drawerEditId + '/apply-osd', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ channelName }),
                });
                if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || r.statusText); }
                drawerMsg('OSD применён', false);
              } catch (e) {
                drawerMsg((e && e.message) || 'Ошибка применения OSD', true);
              }
            };
          }
          const relayBtn = document.getElementById('dw-apply-relay-btn');
          if (relayBtn) {
            relayBtn.onclick = async function() {
              const relayId = parseInt(document.getElementById('dw-relay-id').value, 10) || 1;
              const durationSec = parseInt(document.getElementById('dw-relay-dur').value, 10) || 3;
              try {
                const r = await apiFetch('/devices/' + _drawerEditId + '/relay-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ relayId, durationSec }),
                });
                if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || r.statusText); }
                drawerMsg('Реле настроено', false);
              } catch (e) {
                drawerMsg((e && e.message) || 'Ошибка настройки реле', true);
              }
            };
          }
          const wdrBtn = document.getElementById('dw-apply-wdr-btn');
          if (wdrBtn) {
            wdrBtn.onclick = async function() {
              const wdrEnabled = document.getElementById('dw-wdr-enabled').checked;
              try {
                const r = await apiFetch('/devices/' + _drawerEditId + '/image-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ wdrEnabled }),
                });
                if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || r.statusText); }
                drawerMsg('Настройки изображения применены', false);
              } catch (e) {
                drawerMsg((e && e.message) || 'Ошибка настройки изображения', true);
              }
            };
          }
          // wire save
          document.getElementById('drawerSaveBtn').onclick = async function() {
            await saveDrawerDevice(dtype, drole);
          };
          document.getElementById('drawerTestBtn').onclick = async function() {
            const host = (document.getElementById('dw-host') || {}).value || '';
            if (!host) { drawerMsg('Укажите Host/IP', true); return; }
            const btn = this; btn.textContent = '⏳'; btn.disabled = true;
            try {
              const body2 = { host, type: dtype };
              const u = (document.getElementById('dw-user') || {}).value || '';
              const p = (document.getElementById('dw-pass') || {}).value || '';
              const hp = parseInt((document.getElementById('dw-http') || {}).value || 80, 10);
              if (_drawerEditId) body2.deviceId = _drawerEditId;
              if (u) body2.username = u;
              if (p) body2.password = p;
              if (hp) body2.httpPort = hp;
              const r = await apiFetch('/devices/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) });
              const d = await r.json().catch(() => ({}));
              if (d.reachable) drawerMsg('✅ ' + host + ' доступен', false);
              else drawerMsg('❌ Недоступен: ' + (d.error || 'нет ответа'), true);
            } catch (e) { if (!(e instanceof ApiUnauthorized)) drawerMsg('Ошибка: ' + e.message, true); }
            finally { btn.textContent = '🔌 Проверить'; btn.disabled = false; }
          };
        }

        function drawerMsg(text, isErr) {
          const el = document.getElementById('drawerMsgEl');
          if (!el) return;
          el.textContent = text;
          el.className = isErr ? 'err' : 'ok';
          el.style.display = 'block';
        }

        async function saveDrawerDevice(dtype, drole) {
          const bid = parseInt((document.getElementById('dw-building') || {}).value || '', 10);
          const name = (document.getElementById('dw-name') || {}).value.trim();
          const host = (document.getElementById('dw-host') || {}).value.trim();
          const user = (document.getElementById('dw-user') || {}).value.trim();
          const pass = (document.getElementById('dw-pass') || {}).value;
          const httpPort = parseInt((document.getElementById('dw-http') || {}).value || 80, 10);
          const rtspPort = parseInt((document.getElementById('dw-rtsp') || {}).value || 554, 10);
          const floorVal = (document.getElementById('dw-floor') || {}).value;
          const chEl = document.getElementById('dw-ch');
          const streamEl = document.getElementById('dw-stream');
          const customRtsp = (document.getElementById('dw-rtsp-url') || {}).value.trim();
          if (!name) { drawerMsg('Укажите имя', true); return; }
          if (!host) { drawerMsg('Укажите Host/IP', true); return; }
          const body = { name, host, type: dtype, role: drole, httpPort, rtspPort };
          if (user) body.username = user;
          if (pass) body.password = pass;
          if (floorVal !== '') body.floor = parseInt(floorVal, 10);
          if (chEl) body.defaultChannel = parseInt(chEl.value || 1, 10);
          if (streamEl) body.defaultStream = streamEl.value || 'main';
          if (customRtsp) body.customRtspUrl = customRtsp;
          const btn = document.getElementById('drawerSaveBtn');
          btn.disabled = true;
          try {
            let r;
            if (_drawerEditId) {
              r = await apiFetch('/devices/' + _drawerEditId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            } else {
              r = await apiFetch('/buildings/' + bid + '/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            }
            if (r.ok) {
              drawerMsg(_drawerEditId ? '✅ Сохранено' : '✅ Устройство добавлено', false);
              setTimeout(() => { closeDeviceDrawer(); fetchData('devices'); }, 800);
            } else {
              const d = await r.json().catch(() => ({}));
              drawerMsg('❌ ' + (d.message || r.statusText), true);
            }
          } catch (e) { if (!(e instanceof ApiUnauthorized)) drawerMsg('Ошибка: ' + e.message, true); }
          finally { btn.disabled = false; }
        }

        // ── renderDevicesTab ────────────────────────────────────────────────────
        async function renderDevicesTab() {
          const buildings = await apiJson('/buildings');
          const devicesByBuilding = await Promise.all(
            buildings.map(b =>
              apiFetch('/buildings/' + b.id + '/devices')
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
            )
          );

          // Build flat array of all devices with building info
          const allDevices = [];
          buildings.forEach((b, i) => {
            devicesByBuilding[i].forEach(d => allDevices.push({ ...d, buildingName: b.name || b.id, buildingId: b.id }));
          });

          // KPI counts
          const kpiTotal = allDevices.length;
          const kpiOnline = allDevices.filter(d => d.status === 'online').length;
          const kpiOffline = kpiTotal - kpiOnline;
          const kpiNoStream = allDevices.filter(d => d.role !== 'NVR' && !d.customRtspUrl).length;

          content.innerHTML =
            '<div class="dev-top-bar">' +
              '<div><h2 style="margin:0;">Устройства</h2></div>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<button type="button" class="secondary" id="devCheckAllBtn">🔌 Проверить все</button>' +
                '<button type="button" id="devAddBtn">+ Добавить</button>' +
              '</div>' +
            '</div>' +
            '<div class="dev-kpis">' +
              '<div class="dev-kpi"><div class="lbl">Всего</div><div class="val">' + kpiTotal + '</div></div>' +
              '<div class="dev-kpi ok"><div class="lbl">Онлайн</div><div class="val">' + kpiOnline + '</div></div>' +
              '<div class="dev-kpi danger"><div class="lbl">Офлайн</div><div class="val">' + kpiOffline + '</div></div>' +
              '<div class="dev-kpi warn"><div class="lbl">Без RTSP</div><div class="val">' + kpiNoStream + '</div></div>' +
            '</div>' +
            '<div class="dev-toolbar">' +
              '<div class="dev-search"><input id="devSearch" placeholder="Поиск по имени, IP, ID..."></div>' +
              '<div class="dev-seg">' +
                '<button type="button" class="on" data-role="">Все</button>' +
                '<button type="button" data-role="NVR">NVR</button>' +
                '<button type="button" data-role="CAMERA">Камеры</button>' +
                '<button type="button" data-role="DOORPHONE">Домофоны</button>' +
              '</div>' +
            '</div>' +
            '<div id="devTreeArea"></div>';

          let currentRoleFilter = '';
          let currentSearch = '';

          function renderChannelRow(ch) {
            const isOnline = ch.status === 'online';
            const floorSub = ch.floor != null ? ' · эт.' + ch.floor : '';
            return '<div class="dev-ch">' +
              '<div class="dev-ch-num">' + (ch.defaultChannel != null ? ch.defaultChannel : '?') + '</div>' +
              '<div class="dev-ch-meta">' +
                '<div class="dev-ch-name">' + esc(ch.name || '#' + ch.id) +
                  (isOnline ? ' <span class="status-pill ok">● online</span>' : ' <span class="status-pill off">○ offline</span>') +
                '</div>' +
                '<div class="dev-ch-sub">' + esc(ch.host || '—') + floorSub + '</div>' +
              '</div>' +
              '<div class="dev-ch-actions">' +
                (ch.type === 'UNIVIEW_IPC' ? '<button type="button" class="dev-view" data-device-id="' + ch.id + '" data-device-name="' + esc(ch.name || '#' + ch.id) + '" data-device-host="' + esc(ch.host || '') + '" data-device-role="' + esc(ch.role || '') + '" title="Смотреть видео">▶</button>' : '') +
                '<button type="button" class="secondary dev-open-door" style="font-size:11px;padding:2px 8px;" data-device-id="' + ch.id + '" data-device-name="' + esc(ch.name || '#' + ch.id) + '" title="Открыть дверь">🔓</button>' +
                '<button type="button" class="secondary dev-test" style="font-size:11px;padding:2px 8px;" data-device-id="' + ch.id + '" title="Проверить связь">🔌</button>' +
                '<button type="button" class="secondary dev-edit" style="font-size:11px;padding:2px 8px;" data-device-id="' + ch.id + '">✎</button>' +
                '<button type="button" class="icon-btn dev-delete" data-device-id="' + ch.id + '" data-device-name="' + esc(ch.name || '#' + ch.id) + '" title="Удалить">🗑</button>' +
              '</div>' +
            '</div>';
          }

          function renderIpcRow(d) {
            const isOnline = d.status === 'online';
            const roleTag = d.role === 'DOORPHONE' ? '<span class="role-tag dom">DOM</span>' :
              d.role === 'CAMERA' ? '<span class="role-tag cam">CAM</span>' :
              '<span class="role-tag nvr">NVR</span>';
            const icon = d.role === 'DOORPHONE' ? '🔔' : d.role === 'CAMERA' ? '📷' : '⬛';
            const floorSub = d.floor != null ? ' · эт.' + d.floor : '';
            return '<div class="dev-ipc">' +
              '<div class="dev-ipc-icon">' + icon + '</div>' +
              '<div class="dev-ipc-meta">' +
                '<div class="dev-ipc-name">' + roleTag + ' ' + esc(d.name || '#' + d.id) +
                  (isOnline ? ' <span class="status-pill ok">● online</span>' : ' <span class="status-pill off">○ offline</span>') +
                '</div>' +
                '<div class="dev-ipc-sub">' + esc(d.host || '—') + floorSub + '</div>' +
              '</div>' +
              '<div class="dev-ipc-actions">' +
                (d.type === 'UNIVIEW_IPC' ? '<button type="button" class="dev-view" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" data-device-host="' + esc(d.host || '') + '" data-device-role="' + esc(d.role || '') + '" title="Смотреть видео">▶</button>' : '') +
                '<button type="button" class="secondary dev-open-door" style="font-size:11px;padding:2px 8px;" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" title="Открыть дверь">🔓</button>' +
                '<button type="button" class="secondary dev-test" style="font-size:11px;padding:2px 8px;" data-device-id="' + d.id + '" title="Проверить связь">🔌</button>' +
                '<button type="button" class="secondary dev-edit" style="font-size:11px;padding:2px 8px;" data-device-id="' + d.id + '">✎</button>' +
                '<button type="button" class="icon-btn dev-delete" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" title="Удалить">🗑</button>' +
              '</div>' +
            '</div>';
          }

          function renderTree() {
            const search = currentSearch.toLowerCase();
            const roleF = currentRoleFilter;

            const nvrChildren = {};
            allDevices.forEach(d => {
              if (d.nvrId) {
                if (!nvrChildren[d.nvrId]) nvrChildren[d.nvrId] = [];
                nvrChildren[d.nvrId].push(d);
              }
            });

            function matchesFilter(d) {
              if (roleF && d.role !== roleF) return false;
              if (search) {
                const hay = (String(d.id) + ' ' + (d.name || '') + ' ' + (d.host || '')).toLowerCase();
                if (!hay.includes(search)) return false;
              }
              return true;
            }

            let treeHtml = '';
            buildings.forEach(function(b) {
              const bDevs = allDevices.filter(d => d.buildingId === b.id);
              const topLevel = bDevs.filter(d => !d.nvrId);
              let bodyHtml = '';

              topLevel.forEach(function(d) {
                if (d.role === 'NVR') {
                  const children = nvrChildren[d.id] || [];
                  const visibleChildren = roleF ? children.filter(c => matchesFilter(c)) : children;
                  if (!matchesFilter(d) && !visibleChildren.length) return;
                  const isOnline = d.status === 'online';
                  bodyHtml +=
                    '<div class="dev-nvr">' +
                      '<div class="dev-nvr-head">' +
                        '<div class="dev-nvr-icon">⬛</div>' +
                        '<div class="dev-nvr-meta">' +
                          '<div class="dev-nvr-name"><span class="role-tag nvr">NVR</span> ' + esc(d.name || '#' + d.id) +
                            (isOnline ? ' <span class="status-pill ok">● online</span>' : ' <span class="status-pill off">○ offline</span>') +
                          '</div>' +
                          '<div class="dev-nvr-sub"><span class="k">IP:</span> ' + esc(d.host || '—') + ' <span class="k">Камер:</span> ' + children.length + '</div>' +
                        '</div>' +
                        '<div class="dev-nvr-actions">' +
                          '<button type="button" class="secondary dev-test" style="font-size:11px;padding:3px 10px;" data-device-id="' + d.id + '" title="Проверить связь">🔌 Тест</button>' +
                          '<button type="button" class="secondary dev-edit" style="font-size:11px;padding:3px 10px;" data-device-id="' + d.id + '">✎ Ред.</button>' +
                          '<button type="button" class="secondary dev-scan-ch" style="font-size:11px;padding:3px 10px;" data-device-id="' + d.id + '" data-building-id="' + d.buildingId + '" data-device-name="' + esc(d.name || '#' + d.id) + '" title="Синхронизировать камеры">🔄 Камеры</button>' +
                          '<button type="button" class="icon-btn dev-delete" data-device-id="' + d.id + '" data-device-name="' + esc(d.name || '#' + d.id) + '" title="Удалить">🗑</button>' +
                        '</div>' +
                      '</div>' +
                      '<div id="scan-ch-panel-' + d.id + '"></div>' +
                      '<div class="dev-channels">' +
                        (children.length
                          ? '<div class="dev-ch-header">КАНАЛЫ</div>' + children.map(renderChannelRow).join('')
                          : '<div class="dev-ch-empty" style="padding:8px 14px;">Нет камер — нажмите 🔄 Камеры для синхронизации</div>') +
                      '</div>' +
                    '</div>';
                } else {
                  if (!matchesFilter(d)) return;
                  bodyHtml += renderIpcRow(d);
                }
              });

              if (!bodyHtml) return;
              const bOnline = bDevs.filter(d => d.status === 'online').length;
              treeHtml +=
                '<div class="dev-building">' +
                  '<div class="dev-building-head">' +
                    '<span class="dev-building-chev">▾</span>' +
                    '<div class="dev-building-icon">🏢</div>' +
                    '<div class="dev-building-meta">' +
                      '<div class="dev-building-name">' + esc(b.name || String(b.id)) + '</div>' +
                      '<div class="dev-building-sub">id=' + b.id + ' · ' + bDevs.length + ' устройств</div>' +
                    '</div>' +
                    '<div class="dev-building-stats">' +
                      '<span class="status-pill ok">● ' + bOnline + ' online</span>' +
                    '</div>' +
                    '<button type="button" class="secondary dev-add-to-building" style="font-size:11px;padding:3px 10px;" data-building-id="' + b.id + '">+ Добавить</button>' +
                  '</div>' +
                  '<div class="dev-building-body">' + bodyHtml + '</div>' +
                '</div>';
            });

            const area = document.getElementById('devTreeArea');
            if (!area) return;
            area.innerHTML = treeHtml || '<p style="padding:1rem;color:var(--grg-ink-400);">Нет устройств по выбранным фильтрам.</p>';

            // Building collapse/expand
            area.querySelectorAll('.dev-building-head').forEach(function(head) {
              head.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                const body = this.nextElementSibling;
                const chev = this.querySelector('.dev-building-chev');
                const isCollapsed = body && body.classList.contains('collapsed');
                if (body) body.classList.toggle('collapsed', !isCollapsed);
                if (chev) chev.classList.toggle('closed', !isCollapsed);
              });
            });
          }

          renderTree();

          // Search handler
          let devSearchTimer = null;
          document.getElementById('devSearch').addEventListener('input', function() {
            clearTimeout(devSearchTimer);
            currentSearch = this.value;
            devSearchTimer = setTimeout(renderTree, 200);
          });

          // Role filter (segmented control)
          content.querySelectorAll('.dev-seg button').forEach(function(btn) {
            btn.addEventListener('click', function() {
              content.querySelectorAll('.dev-seg button').forEach(b => b.classList.remove('on'));
              this.classList.add('on');
              currentRoleFilter = this.dataset.role;
              renderTree();
            });
          });

          // Add device
          document.getElementById('devAddBtn').addEventListener('click', function() {
            openDeviceDrawer(buildings, null, null);
          });

          // Check all
          document.getElementById('devCheckAllBtn').addEventListener('click', async function() {
            const btn = this;
            btn.disabled = true; btn.textContent = '⏳ Проверяю...';
            try {
              await Promise.all(allDevices.map(d =>
                apiFetch('/devices/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: d.id }) }).catch(() => null)
              ));
              toast.ok('✅ Проверка завершена');
              fetchData('devices');
            } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err('Ошибка: ' + e.message); }
            finally { btn.disabled = false; btn.textContent = '🔌 Проверить все'; }
          });

          // Delegated events on tree area
          document.getElementById('devTreeArea').addEventListener('click', async function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.classList.contains('dev-view')) {
              openCameraModal(
                Number(btn.dataset.deviceId),
                btn.dataset.deviceName || ('#' + btn.dataset.deviceId),
                btn.dataset.deviceHost || '',
                btn.dataset.deviceRole || ''
              );
              return;
            }

            if (btn.classList.contains('dev-add-to-building')) {
              openDeviceDrawer(buildings, null, Number(btn.dataset.buildingId));
              return;
            }

            if (btn.classList.contains('dev-edit')) {
              const devId = Number(btn.dataset.deviceId);
              const dev = allDevices.find(d => d.id === devId);
              openDeviceDrawer(buildings, dev || null, dev ? dev.buildingId : null);
              return;
            }

            if (btn.classList.contains('dev-open-door')) {
              const id = Number(btn.dataset.deviceId);
              const name = btn.dataset.deviceName || ('#' + id);
              if (!(await confirmModal({ title: 'Открыть дверь «' + name + '»?' }))) return;
              try {
                const r = await apiFetch('/control/' + id + '/open-door', { method: 'POST' });
                const d = await r.json().catch(() => ({}));
                if (r.ok) toast.ok('✅ Дверь открыта'); else toast.err('❌ Ошибка: ' + (d.message || r.statusText));
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err('❌ Ошибка: ' + e.message); }
              return;
            }

            if (btn.classList.contains('dev-test')) {
              const id = Number(btn.dataset.deviceId);
              const origText = btn.textContent;
              btn.textContent = '⏳'; btn.disabled = true;
              try {
                const r = await apiFetch('/devices/test-connection', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deviceId: id }),
                });
                const d = await r.json().catch(() => ({}));
                if (d.reachable) toast.ok('🔌 Устройство #' + id + ' доступно');
                else toast.err('🔌 Устройство #' + id + ': ' + (d.error || 'недоступно'));
                fetchData('devices');
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              finally { btn.textContent = origText; btn.disabled = false; }
              return;
            }

            if (btn.classList.contains('dev-delete')) {
              const id = Number(btn.dataset.deviceId);
              const name = btn.dataset.deviceName || ('#' + id);
              if (!(await confirmModal({ title: 'Удалить устройство «' + name + '»?', danger: true }))) return;
              try {
                const r = await apiFetch('/devices/' + id, { method: 'DELETE' });
                if (!r.ok) throw new Error(r.statusText);
                fetchData('devices');
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err('Ошибка: ' + e.message); }
              return;
            }

            if (btn.classList.contains('dev-scan-ch')) {
              const devId = Number(btn.dataset.deviceId);
              const buildingId = btn.dataset.buildingId;
              const devName = btn.dataset.deviceName || ('#' + devId);
              const origText = btn.textContent;
              btn.textContent = '⏳ Сканирование...'; btn.disabled = true;
              const panel = document.getElementById('scan-ch-panel-' + devId);
              if (!panel) { btn.textContent = origText; btn.disabled = false; return; }
              panel.innerHTML = '<div style="padding:10px 14px;color:var(--grg-ink-400);">🔍 Получаю камеры от «' + esc(devName) + '»...</div>';
              try {
                const r = await apiFetch('/devices/' + devId + '/scan-channels', { method: 'POST' });
                const channels = r.ok ? await r.json() : [];
                if (!channels.length) {
                  panel.innerHTML = '<div style="padding:10px 14px;color:var(--grg-ink-400);">Активных каналов не найдено.</div>';
                } else {
                  let pHtml = '<div class="scan-result-header">📷 Камеры NVR «' + esc(devName) + '»: ' + channels.length + ' шт.</div>';
                  channels.forEach(function(ch) {
                    pHtml += '<div class="scan-result-row">' +
                      '<span style="font-weight:700;color:var(--grg-purple-300);">CH ' + ch.channel + '</span>' +
                      '<code>' + esc(ch.ip || '—') + '</code>' +
                      '<span style="color:var(--grg-ink-400);">' + esc(ch.model || 'Неизвестная модель') + '</span>' +
                      '<button type="button" class="ch-add-btn secondary" style="margin-left:auto;font-size:11px;padding:3px 10px;" ' +
                        'data-building-id="' + esc(String(buildingId)) + '" ' +
                        'data-channel="' + ch.channel + '" ' +
                        'data-ip="' + esc(ch.ip || '') + '" ' +
                        'data-model="' + esc(ch.model || '') + '" ' +
                        'data-nvr-id="' + devId + '" ' +
                        'data-login="' + esc(ch.loginName || '') + '">+ Добавить</button>' +
                      '</div>';
                  });
                  panel.innerHTML = pHtml;
                  panel.querySelectorAll('.ch-add-btn').forEach(function(ab) {
                    ab.addEventListener('click', async function() {
                      const body2 = {
                        name: (this.dataset.model || 'Camera') + ' CH' + this.dataset.channel,
                        host: this.dataset.ip,
                        type: 'UNIVIEW_IPC',
                        role: 'CAMERA',
                        defaultChannel: parseInt(this.dataset.channel, 10),
                        defaultStream: 'main',
                        nvrId: parseInt(this.dataset.nvrId, 10),
                      };
                      if (this.dataset.login) body2.username = this.dataset.login;
                      this.textContent = '⏳'; this.disabled = true;
                      try {
                        const cr = await apiFetch('/buildings/' + this.dataset.buildingId + '/devices', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(body2),
                        });
                        if (cr.ok) { this.textContent = '✅'; fetchData('devices'); }
                        else { const err = await cr.json(); this.textContent = '❌'; toast.err(err.message || cr.statusText); this.disabled = false; }
                      } catch (e) { this.textContent = '❌'; if (!(e instanceof ApiUnauthorized)) toast.err(e.message); this.disabled = false; }
                    });
                  });
                }
              } catch (e) {
                if (panel) panel.innerHTML = '<div style="padding:10px 14px;color:var(--grg-danger);font-size:12px;">Ошибка: ' + e.message + '</div>';
              } finally {
                btn.textContent = origText; btn.disabled = false;
              }
              return;
            }
          });
        }

        async function renderGenericTab(tab) {
        let urlPath2 = '';
        if (tab === 'organizations') urlPath2 = '/organizations';
        else if (tab === 'complexes') urlPath2 = '/complexes';
        else if (tab === 'buildings') urlPath2 = '/buildings';
        else if (tab === 'users') urlPath2 = '/users';
        if (!urlPath2) { content.textContent = 'Неизвестный раздел'; return; }
        const data = await apiJson(urlPath2);
        if (!Array.isArray(data)) { content.textContent = JSON.stringify(data, null, 2); return; }
        if (data.length === 0) { content.textContent = 'Нет записей.'; addCreateForm(tab); return; }
        const keys = Object.keys(data[0]).filter(k => !k.match(/^(building|complex|organization)$/i));
        const isStaff = currentUser && ['SUPER_ADMIN', 'ORG_ADMIN', 'COMPLEX_MANAGER'].includes(currentUser.role);
        if (tab === 'users' && isStaff) {
          const userCols = ['id', 'email', 'phone', 'name', 'role', 'isBlocked', 'createdAt'];
          const allUsers = data;

          function renderUsers(users, filters) {
            try { sessionStorage.setItem('admin_users_filters', JSON.stringify(filters)); } catch (_) {}
            const q = (filters.q || '').toLowerCase();
            const roleF = filters.role || '';
            const statusF = filters.status || '';
            const filtered = users.filter(row => {
              if (roleF && row.role !== roleF) return false;
              if (statusF === 'blocked' && !row.isBlocked && !(row.blockedUntil && new Date(row.blockedUntil) > new Date())) return false;
              if (statusF === 'active' && (row.isBlocked || (row.blockedUntil && new Date(row.blockedUntil) > new Date()))) return false;
              if (q) {
                const hay = ((row.email || '') + ' ' + (row.phone || '') + ' ' + (row.name || '')).toLowerCase();
                if (!hay.includes(q)) return false;
              }
              return true;
            });
            const area = document.getElementById('usersTableArea');
            if (!area) return;
            if (!filtered.length) { area.innerHTML = '<p style="color:var(--grg-ink-400);">Нет пользователей по фильтру.</p>'; return; }
            const keyRow = userCols.map(k => '<th>' + esc(k) + '</th>').join('') + '<th>Действия</th>';
            const rows = filtered.map(row => {
              const cells = userCols.map(k => '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>').join('');
              const blocked = row.isBlocked || (row.blockedUntil && new Date(row.blockedUntil) > new Date());
              const blockBtn = blocked
                ? '<button type="button" class="user-unblock-btn secondary" data-user-id="' + row.id + '">Разблокировать</button>'
                : '<button type="button" class="user-block-btn secondary" data-user-id="' + row.id + '">Заблокировать</button>';
              const uname = esc((row.email || row.phone || row.name || row.id || '').toString());
              const delBtn = '<button type="button" class="user-delete-btn danger" data-user-id="' + row.id + '" data-name="' + uname + '">Удалить</button>';
              return '<tr>' + cells + '<td>' + blockBtn + ' ' + delBtn + '</td></tr>';
            });
            area.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>' + keyRow + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
            area.querySelectorAll('.user-block-btn').forEach(btn => {
              btn.addEventListener('click', async function() {
                const id = this.dataset.userId;
                try {
                  const r = await apiFetch('/admin/users/' + encodeURIComponent(id) + '/block', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isBlocked: true }) });
                  if (r.ok) fetchData('users'); else { const d = await r.json(); toast.err(d.message || r.statusText); }
                } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              });
            });
            area.querySelectorAll('.user-unblock-btn').forEach(btn => {
              btn.addEventListener('click', async function() {
                const id = this.dataset.userId;
                try {
                  const r = await apiFetch('/admin/users/' + encodeURIComponent(id) + '/block', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isBlocked: false }) });
                  if (r.ok) fetchData('users'); else { const d = await r.json(); toast.err(d.message || r.statusText); }
                } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              });
            });
            area.querySelectorAll('.user-delete-btn').forEach(btn => {
              btn.addEventListener('click', async function() {
                const id = this.dataset.userId;
                const uname = this.dataset.name || id;
                if (!(await confirmModal({ title: 'Удалить пользователя «' + uname + '»?', body: 'Привязки к квартирам и заявки будут удалены.', danger: true }))) return;
                try {
                  const r = await apiFetch('/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
                  if (!r.ok) { const d = await r.json().catch(() => ({})); toast.err(d.message || r.statusText); return; }
                  fetchData('users');
                } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
              });
            });
          }

          let savedUF = {};
          try { savedUF = JSON.parse(sessionStorage.getItem('admin_users_filters') || '{}'); } catch (_) {}

          let html = '';
          if (currentUser && currentUser.role === 'SUPER_ADMIN') {
            const orgs = await apiFetch('/organizations').then(r => r.ok ? r.json() : []).catch(() => []);
            const complexes = await apiFetch('/complexes').then(r => r.ok ? r.json() : []).catch(() => []);
            html += '<div class="card" id="createOrgAdminCard" style="margin-bottom:1rem;">' +
              '<h2>Создать администратора УК</h2>' +
              '<form id="createOrgAdminForm">' +
              '<label for="orgAdminEmail">Email</label> <input type="email" id="orgAdminEmail" placeholder="admin@uk.ru"> ' +
              '<label for="orgAdminPhone">Телефон</label> <input type="text" id="orgAdminPhone" placeholder="+79001234567"> ' +
              '<label for="orgAdminName">Имя</label> <input type="text" id="orgAdminName" placeholder="Иван Иванов"> ' +
              '<label for="orgAdminPassword">Пароль</label> <input type="password" id="orgAdminPassword" placeholder="мин. 6 символов" required>' +
              '<label for="orgAdminOrgId">Организация</label> <select id="orgAdminOrgId" required>' + orgs.map(o => '<option value="' + o.id + '">' + esc(o.name || o.id) + '</option>').join('') + '</select> ' +
              '<label for="orgAdminRole">Роль</label> <select id="orgAdminRole">' +
              '<option value="ORG_ADMIN">Админ УК</option><option value="COMPLEX_MANAGER">Менеджер ЖК</option>' +
              '</select> ' +
              '<span id="orgAdminComplexWrap" style="display:none;">' +
              '<label for="orgAdminComplexId">ЖК</label> <select id="orgAdminComplexId"><option value="">— выберите —</option>' + complexes.map(c => '<option value="' + c.id + '" data-org="' + esc(c.organizationId || '') + '">' + esc(c.name || c.id) + '</option>').join('') + '</select></span> ' +
              '<button type="submit">Создать</button>' +
              '</form><div id="createOrgAdminMsg" class="msg" style="display:none;"></div></div>';
          }
          html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">' +
            '<input id="userSearch" placeholder="Email, телефон, имя..." style="min-width:200px;" value="' + esc(savedUF.q || '') + '">' +
            '<select id="userRoleFilter"><option value="">Все роли</option>' +
            ['SUPER_ADMIN','ORG_ADMIN','COMPLEX_MANAGER','RESIDENT'].map(r => '<option' + (savedUF.role === r ? ' selected' : '') + '>' + r + '</option>').join('') +
            '</select>' +
            '<select id="userStatusFilter"><option value="">Все статусы</option>' +
            '<option value="active"' + (savedUF.status === 'active' ? ' selected' : '') + '>Активны</option>' +
            '<option value="blocked"' + (savedUF.status === 'blocked' ? ' selected' : '') + '>Заблокированы</option>' +
            '</select></div>' +
            '<div id="usersTableArea"></div>';
          content.innerHTML = html;

          function getUserFilters() {
            return {
              q: (document.getElementById('userSearch') || {}).value || '',
              role: (document.getElementById('userRoleFilter') || {}).value || '',
              status: (document.getElementById('userStatusFilter') || {}).value || '',
            };
          }
          renderUsers(allUsers, savedUF);
          let userSearchTimer = null;
          const userSearchEl = document.getElementById('userSearch');
          if (userSearchEl) userSearchEl.addEventListener('input', function() {
            clearTimeout(userSearchTimer);
            userSearchTimer = setTimeout(() => renderUsers(allUsers, getUserFilters()), 200);
          });
          ['userRoleFilter','userStatusFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => renderUsers(allUsers, getUserFilters()));
          });
          const createForm = document.getElementById('createOrgAdminForm');
          if (createForm) {
            const roleSel = document.getElementById('orgAdminRole');
            const orgSel = document.getElementById('orgAdminOrgId');
            const complexWrap = document.getElementById('orgAdminComplexWrap');
            const complexSel = document.getElementById('orgAdminComplexId');
            function filterComplexes() {
              if (!complexSel || !orgSel) return;
              const orgId = orgSel.value;
              Array.from(complexSel.querySelectorAll('option')).forEach(opt => {
                if (opt.value === '') { opt.style.display = ''; return; }
                opt.style.display = opt.dataset.org === orgId ? '' : 'none';
                if (opt.dataset.org === orgId && !opt.selected) complexSel.value = opt.value;
              });
            }
            roleSel.addEventListener('change', function() {
              complexWrap.style.display = this.value === 'COMPLEX_MANAGER' ? 'inline' : 'none';
              filterComplexes();
            });
            orgSel.addEventListener('change', filterComplexes);
            if (roleSel.value === 'COMPLEX_MANAGER') complexWrap.style.display = 'inline';
            filterComplexes();
            createForm.addEventListener('submit', async function(e) {
              e.preventDefault();
              const msgEl = document.getElementById('createOrgAdminMsg');
              const email = document.getElementById('orgAdminEmail').value.trim();
              const phone = document.getElementById('orgAdminPhone').value.trim();
              if (!email && !phone) { showMsg(msgEl, 'Укажите email или телефон', true); return; }
              const body = {
                password: document.getElementById('orgAdminPassword').value,
                organizationId: document.getElementById('orgAdminOrgId').value,
                role: document.getElementById('orgAdminRole').value
              };
              if (email) body.email = email;
              if (phone) body.phone = phone;
              const name = document.getElementById('orgAdminName').value.trim();
              if (name) body.name = name;
              if (body.role === 'COMPLEX_MANAGER') {
                const cid = document.getElementById('orgAdminComplexId').value;
                if (!cid) { showMsg(msgEl, 'Выберите ЖК для менеджера', true); return; }
                body.complexId = cid;
              }
              try {
                const r = await apiFetch('/admin/users/org-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = r.ok ? await r.json() : await r.json().catch(() => ({}));
                if (r.ok) { showMsg(msgEl, 'Пользователь создан: ' + (d.email || d.phone || d.id), false); fetchData('users'); createForm.reset(); } else showMsg(msgEl, d.message || r.statusText, true);
              } catch (err) { if (!(err instanceof ApiUnauthorized)) showMsg(msgEl, err.message, true); }
            });
          }
        } else if ((tab === 'organizations' && currentUser && currentUser.role === 'SUPER_ADMIN') ||
            (tab === 'complexes' && isStaff) ||
            (tab === 'buildings' && isStaff)) {
          const keyRow = keys.map(k => '<th>' + esc(k) + '</th>').join('') + '<th>Действия</th>';
          const rows = data.map(row => {
            const cells = keys.map(k => '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>').join('');
            const name = esc((row.name || row.id || '').toString());
            const editBtn = '<button type="button" class="entity-edit-btn secondary" data-tab="' + esc(tab) + '" data-id="' + esc((row.id ?? '').toString()) + '" data-name="' + esc(row.name || '') + '" data-address="' + esc(row.address || '') + '" data-contact-email="' + esc(row.contactEmail || '') + '" data-contact-phone="' + esc(row.contactPhone || '') + '">Изменить</button>';
            const delBtn = '<button type="button" class="entity-delete-btn danger" data-tab="' + esc(tab) + '" data-id="' + esc((row.id ?? '').toString()) + '" data-name="' + name + '">Удалить</button>';
            return '<tr>' + cells + '<td>' + editBtn + ' ' + delBtn + '</td></tr>';
          });
          content.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>' + keyRow + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
          content.querySelectorAll('.entity-edit-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
              const entityTab = this.dataset.tab;
              const id = this.dataset.id;
              let fields, patchPath;
              if (entityTab === 'organizations') {
                fields = [
                  { name: 'name', label: 'Название', default: this.dataset.name || '' },
                  { name: 'contactEmail', label: 'Email контакта', default: this.dataset.contactEmail || '' },
                  { name: 'contactPhone', label: 'Телефон контакта', default: this.dataset.contactPhone || '' },
                ];
                patchPath = '/organizations/' + encodeURIComponent(id);
              } else if (entityTab === 'complexes') {
                fields = [
                  { name: 'name', label: 'Название', default: this.dataset.name || '' },
                  { name: 'address', label: 'Адрес', default: this.dataset.address || '' },
                ];
                patchPath = '/complexes/' + encodeURIComponent(id);
              } else {
                fields = [
                  { name: 'name', label: 'Название', default: this.dataset.name || '' },
                  { name: 'address', label: 'Адрес', default: this.dataset.address || '' },
                ];
                patchPath = '/buildings/' + encodeURIComponent(id);
              }
              const vals = await inputModal({ title: 'Изменить', fields });
              if (!vals) return;
              const body = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== ''));
              if (!Object.keys(body).length) return;
              try {
                const r = await apiFetch(patchPath, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (r.ok) { toast.ok('Сохранено.'); fetchData(entityTab); }
                else { const d = await r.json().catch(() => ({})); toast.err(d.message || r.statusText); }
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
            });
          });
          content.querySelectorAll('.entity-delete-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
              const entityTab = this.dataset.tab;
              const id = this.dataset.id;
              const name = this.dataset.name || id;
              if (!(await confirmModal({ title: 'Удалить «' + name + '»?', body: 'Вложенные данные (ЖК, здания, устройства и т.д.) могут быть затронуты.', danger: true }))) return;
              const path = entityTab === 'organizations' ? 'organizations' : entityTab === 'complexes' ? 'complexes' : 'buildings';
              try {
                const r = await apiFetch('/' + path + '/' + encodeURIComponent(id), { method: 'DELETE' });
                if (!r.ok) { const d = await r.json().catch(function() { return {}; }); toast.err(d.message || r.statusText); return; }
                fetchData(entityTab);
              } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
            });
          });
        } else {
          content.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>' + keys.map(k => '<th>' + esc(k) + '</th>').join('') + '</tr></thead><tbody>' +
            data.map(row => '<tr>' + keys.map(k => '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
        }
        addCreateForm(tab);
        }

        switch (tab) {
          case 'dashboard':    await renderDashboard(); break;
          case 'apartments':   await renderApartments(); break;
          case 'applications': await renderApplications(); break;
          case 'events':       await renderEvents(); break;
          case 'user_apt':     await renderUserApt(); break;
          case 'residents':    await renderResidents(); break;
          case 'devices':      await renderDevicesTab(); break;
          default:             await renderGenericTab(tab); break;
        }
      } catch (e) {
        if (!(e instanceof ApiUnauthorized)) content.textContent = 'Ошибка: ' + e.message;
      }
    }

    async function loadApartmentsByBuilding(buildingId) {
      const list = document.getElementById('apartmentsList');
      if (!list) return;
      list.innerHTML = 'Загрузка…';
      let data;
      try {
        data = await apiJson('/apartments/by-building/' + buildingId);
      } catch (e) { if (!(e instanceof ApiUnauthorized)) list.textContent = 'Ошибка'; return; }
      if (data.length === 0) { list.innerHTML = '<p style="color:var(--muted);">Нет квартир.</p>'; return; }
      const keys = Object.keys(data[0]).filter(k => k !== 'building');
      const keyRow = keys.map(k => '<th>' + esc(k) + '</th>').join('') + '<th>Действия</th>';
      const rows = data.map(row => {
        const cells = keys.map(k => '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>').join('');
        const name = esc((row.number || row.id || '').toString());
        const ext = esc(row.extension != null ? String(row.extension) : '');
        const editBtn = '<button type="button" class="apt-edit-btn secondary" data-id="' + row.id + '" data-name="' + name + '" data-extension="' + ext + '">Изменить</button>';
        const delBtn = '<button type="button" class="apt-delete-btn danger" data-id="' + row.id + '" data-name="' + name + '">Удалить</button>';
        return '<tr>' + cells + '<td>' + editBtn + ' ' + delBtn + '</td></tr>';
      });
      list.innerHTML = '<div style="overflow-x:auto;"><table><thead><tr>' + keyRow + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
      list.querySelectorAll('.apt-edit-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          const id = this.dataset.id;
          const currentExt = this.dataset.extension || '';
          const vals = await inputModal({ title: 'Изменить расширение квартиры', fields: [{ name: 'ext', label: 'Расширение (SIP/номер для вызова монитора). Оставьте пустым, чтобы убрать.', placeholder: '', default: currentExt }] });
          if (vals === null) return;
          const newExt = vals.ext;
          try {
            const req = await apiFetch('/apartments/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extension: newExt.trim() || undefined }) });
            if (!req.ok) { const d = await req.json().catch(function() { return {}; }); toast.err(d.message || req.statusText); return; }
            await loadApartmentsByBuilding(buildingId);
          } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
        });
      });
      list.querySelectorAll('.apt-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          const id = this.dataset.id;
          const name = this.dataset.name || id;
          if (!(await confirmModal({ title: 'Удалить квартиру «' + name + '»?', danger: true }))) return;
          try {
            const req = await apiFetch('/apartments/' + id, { method: 'DELETE' });
            if (!req.ok) { const d = await req.json().catch(function() { return {}; }); toast.err(d.message || req.statusText); return; }
            await loadApartmentsByBuilding(buildingId);
          } catch (e) { if (!(e instanceof ApiUnauthorized)) toast.err(e.message); }
        });
      });
    }

    let currentResidentApartmentId = null;
    function showResidents(apartmentId, apartmentName) {
      currentResidentApartmentId = apartmentId;
      try { sessionStorage.setItem('admin_last_apt', JSON.stringify({ id: apartmentId, name: apartmentName || '' })); } catch (_) {}
      document.getElementById('residentApartmentName').textContent = apartmentName || apartmentId;
      document.getElementById('residentSection').style.display = 'block';
      document.getElementById('addResidentForm').dataset.apartmentId = String(apartmentId);
      loadResidentsList(apartmentId);
    }

    async function loadResidentsList(apartmentId) {
      const el = document.getElementById('residentsList');
      el.textContent = 'Загрузка…';
      let list;
      try {
        list = await apiJson('/apartments/' + apartmentId + '/residents');
      } catch (e) { if (!(e instanceof ApiUnauthorized)) el.textContent = 'Ошибка'; return; }
      if (list.length === 0) { el.innerHTML = '<p style="color:var(--muted);">Нет привязанных жителей.</p>'; return; }
      const userLabel = (ua) => (ua.user ? (ua.user.email || ua.user.phone || ua.userId) : ua.userId);
      el.innerHTML = '<table><thead><tr><th>Пользователь</th><th>Роль</th><th>Действие</th></tr></thead><tbody>' +
        list.map(ua => '<tr><td>' + esc(userLabel(ua)) + '</td><td>' + esc(ua.role || '') + '</td><td><button type="button" class="danger" data-remove="' + esc(ua.userId) + '" data-label="' + esc(String(userLabel(ua))) + '">Удалить</button></td></tr>').join('') + '</tbody></table>';
      el.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async function() {
          const label = this.dataset.label || this.dataset.remove;
          if (!(await confirmModal({ title: 'Удалить привязку для «' + label + '»?' }))) return;
          await removeResident(apartmentId, this.dataset.remove);
          loadResidentsList(apartmentId);
        });
      });
    }

    async function removeResident(apartmentId, userId) {
      const r = await apiFetch('/apartments/' + apartmentId + '/residents/' + encodeURIComponent(userId), { method: 'DELETE' });
      if (!r.ok) throw new Error(r.statusText);
    }

    document.getElementById('addResidentForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const aptId = this.dataset.apartmentId;
      if (!aptId) return;
      const msgEl = document.getElementById('addResidentMsg');
      const body = { role: document.getElementById('resRole').value.trim() || 'resident' };
      if (document.getElementById('resUserId').value.trim()) body.userId = document.getElementById('resUserId').value.trim();
      else if (document.getElementById('resEmail').value.trim()) body.email = document.getElementById('resEmail').value.trim();
      else if (document.getElementById('resPhone').value.trim()) body.phone = document.getElementById('resPhone').value.trim();
      else { showMsg(msgEl, 'Укажите userId, email или phone', true); return; }
      try {
        const r = await apiFetch('/apartments/' + aptId + '/residents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = r.ok ? await r.json() : await r.text();
        if (r.ok) { showMsg(msgEl, 'Житель добавлен.', false); loadResidentsList(Number(aptId)); } else showMsg(msgEl, typeof d === 'string' ? d : (d.message || 'Ошибка'), true);
      } catch (err) { if (!(err instanceof ApiUnauthorized)) showMsg(msgEl, err.message, true); }
    });

    async function openEditDeviceForm(deviceId, buildings) {
      const device = await apiJson('/devices/' + deviceId);
      showCreateDeviceForm(buildings, device);
    }

    function showCreateDeviceForm(buildings, editDevice) {
      const sec = document.getElementById('createSection');
      const title = document.getElementById('createSectionTitle');
      const container = document.getElementById('createFormContainer');
      const isEdit = !!editDevice;
      title.textContent = isEdit ? 'Редактировать устройство' : 'Добавить устройство к зданию';
      container.innerHTML =
        '<input type="hidden" id="devEditId" value="' + (editDevice ? editDevice.id : '') + '">' +
        '<form id="formAddDevice" style="flex-wrap:wrap;">' +
        '<label for="devBuildingId">Здание</label> <select id="devBuildingId">' + buildings.map(b => '<option value="' + b.id + '"' + (editDevice && b.id === editDevice.buildingId ? ' selected' : '') + '>' + esc(b.name || b.id) + '</option>').join('') + '</select> ' +
        '<input id="devName" placeholder="Имя" required value="' + esc(editDevice ? (editDevice.name || '') : '') + '"> ' +
        '<input id="devHost" placeholder="Host (IP)" required value="' + esc(editDevice ? (editDevice.host || '') : '') + '"> ' +
        '<label for="devType">Тип</label> <select id="devType"><option value="UNIVIEW_IPC"' + (editDevice && editDevice.type === 'UNIVIEW_IPC' ? ' selected' : '') + '>Uniview IPC</option><option value="UNIVIEW_NVR"' + (editDevice && editDevice.type === 'UNIVIEW_NVR' ? ' selected' : '') + '>Uniview NVR</option><option value="OTHER"' + (editDevice && editDevice.type === 'OTHER' ? ' selected' : '') + '>Other</option></select> ' +
        '<label for="devRole">Роль</label> <select id="devRole"><option value="DOORPHONE"' + (editDevice && editDevice.role === 'DOORPHONE' ? ' selected' : '') + '>Домофон</option><option value="CAMERA"' + (editDevice && editDevice.role === 'CAMERA' ? ' selected' : '') + '>Камера</option><option value="NVR"' + (editDevice && editDevice.role === 'NVR' ? ' selected' : '') + '>NVR</option></select> ' +
        '<input id="devUser" placeholder="Логин" value="' + esc(editDevice && editDevice.username ? String(editDevice.username) : '') + '"> ' +
        '<input id="devPass" type="password" placeholder="' + (editDevice ? 'Новый пароль (оставьте пустым чтобы не менять)' : 'Пароль') + '"> ' +
        '<input id="devHttpPort" type="number" placeholder="HTTP порт (80)" style="width:110px;" value="' + (editDevice && editDevice.httpPort != null ? editDevice.httpPort : 80) + '"> ' +
        '<input id="devRtspPort" type="number" placeholder="RTSP порт (554)" style="width:110px;" value="' + (editDevice && editDevice.rtspPort != null ? editDevice.rtspPort : 554) + '"> ' +
        '<input id="devChannel" type="number" placeholder="Канал" style="width:80px;" value="' + (editDevice && editDevice.defaultChannel != null ? editDevice.defaultChannel : '') + '"> ' +
        '<input id="devStream" placeholder="Поток (main)" style="width:100px;" value="' + esc(editDevice && editDevice.defaultStream ? String(editDevice.defaultStream) : '') + '"> ' +
        '<input id="devFloor" type="number" placeholder="Этаж (пусто=все)" style="width:130px;" value="' + (editDevice && editDevice.floor != null ? editDevice.floor : '') + '" title="пусто — видят все; число — только этот этаж"> ' +
        '<input id="devCustomRtsp" placeholder="Свой RTSP URL (необяз.)" style="width:260px;" value="' + esc(editDevice && editDevice.customRtspUrl ? String(editDevice.customRtspUrl) : '') + '" title="Если заполнено — используется вместо LiteAPI. Пример: rtsp://192.168.1.100:554/live"> ' +
        '<button type="submit">' + (isEdit ? 'Сохранить' : 'Добавить') + '</button> ' +
        (isEdit ? '<button type="button" id="devCancelEdit" class="secondary">Отмена</button> ' : '') +
        '<button type="button" id="devTestBtn" class="secondary">Проверить связь</button> ' +
        '<button type="button" id="devOnvifBtn" class="secondary">ONVIF поиск</button>' +
        '</form>' +
        '<div id="devTestResult" class="msg" style="display:none;"></div>' +
        '<div id="devOnvifResult" style="margin-top:0.5rem;"></div>';
      sec.style.display = 'block';
      if (isEdit) {
        container.querySelector('#devCancelEdit').addEventListener('click', function() {
          document.getElementById('devEditId').value = '';
          showCreateDeviceForm(buildings);
        });
      }

      container.querySelector('#devTestBtn').addEventListener('click', async function() {
        const el = document.getElementById('devTestResult');
        const host = document.getElementById('devHost').value.trim();
        const type = document.getElementById('devType').value;
        if (!host) { showMsg(el, 'Укажите Host/IP', true); return; }
        el.textContent = 'Проверка...'; el.className = 'msg'; el.style.display = 'block';
        try {
          const body = { host, type };
          const editId = document.getElementById('devEditId') && document.getElementById('devEditId').value.trim();
          if (editId) body.deviceId = parseInt(editId, 10);
          const u = document.getElementById('devUser').value.trim();
          const p = document.getElementById('devPass').value;
          const hp = parseInt(document.getElementById('devHttpPort').value, 10);
          if (u) body.username = u;
          if (p) body.password = p;
          if (hp) body.httpPort = hp;
          const r = await apiFetch('/devices/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const d = await r.json();
          if (d.reachable) {
            const fmt = (v) => {
              if (v == null) return String(v);
              if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 80 ? s.slice(0, 77) + '...' : s; }
              return String(v);
            };
            const info = d.info ? ' | ' + Object.entries(d.info).slice(0, 5).map(([k,v]) => k + ': ' + fmt(v)).join(', ') : '';
            showMsg(el, 'Устройство доступно' + info, false);
          } else {
            showMsg(el, 'Не удалось: ' + (d.error || 'unknown'), true);
          }
        } catch (e) { showMsg(el, 'Ошибка: ' + e.message, true); }
      });

      container.querySelector('#devOnvifBtn').addEventListener('click', async function() {
        const bid = document.getElementById('devBuildingId').value;
        const el = document.getElementById('devOnvifResult');
        el.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px;">🔍 Поиск ONVIF-устройств в сети (5 сек)...</div>';
        try {
          const r = await apiFetch('/buildings/' + bid + '/discover-onvif', { method: 'POST' });
          const list = r.ok ? await r.json() : [];
          if (!list.length) { el.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px;">Устройств не найдено. Убедитесь что устройства в той же подсети.</div>'; return; }
          // Auto-detect device type and role from name/xAddr
          function detectType(d) {
            const n = (d.name || d.xAddr || '').toLowerCase();
            if (n.includes('nvr') || n.includes('recorder')) return { type: 'UNIVIEW_NVR', role: 'NVR' };
            if (n.includes('ipc') || n.includes('camera') || n.includes('cam')) return { type: 'UNIVIEW_IPC', role: 'CAMERA' };
            if (n.includes('doorbell') || n.includes('door')) return { type: 'UNIVIEW_IPC', role: 'DOORPHONE' };
            return { type: 'UNIVIEW_IPC', role: 'CAMERA' };
          }
          let rows = '<div style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">' +
            '<div style="padding:6px 12px;background:var(--accent-dim);font-size:11px;font-weight:600;color:#fff;letter-spacing:.5px;">НАЙДЕНО ONVIF-УСТРОЙСТВ: ' + list.length + '</div>';
          list.forEach((d, i) => {
            const det = detectType(d);
            rows += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:' + (i > 0 ? '1px solid var(--border)' : 'none') + ';font-size:12px;">' +
              '<span style="flex:1;font-weight:600;">' + esc(d.name || d.host) + '</span>' +
              '<code style="color:var(--accent);">' + esc(d.host) + '</code>' +
              '<span class="badge" style="font-size:10px;">' + esc(det.type) + '</span>' +
              '<span style="color:var(--muted);">' + esc(det.role) + '</span>' +
              '<button type="button" class="onvif-pick secondary" style="font-size:11px;padding:3px 10px;" ' +
                'data-host="' + esc(d.host) + '" data-name="' + esc(d.name || d.host) + '" ' +
                'data-type="' + esc(det.type) + '" data-role="' + esc(det.role) + '">Заполнить форму ↑</button>' +
              '</div>';
          });
          rows += '</div>';
          el.innerHTML = rows;
          el.querySelectorAll('.onvif-pick').forEach(btn => {
            btn.addEventListener('click', function() {
              document.getElementById('devHost').value = this.dataset.host;
              if (!document.getElementById('devName').value.trim()) document.getElementById('devName').value = this.dataset.name;
              document.getElementById('devType').value = this.dataset.type;
              document.getElementById('devRole').value = this.dataset.role;
              document.getElementById('devHost').scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          });
        } catch (e) { el.innerHTML = '<div style="padding:8px;color:var(--error);font-size:12px;">Ошибка: ' + e.message + '</div>'; }
      });

      container.querySelector('#formAddDevice').addEventListener('submit', async function(e) {
        e.preventDefault();
        const editId = document.getElementById('devEditId') && document.getElementById('devEditId').value.trim();
        const hpVal = document.getElementById('devHttpPort').value.trim();
        const rpVal = document.getElementById('devRtspPort').value.trim();
        const chVal = document.getElementById('devChannel').value.trim();
        const hp = hpVal ? parseInt(hpVal, 10) : undefined;
        const rp = rpVal ? parseInt(rpVal, 10) : undefined;
        const ch = chVal ? parseInt(chVal, 10) : undefined;
        if (hpVal && (isNaN(hp) || hp < 1 || hp > 65535)) { showMsg(document.getElementById('createMsg'), 'HTTP порт: число от 1 до 65535', true); return; }
        if (rpVal && (isNaN(rp) || rp < 1 || rp > 65535)) { showMsg(document.getElementById('createMsg'), 'RTSP порт: число от 1 до 65535', true); return; }
        const body = {
          name: document.getElementById('devName').value.trim(),
          host: document.getElementById('devHost').value.trim(),
          type: document.getElementById('devType').value,
          role: document.getElementById('devRole').value,
          username: document.getElementById('devUser').value.trim() || undefined,
          password: document.getElementById('devPass').value || undefined,
        };
        if (hp) body.httpPort = hp;
        if (rp) body.rtspPort = rp;
        if (ch) body.defaultChannel = ch;
        const st = document.getElementById('devStream').value.trim();
        if (st) body.defaultStream = st;
        const flVal = document.getElementById('devFloor').value.trim();
        if (flVal !== '') body.floor = parseInt(flVal, 10);
        else body.floor = null;
        const customRtsp = document.getElementById('devCustomRtsp').value.trim();
        body.customRtspUrl = customRtsp || null;
        const msgEl = document.getElementById('createMsg');
        let r;
        try {
          if (editId) {
            r = await apiFetch('/devices/' + editId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r.ok) { showMsg(msgEl, 'Устройство сохранено.', false); document.getElementById('devEditId').value = ''; showCreateDeviceForm(buildings); fetchData('devices'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
          } else {
            const bid = document.getElementById('devBuildingId').value;
            r = await apiFetch('/buildings/' + bid + '/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r.ok) { showMsg(msgEl, 'Устройство добавлено.', false); fetchData('devices'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
          }
        } catch (err) { if (!(err instanceof ApiUnauthorized)) showMsg(msgEl, 'Ошибка: ' + err.message, true); }
      });
    }

    function addCreateForm(tab) {
      const sec = document.getElementById('createSection');
      const title = document.getElementById('createSectionTitle');
      const container = document.getElementById('createFormContainer');
      const msgEl = document.getElementById('createMsg');
      msgEl.style.display = 'none';
      if (tab === 'organizations' && currentUser && currentUser.role === 'SUPER_ADMIN') {
        sec.style.display = 'block';
        title.textContent = 'Создать организацию';
        container.innerHTML = '<form id="formCreateOrg"><label for="orgName">Название</label> <input id="orgName" placeholder="ООО Управляющая компания" required> <label for="orgPlan">Тариф</label> <input id="orgPlan" placeholder="basic" value="basic"> <label for="orgMax">max_complexes</label> <input id="orgMax" type="number" placeholder="10" value="10" min="1"> <label for="orgMaxDevices">max_devices</label> <input id="orgMaxDevices" type="number" placeholder="100" value="100" min="1"> <button type="submit">Создать</button></form>';
        container.querySelector('#formCreateOrg').addEventListener('submit', async function(e) {
          e.preventDefault();
          try {
            const r = await apiFetch('/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('orgName').value.trim(), subscriptionPlan: document.getElementById('orgPlan').value.trim() || 'basic', maxComplexes: parseInt(document.getElementById('orgMax').value, 10) || 10, maxDevices: parseInt(document.getElementById('orgMaxDevices').value, 10) || 100 }) });
            if (r.ok) { showMsg(msgEl, 'Организация создана.', false); fetchData('organizations'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
          } catch (e) { if (!(e instanceof ApiUnauthorized)) showMsg(msgEl, e.message, true); }
        });
        return;
      }
      if (tab === 'complexes' && currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ORG_ADMIN' || currentUser.role === 'COMPLEX_MANAGER')) {
        sec.style.display = 'block';
        title.textContent = 'Создать ЖК';
        (async () => {
          const orgs = await apiFetch('/organizations').then(r => r.ok ? r.json() : []).catch(() => []);
          const orgOptions = Array.isArray(orgs) ? orgs.map(o => '<option value="' + o.id + '">' + esc(o.name || o.id) + '</option>').join('') : '';
          container.innerHTML = '<form id="formCreateComplex"><label for="complexOrgId">Организация</label> <select id="complexOrgId">' + orgOptions + '</select> <label for="complexName">Название</label> <input id="complexName" placeholder="ЖК Солнечный" required> <label for="complexAddr">Адрес</label> <input id="complexAddr" placeholder="Адрес"> <button type="submit">Создать</button></form>';
          container.querySelector('#formCreateComplex').addEventListener('submit', async function(e) {
            e.preventDefault();
            try {
              const r = await apiFetch('/complexes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: document.getElementById('complexOrgId').value, name: document.getElementById('complexName').value.trim(), address: document.getElementById('complexAddr').value.trim() || undefined }) });
              if (r.ok) { showMsg(msgEl, 'ЖК создан.', false); fetchData('complexes'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
            } catch (e) { if (!(e instanceof ApiUnauthorized)) showMsg(msgEl, e.message, true); }
          });
        })();
        return;
      }
      if (tab === 'buildings' && currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ORG_ADMIN' || currentUser.role === 'COMPLEX_MANAGER')) {
        sec.style.display = 'block';
        title.textContent = 'Создать здание';
        (async () => {
          const complexes = await apiFetch('/complexes').then(r => r.ok ? r.json() : []).catch(() => []);
          const opts = Array.isArray(complexes) ? complexes.map(c => '<option value="' + c.id + '">' + esc(c.name || c.id) + '</option>').join('') : '';
          container.innerHTML = '<form id="formCreateBuilding"><label for="buildingComplexId">ЖК</label> <select id="buildingComplexId">' + opts + '</select> <label for="buildingName">Название</label> <input id="buildingName" placeholder="Корпус 1" required> <label for="buildingAddr">Адрес</label> <input id="buildingAddr" placeholder="Адрес"> <button type="submit">Создать</button></form>';
          container.querySelector('#formCreateBuilding').addEventListener('submit', async function(e) {
            e.preventDefault();
            try {
              const r = await apiFetch('/buildings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ complexId: document.getElementById('buildingComplexId').value, name: document.getElementById('buildingName').value.trim(), address: document.getElementById('buildingAddr').value.trim() || undefined }) });
              if (r.ok) { showMsg(msgEl, 'Здание создано.', false); fetchData('buildings'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
            } catch (e) { if (!(e instanceof ApiUnauthorized)) showMsg(msgEl, e.message, true); }
          });
        })();
        return;
      }
      if (tab === 'apartments') {
        sec.style.display = 'block';
        title.textContent = 'Создать квартиру';
        (async () => {
          const buildings = await apiFetch('/buildings').then(r => r.ok ? r.json() : []).catch(() => []);
          const opts = Array.isArray(buildings) ? buildings.map(b => '<option value="' + b.id + '">' + esc(b.name || b.id) + '</option>').join('') : '';
          container.innerHTML = '<form id="formCreateApt"><label for="aptBuildingId">Здание</label> <select id="aptBuildingId">' + opts + '</select> <label for="aptNumber">Номер</label> <input id="aptNumber" placeholder="Номер квартиры" required> <label for="aptFloor">Этаж</label> <input id="aptFloor" type="number" placeholder="Этаж"> <label for="aptExtension">Расширение</label> <input id="aptExtension" placeholder="SIP/номер монитора"> <button type="submit">Создать</button></form>';
          container.querySelector('#formCreateApt').addEventListener('submit', async function(e) {
            e.preventDefault();
            const body = { buildingId: parseInt(document.getElementById('aptBuildingId').value, 10), number: document.getElementById('aptNumber').value.trim() };
            const fl = document.getElementById('aptFloor').value; if (fl) body.floor = parseInt(fl, 10);
            const ext = document.getElementById('aptExtension').value.trim(); if (ext) body.extension = ext;
            try {
              const r = await apiFetch('/apartments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              if (r.ok) { showMsg(msgEl, 'Квартира создана.', false); fetchData('apartments'); } else { const d = await r.json(); showMsg(msgEl, d.message || r.statusText, true); }
            } catch (e) { if (!(e instanceof ApiUnauthorized)) showMsg(msgEl, e.message, true); }
          });
        })();
        return;
      }
      sec.style.display = 'none';
    }

    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      auth();
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);

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

    fetchHealth();
    if (token) onTokenReady();
