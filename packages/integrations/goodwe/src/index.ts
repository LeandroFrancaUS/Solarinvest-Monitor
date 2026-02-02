import {
  VendorCapabilities,
  BaseMockAdapter,
} from '@solarinvest/integrations-core';

export const GOODWE_ADAPTER_VERSION = '0.1.0';

/**
 * GoodWe Mock Adapter (Fixture-based)
 * 
 * Phase 3B: Loads data from fixtures/goodwe/mock-data.json
 * NO external API calls allowed
 */
export class GoodWeAdapter extends BaseMockAdapter {
  constructor(fixturesBasePath?: string) {
    super('GOODWE', fixturesBasePath);
  }

  getCapabilities(): VendorCapabilities {
    return {
      brand: 'GOODWE',
      polling: {
        maxConcurrentRequests: 4,
        maxRequestsPerMinute: 25,
        recommendedMinIntervalSeconds: 600, // 10 minutes
      },
      features: {
        supportsRealtime: true,
        supportsDailySeries: true,
        supportsAlarms: true,
        supportsDeviceList: false,
      },
    };
  }
}
