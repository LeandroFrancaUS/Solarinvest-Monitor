import {
  VendorCapabilities,
  BaseMockAdapter,
} from '@solarinvest/integrations-core';

export const SOLIS_ADAPTER_VERSION = '0.1.0';

/**
 * Solis Mock Adapter (Fixture-based)
 * 
 * Phase 3B: Loads data from fixtures/solis/mock-data.json
 * NO external API calls allowed
 */
export class SolisAdapter extends BaseMockAdapter {
  constructor(fixturesBasePath?: string) {
    super('SOLIS', fixturesBasePath);
  }

  getCapabilities(): VendorCapabilities {
    return {
      brand: 'SOLIS',
      polling: {
        maxConcurrentRequests: 5,
        maxRequestsPerMinute: 30,
        recommendedMinIntervalSeconds: 600, // 10 minutes
      },
      features: {
        supportsRealtime: true,
        supportsDailySeries: true,
        supportsAlarms: true,
        supportsDeviceList: true,
      },
    };
  }
}
