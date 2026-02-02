/**
 * Authentication Routes
 * 
 * Implements login and change-password endpoints per PHASE_3A_SCOPE.md
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { generateAccessToken } from './jwt.js';
import { AuthenticatedRequest } from './middleware.js';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/v1/auth/login
   * 
   * Authenticates user and returns JWT access token
   */
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      try {
        // Validate request body
        const body = loginSchema.parse(request.body);

        // Find user by email
        const user = await fastify.prisma.user.findUnique({
          where: { email: body.email },
          select: {
            id: true,
            email: true,
            role: true,
            password_hash: true,
            must_change_password: true,
          },
        });

        // Generic error message to prevent user enumeration
        const invalidCredentialsError = {
          error: 'Unauthorized',
          message: 'Invalid email or password',
        };

        if (!user) {
          return reply.code(401).send(invalidCredentialsError);
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          body.password,
          user.password_hash
        );

        if (!isValidPassword) {
          return reply.code(401).send(invalidCredentialsError);
        }

        // Generate JWT
        const accessToken = generateAccessToken(user.id, user.role);

        // Return success response
        return reply.code(200).send({
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            must_change_password: user.must_change_password,
          },
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
          message: 'An error occurred during login',
        });
      }
    },
  });

  /**
   * POST /api/v1/auth/change-password
   * 
   * Allows authenticated users to change their password
   */
  fastify.post('/change-password', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      try {
        const user = (request as AuthenticatedRequest).user;

        // Validate request body
        const body = changePasswordSchema.parse(request.body);

        // Hash new password (bcrypt cost >= 12)
        const password_hash = await bcrypt.hash(body.newPassword, 12);

        // Update password and clear must_change_password flag
        await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            password_hash,
            must_change_password: false,
            updated_at: new Date(),
          },
        });

        return reply.code(200).send({ ok: true });
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
          message: 'An error occurred while changing password',
        });
      }
    },
  });
};
