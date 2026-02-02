import { PrismaClient } from '@prisma/client';
import { VendorAdapter } from '@solarinvest/integrations-core';

const prisma = new PrismaClient();

/**
 * Backfill Logic
 * 
 * Checks for gaps in MetricSnapshot data (D-3 to D-0)
 * and requests missing data from the adapter
 */
export async function backfillMetrics(
  plantId: string,
  timezone: string,
  adapter: VendorAdapter
): Promise<void> {
  try {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    // Get existing snapshots for the range
    const existing = await prisma.metricSnapshot.findMany({
      where: {
        plant_id: plantId,
        date: {
          gte: threeDaysAgo,
          lte: today,
        },
      },
      select: { date: true },
    });

    const existingDates = new Set(
      existing.map((s) => s.date.toISOString().split('T')[0])
    );

    // Find missing dates
    const missingDates: Date[] = [];
    for (let i = 3; i >= 0; i--) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      if (!existingDates.has(dateStr)) {
        missingDates.push(new Date(dateStr));
      }
    }

    if (missingDates.length === 0) {
      return; // No gaps
    }

    console.log(`[Backfill] Plant ${plantId} missing ${missingDates.length} days, fetching...`);

    // Fetch daily series for missing range
    const series = await adapter.getDailyEnergySeries(
      { vendorPlantId: plantId },
      { raw: {} },
      {
        startDate: missingDates[0],
        endDate: missingDates[missingDates.length - 1],
      }
    );

    // Create snapshots for missing dates
    for (const point of series.dataPoints) {
      const pointDate = new Date(point.date);
      const dateStr = pointDate.toISOString().split('T')[0];
      
      if (!existingDates.has(dateStr)) {
        await prisma.metricSnapshot.create({
          data: {
            plant_id: plantId,
            date: pointDate,
            timezone,
            today_energy_kwh: point.energyKWh,
            last_seen_at: new Date(),
            source_sampled_at: new Date(),
          },
        });
        console.log(`[Backfill] Created snapshot for ${dateStr}: ${point.energyKWh} kWh`);
      }
    }
  } catch (error) {
    console.error(`[Backfill] Error backfilling plant ${plantId}:`, error);
  }
}

/**
 * Low Generation Detection
 * 
 * Compares today's energy to 7-day median
 * Creates alert if generation is below threshold
 */
export async function checkLowGeneration(plantId: string): Promise<void> {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    // Get last 7 days of snapshots
    const snapshots = await prisma.metricSnapshot.findMany({
      where: {
        plant_id: plantId,
        date: {
          gte: sevenDaysAgo,
          lt: today,
        },
      },
      orderBy: { date: 'desc' },
      take: 7,
    });

    if (snapshots.length < 3) {
      return; // Not enough historical data
    }

    // Calculate 7-day median
    const energies = snapshots.map((s) => s.today_energy_kwh).sort((a, b) => a - b);
    const median = energies[Math.floor(energies.length / 2)];

    // Get today's snapshot
    const todaySnapshot = await prisma.metricSnapshot.findFirst({
      where: {
        plant_id: plantId,
        date: {
          gte: new Date(today.toISOString().split('T')[0]),
        },
      },
    });

    if (!todaySnapshot) {
      return; // No data for today yet
    }

    const todayEnergy = todaySnapshot.today_energy_kwh;
    const threshold30 = median * 0.3;
    const threshold10 = median * 0.1;

    // Check if below thresholds
    if (todayEnergy < threshold10) {
      // RED: < 10% of median
      await createOrUpdateLowGenAlert(plantId, 'CRITICAL', todayEnergy, median);
    } else if (todayEnergy < threshold30) {
      // YELLOW: < 30% of median
      await createOrUpdateLowGenAlert(plantId, 'HIGH', todayEnergy, median);
    } else {
      // Resolve any existing low generation alerts
      await resolveLowGenAlert(plantId);
    }
  } catch (error) {
    console.error(`[LowGen] Error checking plant ${plantId}:`, error);
  }
}

async function createOrUpdateLowGenAlert(
  plantId: string,
  severity: 'HIGH' | 'CRITICAL',
  todayEnergy: number,
  median: number
): Promise<void> {
  const existing = await prisma.alert.findFirst({
    where: {
      plant_id: plantId,
      type: 'LOW_GENERATION',
      state: { in: ['NEW', 'ACKED'] },
    },
  });

  const message = `Low generation detected: ${todayEnergy.toFixed(1)} kWh (median: ${median.toFixed(1)} kWh)`;

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: {
        severity,
        message,
        last_seen_at: new Date(),
      },
    });
  } else {
    await prisma.alert.create({
      data: {
        plant_id: plantId,
        type: 'LOW_GENERATION',
        severity,
        state: 'NEW',
        message,
        occurred_at: new Date(),
        last_seen_at: new Date(),
      },
    });
    console.log(`[LowGen] Created low generation alert for plant ${plantId}`);
  }
}

async function resolveLowGenAlert(plantId: string): Promise<void> {
  const existing = await prisma.alert.findFirst({
    where: {
      plant_id: plantId,
      type: 'LOW_GENERATION',
      state: { in: ['NEW', 'ACKED'] },
    },
  });

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: {
        state: 'RESOLVED',
        cleared_at: new Date(),
      },
    });
    console.log(`[LowGen] Resolved low generation alert for plant ${plantId}`);
  }
}

/**
 * Offline Detection
 * 
 * Creates OFFLINE alert if plant hasn't been seen in > 24h
 */
export async function checkOffline(plantId: string, lastSeenAt: Date): Promise<void> {
  try {
    const now = new Date();
    const hoursSince = (now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60);

    if (hoursSince > 24) {
      // Create or update OFFLINE alert
      const existing = await prisma.alert.findFirst({
        where: {
          plant_id: plantId,
          type: 'OFFLINE',
          state: { in: ['NEW', 'ACKED'] },
        },
      });

      const message = `Plant offline for ${Math.floor(hoursSince)} hours`;

      if (existing) {
        await prisma.alert.update({
          where: { id: existing.id },
          data: {
            message,
            last_seen_at: new Date(),
          },
        });
      } else {
        await prisma.alert.create({
          data: {
            plant_id: plantId,
            type: 'OFFLINE',
            severity: 'CRITICAL',
            state: 'NEW',
            message,
            occurred_at: new Date(),
            last_seen_at: new Date(),
          },
        });
        console.log(`[Offline] Created offline alert for plant ${plantId}`);
      }
    } else {
      // Resolve any existing OFFLINE alerts
      const existing = await prisma.alert.findFirst({
        where: {
          plant_id: plantId,
          type: 'OFFLINE',
          state: { in: ['NEW', 'ACKED'] },
        },
      });

      if (existing) {
        await prisma.alert.update({
          where: { id: existing.id },
          data: {
            state: 'RESOLVED',
            cleared_at: new Date(),
          },
        });
        console.log(`[Offline] Resolved offline alert for plant ${plantId}`);
      }
    }
  } catch (error) {
    console.error(`[Offline] Error checking plant ${plantId}:`, error);
  }
}
