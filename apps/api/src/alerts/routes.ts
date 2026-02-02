/**
 * Alert Routes (Minimal)
 * 
 * Per PHASE_3A_SCOPE.md: returns DB records with no alert engine logic
 */

import { FastifyPluginAsync } from 'fastify';
import { AuthenticatedRequest } from '../auth/middleware.js';

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/alerts
   * 
   * Returns alerts from database (no logic, just data)
   */
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      try {
        const user = (request as AuthenticatedRequest).user;

        // Build where clause based on role
        // For customers, only show alerts for their plants
        let where: any = {};
        
        if (user.role === 'CUSTOMER') {
          where = {
            plant: {
              owner_customer_id: user.id,
            },
          };
        }

        const alerts = await fastify.prisma.alert.findMany({
          where,
          select: {
            id: true,
            plant_id: true,
            type: true,
            severity: true,
            state: true,
            message: true,
            vendor_alarm_code: true,
            device_sn: true,
            occurred_at: true,
            cleared_at: true,
            last_notified_at: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { occurred_at: 'desc' },
          take: 100, // Limit for performance
        });

        return reply.code(200).send(alerts);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch alerts',
        });
      }
    },
  });
};
