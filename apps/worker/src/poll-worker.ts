import { PrismaClient, Plant, Brand } from '@prisma/client';
import { Worker, Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { VendorAdapter } from '@solarinvest/integrations-core';
import { SolisAdapter } from '@solarinvest/integrations-solis';
import { HuaweiAdapter } from '@solarinvest/integrations-huawei';
import { GoodWeAdapter } from '@solarinvest/integrations-goodwe';
import { DeleAdapter } from '@solarinvest/integrations-dele';
import { PollJobData } from './types';
import { backfillMetrics, checkLowGeneration, checkOffline } from './monitoring-utils';

const prisma = new PrismaClient();

function getAdapter(brand: Brand): VendorAdapter {
  switch (brand) {
    case 'SOLIS':
      return new SolisAdapter();
    case 'HUAWEI':
      return new HuaweiAdapter();
    case 'GOODWE':
      return new GoodWeAdapter();
    case 'DELE':
      return new DeleAdapter();
    default:
      throw new Error(`Unknown brand: ${brand}`);
  }
}
// ============================================================================
// ADAPTER FACTORY
// ============================================================================

export async function createPollWorker(
  brand: Brand,
  redisConnection: Redis
): Promise<Worker> {
  const queueName = `queue:poll:${brand.toLowerCase()}`;

  const worker = new Worker<PollJobData>(
    queueName,
    async (job: Job<PollJobData>) => {
      const { plantId, brand } = job.data;
      const startTime = Date.now();

      console.log(`[${brand}] Polling plant ${plantId}...`);

      let pollStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS';
      let adapterErrorType: string | null = null;
      let httpStatus: number | null = null;

      try {
        // Acquire Redis lock
        const lockKey = `lock:plant:${plantId}`;
        const lockTTL = 1200; // 20 minutes (2x polling interval)
        const lockAcquired = await redisConnection.set(
          lockKey,
          'locked',
          'EX',
          lockTTL,
          'NX'
        );

        if (!lockAcquired) {
          console.log(`[${brand}] Plant ${plantId} already locked, skipping`);
          return;
        }

        try {
          // Get plant from database
          const plant = await prisma.plant.findUnique({
            where: { id: plantId },
            include: { integrationCredential: true },
          });

          if (!plant) {
            throw new Error(`Plant ${plantId} not found`);
          }

          if (plant.integration_status !== 'ACTIVE') {
            console.log(`[${brand}] Plant ${plantId} integration not active, skipping`);
            return;
          }

          // Get adapter
          const adapter = getAdapter(brand);

          // Get plant summary
          const summary = await adapter.getPlantSummary(
            { vendorPlantId: plant.vendor_plant_id || plantId },
            { raw: {} } // Mock mode doesn't need real credentials
          );

          // Create or update today's MetricSnapshot
          const today = new Date().toISOString().split('T')[0];
          await prisma.metricSnapshot.upsert({
            where: {
              plant_id_date: {
                plant_id: plantId,
                date: new Date(today),
              },
            },
            create: {
              plant_id: plantId,
              date: new Date(today),
              timezone: summary.timezone,
              today_energy_kwh: summary.todayEnergyKWh,
              current_power_w: summary.currentPowerW,
              grid_injection_power_w: summary.gridInjectionPowerW,
              total_energy_kwh: summary.totalEnergyKWh,
              last_seen_at: summary.lastSeenAt,
              source_sampled_at: summary.sourceSampledAt,
            },
            update: {
              today_energy_kwh: summary.todayEnergyKWh,
              current_power_w: summary.currentPowerW,
              grid_injection_power_w: summary.gridInjectionPowerW,
              total_energy_kwh: summary.totalEnergyKWh,
              last_seen_at: summary.lastSeenAt,
              source_sampled_at: summary.sourceSampledAt,
            },
          });

          // Update plant status
          await updatePlantStatus(plantId, summary.lastSeenAt);

          // Process alarms
          await processAlarms(plantId, adapter);

          // Backfill missing metrics (D-3 to D-0)
          await backfillMetrics(plantId, summary.timezone, adapter);

          // Check for low generation
          await checkLowGeneration(plantId);

          // Check for offline condition
          await checkOffline(plantId, summary.lastSeenAt);

          console.log(`[${brand}] Plant ${plantId} polled successfully`);
        } finally {
          // Release lock
          await redisConnection.del(lockKey);
        }
      } catch (error) {
        pollStatus = 'ERROR';
        console.error(`[${brand}] Error polling plant ${plantId}:`, error);
        
        if (error instanceof Error) {
          adapterErrorType = error.name;
        }
      } finally {
        // Log poll attempt
        const duration = Date.now() - startTime;
        await prisma.pollLog.create({
          data: {
            plant_id: plantId,
            job_type: 'POLL',
            status: pollStatus,
            duration_ms: duration,
            adapter_error_type: adapterErrorType,
            http_status: httpStatus,
            started_at: new Date(startTime),
            finished_at: new Date(),
          },
        });
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 30, // Max 30 jobs per minute
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[${brand}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${brand}] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ============================================================================
// STATUS COMPUTATION
// ============================================================================

async function updatePlantStatus(plantId: string, lastSeenAt: Date): Promise<void> {
  const now = new Date();
  const hoursSinceLastSeen = (now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60);

  let newStatus: 'GREEN' | 'YELLOW' | 'RED' | 'GREY' = 'GREEN';

  // Check integration status first
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
  });

  if (!plant) return;

  if (plant.integration_status !== 'ACTIVE') {
    newStatus = 'GREY';
  } else if (hoursSinceLastSeen > 24) {
    newStatus = 'RED';
  } else if (hoursSinceLastSeen > 2) {
    newStatus = 'YELLOW';
  }

  // Check for active RED alerts
  const redAlerts = await prisma.alert.count({
    where: {
      plant_id: plantId,
      state: 'NEW',
      severity: 'CRITICAL',
    },
  });

  if (redAlerts > 0) {
    newStatus = 'RED';
  }

  // Update plant status if changed
  if (plant.status !== newStatus) {
    await prisma.plant.update({
      where: { id: plantId },
      data: { status: newStatus },
    });
    console.log(`Plant ${plantId} status changed: ${plant.status} → ${newStatus}`);
  }
}

// ============================================================================
// ALARM PROCESSING
// ============================================================================

async function processAlarms(plantId: string, adapter: VendorAdapter): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const alarms = await adapter.getAlarmsSince(
      { vendorPlantId: plantId },
      { raw: {} },
      since
    );

    for (const alarm of alarms) {
      // Deduplication key: (plant_id, type, vendor_alarm_code, device_sn)
      const existingAlert = await prisma.alert.findFirst({
        where: {
          plant_id: plantId,
          type: 'MOCK_FAULT',
          vendor_alarm_code: alarm.vendorAlarmCode,
          device_sn: alarm.deviceSn,
          state: { in: ['NEW', 'ACKED'] },
        },
      });

      if (existingAlert) {
        // Update last_seen_at
        await prisma.alert.update({
          where: { id: existingAlert.id },
          data: { last_seen_at: new Date() },
        });
      } else if (alarm.isActive) {
        // Create new alert
        await prisma.alert.create({
          data: {
            plant_id: plantId,
            type: 'MOCK_FAULT',
            severity: alarm.severity,
            state: 'NEW',
            vendor_alarm_code: alarm.vendorAlarmCode,
            device_sn: alarm.deviceSn,
            message: alarm.message,
            occurred_at: alarm.occurredAt,
            last_seen_at: new Date(),
          },
        });
        console.log(`Created alert for plant ${plantId}: ${alarm.message}`);
      }

      // Auto-resolve if alarm is no longer active
      if (!alarm.isActive && existingAlert) {
        await prisma.alert.update({
          where: { id: existingAlert.id },
          data: {
            state: 'RESOLVED',
            cleared_at: new Date(),
          },
        });
        console.log(`Resolved alert ${existingAlert.id}`);
      }
    }
  } catch (error) {
    console.error(`Error processing alarms for plant ${plantId}:`, error);
  }
}

// ============================================================================
// QUEUE CREATION
// ============================================================================

export function createQueue(brand: Brand, redisConnection: Redis): Queue<PollJobData> {
  const queueName = `queue:poll:${brand.toLowerCase()}`;
  return new Queue<PollJobData>(queueName, {
    connection: redisConnection,
  });
}
