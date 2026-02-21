# Database Schema Documentation

## Overview

The Solarinvest Monitor uses PostgreSQL as its primary database with Prisma as the ORM. The schema follows the specifications outlined in SPEC_MVP.md and MOBILE.md.

## Technology Stack

- **Database**: PostgreSQL 16
- **ORM**: Prisma 5.22.0
- **Migrations**: Prisma Migrate
- **Security**: bcrypt (cost=12) for password hashing

## Schema Structure

### User Management

#### User
Stores user accounts for the platform.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| email | String | Unique email address |
| role | Role | ADMIN \| OPERATOR \| CUSTOMER |
| password_hash | String | bcrypt hashed password (cost ≥ 12) |
| must_change_password | Boolean | Force password change on next login |
| created_at | DateTime | Account creation timestamp |
| updated_at | DateTime | Last update timestamp |

**Relations:**
- `device_registrations` → DeviceRegistration[]

**Indices:**
- Unique: `email`

---

### Plant Management

#### Plant
Central entity representing a solar plant installation.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Plant display name |
| external_reference | String? | Vendor's plant ID |
| brand | Brand | HUAWEI \| SOLIS \| GOODWE \| DELE |
| status | PlantStatus | GREEN \| YELLOW \| RED \| GREY |
| integration_status | IntegrationStatus | See enum below |
| uf | String? | Brazilian state code |
| city | String? | City name |
| lat | Float? | Latitude |
| lng | Float? | Longitude |
| timezone | String | **Required** - IANA timezone (e.g., "America/Sao_Paulo") |
| installed_capacity_w | Float? | Installed capacity in Watts |
| installed_capacity_verified | Boolean | Capacity verification status |
| alerts_silenced_until | DateTime? | Suppress alerts until this time |
| owner_customer_id | String? | Customer owner (nullable in MVP) |
| created_at | DateTime | Creation timestamp |
| updated_at | DateTime | Last update timestamp |

**IntegrationStatus Enum:**
- `ACTIVE` - Integration working normally
- `PAUSED_AUTH_ERROR` - Authentication failed
- `DISABLED_BY_OPERATOR` - Manually disabled
- `PENDING_DOCS` - Awaiting vendor documentation

**Relations:**
- `integration_credentials` → IntegrationCredential[]
- `metric_snapshots` → MetricSnapshot[]
- `alerts` → Alert[]
- `poll_logs` → PollLog[]

**Indices:**
- `status`
- `brand`
- `integration_status`
- `owner_customer_id`

---

#### IntegrationCredential
Stores encrypted vendor API credentials per plant.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| plant_id | String | Foreign key to Plant |
| brand | Brand | Vendor brand |
| encrypted_data | String | **Encrypted** JSON credentials (AES-256-GCM) |
| key_version | String | Encryption key version for rotation |
| created_at | DateTime | Creation timestamp |
| updated_at | DateTime | Last update timestamp |

**Relations:**
- `plant` → Plant (CASCADE delete)

**Indices:**
- Unique: `(plant_id, brand)`

**Security Note:** The `encrypted_data` field is a placeholder in Phase 2. Phase 3 will implement AES-256-GCM encryption using `MASTER_KEY_CURRENT`.

---

### Metrics & Telemetry

#### MetricSnapshot
Daily aggregated metrics per plant (timezone-aware).

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| plant_id | String | Foreign key to Plant |
| date | Date | **Date type** - in plant's timezone |
| timezone | String | Timezone for this snapshot |
| today_energy_kwh | Float | **Required** - Daily energy generation |
| current_power_w | Float? | Current power output |
| grid_injection_power_w | Float? | Power injected to grid |
| total_energy_kwh | Float? | Lifetime total energy |
| last_seen_at | DateTime | **Required** - Last data update |
| source_sampled_at | DateTime | **Required** - Vendor's timestamp |
| created_at | DateTime | Record creation |
| updated_at | DateTime | Record update |

**Relations:**
- `plant` → Plant (CASCADE delete)

**Indices:**
- Unique: `(plant_id, date)`
- `date`
- `(plant_id, date)`

**Business Rules:**
- One snapshot per plant per day
- Smart backfill checks D-3 to D-0 for gaps
- Used for low generation detection (30%/10% thresholds)

---

### Alerts

#### Alert
Stores alerts with deduplication support.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| plant_id | String | Foreign key to Plant |
| type | AlertType | Alert category (see enum) |
| severity | AlertSeverity | CRITICAL \| HIGH \| MEDIUM \| LOW \| INFO |
| state | AlertState | NEW \| ACKED \| RESOLVED |
| vendor_alarm_code | String? | Vendor's alarm code (for dedupe) |
| device_sn | String? | Device serial number (for dedupe) |
| message | String | Alert message |
| occurred_at | DateTime | When alert first occurred |
| cleared_at | DateTime? | When condition cleared |
| last_notified_at | DateTime? | Last notification sent |
| created_at | DateTime | Record creation |
| updated_at | DateTime | Record update |

**AlertType Enum:**
- `OFFLINE` - Plant offline
- `LOW_GEN` - Low generation detected
- `FAULT` - Equipment fault
- `STRING` - String issue
- `VOLTAGE` - Voltage problem
- `API_ERROR` - API integration error

**Relations:**
- `plant` → Plant (CASCADE delete)

**Indices:**
- `(plant_id, state)`
- `(plant_id, type, vendor_alarm_code, device_sn, state)` - **Deduplication key**

**Deduplication Logic:**
- Dedupe key: `(plant_id, type, vendor_alarm_code, device_sn)`
- Update `last_seen_at` for active alerts
- Don't re-notify unless 6h elapsed
- Auto-resolve when condition clears

---

### Polling & Logs

#### PollLog
**Mandatory** log entry for every polling job.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| plant_id | String | Foreign key to Plant |
| job_type | PollJobType | POLL \| ALARMS \| DAILY |
| status | PollStatus | SUCCESS \| ERROR |
| duration_ms | Int | Job execution time |
| adapter_error_type | String? | Standardized error type |
| http_status | Int? | HTTP status code |
| safe_summary_json | Text? | **MUST NOT** contain secrets |
| started_at | DateTime | Job start time |
| finished_at | DateTime | Job end time |
| created_at | DateTime | Record creation |

**Relations:**
- `plant` → Plant (CASCADE delete)

**Indices:**
- `(plant_id, created_at)`
- `(job_type, status, created_at)`

**Security:** Never log credentials, tokens, or include them in `safe_summary_json`.

---

### Mobile & Notifications

#### DeviceRegistration
Stores device push notification tokens (mobile-ready).

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| user_id | String | Foreign key to User |
| platform | DevicePlatform | WEB \| IOS \| ANDROID |
| provider | PushProvider | WEBPUSH \| FCM \| APNS |
| push_token_encrypted | String | **Encrypted** push token |
| device_info | Text? | Device metadata |
| user_agent | String? | Browser/app user agent |
| enabled | Boolean | Notification enabled flag |
| created_at | DateTime | Registration time |
| last_seen_at | DateTime | Last activity |

**Relations:**
- `user` → User (CASCADE delete)

**Indices:**
- `(user_id, enabled)`
- `(platform, provider)`

**Future:** Will support FCM (Android) and APNs (iOS) in mobile app.

---

## Migrations

### Running Migrations

```bash
# Production (apply pending migrations)
pnpm db:migrate

# Development (create new migration)
pnpm db:migrate:dev --name=add_new_field

# Generate Prisma client
pnpm db:generate
```

### Migration History

| Version | Date | Description |
|---------|------|-------------|
| 20260202144614_init | 2026-02-02 | Initial schema with all MVP models |

---

## Seeding

### Admin User

Create the initial admin user:

```bash
pnpm seed:admin
```

**Credentials:**
- Email: `brsolarinvest@gmail.com`
- Role: `ADMIN`
- Password: Generated randomly and displayed once
- must_change_password: `true`

**Security:**
- Password hashed with bcrypt (cost=12)
- Random password format: `Xxxx-Xxxx-Xxxx-Xxxx`
- Password displayed only once in console

---

## Development Database

### Docker Compose Setup

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: solarinvest
    POSTGRES_PASSWORD: solarinvest_dev
    POSTGRES_DB: solarinvest_monitor
  ports:
    - "5432:5432"
```

### Connection String

```
DATABASE_URL=postgresql://solarinvest:solarinvest_dev@localhost:5432/solarinvest_monitor
```

### Accessing Database

```bash
# Using psql
docker exec -it solarinvest-postgres psql -U solarinvest -d solarinvest_monitor

# Using Prisma Studio (future)
npx prisma studio --schema=./prisma/schema.prisma
```

---

## Best Practices

### Timezone Handling
- **Always** use plant-specific timezone for date calculations
- Use `geo-tz` library to infer timezone from lat/lng
- Store dates as DATE type in plant's timezone
- Never hardcode to `America/Sao_Paulo`

### Security
- **Never** log credentials or tokens
- **Always** use bcrypt with cost ≥ 12 for passwords
- **Always** encrypt sensitive data (credentials, push tokens)
- Use `key_version` for key rotation tracking

### Performance
- Use prepared statements (Prisma handles this)
- Leverage indices for common queries
- Use CASCADE delete for referential integrity
- Implement pagination for large result sets

### Data Integrity
- Use transactions for multi-table operations
- Validate data before insert/update
- Use TypeScript types from Prisma client
- Handle unique constraint violations gracefully

---

## Common Queries

### Find Plants by Status
```typescript
const plants = await prisma.plant.findMany({
  where: { status: 'RED' },
  include: { alerts: { where: { state: 'NEW' } } }
});
```

### Get Daily Snapshots
```typescript
const snapshots = await prisma.metricSnapshot.findMany({
  where: {
    plant_id: plantId,
    date: { gte: startDate, lte: endDate }
  },
  orderBy: { date: 'asc' }
});
```

### Check for Existing Alert (Dedupe)
```typescript
const existingAlert = await prisma.alert.findFirst({
  where: {
    plant_id,
    type,
    vendor_alarm_code,
    device_sn,
    state: { in: ['NEW', 'ACKED'] }
  }
});
```

---

## Troubleshooting

### Prisma Generate Fails
If `pnpm db:generate` fails with pnpm workspace errors, the wrapper scripts automatically handle this by temporarily renaming `pnpm-workspace.yaml`.

### Migration Fails
- Check DATABASE_URL in `.env`
- Ensure PostgreSQL is running (`docker ps`)
- Check for conflicting migrations
- Review error message for constraint violations

### Seed Admin Fails
- Verify database is accessible
- Check if user already exists
- Ensure bcrypt is installed correctly
- Check .env file is loaded

---

## Future Enhancements

Phase 3 and beyond:
- [ ] Implement AES-256-GCM encryption for credentials
- [ ] Add key rotation mechanism
- [ ] Add audit log table
- [ ] Add soft delete support
- [ ] Add database backups automation
- [ ] Implement read replicas for scaling
