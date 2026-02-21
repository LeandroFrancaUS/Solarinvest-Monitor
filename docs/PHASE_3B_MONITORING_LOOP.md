# Phase 3B Monitoring Loop

Complete end-to-end flow documentation for the worker polling system.

## Complete End-to-End Flow

**1. Seed Test Plants**
```bash
pnpm seed:test-plants
```
Creates plants in DB with `integration_status: ACTIVE` and `status: GREY`.

**2. Start Worker**
```bash
pnpm --filter worker dev
```
- Worker connects to Redis and Postgres
- Creates 4 brand-specific queues: `queue:poll:solis`, `queue:poll:huawei`, `queue:poll:goodwe`, `queue:poll:dele`
- Starts 4 BullMQ workers (one per brand)
- Scheduler runs immediately, then every 10 minutes

**3. Enqueue Plants (Automatic)**
Scheduler queries all plants where `integration_status = ACTIVE` and adds jobs:
```typescript
// Deterministic job ID prevents duplicates
jobId: `poll:plant:{plantId}:latest`

// Job data
{ plantId: "...", brand: "SOLIS" }

// Job options
attempts: 2, backoff: exponential (5s delay)
```

**4. Poll Execution (Worker)**
For each job:
1. **Acquire Redis lock**: `lock:plant:{plantId}` (TTL: 1200s)
   - If locked → skip (prevents concurrent polls)
2. **Get plant from DB** (includes `integrationCredential`)
3. **Skip if** `integration_status != ACTIVE`
4. **Call adapter**:
   ```typescript
   const summary = adapter.getPlantSummary(ref, creds);
   const alarms = adapter.getAlarmsSince(ref, creds, since);
   ```
5. **Create/Update MetricSnapshot**:
   ```typescript
   // Unique constraint: (plant_id, date)
   date: YYYY-MM-DD in plant timezone
   today_energy_kwh: summary.todayEnergyKWh (required)
   last_seen_at: summary.lastSeenAt
   ```
6. **Update Plant Status**: Calculate GREEN/YELLOW/RED/GREY based on `last_seen_at` and active alerts
7. **Process Alarms**: Dedupe by `(plant_id, type, vendor_alarm_code, device_sn)`, create/update/resolve alerts
8. **Backfill Metrics**: Check D-3 to D-0 for gaps, call `getDailyEnergySeries` if missing
9. **Check Low Generation**: Compare today vs 7-day median (YELLOW: <30%, RED: <10%)
10. **Check Offline**: If `last_seen_at > 24h` → create OFFLINE alert
11. **Release Redis lock**
12. **Create PollLog**: Record status, duration, errors (mandatory for all polls)

**5. Status Update Rules**
```
GREY:  integration_status != ACTIVE
RED:   last_seen_at > 24h OR critical alerts exist
YELLOW: last_seen_at 2-24h OR low generation (30% threshold)
GREEN:  last_seen_at ≤ 2h, no RED alerts
```

**6. Alert Deduplication**
```typescript
// Dedupe key (composite)
(plant_id, type, vendor_alarm_code, device_sn)

// States
NEW → ACKED → RESOLVED

// Re-notification
Only if last_notified_at > 6h ago
```

## Force Immediate Polling (No Waiting)

### Option 1: Restart Worker (RECOMMENDED)
Triggers scheduler immediately:
```bash
# Ctrl+C the worker, then restart
pnpm --filter worker dev
```

### Option 2: Manual Trigger Script (DEV ONLY)
Create a script for development:
```typescript
// scripts/trigger-poll.ts
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const redis = new Redis(process.env.REDIS_URL);
const queue = new Queue('queue:poll:solis', { connection: redis });

await queue.add('poll-plant', {
  plantId: 'YOUR_PLANT_ID',
  brand: 'SOLIS'
}, {
  jobId: `poll:plant:YOUR_PLANT_ID:manual-${Date.now()}`
});

console.log('✓ Poll job enqueued');
await queue.close();
await redis.quit();
```

### ⚠️ Option 3: Redis CLI (DEV ONLY - USE WITH CAUTION)
**WARNING**: Direct queue manipulation can cause issues. Only use in development.

```bash
# Connect to Redis
redis-cli

# Add job to Solis queue (example)
XADD "bull:queue:poll:solis:events" * "event" "added" "jobId" "poll:plant:PLANT_ID:latest"
```

**Note**: This bypasses BullMQ's job validation and can lead to inconsistent state.

## Understanding Worker Logs

**Successful Poll:**
```
[SOLIS] Polling plant clmn8x9y00001...
✓ Created worker and queue for SOLIS
Plant clmn8x9y00001 status changed: GREY → GREEN
[SOLIS] Plant clmn8x9y00001 polled successfully
[SOLIS] Job poll:plant:clmn8x9y00001:latest completed
```

**Lock Contention (Expected):**
```
[SOLIS] Plant clmn8x9y00001 already locked, skipping
```
This is normal - lock prevents concurrent polls.

**Integration Inactive:**
```
[SOLIS] Plant clmn8x9y00001 integration not active, skipping
```
Plant needs `integration_status = ACTIVE` to be polled.

**Errors:**
```
[SOLIS] Error polling plant clmn8x9y00001: Error message
[SOLIS] Job poll:plant:clmn8x9y00001:latest failed: Error message
```
Check PollLog table for full error details.
