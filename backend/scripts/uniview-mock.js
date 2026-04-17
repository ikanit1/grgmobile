#!/usr/bin/env node
/**
 * Uniview LiteAPI Mock Server
 * Эмулирует Uniview IPC/NVR для тестирования без реального оборудования.
 *
 * Запуск:
 *   node scripts/uniview-mock.js [port]        # порт по умолчанию 8888
 *
 * HTTP LiteAPI (имитация устройства):
 *   GET  /LAPI/V1.0/Channels/1/Media/LiveViewURL   → RTSP URL
 *   POST /LAPI/V1.0/Channels/1/OpenDoor            → успех
 *   GET  /LAPI/V1.0/System/Equipment               → инфо об устройстве
 *   GET  /LAPI/V1.0/Channels/System/DeviceInfo     → список каналов
 *   PUT  /LAPI/V1.0/IO/Outputs/1                   → реле
 *
 * WebSocket (LiteAPI Over WS) — бэкенд подключается сюда:
 *   ws://localhost:PORT
 *   Поддерживает: Event/Subscribe, отправка событий всем клиентам
 *
 * Управление mock-сервером (из Postman или curl):
 *   POST /mock/trigger   {"type":"DoorBell"}
 *   POST /mock/trigger   {"type":"Motion","channelId":1}
 *   POST /mock/trigger   {"type":"IOAlarm","inputId":1}
 *   GET  /mock/status    → статус подключений и счётчики
 *   GET  /mock/clients   → список WS клиентов
 *
 * Все доступные типы событий для тестирования:
 *   DoorBell, doorbell, CallIncoming, call_incoming, DoorCall  → входящий звонок
 *   VMD, Motion, motion, VideoMotion                           → движение
 *   IO, IOAlarm, io_alarm, AlarmInput, DigitalInput            → тревога датчика
 *
 * Авто-события:
 *   MOCK_AUTO_DOORBELL=30   → звонок каждые 30 секунд
 *   MOCK_AUTO_MOTION=60     → движение каждые 60 секунд
 *
 * Пример полного теста:
 *   1. node scripts/uniview-mock.js 8888
 *   2. В бэкенде добавить устройство с host=127.0.0.1, httpPort=8888
 *   3. POST /mock/trigger {"type":"DoorBell"} — должен прийти push на телефон
 */

'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.argv[2] || process.env.MOCK_PORT || '8888', 10);
const HOST = process.env.MOCK_HOST || '0.0.0.0';
const DEVICE_NAME = process.env.MOCK_DEVICE_NAME || 'MockUniviewIPC';
const DEVICE_SERIAL = process.env.MOCK_SERIAL || 'MOCK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
const MOCK_USERNAME = process.env.MOCK_USER || 'admin';
const MOCK_PASSWORD = process.env.MOCK_PASS || 'admin123';
const MOCK_RTSP_PORT = process.env.MOCK_RTSP_PORT || '554';
const AUTO_DOORBELL_SEC = process.env.MOCK_AUTO_DOORBELL ? parseInt(process.env.MOCK_AUTO_DOORBELL) : 0;
const AUTO_MOTION_SEC = process.env.MOCK_AUTO_MOTION ? parseInt(process.env.MOCK_AUTO_MOTION) : 0;

// ─── Состояние ───────────────────────────────────────────────────────────────

const stats = {
  httpRequests: 0,
  wsConnections: 0,
  eventsSent: 0,
  doorbellCount: 0,
  doorOpenCount: 0,
  startTime: new Date(),
};

const wsClients = new Map(); // id → { ws, subscribedToEvents, connectedAt }
let clientIdCounter = 0;

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function log(msg, ...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`, ...args);
}

function lapiOk(data = {}) {
  return JSON.stringify({ ResponseCode: 200, ResponseString: 'OK', Data: data });
}

function lapiError(code, msg) {
  return JSON.stringify({ ResponseCode: code, ResponseString: msg, Data: {} });
}

function parseBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  const b64 = authHeader.slice(6);
  const decoded = Buffer.from(b64, 'base64').toString('utf-8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

function parseDigestAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Digest ')) return null;
  return authHeader; // принимаем любой Digest без валидации хэша
}

function isAuthenticated(req) {
  const auth = req.headers['authorization'] || '';
  if (parseDigestAuth(auth)) return true; // Digest — принимаем без проверки
  const basic = parseBasicAuth(auth);
  if (basic) return true; // Basic — принимаем любые креды (мок)
  return false;
}

function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  const nonce = crypto.randomBytes(16).toString('hex');
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': `Digest realm="LAPI", nonce="${nonce}", algorithm=MD5, qop="auth"`,
  });
  res.end(lapiError(401, 'Unauthorized'));
  return false;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ─── Рассылка событий WS клиентам ────────────────────────────────────────────

function buildEvent(type, extra = {}) {
  return {
    EventType: type,
    ChannelID: extra.channelId ?? 1,
    Time: new Date().toISOString(),
    DeviceID: DEVICE_SERIAL,
    ...extra,
  };
}

function broadcastEvent(type, extra = {}) {
  const payload = buildEvent(type, extra);
  const msg = JSON.stringify(payload);
  let sent = 0;

  for (const [id, client] of wsClients) {
    if (client.ws.readyState === 1 /* OPEN */ && client.subscribedToEvents) {
      client.ws.send(msg);
      sent++;
    }
  }

  stats.eventsSent++;
  log(`EVENT [${type}] → ${sent} WS client(s) | payload: ${JSON.stringify(payload)}`);
  return { sent, payload };
}

// ─── HTTP обработчики (LiteAPI) ───────────────────────────────────────────────

function handleLapi(req, res, urlPath, method, body) {
  stats.httpRequests++;

  // ── System/Equipment ──
  if (method === 'GET' && urlPath === '/LAPI/V1.0/System/Equipment') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({
      DeviceType: 'IPC',
      DeviceName: DEVICE_NAME,
      SerialNumber: DEVICE_SERIAL,
      FirmwareVersion: 'MOCK-V1.0.0',
      HardwareVersion: 'MOCK-HW-1.0',
      MacAddress: '00:11:22:33:44:55',
      Resolution: '1920x1080',
    }));
    return;
  }

  // ── LiveViewURL ──
  const liveUrlMatch = urlPath.match(/^\/LAPI\/V1\.0\/Channels\/(\d+)\/Media\/LiveViewURL/);
  if (method === 'GET' && liveUrlMatch) {
    const ch = liveUrlMatch[1];
    const streamParam = new URL('http://x' + urlPath).searchParams.get('StreamType') ?? 'main';
    const streamIdx = streamParam === 'sub' ? 1 : 0;
    const rtspUrl = `rtsp://${MOCK_USERNAME}:${MOCK_PASSWORD}@127.0.0.1:${MOCK_RTSP_PORT}/unicast/c${ch}/s${streamIdx}/live`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({ Url: rtspUrl, StreamType: streamParam }));
    return;
  }

  // ── OpenDoor ──
  const openDoorMatch = urlPath.match(/^\/LAPI\/V1\.0\/Channels\/(\d+)\/OpenDoor/);
  if (method === 'POST' && openDoorMatch) {
    stats.doorOpenCount++;
    log(`DOOR OPENED on channel ${openDoorMatch[1]}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({ Message: 'Door opened' }));
    return;
  }

  // ── IO Relay ──
  const relayMatch = urlPath.match(/^\/LAPI\/V1\.0\/IO\/Outputs\/(\d+)/);
  if (method === 'PUT' && relayMatch) {
    log(`RELAY ${relayMatch[1]} triggered, body:`, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({ Message: 'Relay triggered' }));
    return;
  }

  // ── Channels list (NVR) ──
  if (method === 'GET' && urlPath === '/LAPI/V1.0/Channels/System/DeviceInfo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({
      Channels: [
        { ChannelID: 1, ChannelName: 'Mock Camera 1', Status: 'Online', Resolution: '1920x1080' },
        { ChannelID: 2, ChannelName: 'Mock Camera 2', Status: 'Online', Resolution: '1280x720' },
      ],
    }));
    return;
  }

  // ── Channel detail ──
  if (method === 'GET' && urlPath === '/LAPI/V1.0/Channels/System/ChannelDetailInfo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({
      Channels: [
        { ChannelID: 1, ChannelName: 'Mock Camera 1', Manufacturer: 'Uniview', Model: 'IPC3614SB' },
        { ChannelID: 2, ChannelName: 'Mock Camera 2', Manufacturer: 'Uniview', Model: 'IPC3612SB' },
      ],
    }));
    return;
  }

  // ── Channel basic info ──
  const chInfoMatch = urlPath.match(/^\/LAPI\/V1\.0\/Channels\/(\d+)\/System\/BasicInfo/);
  if (method === 'GET' && chInfoMatch) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({
      ChannelID: parseInt(chInfoMatch[1]),
      ChannelName: `Mock Camera ${chInfoMatch[1]}`,
      Manufacturer: 'Uniview',
      Model: 'IPC3614SB-ADN',
    }));
    return;
  }

  // ── DoorLogs ──
  const doorLogsMatch = urlPath.match(/^\/LAPI\/V1\.0\/Channels\/(\d+)\/DoorLogs/);
  if (method === 'GET' && doorLogsMatch) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({
      DoorLogs: [
        { Time: new Date(Date.now() - 60000).toISOString(), Event: 'DoorOpened', Source: 'Button' },
        { Time: new Date(Date.now() - 300000).toISOString(), Event: 'DoorBell', Source: 'Button' },
      ],
    }));
    return;
  }

  // ── PTZ ──
  if (urlPath.includes('/PTZ/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({ Message: 'PTZ command accepted' }));
    return;
  }

  // ── Snapshot ──
  const snapshotMatch = urlPath.match(/^\/LAPI\/V1\.0\/Channels\/(\d+)\/Media\/Video\/Streams\/(\d+)\/PreviewSnapshot/);
  if (method === 'GET' && snapshotMatch) {
    // Минимальный JPEG (1x1 серый пиксель)
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAA' +
      'AgIBBAMAAAAAAAAAAAAAAQIDBAUREiEx/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEA' +
      'AAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCrpPNxvSLSrVrLpqbtMxlRxn5JZH8eMd' +
      'bYT5IxUWn/2Q==',
      'base64'
    );
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpeg.length });
    res.end(jpeg);
    return;
  }

  // ── Event Subscribe по HTTP (если кто-то попробует) ──
  if (method === 'POST' && urlPath === '/LAPI/V1.0/Event/Subscribe') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(lapiOk({ Message: 'Subscribed via HTTP (use WebSocket for real events)' }));
    return;
  }

  // ── Неизвестный LAPI эндпоинт ──
  log(`LAPI 404: ${method} ${urlPath}`);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(lapiError(404, 'Not Found'));
}

// ─── HTTP обработчик /mock/* (управление мок-сервером) ───────────────────────

async function handleMock(req, res, urlPath, method) {
  if (method === 'POST' && urlPath === '/mock/trigger') {
    const body = await readBody(req);
    const eventType = body.type || body.EventType || 'DoorBell';
    const extra = {};
    if (body.channelId) extra.channelId = body.channelId;
    if (body.inputId) extra.InputID = body.inputId;
    if (body.snapshotUrl) extra.SnapshotURL = body.snapshotUrl;

    const result = broadcastEvent(eventType, extra);

    if (eventType === 'DoorBell' || eventType === 'doorbell' || eventType === 'CallIncoming') {
      stats.doorbellCount++;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      eventType,
      sentToClients: result.sent,
      payload: result.payload,
      tip: result.sent === 0 ? 'Нет WS клиентов. Убедись что бэкенд подключён к ws://HOST:' + PORT : undefined,
    }));
    return;
  }

  if (method === 'GET' && urlPath === '/mock/status') {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      server: DEVICE_NAME,
      serial: DEVICE_SERIAL,
      port: PORT,
      uptime: `${uptime}s`,
      wsClients: wsClients.size,
      stats: {
        httpRequests: stats.httpRequests,
        eventsSent: stats.eventsSent,
        doorbellCount: stats.doorbellCount,
        doorOpenCount: stats.doorOpenCount,
      },
      eventTypes: {
        doorbell: ['DoorBell', 'doorbell', 'CallIncoming', 'call_incoming', 'DoorCall'],
        motion: ['VMD', 'Motion', 'motion', 'VideoMotion', 'VideoMotionDetection'],
        ioAlarm: ['IO', 'IOAlarm', 'io_alarm', 'AlarmInput', 'DigitalInput'],
      },
    }));
    return;
  }

  if (method === 'GET' && urlPath === '/mock/clients') {
    const clients = [...wsClients.entries()].map(([id, c]) => ({
      id,
      subscribedToEvents: c.subscribedToEvents,
      connectedAt: c.connectedAt,
      readyState: c.ws.readyState,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: clients.length, clients }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown mock endpoint' }));
}

// ─── HTTP сервер ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const rawUrl = req.url || '/';
  const urlPath = rawUrl.split('?')[0];

  log(`HTTP ${method} ${rawUrl}`);

  // Управляющие эндпоинты мока — без авторизации
  if (urlPath.startsWith('/mock/')) {
    await handleMock(req, res, urlPath, method);
    return;
  }

  // LAPI эндпоинты — требуют авторизацию
  if (urlPath.startsWith('/LAPI/')) {
    if (!requireAuth(req, res)) return;
    const body = method !== 'GET' ? await readBody(req) : {};
    handleLapi(req, res, urlPath, method, body);
    return;
  }

  // Главная страница — подсказка
  if (urlPath === '/' || urlPath === '/help') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end([
      `Uniview LiteAPI Mock Server — ${DEVICE_NAME} (${DEVICE_SERIAL})`,
      `Порт: ${PORT}`,
      '',
      'Управление:',
      `  GET  http://localhost:${PORT}/mock/status`,
      `  GET  http://localhost:${PORT}/mock/clients`,
      `  POST http://localhost:${PORT}/mock/trigger  {"type":"DoorBell"}`,
      `  POST http://localhost:${PORT}/mock/trigger  {"type":"Motion"}`,
      `  POST http://localhost:${PORT}/mock/trigger  {"type":"IOAlarm","inputId":1}`,
      '',
      'LAPI (с авторизацией):',
      `  GET  http://localhost:${PORT}/LAPI/V1.0/System/Equipment`,
      `  GET  http://localhost:${PORT}/LAPI/V1.0/Channels/1/Media/LiveViewURL`,
      `  POST http://localhost:${PORT}/LAPI/V1.0/Channels/1/OpenDoor`,
      '',
      'WebSocket:',
      `  ws://localhost:${PORT}`,
      '  Subscribe: {"RequestURL":"/LAPI/V1.0/Event/Subscribe","Method":"POST","Cseq":1,"Data":{}}',
    ].join('\n'));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// ─── WebSocket сервер ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const id = ++clientIdCounter;
  const remote = req.socket.remoteAddress + ':' + req.socket.remotePort;
  const clientState = { ws, subscribedToEvents: false, connectedAt: new Date().toISOString() };
  wsClients.set(id, clientState);
  stats.wsConnections++;

  log(`WS CONNECT  client#${id} from ${remote} | total: ${wsClients.size}`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    const reqUrl = msg.RequestURL || '';
    const method = msg.Method || 'GET';
    const cseq = msg.Cseq ?? 0;

    log(`WS MSG      client#${id}: ${method} ${reqUrl} cseq=${cseq}`);

    // ── Event Subscribe ──
    if (reqUrl.includes('/Event/Subscribe') && method === 'POST') {
      clientState.subscribedToEvents = true;
      const response = {
        ResponseURL: reqUrl,
        ResponseCode: 200,
        ResponseString: 'OK',
        Cseq: cseq,
        Data: { SubscribeID: id, Message: 'Subscribed to all events' },
      };
      ws.send(JSON.stringify(response));
      log(`WS SUBSCRIBED client#${id}`);
      return;
    }

    // ── Heartbeat / GetStatus ──
    if (reqUrl.includes('/System/') || method === 'GET') {
      ws.send(JSON.stringify({
        ResponseURL: reqUrl,
        ResponseCode: 200,
        ResponseString: 'OK',
        Cseq: cseq,
        Data: {},
      }));
      return;
    }

    // ── Неизвестный запрос ──
    ws.send(JSON.stringify({
      ResponseURL: reqUrl,
      ResponseCode: 404,
      ResponseString: 'Not Found',
      Cseq: cseq,
      Data: {},
    }));
  });

  ws.on('close', (code, reason) => {
    wsClients.delete(id);
    log(`WS DISCONNECT client#${id} code=${code} | remaining: ${wsClients.size}`);
  });

  ws.on('error', (err) => {
    log(`WS ERROR    client#${id}: ${err.message}`);
    wsClients.delete(id);
  });

  // Приветствие новому клиенту
  ws.send(JSON.stringify({
    EventType: 'Connected',
    Message: `Welcome to ${DEVICE_NAME} mock. Send Event/Subscribe to start receiving events.`,
    DeviceID: DEVICE_SERIAL,
    Time: new Date().toISOString(),
  }));
});

// ─── Автоматические события ───────────────────────────────────────────────────

if (AUTO_DOORBELL_SEC > 0) {
  log(`Auto-DoorBell каждые ${AUTO_DOORBELL_SEC} сек`);
  setInterval(() => {
    stats.doorbellCount++;
    broadcastEvent('DoorBell', { channelId: 1, Note: 'auto-generated' });
  }, AUTO_DOORBELL_SEC * 1000);
}

if (AUTO_MOTION_SEC > 0) {
  log(`Auto-Motion каждые ${AUTO_MOTION_SEC} сек`);
  setInterval(() => {
    broadcastEvent('VMD', { channelId: 1, Note: 'auto-generated' });
  }, AUTO_MOTION_SEC * 1000);
}

// ─── Старт ────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Uniview LiteAPI Mock Server запущен                      `);
  console.log(`║  Устройство : ${DEVICE_NAME} (${DEVICE_SERIAL})`);
  console.log(`║  Адрес      : http://${HOST}:${PORT}`);
  console.log(`║  WebSocket  : ws://${HOST}:${PORT}`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Статус     : GET  /mock/status`);
  console.log(`║  Триггер    : POST /mock/trigger  {"type":"DoorBell"}`);
  console.log(`║  Помощь     : GET  /`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Ожидание подключений...');
  console.log('');
});

server.on('error', (err) => {
  console.error(`Ошибка запуска: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Попробуй: node scripts/uniview-mock.js 8889`);
  }
  process.exit(1);
});
