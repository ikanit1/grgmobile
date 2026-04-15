# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GRG Mobile** is a multi-tenant doorphone/videophone management system consisting of:
- **Backend**: NestJS (Node.js) REST API with TypeORM, JWT auth, WebSocket (Socket.IO)
- **Frontend**: Flutter mobile/web app for end users
- **Devices**: Integration with Akuvox panels (Linux API) and Uniview IPC/NVR (LiteAPI)

The system manages hierarchical organizations → residential complexes → buildings → apartments → residents, with role-based access control and real-time events (incoming calls, door opening).

---

## Repository Structure

```
grgmobileapp/
├── backend/                    # NestJS API server
│   ├── src/
│   │   ├── app.module.ts      # Root module, DB config (PostgreSQL/SQLite), all imports
│   │   ├── main.ts            # Bootstrap, Swagger setup, CORS, global pipes
│   │   ├── auth/              # JWT authentication (login, register, refresh)
│   │   ├── users/             # User management, user_apartments (many-to-many)
│   │   ├── access/            # Access control service (role + building filtering)
│   │   ├── organizations/     # Organizations (УК - management companies)
│   │   ├── residential-complexes/  # ЖК - residential complexes
│   │   ├── buildings/         # Buildings, devices, apartments, imports
│   │   ├── apartments/        # Apartments, residents, applications
│   │   ├── devices/           # Device CRUD + provisioning for Akuvox
│   │   ├── control/           # Open door, live URL, test connection, events
│   │   ├── discovery/         # ONVIF device discovery
│   │   ├── events/            # WebSocket gateway, event log, push notifications
│   │   ├── credentials/       # AES-256 encryption of device credentials
│   │   ├── webhooks/          # Akuvox webhook receiver (incoming calls)
│   │   ├── vendors/
│   │   │   ├── akuvox/        # Akuvox Linux API HTTP client
│   │   │   └── uniview/       # Uniview LiteAPI HTTP + WebSocket client
│   │   ├── common/            # Filters, logging, validators
│   │   └── panel-residents/   # Panel user management for Akuvox contacts
│   ├── public/admin.html      # Vue.js/Bootstrap admin panel (SPA)
│   ├── scripts/               # DB reset, make super-admin, migrations
│   ├── docker-compose.yml     # PostgreSQL container
│   └── .env.example           # Environment variables template
│
├── lib/                        # Flutter app
│   ├── api/
│   │   ├── backend_client.dart    # HTTP client with JWT auth
│   │   └── auth_storage.dart      # Token persistence
│   ├── models/                 # Data models (User, Device, etc.)
│   ├── screens/                # UI screens (auth, home, device control)
│   ├── services/               # Business logic (push, config, device sync)
│   ├── theme/                  # App theme
│   └── widgets/                # Reusable widgets
│
├── pubspec.yaml                # Flutter dependencies
└── README.md                   # Project overview, setup instructions
```

---

## Key Architecture Concepts

### Backend Multi-Tenancy & RBAC

**Hierarchy**: Organization → Residential Complex → Building → Apartment → Resident

**Roles** (defined in `src/users/entities/user.entity.ts`):
- `SUPER_ADMIN`: Full access to all resources
- `ORG_ADMIN`: Manages their organization and all complexes/buildings within it
- `COMPLEX_MANAGER`: Manages their assigned residential complex and its buildings
- `RESIDENT`: Limited to buildings where they have an apartment via `user_apartments`

**Access Control**: `AccessService` centralizes permission checks. It filters queries based on the user's role and linked entities. Always use `findAllForUser(user)` or `findByIdForUser(id, user)` pattern in services to enforce row-level security.

### Device Vendor Architecture

Each vendor implements a client under `src/vendors/`:
- **Akuvox**: HTTP JSON API, Basic auth (credentials encrypted in DB), supports provisioning contacts/users, door open, system info, webhooks for events.
- **Uniview**: LiteAPI HTTP with Digest auth, live URL generation, optional WebSocket for events.

Device type is stored in `Device.type` enum ('akuvox', 'uniview'). The `DevicesService` retrieves credentials (decrypted by `CredentialsService`) and routes calls to appropriate vendor client.

### WebSocket Events

`EventsGateway` (Socket.IO) broadcasts real-time events:
- Incoming call notifications (from Akuvox webhook → push → WebSocket)
- Door open confirmations
- Connection status

Clients subscribe to rooms based on device ID or user context. JWT auth required on connection.

### Credential Encryption

Device credentials (username/password) are encrypted with AES-256-GCM using `CREDENTIALS_ENCRYPTION_KEY` env var. `CredentialsService` handles encryption/decryption. In production, a 32-byte key is mandatory.

---

## Common Development Commands

### Backend (from `backend/` directory)

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled JS (production) |
| `npm run start:dev` | Run with ts-node (hot-reload during development) |
| `npm run test:e2e` | Run Jest e2e tests (from `test/` dir) |
| `npm run db:reset` | Drop all tables and re-sync (dev only) |
| `npm run db:super-admin <email>` | Create/upgrade user to SUPER_ADMIN |

**Environment**:
- Copy `.env.example` to `.env` and configure (DB, JWT_SECRET, etc.)
- DB: PostgreSQL recommended for production, SQLite for local dev (`DB_TYPE=sqlite`)
- Server runs on `PORT` (default 3000), binds to `0.0.0.0`
- Swagger UI at `http://localhost:3000/docs`
- Admin panel at `http://localhost:3000/api/admin`

### Flutter App (from project root)

| Command | Purpose |
|---------|---------|
| `flutter pub get` | Install dependencies |
| `flutter run -d <device>` | Run on specific device (chrome, windows, android, ios) |
| `flutter build web` | Build web deployment |
| `flutter build apk` / `appbundle` | Build Android |
| `flutter build ios` | Build iOS (macOS only) |
| `flutter analyze` | Run static analysis |
| `flutter test` | Run unit/widget tests |

**Configuration**:
- API endpoint is stored in shared preferences and loaded at startup via `ApiConfig.load()`
- Backend mode enabled by `useBackend` flag (default true)
- Firebase initialized if config files present (google-services.json / GoogleService-Info.plist)

---

## Database Schema Overview

**Entities**:
- `User` (email, phone, role, password hash, refresh token)
- `Organization` (УК)
- `ResidentialComplex` (ЖК, belongs to Organization)
- `Building` (belongs to ResidentialComplex)
- `Apartment` (number, floor; belongs to Building)
- `Device` (type, ip, port, credentials; belongs to Building)
- `UserApartment` (join table linking User ↔ Apartment)
- `ApartmentApplication` (resident requests to join an apartment)
- `EventLog` (door open, incoming call events)
- `PanelResident` (Akuvox contact/user entries)

TypeORM auto-syncs in non-production (`synchronize: true`). For production, use migrations (`scripts/migrate-to-multitenant.sql`).

---

## Testing

- **Backend**: Jest e2e tests using Supertest. Tests located in `test/` and `.e2e-spec.ts` files.
  - DB reset between tests is manual via `db:reset` script or test hooks.
  - Run a single test: `npx jest --testPathPattern=specific.e2e-spec.ts`
- **Flutter**: Standard `flutter test` for unit/widget tests. Integration tests not yet set up.

---

## Important Patterns & Gotchas

1. **Module Imports**: When adding a service that depends on another service (e.g., `BuildingsService` needs `CredentialsService`), ensure the provider's module is imported. Check `app.module.ts` for existing modules.

2. **Access Control**: Never expose data without filtering by user. In controllers/services, always accept `RequestUser` (from `@Req()`) and use `accessService` or service methods like `findAllForUser()`.

3. **Device Credentials**: Plain text `username`/`password` fields are deprecated. Store encrypted JSON in `credentials` blob. Use `CredentialsService.encrypt()` and `.decrypt()`.

4. **Vendor Client Usage**: Always go through `DevicesService` or similar abstraction. Vendor clients assume credentials are already decrypted and handle their own HTTP/auth.

5. **CORS & CORS-Origin in WebSocket**: `main.ts` enables CORS globally. WebSocket allowed origins controlled by `WS_ALLOWED_ORIGINS` env var.

6. **Production Secrets**: `main.ts` checks that `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, and `WEBHOOK_SECRET` are set and not default values. Must configure in `.env` before deploying.

7. **Flutter Backend Client**: `BackendClient` automatically includes JWT from `AuthStorage`. For operations requiring auth, ensure user is logged in first (check `getUser()`).

---

## Environment Setup

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env: set DB_TYPE=postgres or sqlite, JWT_SECRET, WEBHOOK_SECRET, PORT
npm install
npm run build
npm start
```

For PostgreSQL, ensure DB exists. Use `scripts/create-db-windows.md` for Windows instructions, or `docker compose up -d` from `backend/` to start a local Postgres container.

### Flutter
```bash
flutter pub get
flutter run -d chrome  # or windows, android, ios
```
For mobile builds, configure Firebase if using push notifications: add `google-services.json` (Android) or `GoogleService-Info.plist` (iOS) to respective platform folders.

---

## API Quick Reference

**Auth**:
- `POST /api/auth/login` → `{email, password}` → `{accessToken, refreshToken, user}`
- `POST /api/auth/register` (disabled in prod unless enabled)
- `POST /api/auth/refresh` → `{refreshToken}` → new access token
- `POST /api/auth/logout`

**Buildings & Devices**:
- `GET /api/buildings` - user-filtered list
- `GET /api/buildings/:id` - building details with devices
- `POST /api/buildings/:id/devices` - add device
- `GET /api/devices/:id` - device details
- `POST /api/devices/:id/open-door` - trigger door open
- `GET /api/devices/:id/live-url` - RTSP URL for video stream

**Webhooks**:
- `POST /api/webhooks/akuvox` - expects `X-Webhook-Secret`, JSON payload with `event` (call_incoming, door_opened)

**Admin**:
- Single-page admin UI at `/api/admin` (protected by JWT)
- Additional admin API under `/api/admin/*` for user management, impersonation

See Swagger at `/docs` for full API.

---

## Migration & Data Setup

- Reset DB (dev): `npm run db:reset` (deletes all tables, re-syncs)
- Create super-admin: `npm run db:super-admin admin@example.com`
- Import apartments CSV/Excel via admin UI or API (`POST /api/buildings/:id/apartments/import`)
- Panel resident sync: triggered automatically on apartment create or manually via admin UI (syncs Akuvox contacts)

---

## External Resources

- Akuvox Linux API docs: `Akuvox Linux Api_20250530.html` (in repo root)
- Uniview LiteAPI docs: `LiteAPI Document for IPC V5.07.pdf`, `LiteAPI Over Websocket Document for IPC V5.05.pdf`
- Full system spec: `backend/docs/FULL_SYSTEM_SPEC.md`
- Backend design: `backend/BACKEND.md`, `backend/SYSTEM_DESIGN.md`
- Roadmap: `backend/docs/SPEC_COMPLIANCE_AND_ROADMAP.md`

---

## Notes for Future Development

- The project is in active development. Some Akuvox endpoints (dial, hangup, calllog) and Uniview features (snapshot, PTZ, playback) are planned or partially implemented.
- Push notifications (FCM) are set up but require Firebase credentials.
- The Flutter app supports backend mode and standalone mode (direct device IP). Backend mode is recommended for multi-tenant and push.
- Web mode (Flutter web) has limitations on some plugins (secure storage, video_player may need native).

---

## Troubleshooting

**Backend fails to start with "UnknownDependenciesException"**:
- Check that all required modules are imported in `app.module.ts` or the specific module (e.g., `CredentialsModule` must be imported by any module using `CredentialsService`).

**Cannot connect to DB**:
- For PostgreSQL: ensure container is running (`docker ps`) and `.env` DB_HOST/PORT correct.
- For SQLite: ensure `data/` directory exists and is writable.

**Flutter cannot find device**:
- Run `flutter doctor` to check environment.
- For web: ensure Chrome is installed; use `-d chrome`.
- For mobile: enable developer options and USB debugging; authorize the computer.

**Build fails with missing permissions**:
- On Windows, avoid paths with spaces; run from PowerShell or CMD in `D:\grgmobileapp`.

---

## Style Conventions

- TypeScript: Strict mode enabled, ES2019 target, decorators for NestJS.
- Dart: Null safety, style follows `flutter_lints` package.
- Commit messages: not enforced, but be descriptive.

---

This CLAUDE.md is maintained by the development team. Update when architecture changes or new common commands are added.
