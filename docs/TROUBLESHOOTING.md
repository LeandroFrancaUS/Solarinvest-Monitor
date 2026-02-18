# Troubleshooting Guide

Complete debugging guide for Phase 3B worker and polling system.

## Quick Decision Tree

### Symptom: Worker not polling

```
1. Check worker is running: `pnpm --filter worker dev`
2. Check Redis connection: Worker logs "✓ Redis is ready"
3. Check INTEGRATION_MOCK_MODE: Must be "true" (worker exits if false)
4. Check plants exist with integration_status = ACTIVE:
   psql> SELECT id, name, integration_status FROM plants;
5. Check scheduler started: Worker logs "✓ Worker initialization complete"
```

### Symptom: Polls fail silently

```
1. Check Redis locks: redis-cli KEYS "lock:plant:*"
   - Stale locks block polling (TTL: 1200s)
   - Manual removal (⚠️ DEV ONLY): redis-cli DEL "lock:plant:PLANT_ID"
2. Check PollLog table for errors:
   psql> SELECT * FROM poll_logs ORDER BY created_at DESC LIMIT 10;
3. Check adapter_error_type column for error classification
4. Check worker console for error logs: "[BRAND] Error polling plant..."
```

### Symptom: MetricSnapshots not created

```
1. Check unique constraint violation: (plant_id, date)
   - Date must be YYYY-MM-DD in plant timezone
   - Multiple polls same day → upsert (not duplicate)
2. Check plant timezone is valid IANA string
3. Check fixture has todayEnergyKWh (required field)
4. Check worker logs for database errors
```

### Symptom: Plant status stuck on GREY

```
1. Check integration_status: Must be ACTIVE
   psql> UPDATE plants SET integration_status = 'ACTIVE' WHERE id = 'PLANT_ID';
2. Check polling succeeded: Look for MetricSnapshot records
3. Check last_seen_at is recent (< 2h for GREEN)
4. Restart worker to trigger immediate poll
```

### Symptom: Alerts not appearing

```
1. Check fixture alarms array has active alarms (isActive: true)
2. Check dedupe logic not blocking:
   psql> SELECT * FROM alerts WHERE plant_id = 'PLANT_ID' AND state IN ('NEW', 'ACKED');
3. Check severity mapping: LOW | MEDIUM | HIGH | CRITICAL
4. Check alerts_silenced_until on plant (blocks notifications)
```

### Symptom: Jobs not processing

```
1. Check BullMQ queue exists: redis-cli KEYS "bull:queue:poll:*"
2. Check job ID format: `poll:plant:{plantId}:latest`
   - Deterministic IDs prevent duplicates
   - Same ID → job not re-added if already queued
3. Check concurrency limits:
   - Per-worker: 5 concurrent jobs
   - Rate limit: 30 jobs/minute
4. Check job retry attempts (max: 2)
```

## Top Failure Modes

### 1. Redis Lock Leak

**Cause**: Worker crashes before releasing lock

**Symptom**: Plant never polls again until TTL expires (20 minutes)

**Fix**: 
```bash
redis-cli DEL "lock:plant:PLANT_ID"
```

**Prevention**: Worker uses try/finally to release locks (already implemented)

**Code Location**: `apps/worker/src/poll-worker.ts:65-150`

---

### 2. Deterministic Job ID Collision

**Cause**: Job ID `poll:plant:{plantId}:latest` already exists in queue

**Symptom**: Scheduler logs "Enqueued" but worker doesn't process

**Fix**: This is **expected behavior** - job is already queued/processing. Wait for completion.

**Prevention**: None needed - this is correct deduplication behavior

**Code Location**: `apps/worker/src/scheduler.ts:83-85`

---

### 3. Mock Mode Environment Variable

**Cause**: `INTEGRATION_MOCK_MODE` not set or set to "false"

**Symptom**: Worker exits with error:
```
ERROR: INTEGRATION_MOCK_MODE must be set to 'true' in Phase 3B
```

**Fix**: Set environment variable
```bash
# In .env file
INTEGRATION_MOCK_MODE=true
```

**Prevention**: Worker validates on startup (Phase 3B requirement)

**Code Location**: `apps/worker/src/index.ts:21-23`

---

### 4. Timezone/Snapshot Uniqueness

**Cause**: Date stored in UTC instead of plant timezone

**Symptom**: Duplicate key error on MetricSnapshot insert
```
ERROR: duplicate key value violates unique constraint "metric_snapshots_plant_id_date_key"
```

**Fix**: Use plant-specific timezone, not hardcoded

**Code Example**:
```typescript
// ❌ WRONG - Uses system timezone
date: new Date()

// ✅ CORRECT - Uses YYYY-MM-DD
date: new Date(new Date().toISOString().split('T')[0])
timezone: plant.timezone // From DB, not hardcoded
```

**Prevention**: Always use `summary.timezone` from adapter response

**Code Location**: `apps/worker/src/poll-worker.ts:99-107`

---

### 5. Fixture Missing Required Fields

**Cause**: `todayEnergyKWh` missing in fixture `plant_summary`

**Symptom**: MetricSnapshot creation fails
```
ERROR: null value in column "today_energy_kwh" violates not-null constraint
```

**Fix**: Add required field to fixture
```json
{
  "plant_summary": {
    "todayEnergyKWh": 28.5  // Required
  }
}
```

**Required fields**: 
- `currentPowerW`
- `todayEnergyKWh` ← **Database constraint**
- `lastSeenAt`
- `sourceSampledAt`
- `timezone`

**Code Location**: See `docs/FIXTURES_SPEC.md`

---

### 6. Database Connection Exhaustion

**Cause**: Worker creates new PrismaClient per poll (wrong pattern)

**Symptom**: 
```
ERROR: too many clients already
```

**Fix**: Use singleton PrismaClient (already implemented correctly)

**Code Example**:
```typescript
// ❌ WRONG - Creates new client per poll
async function poll() {
  const prisma = new PrismaClient();
  // ...
}

// ✅ CORRECT - Singleton at module scope
const prisma = new PrismaClient(); // Top-level

async function poll() {
  // Use shared instance
}
```

**Code Location**: `apps/worker/src/poll-worker.ts:12` (correct implementation)

---

### 7. Alert Deduplication Bug

**Cause**: Dedupe key mismatch (e.g., `device_sn` null vs empty string)

**Symptom**: Duplicate alerts created for same alarm

**Fix**: Normalize null/undefined to null in dedupe query

**Code Example**:
```typescript
// Dedupe key (must match exactly)
const existingAlert = await prisma.alert.findFirst({
  where: {
    plant_id: plantId,
    type: 'MOCK_FAULT',
    vendor_alarm_code: alarm.vendorAlarmCode,
    device_sn: alarm.deviceSn || null, // Normalize empty to null
    state: { in: ['NEW', 'ACKED'] },
  },
});
```

**Prevention**: Use exact dedupe key: `(plant_id, type, vendor_alarm_code, device_sn)`

**Code Location**: `apps/worker/src/poll-worker.ts:240-250`

## Useful Debugging Commands

### Check Active Locks
```bash
# List all plant locks
redis-cli KEYS "lock:plant:*"

# Check TTL for specific lock
redis-cli TTL "lock:plant:PLANT_ID"

# Manually remove lock (⚠️ DEV ONLY)
redis-cli DEL "lock:plant:PLANT_ID"
```

### Check Queue Status
```bash
# Jobs waiting to be processed
redis-cli LLEN "bull:queue:poll:solis:wait"

# Jobs currently processing
redis-cli LLEN "bull:queue:poll:solis:active"

# Failed jobs
redis-cli LLEN "bull:queue:poll:solis:failed"
```

### Check Recent Polls (SQL)
```sql
SELECT 
  p.name, 
  pl.status, 
  pl.duration_ms, 
  pl.adapter_error_type, 
  pl.created_at
FROM poll_logs pl
JOIN plants p ON p.id = pl.plant_id
ORDER BY pl.created_at DESC
LIMIT 20;
```

### Check Plant Status (SQL)
```sql
SELECT 
  id, 
  name, 
  brand, 
  status, 
  integration_status, 
  EXTRACT(EPOCH FROM (NOW() - (
    SELECT last_seen_at 
    FROM metric_snapshots 
    WHERE plant_id = plants.id 
    ORDER BY created_at DESC 
    LIMIT 1
  )))/3600 AS hours_since_seen
FROM plants;
```

### Check Alert States (SQL)
```sql
SELECT 
  p.name,
  a.type,
  a.severity,
  a.state,
  a.message,
  a.occurred_at,
  a.last_seen_at
FROM alerts a
JOIN plants p ON p.id = a.plant_id
WHERE a.state IN ('NEW', 'ACKED')
ORDER BY a.occurred_at DESC;
```

### ⚠️ Force Clear All Locks (DEV ONLY - NUCLEAR OPTION)

**WARNING**: This removes ALL plant locks. Only use in development when locks are stuck.

```bash
redis-cli KEYS "lock:plant:*" | xargs redis-cli DEL
```

**Better approach**: Restart worker (locks TTL expires in 20 minutes automatically)

## Common Log Patterns

### Successful Poll
```
[SOLIS] Polling plant clmn8x9y00001...
Plant clmn8x9y00001 status changed: GREY → GREEN
[SOLIS] Plant clmn8x9y00001 polled successfully
[SOLIS] Job poll:plant:clmn8x9y00001:latest completed
```

### Lock Contention (Normal)
```
[SOLIS] Plant clmn8x9y00001 already locked, skipping
```
*This is expected - prevents concurrent polls*

### Integration Paused
```
[SOLIS] Plant clmn8x9y00001 integration not active, skipping
```
*Check `integration_status` in database*

### Adapter Error
```
[SOLIS] Error polling plant clmn8x9y00001: AdapterError: NETWORK_TIMEOUT
[SOLIS] Job poll:plant:clmn8x9y00001:latest failed: AdapterError
```
*Check `poll_logs` table for full error details*

### Backfill Success
```
[Backfill] Plant clmn8x9y00001 missing 2 days, fetching...
[Backfill] Created snapshot for 2026-02-01: 31.5 kWh
[Backfill] Created snapshot for 2026-02-02: 28.5 kWh
```

### Alert Created
```
Created alert for plant clmn8x9y00001: Grid voltage out of range
[LowGen] Created low generation alert for plant clmn8x9y00001
```

## Security Notes

### Never Log These Values
- ❌ Credentials (API keys, passwords, tokens)
- ❌ `integrationCredential.encrypted_data`
- ❌ `MASTER_KEY_CURRENT` or `MASTER_KEY_PREVIOUS`
- ❌ JWT tokens
- ❌ User passwords or hashes

### Safe to Log
- ✅ Plant IDs (cuid)
- ✅ Plant names
- ✅ Brand names
- ✅ Status values (GREEN/YELLOW/RED/GREY)
- ✅ Public metrics (power, energy)
- ✅ Timestamps
- ✅ Error types (not error details if they contain secrets)

**Verified**: All worker logs follow these rules (checked in code review)
