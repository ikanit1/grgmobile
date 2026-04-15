# go2rtc NAT Traversal + Sub-stream Network Selection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Uniview video streams accessible outside LAN via go2rtc HLS proxy, and automatically switch to sub-stream (lower bitrate) on mobile networks.

**Architecture:** go2rtc runs as a Docker sidecar; the backend registers RTSP streams on-demand and returns both `rtspUrl` (direct, for LAN) and `hlsUrl` (via go2rtc, for WAN) in the `getLiveUrl` response. Flutter's `StreamQualityService` detects connectivity (WiFi vs cellular) and picks `stream=sub` + HLS on cellular, `stream=main` + direct RTSP on WiFi. Graceful degradation: if `GO2RTC_URL` is not configured, `hlsUrl` is omitted and only RTSP is returned.

**Tech Stack:** NestJS + @nestjs/axios (Go2rtcClient), go2rtc v1.9 (Docker), connectivity_plus (Flutter), media_kit (HLS + RTSP playback).

**Important context from existing code:**
- Backend `getLiveUrl` already supports `stream=main|sub` via `LiveUrlQueryDto` — passes to Uniview LiteAPI as `StreamType=main|sub`
- Backend returns `{ protocol: 'rtsp', url: string }` — we add `hlsUrl?: string`
- Flutter `BackendClient.getLiveUrl(deviceId, {stream})` returns `String` — we migrate to `LiveUrlDto`
- `ControlModule` uses `HttpModule.register({ timeout: 10000 })` — `Go2rtcClient` will use the same `HttpService`

---

## File Map

### Backend — Create:
- `backend/src/vendors/go2rtc/go2rtc.client.ts` — injectable service: register/delete RTSP streams, return HLS URL, health check
- `backend/go2rtc.yaml` — go2rtc config: API on :1984, RTSP on :8554, log level warn

### Backend — Modify:
- `backend/docker-compose.yml` — add go2rtc service (image: `alexxit/go2rtc`, port 1984)
- `backend/.env.example` — add `GO2RTC_URL`, `GO2RTC_PUBLIC_URL`
- `backend/src/control/control.module.ts` — add `Go2rtcClient` to providers
- `backend/src/control/control.service.ts` — update `getLiveUrl` to call `Go2rtcClient.ensureStream()` and return `hlsUrl`

### Flutter — Create:
- `lib/services/stream_quality_service.dart` — singleton: detects connectivity, returns `StreamPreference { streamType, preferHls }`
- `lib/models/live_url_dto.dart` — `LiveUrlDto { rtspUrl, hlsUrl? }`

### Flutter — Modify:
- `pubspec.yaml` — add `connectivity_plus: ^6.0.0`
- `lib/api/backend_client.dart` — update `getLiveUrl` to return `LiveUrlDto`
- `lib/screens/live_view_screen.dart` — use `StreamQualityService`, pick `hlsUrl` on cellular, reconnect on network change
- `lib/screens/incoming_call_screen.dart` — use `StreamQualityService` for `stream=sub` on cellular

---

## Phase 1: go2rtc Infrastructure

### Task 1: Add go2rtc to docker-compose and create config

**Files:**
- Modify: `backend/docker-compose.yml`
- Create: `backend/go2rtc.yaml`

- [ ] **Step 1: Create go2rtc config**

Create `backend/go2rtc.yaml`:

```yaml
api:
  listen: :1984

rtsp:
  listen: :8554

log:
  level: warn
```

- [ ] **Step 2: Add go2rtc service to docker-compose.yml**

Current `backend/docker-compose.yml` has only `postgres`. Add go2rtc after it:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: doorphone-postgres
    environment:
      POSTGRES_DB: doorphone
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - doorphone_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d doorphone"]
      interval: 5s
      timeout: 5s
      retries: 20

  go2rtc:
    image: alexxit/go2rtc:latest
    container_name: doorphone-go2rtc
    restart: unless-stopped
    ports:
      - "1984:1984"   # HTTP API + HLS
      - "8554:8554"   # RTSP re-stream
    volumes:
      - ./go2rtc.yaml:/config/go2rtc.yaml:ro
    environment:
      - GO2RTC_CONFIG=/config/go2rtc.yaml

volumes:
  doorphone_postgres_data:
```

- [ ] **Step 3: Add env vars to .env.example**

Add after existing vars in `backend/.env.example`:

```bash
# go2rtc media server (optional — enables HLS proxy for WAN access)
# Internal URL used by backend to register streams (Docker internal address)
GO2RTC_URL=http://localhost:1984
# Public URL returned to Flutter clients for HLS playback
# In production: set to your public domain, e.g. https://media.your-domain.com
GO2RTC_PUBLIC_URL=http://localhost:1984
```

- [ ] **Step 4: Commit**

```bash
cd d:/grgmobileapp && git add backend/docker-compose.yml backend/go2rtc.yaml backend/.env.example
git commit -m "feat(go2rtc): add go2rtc media server to docker-compose"
```

---

### Task 2: Create Go2rtcClient NestJS service

**Files:**
- Create: `backend/src/vendors/go2rtc/go2rtc.client.ts`
- Modify: `backend/src/control/control.module.ts`

- [ ] **Step 1: Create Go2rtcClient**

Create `backend/src/vendors/go2rtc/go2rtc.client.ts`:

```typescript
/**
 * HTTP client for go2rtc media server REST API.
 * Registers Uniview RTSP streams on demand, returns HLS URLs for WAN access.
 * Docs: https://github.com/AlexxIT/go2rtc/tree/master/api
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class Go2rtcClient {
  private readonly logger = new Logger(Go2rtcClient.name);
  private readonly internalUrl: string | null;
  private readonly publicUrl: string | null;

  constructor(@Optional() private readonly http: HttpService) {
    this.internalUrl = process.env.GO2RTC_URL ?? null;
    this.publicUrl = process.env.GO2RTC_PUBLIC_URL ?? null;
  }

  get isConfigured(): boolean {
    return !!this.internalUrl && !!this.publicUrl;
  }

  /**
   * Ensure an RTSP stream is registered in go2rtc.
   * Idempotent — safe to call on every getLiveUrl request.
   * @param name  Stream name, e.g. "device_5_ch1_main"
   * @param rtspUrl  Full RTSP URL including credentials, e.g. "rtsp://user:pass@192.168.1.100:554/..."
   */
  async ensureStream(name: string, rtspUrl: string): Promise<void> {
    if (!this.isConfigured || !this.http) return;
    try {
      await firstValueFrom(
        this.http.put(`${this.internalUrl}/api/streams`, { [name]: [rtspUrl] }),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`go2rtc ensureStream "${name}" failed: ${msg}`);
      // Non-fatal — caller falls back to direct RTSP
    }
  }

  /**
   * Remove a stream from go2rtc (call on device delete).
   */
  async deleteStream(name: string): Promise<void> {
    if (!this.isConfigured || !this.http) return;
    try {
      await firstValueFrom(
        this.http.delete(`${this.internalUrl}/api/streams?name=${encodeURIComponent(name)}`),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`go2rtc deleteStream "${name}" failed: ${msg}`);
    }
  }

  /**
   * Return the public HLS playlist URL for a registered stream.
   * Flutter uses this URL with media_kit to play HLS over WAN.
   */
  getHlsUrl(name: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/api/stream.m3u8?src=${encodeURIComponent(name)}`;
  }

  /**
   * Build a canonical stream name from device ID, channel, and stream type.
   */
  static streamName(deviceId: number, channel: number, streamType: string): string {
    return `device_${deviceId}_ch${channel}_${streamType}`;
  }
}
```

- [ ] **Step 2: Add Go2rtcClient to ControlModule**

In `backend/src/control/control.module.ts`, add `Go2rtcClient` to providers:

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { EventsController } from '../events/events.controller';
import { OpenDoorRateLimitGuard } from './open-door-rate-limit.guard';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { AccessModule } from '../access/access.module';
import { PushModule } from '../push/push.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AkuvoxClient } from '../vendors/akuvox/akuvox.client';
import { UniviewLiteapiHttpClient } from '../vendors/uniview/uniview-liteapi-http.client';
import { Go2rtcClient } from '../vendors/go2rtc/go2rtc.client';
import { Device } from '../devices/entities/device.entity';

const HTTP_TIMEOUT_MS = 10000;

@Module({
  imports: [
    HttpModule.register({ timeout: HTTP_TIMEOUT_MS }),
    DevicesModule,
    EventsModule,
    AccessModule,
    PushModule,
    CredentialsModule,
    TypeOrmModule.forFeature([Device]),
  ],
  controllers: [ControlController, EventsController],
  providers: [ControlService, AkuvoxClient, UniviewLiteapiHttpClient, Go2rtcClient, OpenDoorRateLimitGuard],
})
export class ControlModule {}
```

- [ ] **Step 3: Verify TypeScript build**

```bash
cd d:/grgmobileapp/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd d:/grgmobileapp/backend && git add src/vendors/go2rtc/go2rtc.client.ts src/control/control.module.ts
git commit -m "feat(go2rtc): add Go2rtcClient NestJS service"
```

---

### Task 3: Update getLiveUrl to return hlsUrl

**Files:**
- Modify: `backend/src/control/control.service.ts`

The current `getLiveUrl` in `control.service.ts`:
```typescript
async getLiveUrl(deviceId: number, query: LiveUrlQueryDto, user: RequestUser) {
  const device = await this.devicesService.findById(deviceId);
  await this.accessService.assertCanAccessDevice(user, device.buildingId);
  switch (device.type) {
    case DeviceType.AKUVOX:
      return this.akuvoxClient.getLiveUrl(device, query);
    case DeviceType.UNIVIEW_IPC:
    case DeviceType.UNIVIEW_NVR:
      return this.univiewClient.getLiveUrl(device, query);
    default:
      throw new BadRequestException('Тип устройства не поддерживает получение видеопотока');
  }
}
```

Currently returns `{ protocol: 'rtsp', url: string }`. We add `hlsUrl?`.

- [ ] **Step 1: Inject Go2rtcClient in ControlService and update getLiveUrl**

In `backend/src/control/control.service.ts`, find the constructor and add `Go2rtcClient`. Then update `getLiveUrl`:

Add import at top:
```typescript
import { Go2rtcClient } from '../vendors/go2rtc/go2rtc.client';
```

Add `private readonly go2rtcClient: Go2rtcClient` to constructor parameters (inject alongside existing services).

Replace `getLiveUrl` method body with:

```typescript
async getLiveUrl(deviceId: number, query: LiveUrlQueryDto, user: RequestUser) {
  const device = await this.devicesService.findById(deviceId);
  await this.accessService.assertCanAccessDevice(user, device.buildingId);

  let result: { protocol: string; url: string };
  switch (device.type) {
    case DeviceType.AKUVOX:
      result = await this.akuvoxClient.getLiveUrl(device, query);
      break;
    case DeviceType.UNIVIEW_IPC:
    case DeviceType.UNIVIEW_NVR:
      result = await this.univiewClient.getLiveUrl(device, query);
      break;
    default:
      throw new BadRequestException('Тип устройства не поддерживает получение видеопотока');
  }

  // Register stream in go2rtc and return HLS URL for WAN access
  let hlsUrl: string | undefined;
  if (this.go2rtcClient.isConfigured && result.url) {
    const channel = query.channel ?? device.defaultChannel ?? 1;
    const streamType = query.stream ?? device.defaultStream ?? 'main';
    const streamName = Go2rtcClient.streamName(deviceId, channel, streamType);
    await this.go2rtcClient.ensureStream(streamName, result.url);
    hlsUrl = this.go2rtcClient.getHlsUrl(streamName) ?? undefined;
  }

  return { ...result, hlsUrl };
}
```

- [ ] **Step 2: Verify TypeScript build**

```bash
cd d:/grgmobileapp/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Run tests**

```bash
cd d:/grgmobileapp/backend && npm test 2>&1 | tail -10
```

Expected: 55/55 pass (go2rtc is optional, no tests break)

- [ ] **Step 4: Commit**

```bash
cd d:/grgmobileapp/backend && git add src/control/control.service.ts
git commit -m "feat(go2rtc): register streams on getLiveUrl, return hlsUrl alongside rtspUrl"
```

---

## Phase 2: Flutter — Sub-stream + Connectivity

### Task 4: Add connectivity_plus and LiveUrlDto

**Files:**
- Modify: `pubspec.yaml`
- Create: `lib/models/live_url_dto.dart`

- [ ] **Step 1: Add connectivity_plus to pubspec.yaml**

In `d:/grgmobileapp/pubspec.yaml`, add after `wakelock_plus`:

```yaml
  connectivity_plus: ^6.0.0
```

- [ ] **Step 2: Run flutter pub get**

```bash
cd d:/grgmobileapp && flutter pub get
```

Expected: resolves without conflicts

- [ ] **Step 3: Create LiveUrlDto model**

Create `d:/grgmobileapp/lib/models/live_url_dto.dart`:

```dart
/// Response from GET /devices/:id/live-url
/// Backend returns both direct RTSP (LAN) and go2rtc HLS (WAN) URLs.
class LiveUrlDto {
  /// Direct RTSP URL: rtsp://user:pass@host:554/...
  /// Works on LAN; may not be reachable over cellular/internet.
  final String rtspUrl;

  /// HLS URL via go2rtc proxy: http://server:1984/api/stream.m3u8?src=...
  /// Works over WAN; null if go2rtc not configured on server.
  final String? hlsUrl;

  const LiveUrlDto({required this.rtspUrl, this.hlsUrl});

  factory LiveUrlDto.fromJson(Map<String, dynamic> json) {
    return LiveUrlDto(
      rtspUrl: json['url'] as String? ?? '',
      hlsUrl: json['hlsUrl'] as String?,
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd d:/grgmobileapp && git add pubspec.yaml pubspec.lock lib/models/live_url_dto.dart
git commit -m "feat(flutter): add connectivity_plus, LiveUrlDto model"
```

---

### Task 5: Create StreamQualityService

**Files:**
- Create: `lib/services/stream_quality_service.dart`

The service detects connectivity type and exposes:
- `streamType` — `'main'` on WiFi/ethernet, `'sub'` on cellular
- `preferHls` — `true` on cellular (WAN likely), `false` on WiFi (LAN likely)
- `onChanged` stream — emits when connectivity changes so screens can restart the player

- [ ] **Step 1: Create the service**

Create `d:/grgmobileapp/lib/services/stream_quality_service.dart`:

```dart
import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Detects network connectivity type and returns stream quality preferences.
///
/// Usage:
///   final pref = await StreamQualityService.instance.getPreference();
///   // pref.streamType == 'sub'  → pass stream='sub' to getLiveUrl
///   // pref.preferHls == true    → use hlsUrl if available
class StreamQualityService {
  StreamQualityService._();
  static final StreamQualityService instance = StreamQualityService._();

  final _connectivity = Connectivity();
  final _controller = StreamController<StreamPreference>.broadcast();

  StreamSubscription? _sub;

  /// Broadcast stream — emits when connectivity changes.
  Stream<StreamPreference> get onChanged => _controller.stream;

  /// Start listening for connectivity changes (call once from main.dart or app init).
  void startListening() {
    _sub ??= _connectivity.onConnectivityChanged.listen((results) {
      _controller.add(_fromResults(results));
    });
  }

  void dispose() {
    _sub?.cancel();
    _controller.close();
  }

  /// Returns current network-based stream preference (async, one-time check).
  Future<StreamPreference> getPreference() async {
    final results = await _connectivity.checkConnectivity();
    return _fromResults(results);
  }

  StreamPreference _fromResults(List<ConnectivityResult> results) {
    final isCellular = results.contains(ConnectivityResult.mobile) &&
        !results.contains(ConnectivityResult.wifi) &&
        !results.contains(ConnectivityResult.ethernet);
    return StreamPreference(
      streamType: isCellular ? 'sub' : 'main',
      preferHls: isCellular,
    );
  }
}

class StreamPreference {
  final String streamType; // 'main' or 'sub'
  final bool preferHls;    // true → use hlsUrl when available

  const StreamPreference({required this.streamType, required this.preferHls});
}
```

- [ ] **Step 2: Start listening in main.dart**

In `d:/grgmobileapp/lib/main.dart`, add `StreamQualityService.instance.startListening()` after `MediaKit.ensureInitialized()`:

Current `main.dart`:
```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'screens/app_root.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase not configured
  }
  runApp(const DoorPhoneApp());
}
```

Replace with:
```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'screens/app_root.dart';
import 'services/stream_quality_service.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  StreamQualityService.instance.startListening();
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase not configured
  }
  runApp(const DoorPhoneApp());
}
```

- [ ] **Step 3: Verify flutter analyze**

```bash
cd d:/grgmobileapp && flutter analyze lib/services/stream_quality_service.dart lib/main.dart 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd d:/grgmobileapp && git add lib/services/stream_quality_service.dart lib/main.dart
git commit -m "feat(flutter): add StreamQualityService — auto sub-stream on cellular"
```

---

### Task 6: Update BackendClient.getLiveUrl to return LiveUrlDto

**Files:**
- Modify: `lib/api/backend_client.dart`

Current signature:
```dart
Future<String> getLiveUrl(int deviceId, {int? channel, String? stream}) async {
  // ...
  final url = data['url'] as String? ?? data['liveUrl'] as String? ?? '';
  return url;
}
```

- [ ] **Step 1: Update getLiveUrl signature and return type**

Add import at top of `lib/api/backend_client.dart` (with other model imports):
```dart
import '../models/live_url_dto.dart';
```

Find and replace the `getLiveUrl` method:

Old:
```dart
  Future<String> getLiveUrl(int deviceId, {int? channel, String? stream}) async {
    var path = 'devices/$deviceId/live-url';
    final q = <String>[];
    if (channel != null) q.add('channel=$channel');
    if (stream != null) q.add('stream=${Uri.encodeComponent(stream)}');
    if (q.isNotEmpty) path += '?${q.join('&')}';
    final res = await _getWithRetry(path);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final url = data['url'] as String? ?? data['liveUrl'] as String? ?? '';
    return url;
  }
```

New:
```dart
  Future<LiveUrlDto> getLiveUrl(int deviceId, {int? channel, String? stream}) async {
    var path = 'devices/$deviceId/live-url';
    final q = <String>[];
    if (channel != null) q.add('channel=$channel');
    if (stream != null) q.add('stream=${Uri.encodeComponent(stream)}');
    if (q.isNotEmpty) path += '?${q.join('&')}';
    final res = await _getWithRetry(path);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return LiveUrlDto.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
```

- [ ] **Step 2: Check flutter analyze for compile errors**

```bash
cd d:/grgmobileapp && flutter analyze lib/api/backend_client.dart 2>&1 | tail -10
```

If callers break (IncomingCallScreen, LiveViewScreen) — those will be fixed in Tasks 7–8. The analyze errors in those screens are expected at this step.

- [ ] **Step 3: Commit backend_client change**

```bash
cd d:/grgmobileapp && git add lib/api/backend_client.dart lib/models/live_url_dto.dart
git commit -m "feat(flutter): update getLiveUrl to return LiveUrlDto with rtspUrl + hlsUrl"
```

---

### Task 7: Update LiveViewScreen — HLS fallback + connectivity-aware stream

**Files:**
- Modify: `lib/screens/live_view_screen.dart`

Key changes:
1. In `initState()` — check connectivity to pick `stream=main|sub`
2. In `_loadLiveUrl()` — pick `hlsUrl` on cellular, `rtspUrl` on WiFi
3. Add `_connectivitySub` — restart stream on network change

- [ ] **Step 1: Rewrite _loadLiveUrl and add connectivity handling**

Replace the full `live_view_screen.dart`:

```dart
// lib/screens/live_view_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/stream_quality_service.dart';
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
  String? _streamUrl;
  String? _error;
  bool _openDoorLoading = false;
  bool _ptzSupported = false;
  bool _showPtz = false;
  final _playerKey = GlobalKey<RtspPlayerWidgetState>();
  StreamSubscription? _connectivitySub;

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
    _checkPtz();
    // Restart stream automatically on network type change
    _connectivitySub = StreamQualityService.instance.onChanged.listen((_) {
      if (mounted) _loadLiveUrl();
    });
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    super.dispose();
  }

  Future<void> _loadLiveUrl() async {
    try {
      final pref = await StreamQualityService.instance.getPreference();
      final liveUrl = await widget.client.getLiveUrl(
        widget.deviceId,
        stream: pref.streamType,
      );
      if (!mounted) return;

      // Pick HLS on cellular (WAN), direct RTSP on WiFi (LAN)
      final url = (pref.preferHls && liveUrl.hlsUrl != null)
          ? liveUrl.hlsUrl!
          : liveUrl.rtspUrl;

      if (url.trim().isEmpty) {
        setState(() => _error = 'Не получен адрес видеопотока');
        return;
      }
      setState(() { _streamUrl = url.trim(); _error = null; });
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
    try { await widget.client.ptzMove(widget.deviceId, direction); } catch (_) {}
  }

  Future<void> _ptzStop() async {
    try { await widget.client.ptzStop(widget.deviceId); } catch (_) {}
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
            child: _streamUrl != null
                ? RtspPlayerWidget(key: _playerKey, rtspUrl: _streamUrl!)
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

- [ ] **Step 2: Verify flutter analyze**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/live_view_screen.dart 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd d:/grgmobileapp && git add lib/screens/live_view_screen.dart
git commit -m "feat(flutter): LiveViewScreen uses StreamQualityService — sub-stream + HLS on cellular"
```

---

### Task 8: Update IncomingCallScreen — sub-stream on cellular

**Files:**
- Modify: `lib/screens/incoming_call_screen.dart`

Key change: `_loadPreview()` reads `StreamQualityService` and:
- passes `stream: pref.streamType` to `getLiveUrl`
- uses `hlsUrl` if `preferHls` and available

- [ ] **Step 1: Update _loadPreview in IncomingCallScreen**

In `lib/screens/incoming_call_screen.dart`, add import:
```dart
import '../services/stream_quality_service.dart';
```

Replace `_loadPreview` method:

Old:
```dart
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
```

New:
```dart
  Future<void> _loadPreview() async {
    try {
      final pref = await StreamQualityService.instance.getPreference();
      final liveUrl = await widget.client.getLiveUrl(
        widget.deviceId,
        stream: pref.streamType,
      );
      final url = (pref.preferHls && liveUrl.hlsUrl != null)
          ? liveUrl.hlsUrl!
          : liveUrl.rtspUrl;
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
```

- [ ] **Step 2: Verify flutter analyze**

```bash
cd d:/grgmobileapp && flutter analyze lib/screens/incoming_call_screen.dart 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd d:/grgmobileapp && git add lib/screens/incoming_call_screen.dart
git commit -m "feat(flutter): IncomingCallScreen uses sub-stream + HLS on cellular"
```

---

## Phase 3: Final Verification

### Task 9: Full build verification

- [ ] **Step 1: Backend TypeScript build**

```bash
cd d:/grgmobileapp/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 2: Backend tests**

```bash
cd d:/grgmobileapp/backend && npm test 2>&1 | tail -10
```

Expected: 55/55 pass

- [ ] **Step 3: Flutter analyze**

```bash
cd d:/grgmobileapp && flutter analyze 2>&1 | grep -E "error|warning" | grep -v "avoid_print\|unnecessary_cast\|unused_field\|curly_braces\|use_build_context\|unused_import"
```

Expected: no new errors from our changes

- [ ] **Step 4: Test go2rtc manually (if Docker available)**

```bash
# Start go2rtc
cd d:/grgmobileapp/backend && docker compose up go2rtc -d

# Verify API is up
curl http://localhost:1984/api/streams

# Register a test stream (replace with real RTSP URL)
curl -X PUT http://localhost:1984/api/streams \
  -H "Content-Type: application/json" \
  -d '{"test_stream": ["rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4"]}'

# Verify HLS is accessible
curl -I "http://localhost:1984/api/stream.m3u8?src=test_stream"
# Expected: HTTP 200 with Content-Type: application/vnd.apple.mpegurl
```

- [ ] **Step 5: Commit final verification note**

```bash
cd d:/grgmobileapp && git add .
git commit -m "feat: go2rtc NAT traversal + sub-stream network selection complete"
```

---

## Notes for Operations

**Development without Docker:**
- Set `GO2RTC_URL` and `GO2RTC_PUBLIC_URL` to empty strings or omit from `.env`
- Backend gracefully skips go2rtc registration, returns only `rtspUrl`
- Everything works on LAN as before

**Production setup:**
1. Run `docker compose up -d` from `backend/` — starts both postgres and go2rtc
2. Set `GO2RTC_URL=http://go2rtc:1984` (Docker internal, backend→go2rtc)
3. Set `GO2RTC_PUBLIC_URL=https://media.yourdomain.com` (public HTTPS URL via nginx)
4. Configure nginx to proxy `https://media.yourdomain.com` → `go2rtc:1984`
5. go2rtc must have network access to camera RTSP ports (same network or VPN)

**Stream naming:**
- Streams are named `device_{id}_ch{channel}_{streamType}`, e.g. `device_5_ch1_main`
- Streams are registered lazily on first `getLiveUrl` call
- go2rtc keeps streams in memory; restart registers fresh on next `getLiveUrl`

**Connectivity logic:**
- WiFi → `stream=main`, direct RTSP (assumes LAN access to camera)
- Cellular → `stream=sub`, HLS via go2rtc (assumes WAN, bandwidth limited)
- Ethernet → `stream=main`, direct RTSP (same as WiFi)
- Unknown/no connection → `stream=main`, direct RTSP (fallback)
