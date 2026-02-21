# Solarinvest Monitor – AI Coding Agent Instructions (Enterprise Clean)

This file is the **contract** for AI coding agents: system boundaries, non-negotiable rules, and pointers to canonical docs.
Deep details live in `docs/`.

## Project Context
- Unified solar plant monitoring platform for SolarInvest.
- Current phase: **Phase 3B (Mock Mode)** — worker + fixtures + normalized monitoring loop.
- No real vendor API calls in mock mode (`INTEGRATION_MOCK_MODE=true`).

## Monorepo Structure
```
apps/web        # Next.js 14+ App Router + Tailwind + React Query + Recharts + Leaflet
apps/api        # Fastify + TypeScript + Prisma (port 3001)
apps/worker     # BullMQ + Redis polling engine
packages/integrations/core     # VendorAdapter contracts + BaseMockAdapter
packages/integrations/{solis,huawei,goodwe,dele}  # Brand adapters
fixtures/{brand}/mock-data.json  # Phase 3B fixture data
prisma/schema.prisma             # Prisma schema (output → apps/api/node_modules/.prisma/client)
infra/docker-compose.yml         # PostgreSQL + Redis + Mailhog
```

## Developer Workflows
```bash
# Infrastructure (run first)
cd infra && docker compose up -d

# Install dependencies (pnpm workspaces)
pnpm install

# Database setup
pnpm db:migrate && pnpm db:generate && pnpm seed:admin

# Seed test plants for Phase 3B
pnpm seed:test-plants

# Run all services concurrently
pnpm dev

# Run individual service
pnpm --filter web dev       # http://localhost:3000
pnpm --filter api dev       # http://localhost:3001
pnpm --filter worker dev

# Build / typecheck / lint
pnpm build
pnpm typecheck
pnpm lint
# Note: pnpm test is defined but no tests are implemented yet (Phase 3B)
```

## Key Naming Conventions
- **Queue names**: `queue:poll:{brand.toLowerCase()}` (e.g. `queue:poll:solis`)
- **Job IDs** (deterministic): `poll:plant:{plantId}:latest`
- **Redis lock keys**: `lock:plant:{plantId}` — TTL 1200 s (20 min), acquire BEFORE vendor call, release in `finally`
- **API routes**: all under `/api/v1` prefix; breaking changes require `/api/v2`

## Adapter Pattern (Phase 3B)
All brand adapters extend `BaseMockAdapter` (`packages/integrations/core/src/base-mock-adapter.ts`):
```typescript
// packages/integrations/solis/src/index.ts
export class SolisAdapter extends BaseMockAdapter {
  constructor() { super('SOLIS'); }  // loads fixtures/solis/mock-data.json
  getCapabilities(): VendorCapabilities { ... }
}
```
Fixture files must follow the schema: `{ plant_summary, daily_series: [], alarms: [] }` — see `fixtures/solis/mock-data.json` as the canonical example and `docs/FIXTURES_SPEC.md` for the full spec.

## Plant Status Rules (implemented in `apps/worker/src/poll-worker.ts`)
```
GREY:   integration_status != ACTIVE
RED:    last_seen_at > 24 h OR CRITICAL alert exists
YELLOW: last_seen_at 2–24 h OR low generation (< 30% of 7-day median)
GREEN:  last_seen_at ≤ 2 h, no RED alerts
```

## Alert Types (Phase 3B — from `apps/worker/src/monitoring-utils.ts`)
- `OFFLINE` — CRITICAL severity; created when `last_seen_at > 24 h`; auto-resolved when back online
- `LOW_GENERATION` — HIGH severity when today < 30% of 7-day median; CRITICAL (< 10%); auto-resolved
- `MOCK_FAULT` — maps to vendor alarms from fixture; dedupe key `(plant_id, type, vendor_alarm_code, device_sn)`

## Worker Internals (Phase 3B)
- Scheduler fires immediately on start, then every **10 min** (`pollingIntervalSeconds = 600`)
- Jobs: `attempts: 2`, exponential backoff starting at 5 s; BullMQ worker concurrency: **5 per brand queue**
- Alarm query window: **last 24 h** per poll; backfill checks **D-3 to D-0** for `MetricSnapshot` gaps
- Restart worker to force immediate rescheduling (no manual queue commands needed)

## Canonical Docs (Source of Truth)
- `SPEC_MVP.md` — business rules + core model constraints
- `INTEGRATION_CONTRACTS.md` — TypeScript contract (repo-level reference)
- `CHECKLIST_DE_ACEITE.md` — acceptance criteria
- `docs/ARCHITECTURE.md` — service responsibilities + boundaries
- `docs/PHASE_3B_MONITORING_LOOP.md` — polling → snapshots → status → alerts → pollLog
- `docs/FIXTURES_SPEC.md` — fixture schema + normalization rules
- `docs/SECURITY_MODEL.md` — AES-256-GCM, JWT, RBAC, logging red lines
- `docs/INTEGRATION_CONTRACT.md` — adapter contract + normalized shapes
- `docs/TROUBLESHOOTING.md` — decision trees (**DEV ONLY** commands clearly marked)

## Architecture (Hard Boundaries)
- **Web (Next.js)**: UI only. Calls API. Never calls vendor APIs.
- **API (Fastify)**: auth (JWT), RBAC, CRUD, DTO shaping. Never polls vendors.
- **Worker (BullMQ)**: polling + normalization + snapshots + status + alerts + PollLog. **Never run on Vercel.**
- **Data**: PostgreSQL + Redis (queues + locks).

## Non-Negotiable Rules
### Vendor Isolation
- UI/API must never depend on vendor-specific payloads.
- Never expose raw vendor payloads in any API response.
- All integrations must implement the shared adapter contract (`VendorAdapter` in `packages/integrations/core/src/contracts.ts`).

### Polling Safety
- **Redis lock per plant is mandatory** (prevents concurrent polls).
- **Deterministic job IDs are mandatory** — use `poll:plant:{plantId}:latest`.
- Every job execution must write a **PollLog** record (mandatory, even on error).

### Security
- Encrypt credentials with **AES-256-GCM** (key rotation via `MASTER_KEY_CURRENT` + `MASTER_KEY_PREVIOUS`).
- bcrypt cost ≥ 12 for passwords.
- Never log: credentials, tokens, encrypted blobs, master keys.
- `PollLog.safe_summary_json` must **never** contain secrets.

### Normalization
- Power in **Watts (W)**, energy in **kWh**.
- Timestamps in ISO 8601.
- Timezone must be IANA string from the plant record (no hardcoded `America/Sao_Paulo`).

## Required Environment Variables
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- `MASTER_KEY_CURRENT`, `MASTER_KEY_PREVIOUS`
- `INTEGRATION_MOCK_MODE` (set to `true` for Phase 3B)

## AI Agent Constraints
- Do not invent behavior not supported by code and `/docs`.
- If ambiguous, ask before implementing.
- Prefer small, reviewable commits with clear messages.
