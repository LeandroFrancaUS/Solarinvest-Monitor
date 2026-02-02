#!/usr/bin/env tsx
/**
 * Seed Admin User Script
 * 
 * Creates the initial admin user for Solarinvest Monitor.
 * Email: brsolarinvest@gmail.com
 * Role: ADMIN
 * 
 * Generates a secure random password and requires password change on first login.
 */

import { PrismaClient } from '../node_modules/.prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../../.env' });

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'brsolarinvest@gmail.com';
const BCRYPT_ROUNDS = 12; // Minimum required by SPEC_MVP.md

/**
 * Generate a secure random password
 * Format: 4 groups of 4 alphanumeric characters separated by dashes
 * Example: Ab3d-9Kx2-mP8w-4nZ7
 */
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const groups: string[] = [];
  
  for (let i = 0; i < 4; i++) {
    let group = '';
    for (let j = 0; j < 4; j++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      group += chars[randomIndex];
    }
    groups.push(group);
  }
  
  return groups.join('-');
}

async function main() {
  console.log('🌱 Seeding admin user...\n');

  try {
    // Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (existingUser) {
      console.log(`⚠️  Admin user already exists: ${ADMIN_EMAIL}`);
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Created: ${existingUser.created_at.toISOString()}\n`);
      console.log('ℹ️  No changes made. To reset password, delete the user first.\n');
      return;
    }

    // Generate secure temporary password
    const temporaryPassword = generateSecurePassword();
    
    // Hash password with bcrypt (cost >= 12)
    console.log('🔐 Hashing password with bcrypt (cost: 12)...');
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    // Create admin user
    console.log(`📝 Creating admin user: ${ADMIN_EMAIL}...`);
    const user = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        role: 'ADMIN',
        password_hash: passwordHash,
        must_change_password: true,
      },
    });

    console.log('\n✅ Admin user created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ', ADMIN_EMAIL);
    console.log('🔑 Password: ', temporaryPassword);
    console.log('👤 User ID:  ', user.id);
    console.log('🛡️  Role:     ', user.role);
    console.log('⚠️  Must change password on first login: YES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Save this password now! It will not be shown again.\n');
    console.log('✓ Created at:', user.created_at.toISOString());
    console.log('');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
