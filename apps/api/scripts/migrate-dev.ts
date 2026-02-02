#!/usr/bin/env tsx
/**
 * Prisma Migrate Dev Wrapper
 * Runs prisma migrate dev with proper configuration
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

// Get migration name from arguments
const args = process.argv.slice(2);
const migrationName = args.find((arg) => arg.startsWith('--name='))?.split('=')[1] || 'migration';

// Temporarily rename pnpm-workspace.yaml to avoid Prisma pnpm detection issues
let workspaceRenamed = false;
if (fs.existsSync(workspaceFile)) {
  fs.renameSync(workspaceFile, workspaceBackup);
  workspaceRenamed = true;
}

try {
  console.log(`Running: prisma migrate dev --name ${migrationName}`);
  execSync(`npx prisma migrate dev --name ${migrationName} --schema=${schemaPath}`, {
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
