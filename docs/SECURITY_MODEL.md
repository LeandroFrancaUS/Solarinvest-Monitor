# Security Model

## Overview

Solarinvest Monitor implements **defense-in-depth security** across authentication, encryption, and data access layers.

**Core Principles**:
- Credentials encrypted at rest
- Passwords never stored in plaintext
- Secrets never appear in logs or API responses
- Role-based access control (RBAC)
- API-first authentication (mobile-ready)

---

## Credential Encryption

### Algorithm
**AES-256-GCM** (Galois/Counter Mode)

- **Key Size**: 256 bits (64 hex characters)
- **IV Size**: 12 bytes (random, stored per record)
- **Auth Tag**: 16 bytes (integrity verification)

### Implementation
**Location**: `apps/api/src/security/crypto.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export function encryptCredentials(
  plaintext: string,
  masterKey: Buffer
): { encrypted: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}
```

### Key Rotation

**Environment Variables**:
```bash
MASTER_KEY_CURRENT=<64-hex-chars>     # Active key for new encryptions
MASTER_KEY_PREVIOUS=<64-hex-chars>    # Fallback for old data
```

**Rotation Process**:
1. Generate new key: `openssl rand -hex 32`
2. Set as `MASTER_KEY_CURRENT`, move old to `MASTER_KEY_PREVIOUS`
3. Restart API and Worker
4. Decrypt with `PREVIOUS` fallback if `CURRENT` fails
5. Background job re-encrypts all credentials with `CURRENT` (optional)

**Storage**:
```sql
-- IntegrationCredential table
encrypted_data TEXT NOT NULL    -- Base64 AES-256-GCM ciphertext
iv TEXT NOT NULL                -- Base64 initialization vector
auth_tag TEXT NOT NULL          -- Base64 auth tag
key_version TEXT NOT NULL       -- 'current' or 'previous'
```

**Critical Rules**:
- NEVER commit `MASTER_KEY_*` to git
- NEVER log decrypted credentials
- NEVER return `encrypted_data` in API responses
- NEVER use ECB mode (use GCM only)

---

## Password Hashing

### Algorithm
**bcrypt** with cost factor ≥ 12

**Implementation**:
```typescript
import bcrypt from 'bcrypt';

// Hash password (registration, password change)
const hashedPassword = await bcrypt.hash(plainPassword, 12);

// Verify password (login)
const isValid = await bcrypt.compare(plainPassword, user.password_hash);
```

**Storage**:
```sql
-- User table
password_hash TEXT NOT NULL  -- bcrypt hash (cost 12+)
```

**Critical Rules**:
- NEVER store plaintext passwords
- NEVER log password hashes
- NEVER return `password_hash` in API responses
- Use minimum cost factor 12 (resist brute force)

---

## Authentication

### JWT (Current MVP)

**Flow**:
1. User sends `POST /api/v1/auth/login` with `{ login, password }`
2. API verifies bcrypt hash
3. API issues JWT with `{ userId, role }` payload
4. Client stores token (in-memory or secure storage, NEVER localStorage)
5. All requests include `Authorization: Bearer <token>`

**JWT Configuration**:
```bash
JWT_SECRET=<random-secret>    # NEVER commit to git
JWT_EXPIRATION=15m            # Short-lived (future: use refresh tokens)  
```

**Token Payload**:
```typescript
interface JwtPayload {
  userId: string;
  role: 'ADMIN' | 'OPERATOR' | 'CUSTOMER';
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

**Validation** (Fastify middleware):
```typescript
// apps/api/src/auth/middleware.ts
fastify.decorate('authenticate', async (request, reply) => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    const decoded = fastify.jwt.verify<JwtPayload>(token);
    request.user = await prisma.user.findUnique({ where: { id: decoded.userId }});
  } catch (err) {
    reply.code(401).send({ error: 'Invalid token' });
  }
});
```

### Refresh Tokens (Future – Mobile Apps)

**Not implemented in MVP**, but modeled for Phase 5 (mobile):

```sql
-- RefreshToken table (future)
user_id UUID NOT NULL
token_hash TEXT NOT NULL       -- bcrypt hash of refresh token
device_id TEXT                 -- iOS/Android device identifier
expires_at TIMESTAMPTZ         -- 30 days from issuance
revoked_at TIMESTAMPTZ         -- Manual revocation
```

**Future Flow**:
1. Login → Issue access token (15 min) + refresh token (30 days)
2. Access token expires → Client sends refresh token
3. API validates refresh token → Issues new access token
4. Revoke refresh token on logout or device change

---

## Role-Based Access Control (RBAC)

### Roles

| Role | Description | Access Scope |
|------|-------------|--------------|
| **ADMIN** | Full system access | All plants, all users, system config |
| **OPERATOR** | Operational monitoring | All plants (read/write), no user management |
| **CUSTOMER** | End-user (future) | Only owned plants (via `Plant.owner_customer_id`) |

**Database**:
```sql
-- User table
role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'CUSTOMER'))
```

### Query Scoping

**Example** (Plant list):
```typescript
// apps/api/src/plants/routes.ts
fastify.get('/api/v1/plants', {
  onRequest: [fastify.authenticate],
  handler: async (request, reply) => {
    const user = request.user;
    
    const plants = await prisma.plant.findMany({
      where: user.role === 'CUSTOMER' 
        ? { owner_customer_id: user.id }  // Customer: owned plants only
        : {}                               // Admin/Operator: all plants
    });
    
    return reply.send(plants);
  }
});
```

### Route Protection

**Middleware**:
```typescript
// Require authentication
fastify.get('/protected', {
  onRequest: [fastify.authenticate],
  handler: async (request, reply) => { /* ... */ }
});

// Require specific role
fastify.post('/admin-only', {
  onRequest: [fastify.authenticate, fastify.requireRole(['ADMIN'])],
  handler: async (request, reply) => { /* ... */ }
});
```

**Implementation**:
```typescript
// apps/api/src/auth/middleware.ts
fastify.decorate('requireRole', (allowedRoles: Role[]) => {
  return async (request, reply) => {
    if (!allowedRoles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  };
});
```

---

## Data Transfer Objects (DTOs)

### Purpose
Prevent leakage of sensitive data to clients.

### Operator DTOs (Internal Use)
Full data access for operational monitoring:
```typescript
interface PlantOpsDTO {
  id: string;
  name: string;
  brand: Brand;
  status: PlantStatus;
  vendor_plant_id: string;        // OK for operators
  integration_status: string;     // OK for operators
  today_energy_kwh: number;
  // ... all fields except encrypted_data
}
```

### Customer DTOs (Public / Mobile)
Safe subset for end users:
```typescript
interface PlantPublicDTO {
  id: string;
  name: string;
  status: PlantStatus;            // GREEN/YELLOW/RED only (no GREY)
  today_energy_kwh: number;
  total_energy_kwh: number;
  last_seen_at: Date;
  // NEVER include: vendor_plant_id, integration_status, vendorMeta, raw
}
```

### Critical Rules
- NEVER return raw database entities in API responses
- NEVER include `encrypted_data`, `password_hash`, `iv`, `auth_tag` in DTOs
- NEVER include `vendorMeta` or `raw` payloads in any DTO
- Use role-specific DTOs (Ops vs Public)

---

## Secrets Management

### What NEVER to Log

**Forbidden in Logs**:
- `MASTER_KEY_CURRENT`, `MASTER_KEY_PREVIOUS`
- `JWT_SECRET`
- Plaintext passwords
- `User.password_hash`
- `IntegrationCredential.encrypted_data`
- Decrypted vendor credentials
- JWT tokens (Exception: last 8 chars for debugging)
- SMTP passwords
- VAPID private keys

**Safe to Log**:
- User ID, username, role
- Plant ID, plant name
- Plant status (GREEN/YELLOW/RED/GREY)
- `integration_status` (ACTIVE, PAUSED_AUTH_ERROR, etc.)
- Adapter error types (AUTH_FAILED, RATE_LIMIT_EXCEEDED)
- Job IDs, queue names
- Durations, timestamps

### Environment Variables (Never Commit)

**.env** (git-ignored):
```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Encryption
MASTER_KEY_CURRENT=<64-hex>
MASTER_KEY_PREVIOUS=<64-hex>

# JWT
JWT_SECRET=<random-secret>

# Email
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Integration Mode
INTEGRATION_MOCK_MODE=true
```

**Critical**:
- NEVER commit `.env` to git
- Use `.env.example` with placeholder values
- Rotate secrets immediately if accidentally exposed

---

## Rate Limiting

### Login Endpoint
- **Limit**: 5 attempts per 15 minutes per IP
- **Implementation**: Fastify rate limit plugin
- **Response**: HTTP 429 Too Many Requests

```typescript
// apps/api/src/auth/routes.ts
fastify.post('/api/v1/auth/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '15 minutes'
    }
  },
  handler: async (request, reply) => { /* ... */ }
});
```

### API Endpoints
- **Global**: 100 requests per minute per IP (configurable)
- **Vendor APIs**: Respect `VendorCapabilities.polling.maxRequestsPerMinute`

---

## Web Push Security

### VAPID Keys
- **Algorithm**: ECDSA P-256
- **Generation**: `web-push generate-vapid-keys`
- **Storage**: Environment variables (NEVER commit)

**Configuration**:
```bash
VAPID_PUBLIC_KEY=<base64-public-key>
VAPID_PRIVATE_KEY=<base64-private-key>
```

**Usage**:
```typescript
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:ops@solarinvest.info',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
```

### Subscription Storage
```sql
-- DeviceRegistration table
push_token TEXT              -- Encrypted subscription JSON
platform TEXT                -- 'WEB', 'IOS', 'ANDROID'
provider TEXT                -- 'WEBPUSH', 'FCM', 'APNS'
enabled BOOLEAN DEFAULT true
```

**Encryption**:
- Web push subscription objects stored encrypted (contains endpoint URL)
- Use same AES-256-GCM encryption as credentials

---

## Security Checklist

### Before Deploying
- [ ] All environment variables set (no placeholders)
- [ ] `MASTER_KEY_CURRENT` is 64-character hex (32 bytes)
- [ ] `JWT_SECRET` is random, never committed
- [ ] bcrypt cost ≥ 12
- [ ] No secrets in logs
- [ ] No `encrypted_data` in API responses
- [ ] No `password_hash` in API responses
- [ ] Rate limiting enabled on `/api/v1/auth/login`
- [ ] HTTPS enabled (production)
- [ ] CORS configured (allow only known origins)

### Regular Audits
- [ ] Review PollLog for failed AUTH attempts
- [ ] Rotate `MASTER_KEY_*` every 90 days
- [ ] Rotate JWT_SECRET every 90 days
- [ ] Review API logs for suspicious patterns
- [ ] Verify no credentials in git history (`git log -S "MASTER_KEY"`)

---

## Incident Response

### Credential Leak
1. Immediately rotate `MASTER_KEY_CURRENT`
2. Force re-encryption of all `IntegrationCredential` records
3. Audit PollLog for unauthorized access
4. Notify affected vendors if credentials confirmed exposed

### JWT Secret Leak
1. Immediately rotate `JWT_SECRET`
2. Invalidate all active sessions
3. Force all users to re-login

### Password Hash Leak
1. Force password reset for all users
2. Audit logs for login attempts during exposure window
3. Notify users via email

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) – System overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) – Production deployment
- [ROADMAP.md](./ROADMAP.md) – Future authentication (refresh tokens)
- `apps/api/src/security/crypto.ts` – Encryption implementation
- `apps/api/src/auth/middleware.ts` – JWT validation
