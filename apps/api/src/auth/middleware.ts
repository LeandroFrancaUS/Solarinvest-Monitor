/**
 * Authentication Middleware for Fastify
 * 
 * Implements JWT verification and RBAC per PHASE_3A_SCOPE.md
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { verifyAccessToken, JWTPayload } from './jwt.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: 'ADMIN' | 'OPERATOR' | 'CUSTOMER';
  };
}

/**
 * Fastify plugin for JWT authentication
 */
export const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorator to add user to request
  fastify.decorateRequest('user', null);

  // Hook to verify JWT from Authorization header
  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Missing authorization header',
        });
      }

      if (!authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid authorization format. Use: Bearer <token>',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      const payload = verifyAccessToken(token);

      // Get user from database to validate and get email
      const user = await fastify.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User not found',
        });
      }

      // Attach user to request
      (request as AuthenticatedRequest).user = user;
    } catch (error) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: error instanceof Error ? error.message : 'Invalid token',
      });
    }
  });

  // Helper to enforce role-based access control
  fastify.decorate(
    'requireRole',
    (allowedRoles: Array<'ADMIN' | 'OPERATOR' | 'CUSTOMER'>) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as AuthenticatedRequest).user;

        if (!user) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        if (!allowedRoles.includes(user.role)) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Insufficient permissions',
          });
        }
      };
    }
  );
};

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      roles: Array<'ADMIN' | 'OPERATOR' | 'CUSTOMER'>
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
