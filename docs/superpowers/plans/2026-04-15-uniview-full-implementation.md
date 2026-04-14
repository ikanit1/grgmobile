# Uniview LiteAPI Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Uniview integration: recording/playback from NVR, PTZ camera control, WebSocket auto-reconnect with doorbell call flow, and Flutter screens (live view with media_kit, playback timeline, enhanced events).

**Architecture:** RTSP-centric — backend acts as signaling layer only (REST commands, WebSocket events, FCM push). All media streams flow directly from device to Flutter app via RTSP. Backend never proxies video/audio.

**Tech Stack:** NestJS (backend), Flutter (mobile), media_kit (RTSP player), LiteAPI HTTP (Digest auth), LiteAPI WebSocket (events), FCM (push), Socket.IO (real-time).

**Spec:** `docs/superpowers/specs/2026-04-15-uniview-full-implementation-design.md`

---

## File Map

### Backend — Create:
- `backend/src/control/dto/recordings-query.dto.ts` — DTO for recording search params
- `backend/src/control/dto/ptz-move.dto.ts` — DTO for PTZ movement
- `backend/src/control/dto/ptz-preset.dto.ts` — DTO for PTZ preset goto

### Backend — Modify:
- `backend/src/vendors/uniview/uniview-liteapi-http.client.ts` — add recording + PTZ methods
- `backend/src/vendors/uniview/uniview-liteapi-http.client.spec.ts` — tests for new methods
- `backend/src/events/uniview-ws-connection.service.ts` — auto-reconnect + doorbell handling
- `backend/src/events/event-types.ts` — new event type constants
- `backend/src/events/events.gateway.ts` — connection status event
- `backend/src/control/control.service.ts` — new service methods
- `backend/src/control/control.controller.ts` — new endpoints

### Flutter — Create:
- `lib/widgets/rtsp_player_widget.dart` — reusable RTSP video player
- `lib/screens/live_view_screen.dart` — live view + PTZ + door open + two-way audio
- `lib/screens/playback_screen.dart` — NVR recording playback with timeline

### Flutter — Modify:
- `pubspec.yaml` — add media_kit + wakelock_plus dependencies
- `lib/api/backend_client.dart` — new API methods (recordings, PTZ, playback-url)
- `lib/screens/device_events_screen.dart` — add filters, more event types, real-time
- `lib/screens/incoming_call_screen.dart` — migrate to media_kit, add "Answer" → LiveViewScreen
- `lib/screens/home_screen.dart` — update device tap navigation to LiveViewScreen
- `lib/screens/device_info_backend_screen.dart` — add Live View, Playback, Events navigation buttons

---

## Phase 1: Backend — Vendor Client Extensions

### Task 1: Add new event type constants

**Files:**
- Modify: `backend/src/events/event-types.ts`

- [ ] **Step 1: Add doorbell and connection status event types**

Add after the existing `EVENT_TYPE_UNIVIEW_TAMPER` line at end of file:

```typescript
// Uniview doorbell / intercom events
export const EVENT_TYPE_UNIVIEW_DOORBELL = 'uniview_doorbell';
export const EVENT_TYPE_UNIVIEW_CALL_INCOMING = 'uniview_call_incoming';

// Device connection status
export const EVENT_TYPE_DEVICE_WS_CONNECTED = 'device_ws_connected';
export const EVENT_TYPE_DEVICE_WS_DISCONNECTED = 'device_ws_disconnected';
export const EVENT_TYPE_DEVICE_WS_RECONNECTING = 'device_ws_reconnecting';
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/events/event-types.ts
git commit -m "feat(events): add doorbell and ws connection status event types"
```

---

### Task 2: Add recording/playback methods to HTTP client + tests

**Files:**
- Modify: `backend/src/vendors/uniview/uniview-liteapi-http.client.ts`
- Modify: `backend/src/vendors/uniview/uniview-liteapi-http.client.spec.ts`

- [ ] **Step 1: Write failing tests for getRecordings**

Add to `uniview-liteapi-http.client.spec.ts` after the `triggerRelay` describe block (after line ~229):

```typescript
describe('getRecordings', () => {
  it('returns recording list from Data.RecordInfos', async () => {
    const device = makeDevice();
    const records = [
      { StartTime: '2026-04-15T08:00:00Z', EndTime: '2026-04-15T08:30:00Z', Size: 1024 },
    ];
    httpGet.mockResolvedValueOnce(axiosResp({ Data: { RecordInfos: records } }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getRecordings(device, 1, '2026-04-15T00:00:00Z', '2026-04-15T23:59:59Z');
    expect(result).toEqual(records);
  });

  it('returns empty array on error', async () => {
    const device = makeDevice();
    httpGet.mockRejectedValueOnce({ response: { status: 404 } });
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getRecordings(device, 1);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --verbose 2>&1 | tail -20
```

Expected: FAIL — `client.getRecordings is not a function`

- [ ] **Step 3: Implement getRecordings in HTTP client**

Add to `uniview-liteapi-http.client.ts` after `getSnapshot` method (after line ~226):

```typescript
/**
 * Search recordings on NVR/IPC for a time range.
 * LiteAPI: GET /Channels/{ch}/Record/SearchByTime
 */
async getRecordings(
  device: Device,
  channelId: number,
  from?: string,
  to?: string,
): Promise<unknown[]> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  const params = new URLSearchParams();
  if (from) params.append('StartTime', from);
  if (to) params.append('EndTime', to);
  const qs = params.toString() ? `?${params}` : '';
  try {
    const resp = await this.request(device, 'GET', `/Channels/${ch}/Record/SearchByTime${qs}`);
    return resp?.Data?.RecordInfos ?? resp?.Data?.Records ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern=getRecordings --verbose
```

Expected: PASS

- [ ] **Step 5: Write failing tests for getPlaybackUrl**

Add to spec file:

```typescript
describe('getPlaybackUrl', () => {
  it('constructs RTSP playback URL with time range', async () => {
    const device = makeDevice({ host: '192.168.1.100', rtspPort: 554 });
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc({ username: 'admin', password: 'pass' }));
    const result = await client.getPlaybackUrl(device, 1, '2026-04-15T08:00:00Z', '2026-04-15T08:30:00Z');
    expect(result).toMatch(/^rtsp:\/\//);
    expect(result).toContain('192.168.1.100');
    expect(result).toContain('starttime=');
  });

  it('uses device credentials in URL', async () => {
    const device = makeDevice({ host: '10.0.0.1', rtspPort: 554, username: 'user', password: 'pwd' });
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getPlaybackUrl(device, 2, '2026-04-15T10:00:00Z', '2026-04-15T10:30:00Z');
    expect(result).toContain('user:pwd@');
    expect(result).toContain('/media/video2');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern=getPlaybackUrl --verbose
```

Expected: FAIL — `client.getPlaybackUrl is not a function`

- [ ] **Step 7: Implement getPlaybackUrl**

Add to HTTP client after `getRecordings`:

```typescript
/**
 * Construct RTSP playback URL for NVR/IPC recording.
 * Uniview playback RTSP format: rtsp://user:pass@host:port/media/videoN?starttime=X&endtime=Y
 */
async getPlaybackUrl(
  device: Device,
  channelId: number,
  startTime: string,
  endTime: string,
): Promise<string> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  const { username, password } = this.getAuth(device);
  const host = device.host;
  const port = device.rtspPort ?? 554;
  const start = encodeURIComponent(startTime);
  const end = encodeURIComponent(endTime);
  return `rtsp://${username}:${password}@${host}:${port}/media/video${ch}?starttime=${start}&endtime=${end}`;
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern=getPlaybackUrl --verbose
```

Expected: PASS

- [ ] **Step 9: Write failing test for getRecordingTimeline**

```typescript
describe('getRecordingTimeline', () => {
  it('returns timeline segments from Data.Segments', async () => {
    const device = makeDevice();
    const segments = [
      { StartTime: '2026-04-15T08:00:00Z', EndTime: '2026-04-15T08:30:00Z', Type: 'Normal' },
    ];
    httpGet.mockResolvedValueOnce(axiosResp({ Data: { Segments: segments } }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getRecordingTimeline(device, 1, '2026-04-15');
    expect(result).toEqual(segments);
  });

  it('returns empty array when no data', async () => {
    const device = makeDevice();
    httpGet.mockResolvedValueOnce(axiosResp({ Data: {} }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getRecordingTimeline(device, 1, '2026-04-15');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 10: Implement getRecordingTimeline**

```typescript
/**
 * Get recording timeline for a day (segments with start/end times).
 * LiteAPI: GET /Channels/{ch}/Record/Timeline?Date=YYYY-MM-DD
 */
async getRecordingTimeline(
  device: Device,
  channelId: number,
  date: string,
): Promise<unknown[]> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  try {
    const resp = await this.request(device, 'GET', `/Channels/${ch}/Record/Timeline?Date=${date}`);
    return resp?.Data?.Segments ?? resp?.Data?.Timeline ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 11: Run all recording tests**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern="getRecordings|getPlaybackUrl|getRecordingTimeline" --verbose
```

Expected: ALL PASS

- [ ] **Step 12: Commit**

```bash
cd backend && git add src/vendors/uniview/uniview-liteapi-http.client.ts src/vendors/uniview/uniview-liteapi-http.client.spec.ts
git commit -m "feat(uniview): add recording search, playback URL, timeline methods + tests"
```

---

### Task 3: Add PTZ methods to HTTP client + tests

**Files:**
- Modify: `backend/src/vendors/uniview/uniview-liteapi-http.client.ts`
- Modify: `backend/src/vendors/uniview/uniview-liteapi-http.client.spec.ts`

- [ ] **Step 1: Write failing tests for PTZ methods**

Add to spec file:

```typescript
describe('getPtzCapabilities', () => {
  it('returns capabilities from Data', async () => {
    const device = makeDevice();
    const caps = { Supported: true, PanSupported: true, TiltSupported: true, ZoomSupported: true };
    httpGet.mockResolvedValueOnce(axiosResp({ Data: caps }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getPtzCapabilities(device, 1);
    expect(result).toEqual(caps);
  });

  it('returns { Supported: false } on error', async () => {
    const device = makeDevice();
    httpGet.mockRejectedValueOnce({ response: { status: 404 } });
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getPtzCapabilities(device, 1);
    expect(result).toEqual({ Supported: false });
  });
});

describe('ptzMove', () => {
  it('sends PUT with direction and speed', async () => {
    const device = makeDevice();
    httpPut.mockResolvedValueOnce(axiosResp({ ResponseCode: 0 }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    await client.ptzMove(device, 1, 'left', 50);
    expect(httpPut).toHaveBeenCalled();
    const callArgs = httpPut.mock.calls[0];
    expect(callArgs[0]).toContain('/Channels/1/PTZ/ContinuousMove');
  });
});

describe('ptzStop', () => {
  it('sends PUT with zero speed', async () => {
    const device = makeDevice();
    httpPut.mockResolvedValueOnce(axiosResp({ ResponseCode: 0 }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    await client.ptzStop(device, 1);
    expect(httpPut).toHaveBeenCalled();
    const body = httpPut.mock.calls[0][1];
    expect(body.Pan).toBe(0);
    expect(body.Tilt).toBe(0);
    expect(body.Zoom).toBe(0);
  });
});

describe('getPtzPresets', () => {
  it('returns presets list', async () => {
    const device = makeDevice();
    const presets = [{ ID: 1, Name: 'Home' }, { ID: 2, Name: 'Gate' }];
    httpGet.mockResolvedValueOnce(axiosResp({ Data: { Presets: presets } }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    const result = await client.getPtzPresets(device, 1);
    expect(result).toEqual(presets);
  });
});

describe('gotoPreset', () => {
  it('sends PUT to preset goto endpoint', async () => {
    const device = makeDevice();
    httpPut.mockResolvedValueOnce(axiosResp({ ResponseCode: 0 }));
    const client = new UniviewLiteapiHttpClient(httpSvc, makeCredSvc(null));
    await client.gotoPreset(device, 1, 2);
    expect(httpPut).toHaveBeenCalled();
    expect(httpPut.mock.calls[0][0]).toContain('/Channels/1/PTZ/Presets/2/Goto');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern="ptz|Ptz" --verbose
```

Expected: FAIL — methods not defined

- [ ] **Step 3: Implement all PTZ methods**

Add to `uniview-liteapi-http.client.ts` after recording methods:

```typescript
// ─── PTZ Control ───

/** Check if device supports PTZ. Returns { Supported: boolean, ... } */
async getPtzCapabilities(device: Device, channelId: number): Promise<Record<string, unknown>> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  try {
    const resp = await this.request(device, 'GET', `/Channels/${ch}/PTZ/Capabilities`);
    return resp?.Data ?? { Supported: false };
  } catch {
    return { Supported: false };
  }
}

/**
 * Continuous PTZ movement.
 * direction: 'up' | 'down' | 'left' | 'right' | 'zoomin' | 'zoomout'
 * speed: 1-100
 */
async ptzMove(device: Device, channelId: number, direction: string, speed: number): Promise<void> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  const dirMap: Record<string, { Pan: number; Tilt: number; Zoom: number }> = {
    left:    { Pan: -speed, Tilt: 0, Zoom: 0 },
    right:   { Pan: speed,  Tilt: 0, Zoom: 0 },
    up:      { Pan: 0, Tilt: speed,  Zoom: 0 },
    down:    { Pan: 0, Tilt: -speed, Zoom: 0 },
    zoomin:  { Pan: 0, Tilt: 0, Zoom: speed },
    zoomout: { Pan: 0, Tilt: 0, Zoom: -speed },
  };
  const body = dirMap[direction] ?? { Pan: 0, Tilt: 0, Zoom: 0 };
  await this.request(device, 'PUT', `/Channels/${ch}/PTZ/ContinuousMove`, body);
}

/** Stop PTZ movement. */
async ptzStop(device: Device, channelId: number): Promise<void> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  await this.request(device, 'PUT', `/Channels/${ch}/PTZ/ContinuousMove`, { Pan: 0, Tilt: 0, Zoom: 0 });
}

/** Get list of PTZ presets. */
async getPtzPresets(device: Device, channelId: number): Promise<unknown[]> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  try {
    const resp = await this.request(device, 'GET', `/Channels/${ch}/PTZ/Presets`);
    return resp?.Data?.Presets ?? [];
  } catch {
    return [];
  }
}

/** Move camera to a saved preset position. */
async gotoPreset(device: Device, channelId: number, presetId: number): Promise<void> {
  const ch = channelId ?? device.defaultChannel ?? 1;
  await this.request(device, 'PUT', `/Channels/${ch}/PTZ/Presets/${presetId}/Goto`, {});
}
```

- [ ] **Step 4: Run PTZ tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --testNamePattern="ptz|Ptz" --verbose
```

Expected: ALL PASS

- [ ] **Step 5: Run full spec to verify nothing broken**

```bash
cd backend && npx jest --testPathPattern=uniview-liteapi-http.client.spec.ts --verbose
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/vendors/uniview/uniview-liteapi-http.client.ts src/vendors/uniview/uniview-liteapi-http.client.spec.ts
git commit -m "feat(uniview): add PTZ control methods (capabilities, move, stop, presets, goto) + tests"
```

---

## Phase 2: Backend — API Endpoints

### Task 4: Create DTOs for recordings and PTZ

**Files:**
- Create: `backend/src/control/dto/recordings-query.dto.ts`
- Create: `backend/src/control/dto/ptz-move.dto.ts`
- Create: `backend/src/control/dto/ptz-preset.dto.ts`

- [ ] **Step 1: Create RecordingsQueryDto**

```typescript
// backend/src/control/dto/recordings-query.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RecordingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  channelId?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  date?: string;
}
```

- [ ] **Step 2: Create PtzMoveDto**

```typescript
// backend/src/control/dto/ptz-move.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PtzMoveDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  channelId?: number;

  @IsIn(['up', 'down', 'left', 'right', 'zoomin', 'zoomout'])
  direction: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  speed?: number;
}
```

- [ ] **Step 3: Create PtzPresetDto**

```typescript
// backend/src/control/dto/ptz-preset.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PtzPresetDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  channelId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  presetId: number;
}
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/control/dto/recordings-query.dto.ts src/control/dto/ptz-move.dto.ts src/control/dto/ptz-preset.dto.ts
git commit -m "feat(control): add DTOs for recordings query, PTZ move, and PTZ preset"
```

---

### Task 5: Add recording and PTZ methods to ControlService

**Files:**
- Modify: `backend/src/control/control.service.ts`

- [ ] **Step 1: Add recording service methods**

Add after `getSnapshot` method (after line ~333):

```typescript
// ─── Uniview Recording / Playback ───

async getRecordings(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('Recordings are only supported for Uniview devices');
  }
  const channelId = query.channelId ?? device.defaultChannel ?? 1;
  return this.univiewClient.getRecordings(device, channelId, query.from, query.to);
}

async getPlaybackUrl(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('Playback is only supported for Uniview devices');
  }
  const channelId = query.channelId ?? device.defaultChannel ?? 1;
  if (!query.from || !query.to) {
    throw new BadRequestException('from and to parameters are required for playback URL');
  }
  const url = await this.univiewClient.getPlaybackUrl(device, channelId, query.from, query.to);
  return { url };
}

async getRecordingTimeline(deviceId: number, query: RecordingsQueryDto, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('Recording timeline is only supported for Uniview devices');
  }
  const channelId = query.channelId ?? device.defaultChannel ?? 1;
  const date = query.date ?? new Date().toISOString().split('T')[0];
  return this.univiewClient.getRecordingTimeline(device, channelId, date);
}
```

Add the import at the top:

```typescript
import { RecordingsQueryDto } from './dto/recordings-query.dto';
```

- [ ] **Step 2: Add PTZ service methods**

Add after recording methods:

```typescript
// ─── Uniview PTZ ───

async getPtzCapabilities(deviceId: number, channelId: number | undefined, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    return { Supported: false };
  }
  const ch = channelId ?? device.defaultChannel ?? 1;
  return this.univiewClient.getPtzCapabilities(device, ch);
}

async ptzMove(deviceId: number, dto: PtzMoveDto, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('PTZ is only supported for Uniview devices');
  }
  const ch = dto.channelId ?? device.defaultChannel ?? 1;
  await this.univiewClient.ptzMove(device, ch, dto.direction, dto.speed ?? 50);
  return { success: true };
}

async ptzStop(deviceId: number, channelId: number | undefined, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('PTZ is only supported for Uniview devices');
  }
  const ch = channelId ?? device.defaultChannel ?? 1;
  await this.univiewClient.ptzStop(device, ch);
  return { success: true };
}

async getPtzPresets(deviceId: number, channelId: number | undefined, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    return [];
  }
  const ch = channelId ?? device.defaultChannel ?? 1;
  return this.univiewClient.getPtzPresets(device, ch);
}

async gotoPreset(deviceId: number, dto: PtzPresetDto, user: RequestUser) {
  const device = await this.devicesService.findByIdForUser(deviceId, user);
  if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
    throw new BadRequestException('PTZ is only supported for Uniview devices');
  }
  const ch = dto.channelId ?? device.defaultChannel ?? 1;
  await this.univiewClient.gotoPreset(device, ch, dto.presetId);
  return { success: true };
}
```

Add imports at the top:

```typescript
import { PtzMoveDto } from './dto/ptz-move.dto';
import { PtzPresetDto } from './dto/ptz-preset.dto';
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/control/control.service.ts
git commit -m "feat(control): add recording/playback/PTZ service methods"
```

---

### Task 6: Add recording and PTZ endpoints to ControlController

**Files:**
- Modify: `backend/src/control/control.controller.ts`

- [ ] **Step 1: Add recording endpoints**

Add after the `getSnapshot` endpoint (after line ~140):

```typescript
// ─── Uniview Recording / Playback ───

@Get(':id/recordings')
async getRecordings(
  @Param('id') id: string,
  @Query() query: RecordingsQueryDto,
  @Req() req,
) {
  return this.controlService.getRecordings(+id, query, req.user);
}

@Get(':id/playback-url')
async getPlaybackUrl(
  @Param('id') id: string,
  @Query() query: RecordingsQueryDto,
  @Req() req,
) {
  return this.controlService.getPlaybackUrl(+id, query, req.user);
}

@Get(':id/recording-timeline')
async getRecordingTimeline(
  @Param('id') id: string,
  @Query() query: RecordingsQueryDto,
  @Req() req,
) {
  return this.controlService.getRecordingTimeline(+id, query, req.user);
}
```

- [ ] **Step 2: Add PTZ endpoints**

```typescript
// ─── Uniview PTZ ───

@Get(':id/ptz/capabilities')
async getPtzCapabilities(
  @Param('id') id: string,
  @Query('channelId') channelId: string | undefined,
  @Req() req,
) {
  return this.controlService.getPtzCapabilities(+id, channelId ? +channelId : undefined, req.user);
}

@Post(':id/ptz/move')
async ptzMove(
  @Param('id') id: string,
  @Body() dto: PtzMoveDto,
  @Req() req,
) {
  return this.controlService.ptzMove(+id, dto, req.user);
}

@Post(':id/ptz/stop')
async ptzStop(
  @Param('id') id: string,
  @Body('channelId') channelId: number | undefined,
  @Req() req,
) {
  return this.controlService.ptzStop(+id, channelId, req.user);
}

@Get(':id/ptz/presets')
async getPtzPresets(
  @Param('id') id: string,
  @Query('channelId') channelId: string | undefined,
  @Req() req,
) {
  return this.controlService.getPtzPresets(+id, channelId ? +channelId : undefined, req.user);
}

@Post(':id/ptz/goto-preset')
async gotoPreset(
  @Param('id') id: string,
  @Body() dto: PtzPresetDto,
  @Req() req,
) {
  return this.controlService.gotoPreset(+id, dto, req.user);
}
```

Add imports at the top of the controller file:

```typescript
import { RecordingsQueryDto } from './dto/recordings-query.dto';
import { PtzMoveDto } from './dto/ptz-move.dto';
import { PtzPresetDto } from './dto/ptz-preset.dto';
```

- [ ] **Step 3: Verify build compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/control/control.controller.ts
git commit -m "feat(control): add REST endpoints for recordings, playback, timeline, PTZ"
```

---

## Phase 3: Backend — WebSocket Improvements

### Task 7: Add auto-reconnect to UniviewWsConnectionService

**Files:**
- Modify: `backend/src/events/uniview-ws-connection.service.ts`

- [ ] **Step 1: Add auto-reconnect logic, heartbeat, and connection status**

Replace the entire `uniview-ws-connection.service.ts` with the enhanced version:

```typescript
/**
 * Manages LiteAPI Over WebSocket connections to Uniview devices and forwards events to EventsGateway.
 * Features: auto-reconnect with exponential backoff, heartbeat, doorbell push, connection status.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Device, DeviceType } from '../devices/entities/device.entity';
import { EventsGateway } from './events.gateway';
import { EventLogService } from './event-log.service';
import { PushService } from '../push/push.service';
import { AccessService } from '../access/access.service';
import { UniviewLiteapiWsClient } from '../vendors/uniview/uniview-liteapi-ws.client';
import {
  EVENT_TYPE_UNIVIEW_DOORBELL,
  EVENT_TYPE_DEVICE_WS_CONNECTED,
  EVENT_TYPE_DEVICE_WS_DISCONNECTED,
  EVENT_TYPE_DEVICE_WS_RECONNECTING,
} from './event-types';

const MOTION_EVENT_TYPES = new Set(['VMD', 'Motion', 'motion', 'VideoMotion', 'VideoMotionDetection']);
const IO_ALARM_EVENT_TYPES = new Set(['IO', 'IOAlarm', 'io_alarm', 'AlarmInput', 'DigitalInput']);
const DOORBELL_EVENT_TYPES = new Set(['DoorBell', 'doorbell', 'CallIncoming', 'call_incoming', 'DoorCall']);

const MAX_BACKOFF_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface ConnectionState {
  client: UniviewLiteapiWsClient;
  device: Device;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  backoffMs: number;
  stopped: boolean;
}

@Injectable()
export class UniviewWsConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(UniviewWsConnectionService.name);
  private connections = new Map<number, ConnectionState>();

  constructor(
    private readonly eventsGateway: EventsGateway,
    private readonly eventLogService: EventLogService,
    private readonly pushService: PushService,
    private readonly accessService: AccessService,
  ) {}

  async start(device: Device): Promise<void> {
    if (device.type !== DeviceType.UNIVIEW_IPC && device.type !== DeviceType.UNIVIEW_NVR) {
      return;
    }
    if (this.connections.has(device.id)) {
      return;
    }
    const state: ConnectionState = {
      client: null as any,
      device,
      backoffMs: 1000,
      stopped: false,
    };
    this.connections.set(device.id, state);
    await this.connectDevice(state);
  }

  private async connectDevice(state: ConnectionState): Promise<void> {
    if (state.stopped) return;
    const { device } = state;
    const buildingId = device.buildingId ?? (device.building as any)?.id;
    const wsUrl = `ws://${device.host}:${device.httpPort}`;
    const client = new UniviewLiteapiWsClient(wsUrl);

    client.onEvent((payload) => {
      this.handleEvent(device, buildingId, payload);
    });

    try {
      await client.connect();
      await client.subscribeEvents();
      state.client = client;
      state.backoffMs = 1000; // reset backoff on success

      this.emitConnectionStatus(device.id, buildingId, EVENT_TYPE_DEVICE_WS_CONNECTED);
      this.startHeartbeat(state);
      this.logger.log(`WS connected to device ${device.id} (${device.host})`);
    } catch (e) {
      client.disconnect();
      this.logger.warn(`WS connect failed for device ${device.id}: ${e.message}`);
      this.scheduleReconnect(state);
    }
  }

  private handleEvent(device: Device, buildingId: number | undefined, payload: any): void {
    const eventType = payload?.EventType ?? payload?.type ?? 'EVENT';
    const normalized = {
      time: new Date().toISOString(),
      type: eventType,
      source: device.type,
      payload,
    };

    this.eventLogService.create(device.id, eventType, payload as Record<string, unknown>).catch(() => {});
    this.eventsGateway.emitDeviceEvent(device.id, normalized);
    if (buildingId) {
      this.eventsGateway.emitToHouse(buildingId, normalized);
    }

    if (!buildingId) return;

    this.accessService.getUserIdsWithAccessToBuilding(buildingId).then((userIds) => {
      if (userIds.length === 0) return;
      const p = payload as Record<string, unknown>;
      const snapshotUrl = (p?.SnapshotURL ?? p?.snapshotUrl ?? p?.PictureURL) as string | undefined;
      const channelId = (p?.ChannelID ?? p?.channelId ?? p?.ChannelId) as number | undefined;

      if (DOORBELL_EVENT_TYPES.has(eventType)) {
        this.pushService.sendIncomingCallPush(userIds, {
          apartmentNumber: '',
          buildingName: '',
          deviceId: device.id,
          channelId,
          snapshotUrl,
        }).catch(() => {});
      } else if (MOTION_EVENT_TYPES.has(eventType)) {
        this.pushService.sendMotionPush(userIds, {
          deviceId: device.id,
          channelId,
          snapshotUrl,
          timestamp: normalized.time,
        }).catch(() => {});
      } else if (IO_ALARM_EVENT_TYPES.has(eventType)) {
        const inputId = (p?.InputID ?? p?.inputId ?? p?.Port) as number | string | undefined;
        this.pushService.sendIoAlarmPush(userIds, { deviceId: device.id, inputId }).catch(() => {});
      }
    }).catch(() => {});
  }

  private scheduleReconnect(state: ConnectionState): void {
    if (state.stopped) return;
    const { device } = state;
    const buildingId = device.buildingId ?? (device.building as any)?.id;

    this.emitConnectionStatus(device.id, buildingId, EVENT_TYPE_DEVICE_WS_RECONNECTING);
    this.logger.log(`Scheduling reconnect for device ${device.id} in ${state.backoffMs}ms`);

    state.reconnectTimer = setTimeout(async () => {
      await this.connectDevice(state);
    }, state.backoffMs);

    state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private startHeartbeat(state: ConnectionState): void {
    this.clearHeartbeat(state);
    state.heartbeatTimer = setInterval(() => {
      if (!state.client?.isConnected) {
        this.logger.warn(`Heartbeat: device ${state.device.id} disconnected, reconnecting`);
        this.clearHeartbeat(state);
        const buildingId = state.device.buildingId ?? (state.device.building as any)?.id;
        this.emitConnectionStatus(state.device.id, buildingId, EVENT_TYPE_DEVICE_WS_DISCONNECTED);
        this.scheduleReconnect(state);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(state: ConnectionState): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
  }

  private emitConnectionStatus(deviceId: number, buildingId: number | undefined, status: string): void {
    const payload = { deviceId, status, time: new Date().toISOString() };
    this.eventsGateway.emitDeviceEvent(deviceId, payload);
    if (buildingId) {
      this.eventsGateway.emitToHouse(buildingId, payload);
    }
  }

  stop(deviceId: number): void {
    const state = this.connections.get(deviceId);
    if (state) {
      state.stopped = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      this.clearHeartbeat(state);
      state.client?.disconnect();
      this.connections.delete(deviceId);
    }
  }

  getConnectionStatus(deviceId: number): 'connected' | 'reconnecting' | 'disconnected' {
    const state = this.connections.get(deviceId);
    if (!state) return 'disconnected';
    if (state.client?.isConnected) return 'connected';
    return 'reconnecting';
  }

  onModuleDestroy() {
    this.connections.forEach((state, id) => {
      state.stopped = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      this.clearHeartbeat(state);
      state.client?.disconnect();
    });
    this.connections.clear();
  }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/events/uniview-ws-connection.service.ts src/events/event-types.ts
git commit -m "feat(uniview-ws): auto-reconnect with exponential backoff, heartbeat, doorbell push"
```

---

## Phase 4: Flutter — Foundation

### Task 8: Add media_kit and wakelock_plus dependencies

**Files:**
- Modify: `pubspec.yaml`

- [ ] **Step 1: Add media_kit packages to pubspec.yaml dependencies**

Add to the `dependencies:` section (after existing packages):

```yaml
  media_kit: ^1.1.11
  media_kit_video: ^1.2.5
  media_kit_libs_android_video: ^1.3.6
  media_kit_libs_ios_video: ^1.1.4
  wakelock_plus: ^1.2.8
```

- [ ] **Step 2: Install dependencies**

```bash
cd d:/grgmobileapp && flutter pub get
```

Expected: resolves and downloads packages

- [ ] **Step 3: Initialize media_kit in main.dart**

Read `lib/main.dart` to find the `main()` function. Add `MediaKit.ensureInitialized();` after `WidgetsFlutterBinding.ensureInitialized();`:

```dart
import 'package:media_kit/media_kit.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  // ... rest of main
}
```

- [ ] **Step 4: Commit**

```bash
git add pubspec.yaml pubspec.lock lib/main.dart
git commit -m "feat(flutter): add media_kit and wakelock_plus dependencies"
```

---

### Task 9: Add new API methods to BackendClient

**Files:**
- Modify: `lib/api/backend_client.dart`

- [ ] **Step 1: Add recording API methods**

Add after the existing `getDeviceEvents` method:

```dart
// ─── Recordings / Playback ───

Future<List<Map<String, dynamic>>> getRecordings(int deviceId, {int? channelId, String? from, String? to}) async {
  final params = <String, String>{};
  if (channelId != null) params['channelId'] = channelId.toString();
  if (from != null) params['from'] = from;
  if (to != null) params['to'] = to;
  final qs = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
  final res = await _getWithRetry('devices/$deviceId/recordings${qs.isNotEmpty ? '?$qs' : ''}');
  if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
  final body = jsonDecode(res.body);
  if (body is List) return body.cast<Map<String, dynamic>>();
  return [];
}

Future<String> getPlaybackUrl(int deviceId, {int? channelId, required String from, required String to}) async {
  final params = <String, String>{'from': from, 'to': to};
  if (channelId != null) params['channelId'] = channelId.toString();
  final qs = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
  final res = await _getWithRetry('devices/$deviceId/playback-url?$qs');
  if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
  final body = jsonDecode(res.body);
  return (body['url'] as String?) ?? '';
}

Future<List<Map<String, dynamic>>> getRecordingTimeline(int deviceId, {int? channelId, required String date}) async {
  final params = <String, String>{'date': date};
  if (channelId != null) params['channelId'] = channelId.toString();
  final qs = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
  final res = await _getWithRetry('devices/$deviceId/recording-timeline?$qs');
  if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
  final body = jsonDecode(res.body);
  if (body is List) return body.cast<Map<String, dynamic>>();
  return [];
}
```

- [ ] **Step 2: Add PTZ API methods**

```dart
// ─── PTZ ───

Future<Map<String, dynamic>> getPtzCapabilities(int deviceId, {int? channelId}) async {
  final qs = channelId != null ? '?channelId=$channelId' : '';
  final res = await _getWithRetry('devices/$deviceId/ptz/capabilities$qs');
  if (res.statusCode != 200) return {'Supported': false};
  return jsonDecode(res.body) as Map<String, dynamic>;
}

Future<void> ptzMove(int deviceId, String direction, {int? channelId, int speed = 50}) async {
  final body = <String, dynamic>{'direction': direction, 'speed': speed};
  if (channelId != null) body['channelId'] = channelId;
  final res = await _postWithRetry('devices/$deviceId/ptz/move', body: body);
  if (res.statusCode != 200 && res.statusCode != 201) {
    throw BackendException(_errorMessage(res), res.statusCode);
  }
}

Future<void> ptzStop(int deviceId, {int? channelId}) async {
  final body = <String, dynamic>{};
  if (channelId != null) body['channelId'] = channelId;
  final res = await _postWithRetry('devices/$deviceId/ptz/stop', body: body);
  if (res.statusCode != 200 && res.statusCode != 201) {
    throw BackendException(_errorMessage(res), res.statusCode);
  }
}

Future<List<Map<String, dynamic>>> getPtzPresets(int deviceId, {int? channelId}) async {
  final qs = channelId != null ? '?channelId=$channelId' : '';
  final res = await _getWithRetry('devices/$deviceId/ptz/presets$qs');
  if (res.statusCode != 200) return [];
  final body = jsonDecode(res.body);
  if (body is List) return body.cast<Map<String, dynamic>>();
  return [];
}

Future<void> gotoPreset(int deviceId, int presetId, {int? channelId}) async {
  final body = <String, dynamic>{'presetId': presetId};
  if (channelId != null) body['channelId'] = channelId;
  final res = await _postWithRetry('devices/$deviceId/ptz/goto-preset', body: body);
  if (res.statusCode != 200 && res.statusCode != 201) {
    throw BackendException(_errorMessage(res), res.statusCode);
  }
}
```

- [ ] **Step 3: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/api/backend_client.dart 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/api/backend_client.dart
git commit -m "feat(flutter): add BackendClient methods for recordings, playback, PTZ"
```

---

### Task 10: Create RtspPlayerWidget

**Files:**
- Create: `lib/widgets/rtsp_player_widget.dart`

- [ ] **Step 1: Create the reusable RTSP player widget**

```dart
// lib/widgets/rtsp_player_widget.dart
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Reusable RTSP video player widget using media_kit.
/// Supports live view and playback RTSP streams.
class RtspPlayerWidget extends StatefulWidget {
  final String rtspUrl;
  final bool autoPlay;
  final bool showControls;
  final Widget? overlay;

  const RtspPlayerWidget({
    super.key,
    required this.rtspUrl,
    this.autoPlay = true,
    this.showControls = true,
    this.overlay,
  });

  @override
  State<RtspPlayerWidget> createState() => RtspPlayerWidgetState();
}

class RtspPlayerWidgetState extends State<RtspPlayerWidget> {
  late final Player _player;
  late final VideoController _controller;
  bool _loading = true;
  String? _error;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _openStream();
    WakelockPlus.enable();
  }

  Future<void> _openStream() async {
    try {
      _player.stream.error.listen((error) {
        if (mounted) setState(() => _error = error);
      });
      _player.stream.playing.listen((playing) {
        if (mounted && playing && _loading) {
          setState(() => _loading = false);
        }
      });
      await _player.open(Media(widget.rtspUrl), play: widget.autoPlay);
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  void didUpdateWidget(RtspPlayerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rtspUrl != widget.rtspUrl) {
      setState(() { _loading = true; _error = null; });
      _player.open(Media(widget.rtspUrl), play: widget.autoPlay);
    }
  }

  void toggleMute() {
    setState(() {
      _muted = !_muted;
      _player.setVolume(_muted ? 0 : 100);
    });
  }

  bool get isMuted => _muted;

  @override
  void dispose() {
    WakelockPlus.disable();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        if (_loading)
          const Center(child: CircularProgressIndicator())
        else if (_error != null)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Ошибка видеопотока: $_error',
                style: const TextStyle(color: Colors.red),
                textAlign: TextAlign.center,
              ),
            ),
          )
        else
          Video(controller: _controller, fill: Colors.black),
        if (widget.overlay != null) widget.overlay!,
      ],
    );
  }
}
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/widgets/rtsp_player_widget.dart 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/widgets/rtsp_player_widget.dart
git commit -m "feat(flutter): add RtspPlayerWidget with media_kit for RTSP streaming"
```

---

## Phase 5: Flutter — Screens

### Task 11: Create LiveViewScreen with PTZ and door open

**Files:**
- Create: `lib/screens/live_view_screen.dart`

- [ ] **Step 1: Create LiveViewScreen**

```dart
// lib/screens/live_view_screen.dart
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../widgets/rtsp_player_widget.dart';
import '../theme/app_theme.dart';

class LiveViewScreen extends StatefulWidget {
  final BackendClient client;
  final int deviceId;
  final String deviceName;

  const LiveViewScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<LiveViewScreen> createState() => _LiveViewScreenState();
}

class _LiveViewScreenState extends State<LiveViewScreen> {
  String? _rtspUrl;
  String? _error;
  bool _openDoorLoading = false;
  bool _ptzSupported = false;
  bool _showPtz = false;
  final _playerKey = GlobalKey<RtspPlayerWidgetState>();

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
    _checkPtz();
  }

  Future<void> _loadLiveUrl() async {
    try {
      final url = await widget.client.getLiveUrl(widget.deviceId);
      if (!mounted) return;
      if (url.trim().isEmpty) {
        setState(() => _error = 'Не получен адрес видеопотока');
        return;
      }
      setState(() => _rtspUrl = url.trim());
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _checkPtz() async {
    try {
      final caps = await widget.client.getPtzCapabilities(widget.deviceId);
      if (mounted) {
        setState(() => _ptzSupported = caps['Supported'] == true);
      }
    } catch (_) {}
  }

  Future<void> _openDoor() async {
    setState(() => _openDoorLoading = true);
    try {
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.success ? 'Дверь открыта' : result.message),
          backgroundColor: result.success ? Colors.green : AppColors.danger,
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _openDoorLoading = false);
    }
  }

  Future<void> _ptzMove(String direction) async {
    try {
      await widget.client.ptzMove(widget.deviceId, direction);
    } catch (_) {}
  }

  Future<void> _ptzStop() async {
    try {
      await widget.client.ptzStop(widget.deviceId);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.deviceName),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        actions: [
          if (_ptzSupported)
            IconButton(
              icon: Icon(_showPtz ? Icons.gamepad : Icons.gamepad_outlined),
              onPressed: () => setState(() => _showPtz = !_showPtz),
              tooltip: 'PTZ',
            ),
          IconButton(
            icon: Icon(
              _playerKey.currentState?.isMuted == true ? Icons.volume_off : Icons.volume_up,
            ),
            onPressed: () {
              _playerKey.currentState?.toggleMute();
              setState(() {});
            },
            tooltip: 'Звук',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            flex: 3,
            child: _rtspUrl != null
                ? RtspPlayerWidget(key: _playerKey, rtspUrl: _rtspUrl!)
                : _error != null
                    ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                    : const Center(child: CircularProgressIndicator()),
          ),
          if (_showPtz && _ptzSupported) _buildPtzControls(),
          _buildBottomBar(),
        ],
      ),
    );
  }

  Widget _buildPtzControls() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      color: Colors.black54,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ptzButton(Icons.arrow_upward, 'up'),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ptzButton(Icons.arrow_back, 'left'),
              const SizedBox(width: 48),
              _ptzButton(Icons.arrow_forward, 'right'),
            ],
          ),
          _ptzButton(Icons.arrow_downward, 'down'),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ptzButton(Icons.zoom_in, 'zoomin'),
              const SizedBox(width: 16),
              _ptzButton(Icons.zoom_out, 'zoomout'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _ptzButton(IconData icon, String direction) {
    return GestureDetector(
      onTapDown: (_) => _ptzMove(direction),
      onTapUp: (_) => _ptzStop(),
      onTapCancel: _ptzStop,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Icon(icon, color: Colors.white, size: 32),
      ),
    );
  }

  Widget _buildBottomBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            ElevatedButton.icon(
              onPressed: _openDoorLoading ? null : _openDoor,
              icon: _openDoorLoading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.lock_open),
              label: Text(_openDoorLoading ? 'Открываю...' : 'Открыть дверь'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/live_view_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/live_view_screen.dart
git commit -m "feat(flutter): add LiveViewScreen with media_kit, PTZ, door open"
```

---

### Task 12: Create PlaybackScreen

**Files:**
- Create: `lib/screens/playback_screen.dart`

- [ ] **Step 1: Create PlaybackScreen with date picker and timeline**

```dart
// lib/screens/playback_screen.dart
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../widgets/rtsp_player_widget.dart';

class PlaybackScreen extends StatefulWidget {
  final BackendClient client;
  final int deviceId;
  final String deviceName;

  const PlaybackScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<PlaybackScreen> createState() => _PlaybackScreenState();
}

class _PlaybackScreenState extends State<PlaybackScreen> {
  DateTime _selectedDate = DateTime.now();
  List<Map<String, dynamic>> _timeline = [];
  List<Map<String, dynamic>> _recordings = [];
  bool _loading = false;
  String? _error;
  String? _playbackUrl;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dateStr = _formatDate(_selectedDate);
      final startOfDay = '${dateStr}T00:00:00Z';
      final endOfDay = '${dateStr}T23:59:59Z';
      final results = await Future.wait([
        widget.client.getRecordingTimeline(widget.deviceId, date: dateStr),
        widget.client.getRecordings(widget.deviceId, from: startOfDay, to: endOfDay),
      ]);
      if (mounted) {
        setState(() {
          _timeline = results[0];
          _recordings = results[1];
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _playRecording(String startTime, String endTime) async {
    try {
      final url = await widget.client.getPlaybackUrl(widget.deviceId, from: startTime, to: endTime);
      if (mounted && url.isNotEmpty) {
        setState(() => _playbackUrl = url);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 90)),
      lastDate: DateTime.now(),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
        _playbackUrl = null;
      });
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Записи: ${widget.deviceName}')),
      body: Column(
        children: [
          if (_playbackUrl != null)
            SizedBox(
              height: 240,
              child: RtspPlayerWidget(rtspUrl: _playbackUrl!),
            ),
          _buildDateSelector(),
          if (_loading) const Expanded(child: Center(child: CircularProgressIndicator())),
          if (_error != null)
            Expanded(child: Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))),
          if (!_loading && _error == null) _buildTimelineBar(),
          if (!_loading && _error == null) Expanded(child: _buildRecordingsList()),
        ],
      ),
    );
  }

  Widget _buildDateSelector() {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: OutlinedButton.icon(
        onPressed: _pickDate,
        icon: const Icon(Icons.calendar_today, size: 18),
        label: Text(_formatDate(_selectedDate)),
      ),
    );
  }

  Widget _buildTimelineBar() {
    if (_timeline.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(8),
        child: Text('Нет записей за этот день', style: TextStyle(color: Colors.grey)),
      );
    }
    return Container(
      height: 40,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: CustomPaint(
        painter: _TimelinePainter(_timeline),
        size: Size.infinite,
      ),
    );
  }

  Widget _buildRecordingsList() {
    if (_recordings.isEmpty) {
      return const Center(child: Text('Нет записей'));
    }
    return ListView.separated(
      itemCount: _recordings.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (ctx, i) {
        final r = _recordings[i];
        final start = r['StartTime'] as String? ?? '';
        final end = r['EndTime'] as String? ?? '';
        return ListTile(
          leading: const Icon(Icons.play_circle_outline),
          title: Text('${_timeOnly(start)} — ${_timeOnly(end)}'),
          subtitle: Text(_duration(start, end)),
          onTap: () => _playRecording(start, end),
        );
      },
    );
  }

  String _timeOnly(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  String _duration(String start, String end) {
    try {
      final d = DateTime.parse(end).difference(DateTime.parse(start));
      if (d.inHours > 0) return '${d.inHours}ч ${d.inMinutes % 60}мин';
      return '${d.inMinutes}мин';
    } catch (_) {
      return '';
    }
  }
}

class _TimelinePainter extends CustomPainter {
  final List<Map<String, dynamic>> segments;
  _TimelinePainter(this.segments);

  @override
  void paint(Canvas canvas, Size size) {
    final bgPaint = Paint()..color = Colors.grey.shade300;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    final segPaint = Paint()..color = Colors.blue;
    for (final seg in segments) {
      try {
        final start = DateTime.parse(seg['StartTime'] as String);
        final end = DateTime.parse(seg['EndTime'] as String);
        final startFrac = (start.hour * 60 + start.minute) / 1440;
        final endFrac = (end.hour * 60 + end.minute) / 1440;
        canvas.drawRect(
          Rect.fromLTWH(startFrac * size.width, 0, (endFrac - startFrac) * size.width, size.height),
          segPaint,
        );
      } catch (_) {}
    }

    // Hour labels
    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    for (int h = 0; h <= 24; h += 6) {
      textPainter.text = TextSpan(text: '$h', style: const TextStyle(fontSize: 10, color: Colors.black54));
      textPainter.layout();
      textPainter.paint(canvas, Offset((h / 24) * size.width, size.height - 12));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/playback_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/playback_screen.dart
git commit -m "feat(flutter): add PlaybackScreen with NVR recording timeline and RTSP playback"
```

---

### Task 13: Update DeviceInfoBackendScreen with navigation buttons

**Files:**
- Modify: `lib/screens/device_info_backend_screen.dart`

- [ ] **Step 1: Add imports and navigation buttons for Live View, Playback, Events**

Add imports at top:

```dart
import 'live_view_screen.dart';
import 'playback_screen.dart';
import 'device_events_screen.dart';
```

Add three navigation buttons before the "Жители панели" button in the build method. Insert a row of action buttons after the AppBar/before the ListView:

```dart
// Add as a Card/Row above the info list
Padding(
  padding: const EdgeInsets.all(12),
  child: Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      ActionChip(
        avatar: const Icon(Icons.videocam, size: 18),
        label: const Text('Видео'),
        onPressed: () => Navigator.push(context, MaterialPageRoute(
          builder: (_) => LiveViewScreen(
            client: widget.client,
            deviceId: widget.deviceId,
            deviceName: widget.deviceName,
          ),
        )),
      ),
      ActionChip(
        avatar: const Icon(Icons.history, size: 18),
        label: const Text('Записи'),
        onPressed: () => Navigator.push(context, MaterialPageRoute(
          builder: (_) => PlaybackScreen(
            client: widget.client,
            deviceId: widget.deviceId,
            deviceName: widget.deviceName,
          ),
        )),
      ),
      ActionChip(
        avatar: const Icon(Icons.event_note, size: 18),
        label: const Text('События'),
        onPressed: () => Navigator.push(context, MaterialPageRoute(
          builder: (_) => DeviceEventsScreen(
            client: widget.client,
            deviceId: widget.deviceId,
            deviceName: widget.deviceName,
          ),
        )),
      ),
    ],
  ),
),
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/device_info_backend_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/device_info_backend_screen.dart
git commit -m "feat(flutter): add Live View, Playback, Events navigation to device info screen"
```

---

### Task 14: Enhance DeviceEventsScreen with filters and more event types

**Files:**
- Modify: `lib/screens/device_events_screen.dart`

- [ ] **Step 1: Add event type filter, real-time updates, and more labels**

Replace the full file content:

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/events_socket_service.dart';

class DeviceEventsScreen extends StatefulWidget {
  const DeviceEventsScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<DeviceEventsScreen> createState() => _DeviceEventsScreenState();
}

class _DeviceEventsScreenState extends State<DeviceEventsScreen> {
  List<DeviceEventDto>? _events;
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  StreamSubscription? _eventsSub;

  static const _filters = {
    'all': 'Все',
    'door_open': 'Двери',
    'incoming_call': 'Звонки',
    'motion': 'Движение',
    'alarm': 'Тревоги',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _eventsSub = EventsSocketService.instance.events.listen((event) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _eventsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final events = await widget.client.getDeviceEvents(widget.deviceId, limit: 200);
      if (mounted) setState(() { _events = events; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<DeviceEventDto> get _filteredEvents {
    if (_events == null) return [];
    if (_filter == 'all') return _events!;
    return _events!.where((e) {
      switch (_filter) {
        case 'door_open': return e.type.contains('door_open') || e.type.contains('DOOR_OPEN');
        case 'incoming_call': return e.type.contains('incoming_call') || e.type.contains('doorbell') || e.type.contains('DoorBell');
        case 'motion': return e.type.contains('motion') || e.type.contains('Motion') || e.type.contains('VMD');
        case 'alarm': return e.type.contains('alarm') || e.type.contains('Alarm') || e.type.contains('IO');
        default: return true;
      }
    }).toList();
  }

  String _eventTypeLabel(String type) {
    final lower = type.toLowerCase();
    if (lower.contains('door_open')) return 'Открытие двери';
    if (lower.contains('incoming_call') || lower.contains('doorbell') || lower.contains('doorcall')) return 'Входящий звонок';
    if (lower.contains('motion') || lower.contains('vmd')) return 'Движение';
    if (lower.contains('alarm') || lower.contains('io')) return 'Тревога';
    if (lower.contains('tamper')) return 'Вскрытие';
    return type;
  }

  IconData _eventIcon(String type) {
    final lower = type.toLowerCase();
    if (lower.contains('door_open')) return Icons.door_front_door;
    if (lower.contains('incoming_call') || lower.contains('doorbell')) return Icons.phone_callback;
    if (lower.contains('motion') || lower.contains('vmd')) return Icons.directions_run;
    if (lower.contains('alarm') || lower.contains('io')) return Icons.warning_amber;
    if (lower.contains('tamper')) return Icons.security;
    return Icons.event_note;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredEvents;
    return Scaffold(
      appBar: AppBar(title: Text('События: ${widget.deviceName}')),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(8),
            child: Row(
              children: _filters.entries.map((entry) {
                final selected = _filter == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(entry.value),
                    selected: selected,
                    onSelected: (_) => setState(() => _filter = entry.key),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, style: const TextStyle(color: Colors.red)),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _load, child: const Text('Повторить')),
                        ],
                      ))
                    : filtered.isEmpty
                        ? const Center(child: Text('Нет событий'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              itemCount: filtered.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (ctx, i) {
                                final e = filtered[i];
                                return ListTile(
                                  leading: Icon(_eventIcon(e.type)),
                                  title: Text(_eventTypeLabel(e.type)),
                                  subtitle: Text(e.time.isNotEmpty ? e.time : '—'),
                                  trailing: Text(e.source, style: Theme.of(context).textTheme.bodySmall),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/device_events_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/device_events_screen.dart
git commit -m "feat(flutter): enhance DeviceEventsScreen with filters, more event types, real-time"
```

---

### Task 15: Update IncomingCallScreen to use media_kit

**Files:**
- Modify: `lib/screens/incoming_call_screen.dart`

- [ ] **Step 1: Replace video_player with media_kit and add "Answer" → LiveViewScreen**

Replace the full file. Key changes:
- Import `media_kit` / `media_kit_video` instead of `video_player`
- "Принять" navigates to `LiveViewScreen`
- Timeout auto-dismiss after 60 seconds

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import 'live_view_screen.dart';

class IncomingCallScreen extends StatefulWidget {
  final int deviceId;
  final String? buildingName;
  final String? apartmentNumber;
  final BackendClient client;
  final VoidCallback onDismiss;

  const IncomingCallScreen({
    super.key,
    required this.deviceId,
    required this.client,
    required this.onDismiss,
    this.buildingName,
    this.apartmentNumber,
  });

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  Player? _player;
  VideoController? _videoController;
  bool _loadingVideo = true;
  bool _openDoorLoading = false;
  Timer? _timeout;

  @override
  void initState() {
    super.initState();
    _loadPreview();
    _timeout = Timer(const Duration(seconds: 60), () {
      if (mounted) widget.onDismiss();
    });
  }

  Future<void> _loadPreview() async {
    try {
      final url = await widget.client.getLiveUrl(widget.deviceId);
      if (!mounted || url.trim().isEmpty) {
        setState(() => _loadingVideo = false);
        return;
      }
      _player = Player();
      _videoController = VideoController(_player!);
      _player!.stream.playing.listen((playing) {
        if (mounted && playing && _loadingVideo) {
          setState(() => _loadingVideo = false);
        }
      });
      await _player!.open(Media(url.trim()), play: true);
      _player!.setVolume(0); // muted preview
    } catch (_) {
      if (mounted) setState(() => _loadingVideo = false);
    }
  }

  @override
  void dispose() {
    _timeout?.cancel();
    _player?.dispose();
    super.dispose();
  }

  Future<void> _openDoor() async {
    setState(() => _openDoorLoading = true);
    try {
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.success ? 'Дверь открыта' : result.message),
          backgroundColor: result.success ? Colors.green : AppColors.danger,
        ),
      );
      if (result.success) widget.onDismiss();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _openDoorLoading = false);
    }
  }

  void _answer() {
    widget.onDismiss();
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => LiveViewScreen(
        client: widget.client,
        deviceId: widget.deviceId,
        deviceName: widget.buildingName ?? 'Домофон',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (widget.buildingName != null && widget.buildingName!.isNotEmpty) widget.buildingName,
      if (widget.apartmentNumber != null && widget.apartmentNumber!.isNotEmpty) 'кв. ${widget.apartmentNumber}',
    ].join(' · ');

    return Material(
      color: Colors.black87,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.door_front_door, color: AppColors.purple, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Входящий звонок',
                          style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                        if (subtitle.isNotEmpty)
                          Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 14)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: Center(child: _buildVideoArea())),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _actionButton(icon: Icons.call_end, label: 'Сбросить', color: AppColors.danger, onPressed: widget.onDismiss),
                  _actionButton(icon: Icons.lock_open, label: _openDoorLoading ? '...' : 'Открыть', color: AppColors.success, onPressed: _openDoorLoading ? null : _openDoor),
                  _actionButton(icon: Icons.videocam, label: 'Ответить', color: AppColors.purple, onPressed: _answer),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVideoArea() {
    if (_loadingVideo && _videoController == null) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: AppColors.purple),
          SizedBox(height: 16),
          Text('Загрузка видео...', style: TextStyle(color: Colors.white70)),
        ],
      );
    }
    if (_videoController != null) {
      return AspectRatio(aspectRatio: 16 / 9, child: Video(controller: _videoController!, fill: Colors.black));
    }
    return const Icon(Icons.videocam_off, size: 64, color: Colors.white38);
  }

  Widget _actionButton({required IconData icon, required String label, required Color color, required VoidCallback? onPressed}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton.filled(
          onPressed: onPressed,
          icon: Icon(icon),
          style: IconButton.styleFrom(
            backgroundColor: color.withValues(alpha: 0.3),
            foregroundColor: color,
            padding: const EdgeInsets.all(16),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}
```

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/incoming_call_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/incoming_call_screen.dart
git commit -m "feat(flutter): migrate IncomingCallScreen to media_kit, add Answer→LiveView, 60s timeout"
```

---

### Task 16: Update HomeScreen device navigation

**Files:**
- Modify: `lib/screens/home_screen.dart`

- [ ] **Step 1: Update device tap to navigate to LiveViewScreen instead of DoorControlBackendScreen**

Find the device tap handler in `_BuildingDevicesScreen` (around lines 800-850) where it navigates to `DoorControlBackendScreen`. Change it to navigate to `LiveViewScreen`:

Add import at top:

```dart
import 'live_view_screen.dart';
```

Change the `onTap` callback from:

```dart
builder: (_) => DoorControlBackendScreen(
```

to:

```dart
builder: (_) => LiveViewScreen(
```

The constructor params are the same: `client`, `deviceId`, `deviceName`.

- [ ] **Step 2: Verify Flutter analyzes clean**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/home_screen.dart 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/screens/home_screen.dart
git commit -m "feat(flutter): update device tap to open LiveViewScreen instead of DoorControlBackendScreen"
```

---

### Task 17: Final build verification

- [ ] **Step 1: Run full backend build**

```bash
cd d:/grgmobileapp/backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run all backend tests**

```bash
cd d:/grgmobileapp/backend && npx jest --verbose 2>&1 | tail -30
```

Expected: all pass

- [ ] **Step 3: Run Flutter analyze**

```bash
cd d:/grgmobileapp && flutter analyze 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 4: Commit any fixes if needed, then tag completion**

```bash
git add -A
git commit -m "chore: fix any lint/build issues from full Uniview implementation"
```
