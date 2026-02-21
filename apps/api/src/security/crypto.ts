/**
 * AES-256-GCM Encryption/Decryption with Key Rotation Support
 * 
 * Implements secure encryption for sensitive data per PHASE_3A_SCOPE.md
 */

import crypto from 'node:crypto';

export interface EncryptedPayload {
  ciphertextB64: string;
  ivB64: string;
  tagB64: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM
const KEY_LENGTH = 32; // 256 bits

/**
 * Validates that a key is a valid 64-character hex string (32 bytes)
 */
function validateKeyFormat(keyHex: string, keyName: string): void {
  if (!keyHex) {
    throw new Error(`${keyName} is required`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      `${keyName} must be a 64-character hexadecimal string (32 bytes)`
    );
  }
}

/**
 * Encrypts plaintext using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param keyHex - 64-character hex string (32 bytes)
 * @returns Encrypted payload with ciphertext, IV, and auth tag
 */
export function encryptAESGCM(
  plaintext: string,
  keyHex: string
): EncryptedPayload {
  validateKeyFormat(keyHex, 'Encryption key');

  // Generate random IV for this encryption
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Convert hex key to buffer
  const key = Buffer.from(keyHex, 'hex');
  
  if (key.length !== KEY_LENGTH) {
    throw new Error('Invalid key length after conversion');
  }

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  // Get authentication tag
  const tag = cipher.getAuthTag();

  return {
    ciphertextB64: encrypted.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM
 * 
 * @param payload - Encrypted payload
 * @param keyHex - 64-character hex string (32 bytes)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export function decryptAESGCM(
  payload: EncryptedPayload,
  keyHex: string
): string {
  validateKeyFormat(keyHex, 'Decryption key');

  const { ciphertextB64, ivB64, tagB64 } = payload;
  
  if (!ciphertextB64 || !ivB64 || !tagB64) {
    throw new Error('Invalid encrypted payload: missing required fields');
  }

  // Convert base64 to buffers
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const key = Buffer.from(keyHex, 'hex');
  
  if (key.length !== KEY_LENGTH) {
    throw new Error('Invalid key length after conversion');
  }

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypts data with key rotation support
 * Always uses MASTER_KEY_CURRENT
 */
export function encryptWithRotation(plaintext: string): {
  payload: EncryptedPayload;
  keyVersion: 'current';
} {
  const currentKey = process.env.MASTER_KEY_CURRENT;
  
  if (!currentKey) {
    throw new Error('MASTER_KEY_CURRENT is not set');
  }

  const payload = encryptAESGCM(plaintext, currentKey);
  
  return {
    payload,
    keyVersion: 'current',
  };
}

/**
 * Decrypts data with key rotation support
 * Tries MASTER_KEY_CURRENT first, then MASTER_KEY_PREVIOUS if available
 */
export function decryptWithRotation(
  payload: EncryptedPayload
): string {
  const currentKey = process.env.MASTER_KEY_CURRENT;
  const previousKey = process.env.MASTER_KEY_PREVIOUS;

  if (!currentKey) {
    throw new Error('MASTER_KEY_CURRENT is not set');
  }

  // Try current key first
  try {
    return decryptAESGCM(payload, currentKey);
  } catch (error) {
    // If current key fails and previous key exists, try it
    if (previousKey) {
      try {
        return decryptAESGCM(payload, previousKey);
      } catch {
        // Both keys failed
        throw new Error('Decryption failed with both current and previous keys');
      }
    }
    
    // No previous key available, re-throw original error
    throw error;
  }
}

/**
 * Validates encryption keys at application startup
 * Fails fast if keys are invalid
 */
export function validateEncryptionKeys(): void {
  const currentKey = process.env.MASTER_KEY_CURRENT;
  
  if (!currentKey) {
    throw new Error(
      'MASTER_KEY_CURRENT environment variable is required'
    );
  }

  try {
    validateKeyFormat(currentKey, 'MASTER_KEY_CURRENT');
  } catch (error) {
    throw new Error(
      `Invalid MASTER_KEY_CURRENT: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate previous key if present
  const previousKey = process.env.MASTER_KEY_PREVIOUS;
  if (previousKey) {
    try {
      validateKeyFormat(previousKey, 'MASTER_KEY_PREVIOUS');
    } catch (error) {
      throw new Error(
        `Invalid MASTER_KEY_PREVIOUS: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Test encryption/decryption with current key
  try {
    const testData = 'encryption-test-data';
    const encrypted = encryptAESGCM(testData, currentKey);
    const decrypted = decryptAESGCM(encrypted, currentKey);
    
    if (decrypted !== testData) {
      throw new Error('Encryption/decryption test failed');
    }
  } catch (error) {
    throw new Error(
      `Encryption validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  console.log('✓ Encryption keys validated successfully');
}
