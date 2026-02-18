# Solarinvest Monitor – AI Agent Contract

**Role**: AI coding agent for Solarinvest Monitor platform.  
**Current Phase**: 3B – Mock monitoring engine with fixture-based polling.  
**Objective**: Enforce architectural contracts, never invent undocumented behavior.

---

## Quick Start

```bash
pnpm install && cd infra && docker compose up -d
pnpm db:migrate && pnpm db:generate
pnpm seed:admin && pnpm seed:test-plants
pnpm dev  # → Web: 3000, API: 3001, Mailhog: 8025
```

**Force poll**: `pnpm --filter worker dev` (restarts scheduler)

**Documentation**:
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) – System design & responsibilities
- [SPEC_MVP.md](../SPEC_MVP.md) – Business requirements
- [INTEGRATION_CONTRACT.md](../docs/INTEGRATION_CONTRACT.md) – Vendor adapter contracts
- [PHASE_3B_MONITORING_LOOP.md](../docs/PHASE_3B_MONITORING_LOOP.md) – Polling workflow
- [SECURITY_MODEL.md](../docs/SECURITY_MODEL.md) – Encryption, auth, RBAC
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) – Production deployment
- [TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) – Debugging guide
- [ROADMAP.md](../docs/ROADMAP.md) – Future phases

---

## System Architecture (Contract)

### Service Separation (Immutable)
```
Web (Next.js)      → UI only, NO business logic, NO vendor APIs
API (Fastify)      → Auth, CRUD, DTO shaping, serves normalized data
Worker (BullMQ)    → Polling, normalization, status, alerts, PollLog
PostgreSQL         → Entity storage (Prisma ORM)
Redis              → BullMQ queues + distributed locks
```

**Critical**: Web and Worker NEVER share runtime. Worker MUST NOT run on Vercel.

**Critical**: Web and Worker NEVER share runtime. Worker MUST NOT run on Vercel.

### Vendor Isolation (Immutable)
```
Vendor APIs ──▶ VendorAdapter ──▶ Normalized Data ──▶ Worker/API/UI
               (interface)         (W, kWh, ISO)
```

**Contract**: All vendor integrations MUST implement `VendorAdapter` interface.  
**Non-Negotiable**: UI, Alert Engine, API NEVER consume raw vendor payloads.

**See**: [INTEGRATION_CONTRACT.md](../docs/INTEGRATION_CONTRACT.md)

---

## Non-Negotiable Rules

### 1. Polling Safety (Redis Locks)
- **Lock per plant**: `lock:plant:{plantId}` (TTL: 1200s)
- **Deterministic Job IDs**: `poll:plant:{plantId}:latest`
- **Never poll concurrently**: Acquire lock BEFORE vendor API call
- **Respect rate limits**: `VendorCapabilities.polling` caps apply

**Violation**: Causes duplicate polls, vendor API bans, race conditions.

### 2. Status Calculation (Fixed Algorithm)
```
GREY:   integration_status != ACTIVE
RED:    last_seen_at > 24h OR critical alerts
YELLOW: last_seen_at 2-24h OR low generation (<30% of 7-day median)
GREEN:  last_seen_at ≤ 2h, no RED alerts, generation OK
```

**Source**: `apps/worker/src/monitoring-utils.ts`  
**Never**: Invent new status logic, skip status updates, use hardcoded thresholds.

### 3. Alert Deduplication (Mandatory)
- **Dedupe Key**: `(plant_id, type, vendor_alarm_code, device_sn)`
- **States**: `NEW → ACKED → RESOLVED`
- **Update Rule**: If active alert exists, update `last_seen_at`, don't create duplicate
- **Auto-Resolve**: When vendor marks alarm inactive

**Violation**: Creates duplicate alerts, spams notifications.

### 4. Normalization (Strict Units)
- **Power**: Watts (W), never kW or MW
- **Energy**: kWh, never Wh or MWh
- **Dates**: ISO 8601 → `Date` objects
- **Timezone**: IANA format (`America/Sao_Paulo`), never hardcoded
- **Required Field**: `todayEnergyKWh` (database constraint)

**Violation**: Unit mismatches break charts, status logic, UI display.

### 5. Security (Zero Tolerance)
- **Credentials**: AES-256-GCM encrypted, NEVER in logs or API responses
- **Passwords**: bcrypt (cost ≥ 12), NEVER in plaintext
- **Keys**: `MASTER_KEY_CURRENT` + `MASTER_KEY_PREVIOUS` (rotation support)
- **Never Log**: Credentials, tokens, `password_hash`, `encrypted_data`, `MASTER_KEY_*`
- **DTOs Only**: Never return raw Prisma entities in API responses

**See**: [SECURITY_MODEL.md](../docs/SECURITY_MODEL.md)

### 6. PollLog Auditing (Mandatory)
- **Record every poll**: Success or failure
- **Fields**: `plant_id`, `job_type`, `status`, `duration_ms`, `adapter_error_type`
- **Never skip**: Required for debugging, vendor SLA tracking

**Violation**: Impossible to diagnose failures, no audit trail.

### 7. Phase 3B Mock Mode (Current Phase)
- **Environment**: `INTEGRATION_MOCK_MODE=true` (worker exits if false)
- **Adapters**: Extend `BaseMockAdapter`, load from `fixtures/<brand>/mock-data.json`
- **Zero Real API Calls**: Fixtures only, no HTTP requests to vendors

**See**: [FIXTURES_SPEC.md](../docs/FIXTURES_SPEC.md)

---

## Data Model (Core Entities)

### Plant
```typescript
status: 'GREEN' | 'YELLOW' | 'RED' | 'GREY'
integration_status: 'ACTIVE' | 'PAUSED_AUTH_ERROR' | 'DISABLED_BY_OPERATOR' | 'PENDING_DOCS'
timezone: string  // IANA format, NEVER hardcoded
alerts_silenced_until: Date | null  // Suppress notifications
```

### MetricSnapshot (Daily Aggregates)
```typescript
plant_id + date: unique constraint
today_energy_kwh: number  // REQUIRED (DB constraint)
total_energy_kwh: number | null
current_power_w: number | null
```

**Backfill**: Check gaps D-3 to D-0, call `getDailyEnergySeries` to fill.

**Backfill**: Check gaps D-3 to D-0, call `getDailyEnergySeries` to fill.

### Alert
```typescript
type: 'OFFLINE' | 'LOW_GEN' | 'FAULT' | 'STRING' | 'VOLTAGE' | 'API_ERROR'
severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
state: 'NEW' | 'ACKED' | 'RESOLVED'
dedupe_key: `${plant_id}_${type}_${vendor_alarm_code}_${device_sn}`
```

### PollLog (Audit Trail)
```typescript
plant_id, job_type, status, duration_ms, adapter_error_type, created_at
```

**See**: `prisma/schema.prisma`

---

## Environment Variables (Required)

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

**Never commit**: `.env` files, secrets, `MASTER_KEY_*`, `JWT_SECRET`.

---

## Tech Stack (Locked In)

### API (Fastify)
- **Pattern**: Domain-driven folders (`/auth`, `/plants`, `/alerts`, `/integrations`)
- **Validation**: Zod schemas
- **ORM**: Prisma
- **Auth**: JWT via `Authorization: Bearer <token>`
- **NOT NestJS**: Lighter, less boilerplate

### Worker (BullMQ)
- **Queues**: Brand-specific (`queue:poll:solis`, `queue:poll:huawei`, etc.)
- **Concurrency**: Per `VendorCapabilities.polling.maxConcurrentRequests`
- **Timeout**: 8 seconds per vendor API call
- **Retries**: 2× with exponential backoff (1s, 3s)

### Frontend (Next.js)
- **Maps**: Leaflet + OpenStreetMap + `leaflet.markercluster` (MANDATORY)
- **Charts**: Recharts (LOCKED, no alternatives)
- **State**: URL params (filters) + React Query (server state)

**See**: [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for service responsibilities.

---

## API Contracts (Immutable)

### Route Prefix
All routes MUST use `/api/v1` prefix.

### Authentication
- **JWT via Authorization header**: `Bearer <token>`
- Validation via Fastify decorators: `fastify.authenticate`

### RBAC (Future-Ready)
- **Roles**: `ADMIN | OPERATOR | CUSTOMER`
- Query scoping:
  - `CUSTOMER` → `Plant.owner_customer_id = user.id`
  - `ADMIN | OPERATOR` → All plants

### DTOs (Security Boundary)
- **Never return raw Prisma entities**
- **Operator DTOs**: Full data (includes `vendor_plant_id`, `integration_status`)
- **Customer DTOs**: Safe subset (no credentials, no vendor internals)
- **Never expose**: `encrypted_data`, `password_hash`, `vendorMeta`, `raw`

**See**: [SECURITY_MODEL.md](../docs/SECURITY_MODEL.md)

---

## Critical Workflows

### Polling Loop (Phase 3B)
```
1. Scheduler → Enqueue job (deterministic ID)
2. Worker → Acquire Redis lock
3. Worker → Call VendorAdapter (mock mode)
4. Worker → Normalize data (W, kWh, ISO)
5. Worker → Upsert MetricSnapshot
6. Worker → Calculate status (GREEN/YELLOW/RED/GREY)
7. Worker → Process alarms → Create/update/resolve Alerts
8. Worker → Create PollLog entry
9. Worker → Release Redis lock
```

**See**: [PHASE_3B_MONITORING_LOOP.md](../docs/PHASE_3B_MONITORING_LOOP.md)

### Error Handling (Standardized)
```
HTTP 401/403 → AUTH_FAILED (pause integration, GREY status)
HTTP 429 → RATE_LIMIT_EXCEEDED (backoff with retryAfterSeconds)
Timeout/5xx → NETWORK_TIMEOUT (retry 2× exponential backoff)
Invalid JSON → INVALID_DATA_FORMAT (log, skip poll)
```

### Status Calculation (After Every Poll)
```
1. Check integration_status → If != ACTIVE, set GREY
2. Check last_seen_at → If > 24h, set RED
3. Check critical alerts → If any active, set RED
4. Check last_seen_at → If 2-24h, set YELLOW
5. Check low generation → If < 30% of 7-day median, set YELLOW
6. Else → set GREEN
```

**Source**: `apps/worker/src/monitoring-utils.ts`

---

## AI Agent Constraints (Strict)

### Never Invent Behavior
- **This is a greenfield project** – no hidden legacy patterns
- If uncertain, reference `SPEC_MVP.md`, `INTEGRATION_CONTRACTS.md`, `CHECKLIST_DE_ACEITE.md`
- Do NOT assume undocumented features exist

### Never Bypass Contracts
- **VendorAdapter interface is mandatory** – no direct vendor API calls outside adapters
- Alert Engine and UI MUST use normalized data only
- No vendor-specific field names leak beyond adapter boundary

### Never Compromise Security
- NEVER log credentials, tokens, `MASTER_KEY_*`, `password_hash`
- NEVER return `encrypted_data` in API responses
- NEVER skip encryption for credentials
- NEVER use plaintext password storage

### Never Skip Safety Mechanisms
- Redis locks MUST be acquired before polling
- PollLog MUST be created for every job (success or failure)
- Status calculation MUST run after every successful poll
- Alert deduplication MUST use `(plant_id, type, vendor_alarm_code, device_sn)`

### Never Violate Deployment Model
- Worker MUST NOT run on Vercel (requires long-running processes)
- Web MUST NOT call vendor APIs (Worker only)
- API MUST NOT implement polling logic (Worker only)

---

## Common Pitfalls (Avoid)

1. **Calling vendor APIs from Web or API** → Worker only, via VendorAdapter
2. **Hardcoding timezone** → Use plant-specific IANA timezone
3. **Skipping Redis locks** → Causes duplicate polls, vendor bans
4. **Logging credentials** → Never in `vendorMeta`, `raw`, or logs
5. **Unit inconsistency** → Always W and kWh (never kW, MW, Wh)
6. **Alert duplication** → Use dedupe key, update `last_seen_at` instead of creating new
7. **Skipping PollLog** → Required for debugging, SLA tracking
8. **Ignoring Phase 3B mock mode** → Worker exits if `INTEGRATION_MOCK_MODE != 'true'`

---

## Troubleshooting (Quick Reference)

### Worker Not Polling?
1. Check `INTEGRATION_MOCK_MODE=true` in `.env`
2. Verify `integration_status = ACTIVE` in database
3. Restart worker: `pnpm --filter worker dev`

### Status Stuck on GREY?
1. Set `integration_status = ACTIVE` in database
2. Restart worker to trigger poll

### Redis Lock Leak?
- **⚠️ DEV ONLY**: `redis-cli DEL "lock:plant:{plantId}"`
- **Never in production** (causes race conditions)

**Full guide**: [TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md)

---

## Documentation Index

**Core Contracts**:
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) – System design, service responsibilities
- [INTEGRATION_CONTRACT.md](../docs/INTEGRATION_CONTRACT.md) – VendorAdapter interface, normalization rules
- [SECURITY_MODEL.md](../docs/SECURITY_MODEL.md) – Encryption, auth, RBAC, DTOs

**Technical Guides**:
- [PHASE_3B_MONITORING_LOOP.md](../docs/PHASE_3B_MONITORING_LOOP.md) – End-to-end polling workflow
- [FIXTURES_SPEC.md](../docs/FIXTURES_SPEC.md) – Mock data format (Phase 3B)
- [TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) – Debugging, common issues

**Deployment & Planning**:
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) – Production deployment (Vercel + Docker)
- [ROADMAP.md](../docs/ROADMAP.md) – Future phases (real APIs, mobile)

**Business Requirements**:
- [SPEC_MVP.md](../SPEC_MVP.md) – Business rules, system requirements
- [CHECKLIST_DE_ACEITE.md](../CHECKLIST_DE_ACEITE.md) – Acceptance criteria
- [PHASE_3B_SCOPE.md](../PHASE_3B_SCOPE.md) – Current phase detailed scope

---

## End
