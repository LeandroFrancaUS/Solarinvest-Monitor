/**
 * Plant Routes (Minimal API Wiring)
 * 
 * Implements basic CRUD operations per PHASE_3A_SCOPE.md
 * No business logic - just data access with RBAC
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthenticatedRequest } from '../auth/middleware.js';

// Validation schemas
const createPlantSchema = z.object({
  name: z.string().min(1),
  brand: z.enum(['HUAWEI', 'SOLIS', 'GOODWE', 'DELE']),
  timezone: z.string().min(1),
  uf: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  installed_capacity_w: z.number().positive().optional(),
});

export const plantRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/plants
   * 
   * Lists plants based on user role:
   * - ADMIN/OPERATOR: all plants
   * - CUSTOMER: only plants where owner_customer_id = user.id
   */
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      try {
        const user = (request as AuthenticatedRequest).user;

        // Build where clause based on role
        const where =
          user.role === 'ADMIN' || user.role === 'OPERATOR'
            ? {} // All plants
            : { owner_customer_id: user.id }; // Only owned plants

        const plants = await fastify.prisma.plant.findMany({
          where,
          select: {
            id: true,
            name: true,
            brand: true,
            status: true,
            integration_status: true,
            timezone: true,
            uf: true,
            city: true,
            lat: true,
            lng: true,
            installed_capacity_w: true,
            installed_capacity_verified: true,
            alerts_silenced_until: true,
            created_at: true,
            updated_at: true,
            // Don't expose owner_customer_id or reference_external
          },
          orderBy: { created_at: 'desc' },
        });

        return reply.code(200).send(plants);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch plants',
        });
      }
    },
  });

  /**
   * POST /api/v1/plants
   * 
   * Creates a new plant (ADMIN only)
   * Status defaults to GREY, integration_status to PENDING_DOCS
   * Does NOT accept vendor credentials in Phase 3A
   */
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.requireRole(['ADMIN'])],
    handler: async (request, reply) => {
      try {
        // Validate request body
        const body = createPlantSchema.parse(request.body);

        // Create plant with defaults
        const plant = await fastify.prisma.plant.create({
          data: {
            name: body.name,
            brand: body.brand,
            timezone: body.timezone,
            uf: body.uf,
            city: body.city,
            lat: body.lat,
            lng: body.lng,
            installed_capacity_w: body.installed_capacity_w,
            status: 'GREY', // Default per spec
            integration_status: 'PENDING_DOCS', // Default per spec
            installed_capacity_verified: false,
          },
          select: {
            id: true,
            name: true,
            brand: true,
            status: true,
            integration_status: true,
            timezone: true,
            uf: true,
            city: true,
            lat: true,
            lng: true,
            installed_capacity_w: true,
            installed_capacity_verified: true,
            created_at: true,
            updated_at: true,
          },
        });

        return reply.code(201).send(plant);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Invalid request body',
            details: error.errors,
          });
        }

        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create plant',
        });
      }
    },
  });

  /**
   * GET /api/v1/plants/:id
   * 
   * Gets a specific plant with same RBAC rules as list
   */
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      try {
        const user = (request as AuthenticatedRequest).user;
        const { id } = request.params as { id: string };

        // Build where clause based on role
        const where =
          user.role === 'ADMIN' || user.role === 'OPERATOR'
            ? { id } // Any plant
            : { id, owner_customer_id: user.id }; // Only owned plant

        const plant = await fastify.prisma.plant.findFirst({
          where,
          select: {
            id: true,
            name: true,
            brand: true,
            status: true,
            integration_status: true,
            timezone: true,
            uf: true,
            city: true,
            lat: true,
            lng: true,
            installed_capacity_w: true,
            installed_capacity_verified: true,
            alerts_silenced_until: true,
            created_at: true,
            updated_at: true,
          },
        });

        if (!plant) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Plant not found',
          });
        }

        return reply.code(200).send(plant);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch plant',
        });
      }
    },
  });
};
