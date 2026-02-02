/**
 * Integration Test Route (Stub Only)
 * 
 * Per PHASE_3A_SCOPE.md: validates payload but returns stub response
 * Adapters are NOT implemented in Phase 3A
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// Validation schema matching CredentialInput from INTEGRATION_CONTRACTS.md
const credentialInputSchema = z.object({
  brand: z.enum(['HUAWEI', 'SOLIS', 'GOODWE', 'DELE']),
  credentials: z.record(z.unknown()), // Brand-specific credentials
  plant_id: z.string().optional(),
});

export const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/v1/integrations/test
   * 
   * Validates integration credentials format (stub only)
   */
  fastify.post('/test', {
    onRequest: [fastify.authenticate, fastify.requireRole(['ADMIN', 'OPERATOR'])],
    handler: async (request, reply) => {
      try {
        // Validate request body
        credentialInputSchema.parse(request.body);

        // Return stub response per spec
        return reply.code(200).send({
          ok: false,
          message: 'Adapters not implemented in Phase 3A',
        });
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
          message: 'Failed to test integration',
        });
      }
    },
  });
};
