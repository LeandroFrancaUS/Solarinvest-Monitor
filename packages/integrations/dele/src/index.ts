import {
  VendorCapabilities,
  BaseMockAdapter,
} from '@solarinvest/integrations-core';

export const DELE_ADAPTER_VERSION = '0.1.0';

/**
 * Dele Mock Adapter (Fixture-based)
 * 
 * Phase 3B: Loads data from fixtures/dele/mock-data.json
 * NO external API calls allowed
 */
export class DeleAdapter extends BaseMockAdapter {
  constructor(fixturesBasePath?: string) {
    super('DELE', fixturesBasePath);
  }

  getCapabilities(): VendorCapabilities {
    return {
      brand: 'DELE',
      polling: {
        maxConcurrentRequests: 3,
        maxRequestsPerMinute: 15,
        recommendedMinIntervalSeconds: 900, // 15 minutes
      },
      features: {
        supportsRealtime: true,
        supportsDailySeries: true,
        supportsAlarms: false,
        supportsDeviceList: false,
      },
    };
  }
}
