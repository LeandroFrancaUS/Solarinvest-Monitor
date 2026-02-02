Phase 3B Scope — Worker, Mock Integrations & Monitoring Core

This document defines the complete, authoritative scope for Phase 3B of the Solarinvest Monitor platform.

Phase 3B transforms the system from a secured API into a functional monitoring engine using mock integrations and deterministic data.

This document MUST be followed verbatim by any AI coding agent.

----------------------------------------------------------------

SOURCE OF TRUTH

This phase MUST follow:
- SPEC_MVP.md
- INTEGRATION_CONTRACTS.md
- CHECKLIST_DE_ACEITE.md
- PHASE_3A_SCOPE.md
- MOBILE.md
- copilot-instructions.md
- THIS FILE (PHASE_3B_SCOPE.txt)

If any ambiguity exists, the agent MUST ask before implementing.

----------------------------------------------------------------

EXPLICITLY OUT OF SCOPE (DO NOT IMPLEMENT)

- Real vendor APIs (Huawei, Solis, GoodWe, Dele)
- Email notifications
- Web Push notifications
- Mobile Push notifications
- Frontend dashboards beyond basic validation
- Refresh tokens or auth changes
- Multi-tenant billing or payments
- Auto-scaling or production infrastructure tuning

================================================================
A) WORKER ARCHITECTURE (BULLMQ)
================================================================

A1) Worker Service

Location:
apps/worker

Responsibilities:
- Poll plants periodically
- Call mock adapters
- Normalize metrics
- Persist MetricSnapshots
- Generate alerts
- Update plant status

Worker MUST NOT:
- Expose HTTP APIs
- Perform authentication
- Contain frontend logic

----------------------------------------------------------------

A2) QUEUES (LOCKED)

Use BullMQ with Redis.

Queues:
- queue:poll:solis
- queue:poll:huawei
- queue:poll:goodwe
- queue:poll:dele

Each plant MUST be enqueued based on its brand.

----------------------------------------------------------------

A3) CONCURRENCY & LOCKS

- Use Redis locks per plant:
  lock:plant:{plantId}
- TTL = 2 × polling interval
- Never poll the same plant concurrently
- Deterministic job IDs:
  poll:plant:{plantId}:latest
  daily:plant:{plantId}:{YYYY-MM-DD}

================================================================
B) MOCK INTEGRATIONS (FIXTURES)
================================================================

B1) FIXTURE-BASED ADAPTERS

Adapters MUST:
- Live in packages/integrations/<brand>
- Implement VendorAdapter interface
- Load data ONLY from fixtures/<brand>/*.json

No HTTP calls allowed in this phase.

----------------------------------------------------------------

B2) NORMALIZATION RULES

All adapters MUST output normalized structures:
- Power in W
- Energy in kWh
- Timestamps in ISO 8601
- Timezone-aware calculations

Raw vendor payloads MUST NOT leak outside adapters.

================================================================
C) METRIC PROCESSING
================================================================

C1) METRIC SNAPSHOT (DAILY)

Worker MUST:
- Create one MetricSnapshot per plant per day
- Respect plant timezone
- Backfill up to D-3 if gaps exist

Required fields:
- date
- today_energy_kwh
- peak_power_w (optional)
- raw_source = MOCK

----------------------------------------------------------------

C2) POLLLOG (MANDATORY)

Every poll job MUST create a PollLog entry:
- plant_id
- job_type
- status (SUCCESS | ERROR)
- duration_ms
- adapter_error_type (nullable)

No secrets allowed in logs.

================================================================
D) STATUS COMPUTATION (LOCKED)
================================================================

Plant.status MUST be derived automatically:

- GREEN:
  - last_seen_at <= 2 hours
  - No active RED alerts
- YELLOW:
  - last_seen_at between 2h and 24h
  - OR low generation (<30% of 7-day median)
- RED:
  - last_seen_at > 24h
  - OR critical alert
- GREY:
  - integration_status != ACTIVE

================================================================
E) ALERT ENGINE (MINIMAL)
================================================================

E1) ALERT TYPES (MVP)

- OFFLINE
- LOW_GENERATION
- MOCK_FAULT

----------------------------------------------------------------

E2) DEDUPLICATION (LOCKED)

Deduplication key:
(plant_id, type, vendor_alarm_code, device_sn)

States:
- NEW
- ACKED
- RESOLVED

Rules:
- Do NOT create duplicate active alerts
- Update last_seen_at instead
- Auto-resolve when condition clears

================================================================
F) API EXPOSURE (READ-ONLY)
================================================================

Phase 3B does NOT add new endpoints.

Existing endpoints MUST now return live monitoring data:
- GET /api/v1/plants
- GET /api/v1/plants/:id
- GET /api/v1/alerts

================================================================
G) MOCK MODE (REQUIRED)
================================================================

Environment variable:
INTEGRATION_MOCK_MODE=true

When enabled:
- Worker MUST use fixtures only
- No external calls allowed
- System MUST be fully functional

================================================================
H) ACCEPTANCE CRITERIA
================================================================

Phase 3B is complete ONLY if ALL conditions below are met:

1) Worker starts and runs without crashes
2) Polling jobs execute on schedule
3) MetricSnapshots are created automatically
4) Plant status transitions correctly (GREEN/YELLOW/RED/GREY)
5) Alerts are created, deduplicated, and resolved correctly
6) PollLog entries exist for every job
7) No vendor APIs are called
8) No secrets appear in logs
9) API endpoints return live monitoring data
10) System functions fully in INTEGRATION_MOCK_MODE

----------------------------------------------------------------

END OF PHASE 3B SCOPE
