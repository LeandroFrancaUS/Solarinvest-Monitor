# Solarinvest Monitor — Architecture

See README.md for full architecture details.
# System Architecture

## Overview

Solarinvest Monitor is a unified solar plant monitoring platform built on a **strict service separation model**:

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│  Web (UI)   │─────▶│  API Server │      │    Worker    │
│  Next.js    │      │   Fastify   │      │   BullMQ     │
└─────────────┘      └──────┬──────┘      └───────┬──────┘
                            │                     │
                     ┌──────▼──────┬──────────────▼──────┐
                     │  PostgreSQL │      Redis          │
                     │  (Prisma)   │  (Queues + Locks)   │
                     └─────────────┴─────────────────────┘
                            │
                     ┌──────▼──────────────────────────────┐
                     │  Vendor Integration Adapters        │
                     │  (Solis, Huawei, GoodWe, Dele)      │
                     └─────────────────────────────────────┘
```

---

## Service Responsibilities

### 1. Web Application (Next.js)
**Location**: `apps/web`

**Purpose**: User interface only.

**Responsibilities**:
- Display normalized data from API
- Authentication UI (login, password change)
- Dashboard, map, alerts, plant CRUD
- No business logic
- No vendor API calls
- No direct database access

**Technology**:
- Next.js 14+ (App Router)
- Tailwind CSS
- Leaflet (maps) + `leaflet.markercluster`
- Recharts (charts)
- React Query (server state)

**Critical Constraints**:
- NEVER call vendor APIs directly
- NEVER implement status calculation logic
- NEVER bypass `/api/v1` endpoints

---

### 2. API Server (Fastify)
**Location**: `apps/api`

**Purpose**: Centralized business logic, authentication, and data access layer.

**Responsibilities**:
- JWT authentication (login, password change, token validation)
- RBAC enforcement (ADMIN, OPERATOR, CUSTOMER)
- CRUD operations (plants, alerts, users)
- DTO shaping (OpsDTO vs PublicDTO)
- Credential encryption/decryption
- Test vendor connections
- No polling logic (belongs to Worker)

**Technology**:
- Fastify + TypeScript
- Prisma ORM
- Zod validation
- JWT + bcrypt

**API Route Structure**:
```
/api/v1/auth         # login, change-password
/api/v1/plants       # CRUD, list, filters
/api/v1/alerts       # list, acknowledge, resolve
/api/v1/integrations # test connection
/api/v1/push         # web push subscriptions
```

**Critical Constraints**:
- All routes MUST use `/api/v1` prefix
- NEVER log credentials, tokens, or `MASTER_KEY_*`
- Breaking changes require `/api/v2`
- Support CUSTOMER role queries (mobile future-proofing)

---

### 3. Worker (BullMQ)
**Location**: `apps/worker`

**Purpose**: Asynchronous polling, normalization, status calculation, and alerting.

**Responsibilities**:
- Poll vendor APIs via adapters (every 10 min for realtime, 15 min for alarms)
- Normalize vendor payloads to standard format
- Create/update `MetricSnapshot` records
- Calculate plant status (GREEN / YELLOW / RED / GREY)
- Generate and deduplicate alerts
- Smart backfill (D-3 to D-0 gap detection)
- Record every poll in `PollLog`
- Acquire Redis locks per plant (prevent concurrent polls)
- Respect vendor rate limits (via `VendorCapabilities`)

**Technology**:
- Node.js + TypeScript
- BullMQ (job queues)
- Redis (locks + queues)
- Prisma (database access)

**Job Queues** (brand-specific):
```
queue:poll:solis
queue:poll:huawei
queue:poll:goodwe
queue:poll:dele
```

**Critical Constraints**:
- NEVER poll same plant concurrently (Redis lock: `lock:plant:{plantId}`, TTL: 1200s)
- Use deterministic Job IDs: `poll:plant:{plantId}:latest`
- Respect `VendorCapabilities.polling` (max requests, interval, concurrency)
- Exit if `INTEGRATION_MOCK_MODE != 'true'` (Phase 3B requirement)
- NEVER skip `PollLog` creation

**Polling Flow**: See [PHASE_3B_MONITORING_LOOP.md](./PHASE_3B_MONITORING_LOOP.md) for complete step-by-step workflow.

---

### 4. PostgreSQL (Prisma)
**Location**: `prisma/schema.prisma`

**Purpose**: Persistent storage for all operational data.

**Core Entities**:
- `User` (login, role, password hash)
- `Plant` (metadata, status, integration_status, vendor_plant_id)
- `IntegrationCredential` (encrypted vendor credentials, key_version)
- `MetricSnapshot` (daily aggregates: date, today_energy_kwh, total_energy_kwh)
- `Alert` (type, severity, state: NEW → ACKED → RESOLVED, dedupe logic)
- `PollLog` (audit trail: plant_id, job_type, status, duration_ms, adapter_error_type)
- `DeviceRegistration` (web push / mobile push tokens)

**Critical Constraints**:
- `MetricSnapshot.today_energy_kwh` is REQUIRED (DB constraint)
- Unique constraint: `(plant_id, date)` on MetricSnapshot
- Alert dedupe key: `(plant_id, type, vendor_alarm_code, device_sn)`
- `NEVER store credentials in plaintext` (use `IntegrationCredential.encrypted_data`)

---

### 5. Redis
**Location**: `REDIS_URL` environment variable

**Purpose**: Job queues and distributed locks.

**Use Cases**:
- **Job Queues**: BullMQ stores all job data
- **Locks**: Prevent concurrent polling of same plant
  - Key format: `lock:plant:{plantId}`
  - TTL: 1200 seconds (20 minutes, 2× max polling interval)
  - Never manually delete in production (DEV ONLY)

**Critical Constraints**:
- Lock must be acquired BEFORE calling vendor API
- Lock must be released in `finally` block
- Never clear locks in production (causes race conditions)

---

### 6. Vendor Integration Adapters
**Location**: `packages/integrations/<brand>`

**Purpose**: Abstract vendor API differences behind a unified interface.

**Adapter Interface**:
```typescript
interface VendorAdapter {
  testConnection(creds): Promise<TestConnectionResult>
  getPlantSummary(ref, creds): Promise<NormalizedPlantSummary>
  getDailyEnergySeries(ref, creds, range): Promise<NormalizedDailySeries>
  getAlarmsSince(ref, creds, since): Promise<NormalizedAlarm[]>
  getCapabilities(): VendorCapabilities
}
```

**Supported Brands**:
- Solis (SolisCloud API)
- Huawei (FusionSolar Northbound API)
- GoodWe (SEMS Open API)
- Dele (stub, pending vendor documentation)

**Phase 3B Mock Mode**:
- All adapters extend `BaseMockAdapter`
- Load data from `fixtures/<brand>/mock-data.json`
- No real vendor API calls allowed
- Fixture format: See [FIXTURES_SPEC.md](./FIXTURES_SPEC.md)

**Critical Constraints**:
- Output MUST be normalized (W, kWh, ISO 8601, IANA timezones)
- NEVER leak vendor-specific field names to UI/API/Alert Engine
- Error types must map to standard `AdapterError` types
- See [INTEGRATION_CONTRACT.md](./INTEGRATION_CONTRACT.md) for full contracts

---

## Data Flow (Polling Cycle)

```
1. Scheduler → Enqueue job (deterministic ID)
2. Worker → Acquire Redis lock for plant
3. Worker → Call VendorAdapter (mock mode in Phase 3B)
4. Worker → Normalize data (W, kWh, ISO dates)
5. Worker → Upsert MetricSnapshot (daily aggregate)
6. Worker → Calculate plant status (GREEN/YELLOW/RED/GREY)
7. Worker → Process alarms → Create/update/resolve Alerts
8. Worker → Create PollLog entry (status, duration, errors)
9. Worker → Release Redis lock
10. API → Serve normalized data to Web UI
```

**Full details**: [PHASE_3B_MONITORING_LOOP.md](./PHASE_3B_MONITORING_LOOP.md)

---

## Deployment Model

### Development
```bash
# All services local
pnpm dev                         # Starts web + api + worker
docker compose up -d             # Postgres, Redis, Mailhog
```

### Production

**Web Application**:
- **Platform**: Vercel
- **Configuration**:
  - Root directory: `apps/web`
  - Build command: `cd ../.. && pnpm build --filter web`
  - Output directory: `.next`
- **Domain**: `monitor.solarinvest.info`

**API + Worker**:
- **Platform**: Docker on VPS (single or separate containers)
- **Critical**: Worker MUST NOT run on Vercel (requires long-running processes for BullMQ)
- **Reverse Proxy**: Nginx or Caddy for API endpoints
- **Endpoints**:
  - API: `https://monitor.solarinvest.info/api/v1`
  - Worker: Internal only (no public access)

**Database + Redis**:
- PostgreSQL: Docker or managed (DigitalOcean, AWS RDS)
- Redis: Docker or managed (Redis Cloud, AWS ElastiCache)

**Detailed deployment guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Security Model

### Credential Encryption
- **Algorithm**: AES-256-GCM
- **Key Rotation**: Supported via `MASTER_KEY_CURRENT` + `MASTER_KEY_PREVIOUS`
- **Storage**: `IntegrationCredential.encrypted_data`

### Password Hashing
- **Algorithm**: bcrypt
- **Cost**: ≥ 12

### Authentication
- **Current**: JWT via `Authorization: Bearer <token>`
- **Future**: Refresh token support (mobile apps)

### RBAC
- **Roles**: ADMIN | OPERATOR | CUSTOMER
- **Query Scoping**: CUSTOMER sees only owned plants

**Full security details**: [SECURITY_MODEL.md](./SECURITY_MODEL.md)

---

## Mobile Future-Proofing

### API-First Principle
- Web and future mobile apps consume **the same API**
- No business logic in frontend (web or mobile)
- Breaking changes require `/api/v2`

### RBAC Ready
- `User.role` supports CUSTOMER (even if unused in MVP)
- `Plant.owner_customer_id` nullable for MVP, required for mobile

### Notification Abstraction
- Current: Email (SMTP) + Web Push (VAPID)
- Future: Mobile Push (FCM for Android, APNs for iOS)
- `DeviceRegistration` model ready for platform-specific tokens

**Full mobile strategy**: [ROADMAP.md](./ROADMAP.md)

---

## Critical Architectural Rules

1. **Never call vendor APIs from Web or API** → Worker only
2. **Never bypass VendorAdapter interface** → UI/Alert Engine must use normalized data
3. **Never poll without Redis lock** → Causes duplicate jobs and vendor bans
4. **Never skip PollLog** → Required for debugging and auditing
5. **Never log credentials** → Use DTO isolation, never include in `vendorMeta` or `raw`
6. **Never run Worker on Vercel** → Requires persistent processes for BullMQ
7. **Never hardcode timezone** → Use plant-specific timezone, not `America/Sao_Paulo`
8. **Never skip status calculation** → Must happen after every successful poll

---

## System Monitoring

### Health Checks
- API: `GET /api/v1/health` (Fastify liveness)
- Worker: Bull Board Dashboard (dev only)
- Database: Prisma connection pooling
- Redis: BullMQ connection events

### Observability  
- `PollLog` table tracks every poll (status, duration, errors)
- Alert states provide historical view of plant health
- `MetricSnapshot` daily aggregates for trend analysis

### Error Tracking
- Adapter errors mapped to standard types (AUTH_FAILED, RATE_LIMIT_EXCEEDED, NETWORK_TIMEOUT)
- PollLog records `adapter_error_type` for debugging
- Alert notifications sent for critical failures

---

## Related Documentation

- [PHASE_3B_MONITORING_LOOP.md](./PHASE_3B_MONITORING_LOOP.md) – Complete polling workflow
- [FIXTURES_SPEC.md](./FIXTURES_SPEC.md) – Mock data format (Phase 3B)
- [INTEGRATION_CONTRACT.md](./INTEGRATION_CONTRACT.md) – VendorAdapter interface
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) – Encryption, auth, RBAC
- [DEPLOYMENT.md](./DEPLOYMENT.md) – Production deployment guide
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) – Common issues and debugging
- [ROADMAP.md](./ROADMAP.md) – Future phases (real APIs, mobile)
