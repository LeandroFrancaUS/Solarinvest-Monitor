#!/usr/bin/env tsx
/**
 * Seed Test Plants
 * 
 * Creates sample plants for testing Phase 3B mock integrations
 */

import { PrismaClient, Brand } from '@prisma/client';

const prisma = new PrismaClient();

interface TestPlant {
  name: string;
  brand: Brand;
  timezone: string;
  uf: string;
  city: string;
  lat: number;
  lng: number;
  installed_capacity_w: number;
  vendor_plant_id: string;
}

const TEST_PLANTS: TestPlant[] = [
  {
    name: 'Usina Solar Santos (Solis)',
    brand: 'SOLIS',
    timezone: 'America/Sao_Paulo',
    uf: 'SP',
    city: 'Santos',
    lat: -23.9618,
    lng: -46.3322,
    installed_capacity_w: 50000,
    vendor_plant_id: 'mock-solis-plant-1',
  },
  {
    name: 'Parque Solar Brasília (Huawei)',
    brand: 'HUAWEI',
    timezone: 'America/Sao_Paulo',
    uf: 'DF',
    city: 'Brasília',
    lat: -15.7975,
    lng: -47.8919,
    installed_capacity_w: 75000,
    vendor_plant_id: 'mock-huawei-plant-1',
  },
  {
    name: 'Fazenda Fotovoltaica Curitiba (GoodWe)',
    brand: 'GOODWE',
    timezone: 'America/Sao_Paulo',
    uf: 'PR',
    city: 'Curitiba',
    lat: -25.4284,
    lng: -49.2733,
    installed_capacity_w: 45000,
    vendor_plant_id: 'mock-goodwe-plant-1',
  },
  {
    name: 'Estação Solar Fortaleza (Dele)',
    brand: 'DELE',
    timezone: 'America/Fortaleza',
    uf: 'CE',
    city: 'Fortaleza',
    lat: -3.7172,
    lng: -38.5433,
    installed_capacity_w: 60000,
    vendor_plant_id: 'mock-dele-plant-1',
  },
];

async function main() {
  console.log('============================================');
  console.log('Seeding Test Plants for Phase 3B');
  console.log('============================================\n');

  for (const plantData of TEST_PLANTS) {
    try {
      // Check if plant already exists
      const existing = await prisma.plant.findFirst({
        where: {
          name: plantData.name,
        },
      });

      if (existing) {
        console.log(`✓ Plant already exists: ${plantData.name}`);
        continue;
      }

      // Create plant
      const plant = await prisma.plant.create({
        data: {
          name: plantData.name,
          brand: plantData.brand,
          status: 'GREY', // Will be updated by worker
          integration_status: 'ACTIVE',
          timezone: plantData.timezone,
          uf: plantData.uf,
          city: plantData.city,
          lat: plantData.lat,
          lng: plantData.lng,
          installed_capacity_w: plantData.installed_capacity_w,
          installed_capacity_verified: true,
          vendor_plant_id: plantData.vendor_plant_id,
        },
      });

      // Create integration credential (mock - not actually used)
      await prisma.integrationCredential.create({
        data: {
          plant_id: plant.id,
          brand: plant.brand,
          encrypted_data: '{}', // Mock credential
          key_version: 1,
        },
      });

      console.log(`✓ Created plant: ${plantData.name} (${plant.id})`);
      console.log(`  Brand: ${plantData.brand}`);
      console.log(`  Status: ${plant.status}`);
      console.log(`  Integration: ${plant.integration_status}`);
      console.log('');
    } catch (error) {
      console.error(`✗ Error creating plant ${plantData.name}:`, error);
    }
  }

  console.log('============================================');
  console.log('Seeding complete!');
  console.log('============================================\n');
  console.log('Next steps:');
  console.log('1. Start infrastructure: cd infra && docker compose up -d');
  console.log('2. Set environment: export INTEGRATION_MOCK_MODE=true');
  console.log('3. Start worker: cd apps/worker && pnpm dev');
  console.log('4. Watch worker poll plants automatically');
  console.log('5. Check database for MetricSnapshots and Alerts');
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
