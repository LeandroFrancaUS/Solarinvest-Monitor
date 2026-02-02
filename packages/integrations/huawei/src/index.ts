import {
  VendorCapabilities,
  BaseMockAdapter,
} from '@solarinvest/integrations-core';

export const HUAWEI_ADAPTER_VERSION = '0.1.0';

/**
 * Huawei Mock Adapter (Fixture-based)
 * 
 * Phase 3B: Loads data from fixtures/huawei/mock-data.json
 * NO external API calls allowed
 */
export class HuaweiAdapter extends BaseMockAdapter {
  constructor(fixturesBasePath?: string) {
    super('HUAWEI', fixturesBasePath);
  }

  getCapabilities(): VendorCapabilities {
    return {
      brand: 'HUAWEI',
      polling: {
        maxConcurrentRequests: 3,
        maxRequestsPerMinute: 20,
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
