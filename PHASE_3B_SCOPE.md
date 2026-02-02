# Phase 3B Scope — Worker, Mock Integrations & Monitoring Core

This document defines the **complete, authoritative scope** for **Phase 3B** of the Solarinvest Monitor platform.

Phase 3B transforms the system from a secured API into a **functional monitoring engine** using mock integrations and deterministic data.

This document MUST be followed verbatim by any AI coding agent.

---

## Source of Truth

This phase MUST follow:
- SPEC_MVP.md
- INTEGRATION_CONTRACTS.md
- CHECKLIST_DE_ACEITE.md
- PHASE_3A_SCOPE.md
- MOBILE.md
- copilot-instructions.md
- THIS FILE (PHASE_3B_SCOPE.md)

If any ambiguity exists, the agent MUST ask before implementing.

---

## Explicitly Out of Scope (DO NOT IMPLEMENT)

- Real vendor APIs (Huawei, Solis, GoodWe, Dele)
- Email, Web Push or Mobile Push notifications
- Frontend dashboards beyond basic validation
- Refresh tokens or auth changes
- Multi-tenant billing or payments
- Auto-scaling or production infra tuning

---

# A) Worker Architecture (BullMQ)

## A1) Worker Service

Location:
