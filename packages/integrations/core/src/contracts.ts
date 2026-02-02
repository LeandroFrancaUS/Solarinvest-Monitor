/**
 * Vendor Integration Contracts
 * 
 * Based on INTEGRATION_CONTRACTS.md and SPEC_MVP.md
 * All vendor adapters MUST implement these interfaces
 */

// ============================================================================
// VENDOR ADAPTER INTERFACE
// ============================================================================

export interface VendorAdapter {
  /**
   * Test connection with vendor credentials
   */
  testConnection(creds: VendorCredentials): Promise<TestConnectionResult>;

  /**
   * Get plant summary (realtime or latest available)
   */
  getPlantSummary(
    ref: PlantReference,
    creds: VendorCredentials
  ): Promise<NormalizedPlantSummary>;

  /**
   * Get daily energy series for a date range
   */
  getDailyEnergySeries(
    ref: PlantReference,
    creds: VendorCredentials,
    range: DateRange
  ): Promise<NormalizedDailySeries>;

  /**
   * Get alarms/alerts since a timestamp
   */
  getAlarmsSince(
    ref: PlantReference,
    creds: VendorCredentials,
    since: Date
  ): Promise<NormalizedAlarm[]>;

  /**
   * Get adapter capabilities (rate limits, features)
   */
  getCapabilities(): VendorCapabilities;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface VendorCredentials {
  /** Raw JSON blob - each vendor has different structure */
  raw: Record<string, unknown>;
}

export interface PlantReference {
  /** Plant external ID from vendor */
  vendorPlantId: string;
  /** Additional vendor-specific identifiers */
  meta?: Record<string, unknown>;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ============================================================================
// OUTPUT TYPES (NORMALIZED)
// ============================================================================

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  /** Detected plant list (if available) */
  plants?: Array<{
    id: string;
    name: string;
  }>;
}

export interface NormalizedPlantSummary {
  /** Current power output in Watts */
  currentPowerW: number;
  /** Today's energy production in kWh */
  todayEnergyKWh: number;
  /** Total lifetime energy in kWh (if available) */
  totalEnergyKWh?: number;
  /** Grid injection power in Watts (if available) */
  gridInjectionPowerW?: number;
  /** Last data update timestamp from vendor */
  lastSeenAt: Date;
  /** When the vendor sampled this data */
  sourceSampledAt: Date;
  /** Timezone of the plant */
  timezone: string;
}

export interface NormalizedDailySeries {
  dataPoints: Array<{
    date: string; // YYYY-MM-DD
    energyKWh: number;
  }>;
}

export interface NormalizedAlarm {
  /** Vendor-specific alarm code */
  vendorAlarmCode: string;
  /** Device serial number (if applicable) */
  deviceSn?: string;
  /** Alarm message */
  message: string;
  /** When the alarm occurred */
  occurredAt: Date;
  /** Whether the alarm is still active */
  isActive: boolean;
  /** Alarm severity (mapped to our system) */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// ============================================================================
// CAPABILITIES
// ============================================================================

export interface VendorCapabilities {
  brand: 'SOLIS' | 'HUAWEI' | 'GOODWE' | 'DELE';
  
  polling: {
    /** Maximum concurrent requests */
    maxConcurrentRequests: number;
    /** Maximum requests per minute */
    maxRequestsPerMinute: number;
    /** Recommended minimum interval in seconds */
    recommendedMinIntervalSeconds: number;
  };
  
  features: {
    supportsRealtime: boolean;
    supportsDailySeries: boolean;
    supportsAlarms: boolean;
    supportsDeviceList: boolean;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum AdapterErrorType {
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',
  VENDOR_ERROR = 'VENDOR_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AdapterError extends Error {
  constructor(
    public type: AdapterErrorType,
    message: string,
    public httpStatus?: number,
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
