# Solarinvest Monitor – AI Coding Agent Instructions (Enterprise Clean)

This file is the **contract** for AI coding agents: system boundaries, non-negotiable rules, and pointers to canonical docs.
It is intentionally concise. Deep details live in `/docs`.

## Project Context
- Unified solar plant monitoring platform for SolarInvest.
- Current phase: **Phase 3B (Mock Mode)** — worker + fixtures + normalized monitoring loop.
- No real vendor API calls in mock mode.

## Canonical Docs (Source of Truth)
- `../SPEC_MVP.md` — business rules + core model constraints
- `../INTEGRATION_CONTRACTS.md` — TypeScript contract (repo-level reference)
- `../CHECKLIST_DE_ACEITE.md` — acceptance criteria (repo-level reference)

**Detailed operational docs (implementation-aligned):**
- `../docs/ARCHITECTURE.md` — service responsibilities + boundaries
- `../docs/PHASE_3B_MONITORING_LOOP.md` — polling → snapshots → status → alerts → pollLog
- `../docs/FIXTURES_SPEC.md` — fixture schema + normalization rules
- `../docs/TROUBLESHOOTING.md` — decision trees + common failure modes (**DEV ONLY** commands clearly marked)
- `../docs/SECURITY_MODEL.md` — AES-256-GCM, JWT, RBAC, logging red lines
- `../docs/DEPLOYMENT.md` — Vercel + Docker/VPS deployment model (what runs where)
- `../docs/INTEGRATION_CONTRACT.md` — adapter contract + normalized shapes (doc form)
- `../docs/ROADMAP.md` — Phase 4+ (real vendor APIs, notifications, mobile)

## Architecture (Hard Boundaries)
- **Web (Next.js)**: UI only. Calls API. Never calls vendor APIs.
- **API (Fastify)**: auth (JWT), RBAC, CRUD, DTO shaping. Never polls vendors.
- **Worker (BullMQ)**: polling + normalization + snapshots + status + alerts + PollLog.
- **Data**: PostgreSQL + Redis (queues + locks).

## Non-Negotiable Rules
### Vendor Isolation
- UI/API must never depend on vendor-specific payloads.
- Never expose raw vendor payloads in any API response.
- All integrations must implement the shared adapter contract (see `docs/INTEGRATION_CONTRACT.md`).

### Polling Safety
- **Redis lock per plant is mandatory** (prevents concurrent polls).
- **Deterministic job IDs are mandatory**.
- Every job execution must write a **PollLog** record.

### Security
- Encrypt credentials with **AES-256-GCM** (key rotation supported).
- bcrypt cost ≥ 12 for passwords.
- Never log: credentials, tokens, encrypted blobs, master keys.

### Normalization
- Power in **Watts (W)**, energy in **kWh**.
- Timestamps in ISO 8601.
- Timezone must be IANA (no hardcoded `America/Sao_Paulo`).

## Required Environment Variables
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MASTER_KEY_CURRENT`
- `MASTER_KEY_PREVIOUS`
- `INTEGRATION_MOCK_MODE`

## AI Agent Constraints
- Do not invent behavior not supported by code and `/docs`.
- If ambiguous, ask before implementing.
- Prefer small, reviewable commits with clear messages.
