import { PrismaClient, Brand } from '@prisma/client';
import { Queue } from 'bullmq';
import { PollJobData } from './types';

const prisma = new PrismaClient();

/**
 * Scheduler
 * 
 * Enqueues all active plants for polling based on their brand
 */
export class Scheduler {
  private queues: Map<Brand, Queue<PollJobData>>;
  private intervalId: NodeJS.Timeout | null = null;
  private pollingIntervalSeconds: number;

  constructor(queues: Map<Brand, Queue<PollJobData>>, pollingIntervalSeconds = 600) {
    this.queues = queues;
    this.pollingIntervalSeconds = pollingIntervalSeconds; // 10 minutes default
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.log('Scheduler already running');
      return;
    }

    console.log(`Starting scheduler (polling every ${this.pollingIntervalSeconds}s)`);

    // Schedule immediately
    this.schedulePlants();

    // Then schedule periodically
    this.intervalId = setInterval(() => {
      this.schedulePlants();
    }, this.pollingIntervalSeconds * 1000);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Scheduler stopped');
    }
  }

  /**
   * Schedule all active plants for polling
   */
  private async schedulePlants(): Promise<void> {
    try {
      console.log('[Scheduler] Enqueueing plants for polling...');

      const plants = await prisma.plant.findMany({
        where: {
          integration_status: 'ACTIVE',
        },
        select: {
          id: true,
          brand: true,
          name: true,
        },
      });

      console.log(`[Scheduler] Found ${plants.length} active plants`);

      for (const plant of plants) {
        const queue = this.queues.get(plant.brand);
        
        if (!queue) {
          console.error(`[Scheduler] No queue found for brand: ${plant.brand}`);
          continue;
        }

        try {
          // Deterministic job ID to prevent duplicates
          const jobId = `poll:plant:${plant.id}:latest`;

          await queue.add(
            'poll-plant',
            {
              plantId: plant.id,
              brand: plant.brand,
            },
            {
              jobId,
              removeOnComplete: 100, // Keep last 100 completed jobs
              removeOnFail: 50, // Keep last 50 failed jobs
              attempts: 2, // Retry once
              backoff: {
                type: 'exponential',
                delay: 5000, // Start with 5 second delay
              },
            }
          );

          console.log(`[Scheduler] Enqueued ${plant.brand} plant: ${plant.name} (${plant.id})`);
        } catch (error) {
          console.error(`[Scheduler] Error enqueueing plant ${plant.id}:`, error);
        }
      }

      console.log('[Scheduler] Scheduling complete');
    } catch (error) {
      console.error('[Scheduler] Error in schedulePlants:', error);
    }
  }
}
