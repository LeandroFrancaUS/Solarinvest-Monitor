# Phase 3A Scope — Authentication, Encryption & Minimal API Wiring

This document defines the **complete, authoritative scope** for **Phase 3A** of the Solarinvest Monitor platform.

It exists to avoid GitHub comment truncation and MUST be followed verbatim by any AI coding agent.

---

## Source of Truth

This phase MUST follow:
- SPEC_MVP.md
- INTEGRATION_CONTRACTS.md
- CHECKLIST_DE_ACEITE.md
- MOBILE.md
- copilot-instructions.md
- THIS FILE (PHASE_3A_SCOPE.md)

If any ambiguity exists, the agent MUST ask before implementing.

---

## Explicitly Out of Scope (DO NOT IMPLEMENT)

- BullMQ jobs or worker logic
- Polling or scheduling
- Vendor adapters (Solis, Huawei, GoodWe, Dele)
- Alert engine logic
- Refresh tokens
- Push notification sending (email, web push, mobile)
- Mobile-specific endpoints beyond data model support
- Frontend work (unless strictly required for manual API testing)

---

# A) Authentication (Fastify + JWT)

## A1) POST /api/v1/auth/login

### Request JSON
```json
{
  "email": "string",
  "password": "string"
}

{
  "accessToken": "<JWT>",
  "user": {
    "id": "<uuid>",
    "email": "<email>",
    "role": "ADMIN|OPERATOR|CUSTOMER",
    "must_change_password": true
  }
}
