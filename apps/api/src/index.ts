import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { validateEncryptionKeys } from './security/crypto.js';
import { validateJWTConfig } from './auth/jwt.js';
import { authPlugin } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import { plantRoutes } from './plants/routes.js';
import { integrationRoutes } from './integrations/routes.js';
import { alertRoutes } from './alerts/routes.js';

config();

// Validate configuration at startup
console.log('Validating configuration...');
validateEncryptionKeys();
validateJWTConfig();

const fastify = Fastify({
  logger: true,
});

// Initialize Prisma client
const prisma = new PrismaClient();

// Decorate fastify with prisma
fastify.decorate('prisma', prisma);

// Register plugins
fastify.register(cors);
fastify.register(rateLimit, {
  global: false, // Apply per-route
});

// Register auth plugin
fastify.register(authPlugin);

// API v1 routes
fastify.register(
  async (fastify) => {
    // Health check (no auth required)
    fastify.get('/health', async () => {
      return { status: 'ok' };
    });

    // Auth routes
    fastify.register(authRoutes, { prefix: '/auth' });

    // Plant routes
    fastify.register(plantRoutes, { prefix: '/plants' });

    // Integration routes
    fastify.register(integrationRoutes, { prefix: '/integrations' });

    // Alert routes
    fastify.register(alertRoutes, { prefix: '/alerts' });
  },
  { prefix: '/api/v1' }
);

// Root endpoint
fastify.get('/', async () => {
  return { message: 'Solarinvest Monitor API', version: '0.1.0' };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`✓ API server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

start();

// Type augmentation for Prisma
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
