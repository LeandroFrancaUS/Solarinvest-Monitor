PHASE_3A_SCOPE.txt
==================

Phase 3A Scope — Authentication, Encryption & Minimal API Wiring

This document defines the complete, authoritative scope for Phase 3A of the Solarinvest Monitor platform.

It exists to avoid GitHub comment truncation and MUST be followed verbatim by any AI coding agent.

----------------------------------------------------------------

SOURCE OF TRUTH

This phase MUST follow:
- SPEC_MVP.md
- INTEGRATION_CONTRACTS.md
- CHECKLIST_DE_ACEITE.md
- MOBILE.md
- copilot-instructions.md
- THIS FILE (PHASE_3A_SCOPE.txt)

If any ambiguity exists, the agent MUST ask before implementing.

----------------------------------------------------------------

EXPLICITLY OUT OF SCOPE (DO NOT IMPLEMENT)

- BullMQ jobs or worker logic
- Polling or scheduling
- Vendor adapters (Solis, Huawei, GoodWe, Dele)
- Alert engine logic
- Refresh tokens
- Push notification sending (email, web push, mobile)
- Mobile-specific endpoints beyond data model support
- Frontend work (unless strictly required for manual API testing)

================================================================
A) AUTHENTICATION (FASTIFY + JWT)
================================================================

A1) POST /api/v1/auth/login

REQUEST JSON
------------
{
  "email": "string",
  "password": "string"
}

RESPONSE 200 JSON (EXACT FORMAT)
--------------------------------
{
  "accessToken": "<JWT>",
  "user": {
    "id": "<uuid>",
    "email": "<email>",
    "role": "ADMIN|OPERATOR|CUSTOMER",
    "must_change_password": true
  }
}

RULES
-----
- Validate request using Zod
- Rate-limit this endpoint
- Verify password using bcrypt against User.password_hash
- bcrypt cost MUST be >= 12
- On invalid credentials:
  - Return HTTP 401
  - Use generic error message (no user enumeration)
- DO NOT use cookies
- Client must authenticate subsequent requests using:
  Authorization: Bearer <JWT>

JWT CONFIGURATION (LOCKED)
--------------------------
- Secret: JWT_SECRET (environment variable)
- Algorithm: HS256
- Expiration: 15 minutes
- Payload MUST include:
  - sub: userId
  - role: user role

----------------------------------------------------------------

A2) POST /api/v1/auth/change-password

AUTHENTICATION
--------------
Requires Authorization: Bearer <JWT>

REQUEST JSON
------------
{
  "newPassword": "string"
}

RULES
-----
- Validate with Zod
- Minimum length: 12 characters
- Hash password using bcrypt (cost >= 12)
- Set must_change_password = false after success

RESPONSE
--------
{ "ok": true }

----------------------------------------------------------------

A3) AUTH MIDDLEWARE & RBAC

- Implement Fastify auth hook/decorator that:
  - Verifies JWT from Authorization header
  - Attaches request.user = { id, email, role }
- Provide helper to enforce RBAC:
  - requireRole(["ADMIN", "OPERATOR"])

----------------------------------------------------------------

A4) HEALTH CHECK

GET /api/v1/health

RESPONSE
--------
{ "status": "ok" }

================================================================
B) ENCRYPTION (AES-256-GCM + KEY ROTATION)
================================================================

Implementation location:
apps/api/src/security/crypto.ts

FUNCTION SIGNATURES (LOCKED)
----------------------------

EncryptedPayload:
{
  ciphertextB64: string
  ivB64: string
  tagB64: string
}

encryptAESGCM(plaintext: string, keyHex: string) -> EncryptedPayload
decryptAESGCM(payload: EncryptedPayload, keyHex: string) -> string

----------------------------------------------------------------

B1) KEY MANAGEMENT

- Environment variables:
  - MASTER_KEY_CURRENT (required)
  - MASTER_KEY_PREVIOUS (optional)
- Key format:
  - 64 hex characters (32 bytes)
- Validate keys at application startup
- Fail fast if MASTER_KEY_CURRENT is invalid

----------------------------------------------------------------

B2) IV / NONCE RULES

- Generate a random 12-byte IV for every encryption
- Use AES-256-GCM
- Authentication tag MUST be stored separately as tagB64

----------------------------------------------------------------

B3) KEY ROTATION BEHAVIOR

- When decrypting:
  1) Try MASTER_KEY_CURRENT
  2) If it fails, try MASTER_KEY_PREVIOUS
- When encrypting:
  - Always use MASTER_KEY_CURRENT
  - Store key_version = "current" in database

----------------------------------------------------------------

B4) ENCRYPTED FIELDS (MANDATORY)

Apply encryption-at-rest to:
- IntegrationCredential.encrypted_data
- DeviceRegistration.push_token_encrypted

Storage format (JSON string):
{
  "ciphertextB64": "...",
  "ivB64": "...",
  "tagB64": "..."
}

SECURITY RULES
--------------
- NEVER log plaintext, keys, credentials, or tokens
- Errors must not leak sensitive data

================================================================
C) MINIMAL API WIRING (NO BUSINESS LOGIC)
================================================================

C1) PLANTS

GET /api/v1/plants
------------------
- Auth required
- ADMIN / OPERATOR -> all plants
- CUSTOMER -> only plants where owner_customer_id = request.user.id

----------------------------------------------------------------

POST /api/v1/plants
-------------------
- Auth required
- ADMIN only

REQUEST JSON
------------
{
  "name": "string",
  "brand": "HUAWEI|SOLIS|GOODWE|DELE",
  "timezone": "string",
  "uf": "string?",
  "city": "string?",
  "lat": "number?",
  "lng": "number?",
  "installed_capacity_w": "number?"
}

DEFAULTS
--------
- status = GREY
- integration_status = PENDING_DOCS

IMPORTANT:
- DO NOT accept vendor credentials in Phase 3A

----------------------------------------------------------------

GET /api/v1/plants/:id
----------------------
- Same RBAC rules as list

----------------------------------------------------------------

C2) INTEGRATIONS TEST (STUB ONLY)

POST /api/v1/integrations/test
------------------------------
- Validate payload using Zod
- Shape MUST match CredentialInput from INTEGRATION_CONTRACTS.md

RESPONSE
--------
{
  "ok": false,
  "message": "Adapters not implemented in Phase 3A"
}

IMPORTANT:
- DO NOT implement adapters

----------------------------------------------------------------

C3) ALERTS (MINIMAL)

GET /api/v1/alerts
------------------
- Auth required
- Return DB records or empty array []
- No alert engine logic

================================================================
D) ACCEPTANCE CRITERIA
================================================================

Phase 3A is complete ONLY if ALL conditions below are met:

1) pnpm dev runs with no crashes
2) /api/v1/auth/login works with seeded admin user
3) Login response includes full accessToken and user object
4) Admin is forced to change password on first login
5) /api/v1/auth/change-password works and clears must_change_password
6) JWT:
   - HS256
   - 15 minute expiry
   - Uses JWT_SECRET
   - Contains sub and role
7) AES-256-GCM encryption/decryption works correctly
8) Encrypted fields are NOT stored in plaintext
9) No secrets appear in logs
10) RBAC enforced on plant endpoints
11) /api/v1/integrations/test validates payload and returns stub response
12) No worker, polling, adapters, or alert engine code exists in this phase

----------------------------------------------------------------

END OF PHASE 3A SCOPE
