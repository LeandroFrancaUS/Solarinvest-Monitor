# Solarinvest Monitor – AI Coding Agent Instructions

## Project Overview
Unified solar plant monitoring platform for SolarInvest. Normalizes data from multiple inverter manufacturers (Huawei, Solis, GoodWe, Dele) into a single operational dashboard with automated alerts.

**Key docs (source of truth):**
- [`SPEC_MVP.md`](../SPEC_MVP.md) – Architecture, business rules, data model
- [`INTEGRATION_CONTRACTS.md`](../INTEGRATION_CONTRACTS.md) – TypeScript contracts for vendor integrations
- [`CHECKLIST_DE_ACEITE.md`](../CHECKLIST_DE_ACEITE.md) – Acceptance criteria

## Greenfield Project (No Legacy Code)

**Critical**: This is a NEW project from scratch.
- There is NO existing codebase to reference
- There are NO hidden patterns or legacy utilities
- If something is unclear, ASK before implementing
- Do NOT invent behavior not documented in SPEC_MVP.md, INTEGRATION_CONTRACTS.md, or CHECKLIST_DE_ACEITE.md

## Architecture (Non-Negotiable Boundaries)

### Monorepo Structure (Exact Layout)
```
/apps
  /web          # Next.js 14+ App Router + Tailwind
  /api          # Fastify + TypeScript + Prisma
  /worker       # Node + BullMQ + TypeScript
/packages
  /integrations
    /core       # contracts.ts, health.ts, shared utils
    /solis
    /huawei
    /goodwe
    /dele       # stub (pending vendor docs)
  /ui           # (optional) shared components
/fixtures       # mock payloads by brand
  /solis
  /huawei
  /goodwe
  /dele
/infra
  docker-compose.yml
/prisma
  schema.prisma
```

### Service Separation
- **Web App** (Next.js): UI only, never calls vendor APIs directly
- **API Server** (Fastify): CRUD, auth, serves normalized data
- **Worker** (Node + BullMQ): Polling, normalization, alerting
- **Data**: PostgreSQL + Redis (queues, cache, locks)

### Adapter Pattern (Critical)
All vendor integrations live in `packages/integrations/<brand>` and implement `VendorAdapter` interface:
```typescript
interface VendorAdapter {
  testConnection(creds): Promise<TestConnectionResult>
  getPlantSummary(ref, creds): Promise<NormalizedPlantSummary>
  getDailyEnergySeries(ref, creds, range): Promise<NormalizedDailySeries>
  getAlarmsSince(ref, creds, since): Promise<NormalizedAlarm[]>
  getCapabilities(): VendorCapabilities
}
```

**Never** make UI or Alert Engine depend on vendor-specific payloads.

## Tech Stack Decisions (Locked In)

### API Server (Fastify Pattern)
- **Framework**: Fastify + TypeScript (NOT NestJS)
- **Why**: Lighter, faster, less boilerplate, better for solo dev
- **Code Organization**: Domain-driven folders (like NestJS style):
  ```
  apps/api/src/
    /auth         # login, JWT, password reset
    /plants       # CRUD plants, list, filters
    /alerts       # alert CRUD, acknowledge, resolve
    /integrations # test connection, credentials
    /metrics      # snapshots, telemetry, series
    /notifications # email, web push, future mobile push
  ```
- **Validation**: Zod schemas for all routes
- **ORM**: Prisma
- **Plugin Pattern**: Use Fastify plugins for auth, CORS, rate limiting
- **Logging**: NEVER log secrets, credentials, or tokens

### Worker
- **Queue**: BullMQ with Redis
- **Jobs**: Separate queues per brand (`queue:poll:solis`, etc.)
- **Concurrency**: Configured per `VendorCapabilities.polling`
- **Default timeout**: 8 seconds per request
- **Retries**: 2 attempts with exponential backoff (1s, 3s)
- **Never poll same plant concurrently** (Redis locks)

### Frontend
- **Next.js 14+** with App Router + TypeScript
- **Styling**: Tailwind CSS
- **Maps**: Leaflet + OpenStreetMap + `leaflet.markercluster` (mandatory, no alternatives)
- **Charts**: Recharts (locked for MVP, do not switch libraries)
- **State**: URL params for filters, React Query for server state

## API Conventions (Locked)

### Route Prefix
All routes MUST use `/api/v1` prefix.

### Required Endpoints (MVP)
```
POST   /api/v1/auth/login
POST   /api/v1/auth/change-password
GET    /api/v1/plants
POST   /api/v1/plants
GET    /api/v1/plants/:id
POST   /api/v1/integrations/test
GET    /api/v1/alerts
POST   /api/v1/alerts/:id/ack
POST   /api/v1/alerts/:id/resolve
POST   /api/v1/push/subscribe
```

### Authentication
- **JWT via Authorization header** (Bearer token)
- No cookie-based sessions in MVP
- Refresh tokens optional for future iterations
- Token validation via Fastify decorators/hooks

## Environment Variables (Required)

Use these exact names consistently:
```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
INTEGRATION_MOCK_MODE=true|false
MASTER_KEY_CURRENT=<32-byte-hex>
MASTER_KEY_PREVIOUS=<32-byte-hex>
JWT_SECRET=<secret>
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

## Mobile Future-Proofing (Mandatory)

### API-First Design
- Web and future mobile apps consume the same `/api/v1` API
- No business logic in frontend - all logic in API/Worker
- No vendor APIs exposed to clients (web or mobile)
- `/api/v1` is stable and backward-compatible
- Breaking changes require `/api/v2`

### RBAC Preparation
- Roles: `ADMIN | OPERATOR | CUSTOMER`
- Add to User model now, even if CUSTOMER unused in MVP
- `Plant.owner_customer_id` (nullable for MVP, required when mobile launches)
- Query scoping rules:
  - ADMIN/OPERATOR → access all plants
  - CUSTOMER → access only owned plants

### Authentication (Mobile-Ready)
- **Current MVP**: JWT access token via Authorization header
- **Future-ready**: 
  - Short-lived access token (15 min)
  - Refresh token (30 days)
  - `RefreshToken` model: `user_id`, `token_hash`, `device_id`, `expires_at`, `revoked_at`
- Tokens stored securely (Keychain/Secure Storage on mobile)

### Notification Abstraction
- Implement `NotificationProvider` interface:
  ```typescript
  interface NotificationProvider {
    sendEmail(to, subject, body): Promise<void>
    sendWebPush(subscription, payload): Promise<void>
    sendMobilePush(deviceToken, payload): Promise<void> // stub for now
  }
  ```
- Current: Email + Web Push (VAPID)
- Future: FCM (Android) + APNs (iOS)

### Device Registration
- Add `DeviceRegistration` model:
  ```
  - id, user_id
  - platform: WEB | IOS | ANDROID
  - provider: WEBPUSH | FCM | APNS
  - push_token (encrypted)
  - enabled (bool)
  - device_info, user_agent
  - created_at, last_seen_at
  ```

### DTOs and Security
- **Never return raw DB entities** - always use DTOs
- **Operator DTOs**: Full plant data, vendor info, credentials management
  - `PlantOpsDTO`, `AlertOpsDTO`
- **Customer DTOs**: Safe subset (no credentials, no vendor internals)
  - `PlantPublicDTO`, `AlertPublicDTO`
- **Never expose** `vendorMeta`, `raw`, credentials in any API response
- DTO changes must be **additive** (backward-compatible)

### Data Strategy (Mobile Performance)
- Primary data source: `MetricSnapshot` (daily aggregates)
- Mobile apps avoid heavy realtime telemetry
- Charts use daily data (mobile-friendly, bandwidth-efficient)
- Realtime telemetry optional and limited

### Future Mobile Endpoints (Planned, Not Implemented Yet)
```
GET /api/v1/me
GET /api/v1/customer/plants
GET /api/v1/customer/plants/:id
GET /api/v1/customer/alerts
```

### Security Requirements
- JWT tokens stored securely (never in localStorage on web)
- No secrets in logs (applies to mobile SDKs too)
- Rate limiting applies equally to web and mobile clients
- Same encryption standards (AES-256-GCM for sensitive data)

## Greenfield Project (No Legacy Code)

**Critical**: This is a NEW project from scratch.
- There is NO existing codebase to reference
- There are NO hidden patterns or legacy utilities
- If something is unclear, ASK before implementing
- Do NOT invent behavior not documented in SPEC_MVP.md, INTEGRATION_CONTRACTS.md, or CHECKLIST_DE_ACEITE.md

## Critical Developer Rules

### 1. Concurrency & Rate Limiting
- **Lock per plant**: `lock:plant:{plantId}` in Redis (TTL = 2× polling interval)
- **Deterministic Job IDs**: `poll:plant:{plantId}:latest`, `daily:plant:{plantId}:{YYYY-MM-DD}`
- **Separate queues by brand**: `queue:poll:solis`, `queue:poll:huawei`, etc.
- Respect `VendorCapabilities.polling`: `maxConcurrentRequests`, `maxRequestsPerMinute`, `recommendedMinIntervalSeconds`

### 2. Health Status Logic (GREEN/YELLOW/RED/GREY)
```
GREEN: last_seen_at ≤ 2h, no RED alerts, generation OK or nighttime
YELLOW: last_seen_at 2-24h OR low generation (30% of 7-day median)
RED: last_seen_at > 24h OR critical fault OR ultra-low gen (10% median > 2h)
GREY: integration_status != ACTIVE (auth failed, pending docs, disabled)
```

### 3. Alert Deduplication
- Dedupe key: `(plant_id, type, vendor_alarm_code, device_sn)`
- States: `NEW → ACKED → RESOLVED`
- Update `last_seen_at` for active alerts, don't re-notify unless 6h elapsed
- Auto-resolve when condition clears

### 4. Security (Never Violate)
- **Encrypt credentials**: AES-256-GCM with `MASTER_KEY_CURRENT`
- **Key rotation**: Support `MASTER_KEY_PREVIOUS` for decrypt fallback
- **bcrypt cost**: ≥ 12 for passwords
- **No secrets in logs**: Never log creds, tokens, or include in `vendorMeta`/`raw`

### 5. Error Mapping (Standardized)
```
HTTP 401/403 → AUTH_FAILED (pause integration, set GREY)
HTTP 429 → RATE_LIMIT_EXCEEDED (backoff with retryAfterSeconds)
Timeout/5xx → NETWORK_TIMEOUT (2 retries with exponential backoff)
Bad payload → INVALID_DATA_FORMAT
```

## Data Model Essentials

### Plant
- `status`: GREEN | YELLOW | RED | GREY
- `integration_status`: ACTIVE | PAUSED_AUTH_ERROR | DISABLED_BY_OPERATOR | PENDING_DOCS
- `alerts_silenced_until`: Suppress notifications until timestamp
- `timezone`: **Required** for accurate daily calculations (use geo-tz from lat/lng, not hardcoded)

### MetricSnapshot (daily aggregates)
- `date`: YYYY-MM-DD in plant timezone
- `today_energy_kwh`: **Required field**
- Smart backfill: Check gaps D-3 to D-0 and call `getDailyEnergySeries` to fill

### PollLog (mandatory for all jobs)
- Record every poll: `plant_id`, `job_type`, `status`, `duration_ms`, `adapter_error_type`
- Never include secrets in `raw_summary`

## Workflows

### Add Plant Wizard (5 steps)
1. Choose brand
2. Enter metadata (name, UF, city, lat/lng, timezone)
3. Provide credentials (brand-specific)
4. Test connection (`POST /integrations/test` → calls `adapter.testConnection()`)
5. Save (encrypt creds, create Plant, schedule polling jobs)

### Polling Schedule (MVP)
- **Realtime summary**: Every 10 min (respect brand limits)
- **Alarms**: Every 15 min
- **Daily snapshot**: 23:50 in plant timezone

### Low Generation Detection
During daylight window (sunrise+45min to sunset-45min):
- Calculate 7-day median of `today_energy_kwh`
- YELLOW if today < 30% of median
- RED if today < 10% of median for >2h

## Mock Mode (Development)

### Setup
- Set `INTEGRATION_MOCK_MODE=true`
- Adapters read from `/fixtures/<brand>/*.json`
- All tests must pass without real APIs

### Definition of Done (DoD)
With `INTEGRATION_MOCK_MODE=true`, the worker MUST:
1. Complete polling cycles (summary, alarms, daily)
2. Create `MetricSnapshot` and `PollLog` records in DB
3. Feed UI dashboard/list/map with realistic data
4. **Zero vendor API calls** (all data from fixtures)

The entire system must be fully functional in mock mode.

## Commands
```bash
pnpm install        # Install dependencies
pnpm dev            # Start all services locally
docker-compose up   # postgres, redis, mailhog
```

## Deployment (Baseline)

- **Web**: Vercel (Next.js optimized)
- **API + Worker**: Docker on VPS (single or separate containers)
- **Critical**: DO NOT run Worker on Vercel/serverless (needs long-running processes for BullMQ)
- **Domain**: `monitor.solarinvest.info`
- **Reverse proxy**: Nginx or Caddy for API/Worker endpoints

## UI Patterns
- **Map**: Leaflet + OpenStreetMap, clustering enabled, colors: GREEN=#22C55E, YELLOW=#FACC15, RED=#EF4444, GREY=#9CA3AF
- **Filters**: Persist in URL query params (brand, UF, city, status)
- **Dashboard**: Total plants, status breakdown, total today generation

## Common Pitfalls to Avoid
1. **Don't** call vendor APIs from frontend or alert engine
2. **Don't** hardcode timezone to `America/Sao_Paulo` (use plant-specific)
3. **Don't** skip Redis locks (causes duplicate jobs and API bans)
4. **Don't** log credentials in `vendorMeta`, `raw`, or anywhere
5. **Don't** forget to normalize units (always W and kWh, never kW or MW)
6. **Don't** implement alert logic without deduplication
7. **Don't** skip `PollLog` entries (needed for debugging/auditing)
