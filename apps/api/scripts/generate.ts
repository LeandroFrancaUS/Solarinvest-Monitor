#!/usr/bin/env tsx
/**
 * Prisma Generate Wrapper
 * Generates Prisma Client with proper configuration
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
config({ path: '../../.env' });

const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
const workspaceFile = path.resolve(__dirname, '../../pnpm-workspace.yaml');
const workspaceBackup = `${workspaceFile}.bak`;

// Temporarily rename pnpm-workspace.yaml to avoid Prisma pnpm detection issues
let workspaceRenamed = false;
if (fs.existsSync(workspaceFile)) {
  fs.renameSync(workspaceFile, workspaceBackup);
  workspaceRenamed = true;
}

try {
  console.log('Running: prisma generate');
  execSync(`npx prisma generate --schema=${schemaPath}`, {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env },
  });
} finally {
  // Restore pnpm-workspace.yaml
  if (workspaceRenamed && fs.existsSync(workspaceBackup)) {
    fs.renameSync(workspaceBackup, workspaceFile);
  }
}
