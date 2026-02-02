# Phase 3B Testing Guide

Complete end-to-end testing guide for mock integrations and monitoring functionality.

## Prerequisites

1. **Infrastructure Running**
   ```bash
   cd infra
   docker compose up -d
   ```
   
   Verify:
   - PostgreSQL on port 5432
   - Redis on port 6379
   - Mailhog on ports 1025/8025

2. **Environment Variables**
   Create `.env` file in repo root:
   ```bash
   DATABASE_URL=postgresql://solarinvest:solarpass@localhost:5432/solarinvest_monitor
   REDIS_URL=redis://localhost:6379
   INTEGRATION_MOCK_MODE=true
   MASTER_KEY_CURRENT=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   MASTER_KEY_PREVIOUS=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   ```

3. **Database Setup**
   ```bash
   pnpm db:migrate
   pnpm db:generate
   pnpm seed:admin
   ```

## Step 1: Seed Test Plants

```bash
pnpm seed:test-plants
```

Expected output:
```
============================================
Seeding Test Plants for Phase 3B
============================================

✓ Created plant: Usina Solar Santos (Solis) (<uuid>)
  Brand: SOLIS
  Status: GREY
  Integration: ACTIVE

✓ Created plant: Parque Solar Brasília (Huawei) (<uuid>)
  Brand: HUAWEI
  Status: GREY
  Integration: ACTIVE

✓ Created plant: Fazenda Fotovoltaica Curitiba (GoodWe) (<uuid>)
  Brand: GOODWE
  Status: GREY
  Integration: ACTIVE

✓ Created plant: Estação Solar Fortaleza (Dele) (<uuid>)
  Brand: DELE
  Status: GREY
  Integration: ACTIVE

============================================
Seeding complete!
============================================
```

## Step 2: Start Worker

```bash
cd apps/worker
pnpm dev
```

Expected output:
```
============================================
Solarinvest Monitor Worker
============================================
Redis URL: redis://localhost:6379
Mock Mode: true
============================================

✓ Worker connected to Redis
✓ Redis is ready

Initializing workers and queues...

✓ Created worker and queue for SOLIS
✓ Created worker and queue for HUAWEI
✓ Created worker and queue for GOODWE
✓ Created worker and queue for DELE

✓ Worker initialization complete
Workers are now polling plants...

[Scheduler] Enqueueing plants for polling...
[Scheduler] Found 4 active plants
[Scheduler] Enqueued SOLIS plant: Usina Solar Santos (Solis) (<uuid>)
[Scheduler] Enqueued HUAWEI plant: Parque Solar Brasília (Huawei) (<uuid>)
[Scheduler] Enqueued GOODWE plant: Fazenda Fotovoltaica Curitiba (GoodWe) (<uuid>)
[Scheduler] Enqueued DELE plant: Estação Solar Fortaleza (Dele) (<uuid>)
[Scheduler] Scheduling complete

[SOLIS] Polling plant <uuid>...
[HUAWEI] Polling plant <uuid>...
[GOODWE] Polling plant <uuid>...
[DELE] Polling plant <uuid>...

[SOLIS] Plant <uuid> polled successfully
[HUAWEI] Plant <uuid> polled successfully
[GOODWE] Plant <uuid> polled successfully
[DELE] Plant <uuid> polled successfully
```

## Step 3: Verify Database Records

### Check MetricSnapshots

```bash
docker exec -it solarinvest-postgres psql -U solarinvest -d solarinvest_monitor

SELECT 
  p.name, 
  ms.date, 
  ms.today_energy_kwh, 
  ms.current_power_w,
  ms.last_seen_at
FROM "MetricSnapshot" ms
JOIN "Plant" p ON p.id = ms.plant_id
ORDER BY ms.date DESC, p.name;
```

Expected: 4 snapshots (one per plant) with realistic data from fixtures.

### Check Plant Status

```sql
SELECT name, brand, status, integration_status, updated_at
FROM "Plant"
ORDER BY name;
```

Expected: All plants should have status GREEN (assuming last_seen_at is recent).

### Check Alerts

```sql
SELECT 
  p.name,
  a.type,
  a.severity,
  a.state,
  a.message,
  a.occurred_at
FROM "Alert" a
JOIN "Plant" p ON p.id = a.plant_id
ORDER BY a.occurred_at DESC;
```

Expected: 
- 1 MOCK_FAULT alert from Solis (resolved)
- 1 MOCK_FAULT alert from GoodWe (active, LOW severity)

### Check PollLogs

```sql
SELECT 
  p.name,
  pl.job_type,
  pl.status,
  pl.duration_ms,
  pl.finished_at
FROM "PollLog" pl
JOIN "Plant" p ON p.id = pl.plant_id
ORDER BY pl.finished_at DESC
LIMIT 10;
```

Expected: SUCCESS entries for all 4 plants.

## Step 4: Test API Endpoints

### Health Check

```bash
curl http://localhost:3001/api/v1/health
```

Expected: `{"status":"ok"}`

### Login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"brsolarinvest@gmail.com","password":"YOUR_SEED_PASSWORD"}'
```

Save the `accessToken` from response.

### List Plants (with live monitoring data)

```bash
curl http://localhost:3001/api/v1/plants \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expected: Array of 4 plants with status, brand, and metadata.

### Get Plant Details

```bash
curl http://localhost:3001/api/v1/plants/<PLANT_ID> \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expected: Full plant details.

### List Alerts

```bash
curl http://localhost:3001/api/v1/alerts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expected: Array of alerts from fixtures.

## Step 5: Acceptance Criteria Validation

### ✅ AC1: Worker starts and runs without crashes
Worker should stay running and log periodic polling activity.

### ✅ AC2: Polling jobs execute on schedule
Check worker logs every 10 minutes for scheduling activity.

### ✅ AC3: MetricSnapshots are created automatically
Verify database has snapshots for all 4 plants.

### ✅ AC4: Plant status transitions correctly
All plants should transition from GREY → GREEN after first poll.

### ✅ AC5: Alerts are created, deduplicated, and resolved correctly
- Solis: 1 resolved MOCK_FAULT
- GoodWe: 1 active LOW severity MOCK_FAULT

### ✅ AC6: PollLog entries exist for every job
Check PollLog table has SUCCESS entries.

### ✅ AC7: No vendor APIs are called
Worker runs entirely from fixtures (no network calls).

### ✅ AC8: No secrets appear in logs
Verify logs don't contain credentials or sensitive data.

### ✅ AC9: API endpoints return live monitoring data
GET /api/v1/plants returns plants with correct status and brand.

### ✅ AC10: System functions fully in INTEGRATION_MOCK_MODE
All functionality works without external API dependencies.

## Troubleshooting

### Worker fails with "INTEGRATION_MOCK_MODE must be true"
Set the environment variable:
```bash
export INTEGRATION_MOCK_MODE=true
```

### Fixtures not found
Ensure you're running worker from repo root or set `fixturesBasePath` in adapters.

### Redis connection fails
Check Docker: `docker compose ps` and ensure Redis is running.

### No plants being polled
Verify plants have `integration_status = 'ACTIVE'` in database.

## Success Criteria

Phase 3B is successful if:
1. ✅ Worker runs continuously without errors
2. ✅ All 4 plants are polled every 10 minutes
3. ✅ MetricSnapshots are created and updated
4. ✅ Plant statuses are computed correctly
5. ✅ Alerts are generated from fixtures
6. ✅ PollLogs record all operations
7. ✅ API endpoints return live data
8. ✅ System runs entirely in mock mode
9. ✅ No external API calls made
10. ✅ No secrets logged

---

**Phase 3B Complete! 🎉**
