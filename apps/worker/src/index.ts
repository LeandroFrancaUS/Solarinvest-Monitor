import { config } from 'dotenv';
import Redis from 'ioredis';
import { Brand } from '@prisma/client';
import { Queue } from 'bullmq';
import { createPollWorker, createQueue } from './poll-worker';
import { Scheduler } from './scheduler';
import { PollJobData } from './types';

config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const mockMode = process.env.INTEGRATION_MOCK_MODE === 'true';

console.log('============================================');
console.log('Solarinvest Monitor Worker');
console.log('============================================');
console.log('Redis URL:', redisUrl.replace(/:[^:@]+@/, ':***@'));
console.log('Mock Mode:', mockMode);
console.log('============================================\n');

if (!mockMode) {
  console.error('ERROR: INTEGRATION_MOCK_MODE must be set to "true" in Phase 3B');
  process.exit(1);
}

const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redisConnection.on('connect', () => {
  console.log('✓ Worker connected to Redis');
});

redisConnection.on('error', (err) => {
  console.error('✗ Redis connection error:', err.message);
});

redisConnection.on('ready', async () => {
  console.log('✓ Redis is ready');
  await startWorker();
});

// ============================================================================
// WORKER STARTUP
// ============================================================================

const workers: any[] = [];
const queues = new Map<Brand, Queue<PollJobData>>();
let scheduler: Scheduler | null = null;

async function startWorker(): Promise<void> {
  try {
    console.log('\nInitializing workers and queues...\n');

    // Create queues and workers for each brand
    const brands: Brand[] = ['SOLIS', 'HUAWEI', 'GOODWE', 'DELE'];

    for (const brand of brands) {
      const queue = createQueue(brand, redisConnection);
      queues.set(brand, queue);
      
      const worker = await createPollWorker(brand, redisConnection);
      workers.push(worker);
      
      console.log(`✓ Created worker and queue for ${brand}`);
    }

    // Start scheduler
    scheduler = new Scheduler(queues, 600); // Poll every 10 minutes
    scheduler.start();

    console.log('\n✓ Worker initialization complete');
    console.log('Workers are now polling plants...\n');
  } catch (error) {
    console.error('✗ Error starting worker:', error);
    process.exit(1);
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(): Promise<void> {
  console.log('\nShutting down gracefully...');

  if (scheduler) {
    scheduler.stop();
  }

  for (const worker of workers) {
    await worker.close();
  }

  await redisConnection.quit();
  console.log('✓ Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

