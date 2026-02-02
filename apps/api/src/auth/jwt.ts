/**
 * JWT Utilities for Authentication
 * 
 * Implements JWT-based authentication per PHASE_3A_SCOPE.md
 * - Algorithm: HS256
 * - Expiration: 15 minutes
 * - Payload: sub (userId), role
 */

import jwt from 'jsonwebtoken';

export interface JWTPayload {
  sub: string; // userId
  role: 'ADMIN' | 'OPERATOR' | 'CUSTOMER';
}

const JWT_EXPIRATION = '15m'; // 15 minutes as per spec
const JWT_ALGORITHM = 'HS256';

/**
 * Generates a JWT access token
 */
export function generateAccessToken(userId: string, role: JWTPayload['role']): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const payload: JWTPayload = {
    sub: userId,
    role,
  };

  return jwt.sign(payload, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRATION,
  });
}

/**
 * Verifies and decodes a JWT token
 */
export function verifyAccessToken(token: string): JWTPayload {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Validates JWT_SECRET at startup
 */
export function validateJWTConfig(): void {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  console.log('✓ JWT configuration validated successfully');
}
