# Design Spec: Uniview OSD Config + WS URL Fix

**Date:** 2026-05-08  
**Scope:** Backend only + Admin drawer. No Flutter screen.  
**Out of scope:** Panel users (RFID/PIN) — not supported via LiteAPI; requires EGS SDK.

---

## 1. WS URL Fix

### Problem
`uniview-ws-connection.service.ts:68` builds `ws://${device.host}:${device.httpPort}` — no path.  
CLAUDE.md documents the correct path as `ws://{ip}/LAPI/V1.0/Notify/Event`.  
Without the path, the WS handshake likely fails on real Uniview panels.

### Fix
Introduce a constant `WS_EVENT_PATH = '/LAPI/V1.0/Notify/Event'` in `uniview-liteapi-ws.client.ts`.  
In `uniview-ws-connection.service.ts` build:
```
ws://${device.host}:${device.httpPort}/LAPI/V1.0/Notify/Event
```

No configuration parameter needed — path is standard across all Uniview IPC/NVR/Door Station per LiteAPI doc. If a device needs a different path, it will be added as a `Device.wsPath` override column then.

### DoorBell event coverage
`DOORBELL_EVENT_TYPES` already covers `DoorBell`, `doorbell`, `CallIncoming`, `call_incoming`, `DoorCall` — no change needed. After the URL fix, verify on real hardware that `DoorBell` arrives.

---

## 2. OSD Configuration

### LiteAPI endpoints used
| Method | URL | Purpose |
|---|---|---|
| `GET` | `/LAPI/V1.0/Channels/<ID>/Media/OSDs/Capabilities` | Check max items supported |
| `GET` / `PUT` | `/LAPI/V1.0/Channels/<ID>/Media/OSDs/ContentStyle` | Font size, color, date format |
| `GET` / `PUT` | `/LAPI/V1.0/Channels/<ID>/Media/OSDs/Contents` | OSD text items (channel name, datetime) |

OSD `ContentType` values: `1` = Custom text, `2` = Time and date.

### What we write on a device
Two OSD slots on channel 0 (or channel specified via `defaultChannel`):
1. **Slot 0**: ContentType `1` (Custom text), `Value` = device name from DB. Enabled = `1`.
2. **Slot 1**: ContentType `2` (Time and date). Enabled = `1`.
3. `ContentStyle`: FontSize `2` (Medium), Color white (`16777215`), DateFormat `0` (yyyy-MM-dd).

### New methods in `UniviewLiteapiHttpClient`
```typescript
getOsdContents(device: Device, channelId: number): Promise<OsdContentsResponseDto>
setOsdContents(device: Device, channelId: number, contents: OsdContentsDto): Promise<void>
setOsdContentStyle(device: Device, channelId: number, style: OsdStyleDto): Promise<void>
applyDefaultOsd(device: Device, channelName: string): Promise<void>  // composite helper
```

`applyDefaultOsd` uses `device.defaultChannel ?? 0` as channelId, calls `setOsdContentStyle` then `setOsdContents` — called from two places:
1. **Auto on device create**: `DevicesService.create()` calls `applyDefaultOsd(device, device.name)` fire-and-forget (`.catch(logger.warn)`) so it never fails device creation.
2. **Manual via Admin drawer**: `POST /control/:id/apply-osd` endpoint with optional `{ channelName?: string }` body. Defaults to device name.

### New backend endpoint
```
POST /api/control/:id/apply-osd
Body: { channelName?: string }
Auth: JwtAuthGuard, ORG_ADMIN+ only
Response: 204 No Content
```
Added to `ControlController` and `ControlService`.

### Admin drawer addition
In the device drawer (`openDeviceDrawer`), after the existing fields, add a collapsible section **«OSD / Подпись на видео»**:
- Text input pre-filled with device name.
- Button **«Применить OSD»** → calls `POST /control/:id/apply-osd`.
- Success/error shown in `drawerMsg`.
- Only shown when drawer is in **edit mode** (device already saved and has an id).

---

## 3. Panel Users — Explicit Out-of-Scope

Add a comment block to `backend/src/vendors/uniview/uniview-liteapi-http.client.ts` header:

```typescript
// Panel user management (RFID cards, PIN codes, face recognition) is NOT available
// via LiteAPI. Uniview manages access control through the EGS Platform or local device UI.
// If this integration is needed in future, it requires the separate LAPI SDK (not LiteAPI).
```

Remove or rename any dead code references to `PanelResident` if they exist.

---

## 4. Files changed

| File | Change |
|---|---|
| `backend/src/vendors/uniview/uniview-liteapi-ws.client.ts` | Add `WS_EVENT_PATH` constant, export it |
| `backend/src/events/uniview-ws-connection.service.ts` | Append path to wsUrl |
| `backend/src/vendors/uniview/uniview-liteapi-http.client.ts` | Add `getOsdContents`, `setOsdContents`, `setOsdContentStyle`, `applyDefaultOsd`; add out-of-scope comment |
| `backend/src/control/dto/apply-osd.dto.ts` | New — `{ channelName?: string }` |
| `backend/src/control/control.service.ts` | Add `applyOsd(deviceId, dto, user)` |
| `backend/src/control/control.controller.ts` | Add `POST :id/apply-osd` endpoint |
| `backend/src/devices/devices.service.ts` | Call `applyDefaultOsd` fire-and-forget after device create (`UniviewLiteapiHttpClient` already injected via `DevicesModule`) |
| `backend/public/admin.js` | Add OSD section in drawer edit mode |

No new module. No new entity. No Flutter changes.

---

## 5. Error handling

- `applyDefaultOsd` is always fire-and-forget: device create/update does not fail if OSD write fails.
- `/apply-osd` endpoint returns 204 on success, 502 with error message if LiteAPI call fails.
- `getOsdContents` not exposed via API (internal only, for `applyDefaultOsd`).

---

## 6. Tests

- Unit test for `applyDefaultOsd`: mock `request()`, verify correct PUT body with ContentType 1+2.
- Unit test for WS URL: verify `wsUrl` includes `/LAPI/V1.0/Notify/Event` path.
- No e2e tests (require real device).
