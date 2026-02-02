import { config } from 'dotenv';
import Redis from 'ioredis';

config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  console.log('✓ Worker connected to Redis');
});

redis.on('error', (err) => {
  console.error('✗ Redis connection error:', err.message);
});

redis.on('ready', () => {
  console.log('✓ Redis is ready');
});

console.log('Worker process started');
console.log('Redis URL:', redisUrl.replace(/:[^:@]+@/, ':***@'));

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});
