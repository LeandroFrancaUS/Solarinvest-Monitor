# Integration Contracts

## Purpose

All vendor integrations MUST implement a **unified interface** to ensure:
- Platform-wide portability (UI, Alert Engine, Worker never depend on vendor-specific payloads)
- Consistent data normalization (W, kWh, ISO dates)
- Predictable error handling
- Mock mode support (Phase 3B requirement)

**No part of the system can depend on raw vendor payloads.**

---

## Core Principle

```
┌────────────────┐
│ Vendor API     │  (Solis, Huawei, GoodWe, Dele)
└───────┬────────┘
        │ raw payload (brand-specific)
        ▼
┌────────────────┐
│ VendorAdapter  │  ← Normalization happens here
└───────┬────────┘
        │ normalized data
        ▼
┌────────────────┐
│ Worker         │  ← Status, alerts, MetricSnapshot
└───────┬────────┘
        │ normalized data
        ▼
┌────────────────┐
│ API / UI       │  ← Never sees vendor-specific fields
└────────────────┘
```

---

## VendorAdapter Interface

**Location**: `packages/integrations/core/src/contracts.ts`

```typescript
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
```

---

## Input Types

### VendorCredentials
```typescript
export interface VendorCredentials {
  /** Raw JSON blob - each vendor has different structure */
  raw: Record<string, unknown>;
}
```

**Examples** (brand-specific, stored encrypted):
```typescript
// Solis
{ 
  keyId: '123456789',
  keySecret: 'abc123...',
  apiDomain: 'https://soliscloud.com'
}

// Huawei
{
  username: 'ops@solarinvest.info',
  password: 'encrypted...',
  systemCode: 'SYS001'
}

// GoodWe
{
  account: 'solarinvest',
  password: 'encrypted...',
  appKey: 'goodwe-app-123'
}
```

### PlantReference
```typescript
export interface PlantReference {
  /** Plant external ID from vendor */
  vendorPlantId: string;
  
  /** Additional vendor-specific identifiers */
  meta?: Record<string, unknown>;
}
```

**Examples**:
```typescript
// Solis
{ vendorPlantId: '1234567890' }

// Huawei (may need station code + plant code)
{ 
  vendorPlantId: 'NE=12345678',
  meta: { stationCode: 'NE=12345678' }
}
```

### DateRange
```typescript
export interface DateRange {
  startDate: Date;  // Inclusive
  endDate: Date;    // Inclusive
}
```

---

## Output Types (Normalized)

### TestConnectionResult
```typescript
export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  
  /** Detected plant list (if vendor API provides it) */
  plants?: Array<{
    id: string;      // vendorPlantId
    name: string;
  }>;
}
```

**Usage**:
- Called when adding a new plant (wizard step 4)
- Validates credentials before saving
- Optionally discovers available plants

### NormalizedPlantSummary
```typescript
export interface NormalizedPlantSummary {
  /** Current power output in Watts (not kW) */
  currentPowerW: number;
  
  /** Today's energy production in kWh (REQUIRED) */
  todayEnergyKWh: number;
  
  /** Total lifetime energy in kWh (optional) */
  totalEnergyKWh?: number;
  
  /** Grid injection power in Watts (optional) */
  gridInjectionPowerW?: number;
  
  /** Last data update timestamp from vendor */
  lastSeenAt: Date;
  
  /** When the vendor sampled this data */
  sourceSampledAt: Date;
  
  /** Timezone of the plant (IANA format) */
  timezone: string;
}
```

**Normalization Rules**:
- **Power**: Always Watts (W), never kW or MW
- **Energy**: Always kWh, never Wh or MWh
- **Dates**: ISO 8601 strings parsed to `Date` objects
- **Timezone**: IANA format (e.g., `America/Sao_Paulo`, `America/Fortaleza`)
- **Required**: `todayEnergyKWh` is MANDATORY (database constraint)

**Examples**:
```typescript
// Solis → Normalized
{
  currentPowerW: 4500,              // vendor sends 4.5 kW
  todayEnergyKWh: 28.5,             // vendor sends 28.5 kWh
  totalEnergyKWh: 12345.67,         // vendor sends 12345.67 kWh
  lastSeenAt: new Date('2026-02-18T14:30:00Z'),
  sourceSampledAt: new Date('2026-02-18T14:29:50Z'),
  timezone: 'America/Sao_Paulo'
}

// Huawei → Normalized
{
  currentPowerW: 3200,              // vendor sends 3200 W
  todayEnergyKWh: 22.1,             // vendor sends 22100 Wh
  totalEnergyKWh: 9876.54,          // vendor sends 9876.54 kWh
  lastSeenAt: new Date('2026-02-18T14:30:00Z'),
  sourceSampledAt: new Date('2026-02-18T14:28:00Z'),
  timezone: 'America/Fortaleza'
}
```

### NormalizedDailySeries
```typescript
export interface NormalizedDailySeries {
  data: Array<{
    date: string;       // YYYY-MM-DD format (plant timezone)
    energyKWh: number;  // Daily production in kWh
  }>;
}
```

**Normalization Rules**:
- **Date Format**: `YYYY-MM-DD` (plant timezone, not UTC)
- **Energy**: Always kWh
- **Sorting**: Ascending by date

**Example**:
```typescript
{
  data: [
    { date: '2026-02-15', energyKWh: 32.1 },
    { date: '2026-02-16', energyKWh: 28.5 },
    { date: '2026-02-17', energyKWh: 30.2 },
    { date: '2026-02-18', energyKWh: 22.1 }  // Partial day
  ]
}
```

### NormalizedAlarm
```typescript
export interface NormalizedAlarm {
  /** Vendor-specific alarm code */
  vendorAlarmCode: string;
  
  /** Human-readable alarm description */
  message: string;
  
  /** Severity level */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  /** When the alarm occurred (vendor timestamp) */
  occurredAt: Date;
  
  /** Whether the alarm is currently active */
  isActive: boolean;
  
  /** Device serial number (if alarm is device-specific) */
  deviceSn?: string;
  
  /** Additional vendor metadata (optional) */
  meta?: Record<string, unknown>;
}
```

**Severity Mapping**:
| Vendor Term | Normalized Severity |
|-------------|---------------------|
| Info, Notice | LOW |
| Warning, Minor | MEDIUM |
| Major, Error | HIGH |
| Critical, Fault | CRITICAL |

**Example**:
```typescript
{
  vendorAlarmCode: 'SOLIS_GRID_FAULT_001',
  message: 'Grid voltage out of range',
  severity: 'HIGH',
  occurredAt: new Date('2026-02-18T10:15:00Z'),
  isActive: true,
  deviceSn: 'INV-12345678'
}
```

### VendorCapabilities
```typescript
export interface VendorCapabilities {
  brand: Brand;
  
  polling: {
    /** Max concurrent requests for this brand */
    maxConcurrentRequests: number;
    
    /** Max requests per minute */
    maxRequestsPerMinute: number;
    
    /** Recommended minimum interval between polls (seconds) */
    recommendedMinIntervalSeconds: number;
  };
  
  features: {
    /** Supports realtime power/energy data */
    supportsRealtime: boolean;
    
    /** Supports daily energy series */
    supportsDailySeries: boolean;
    
    /** Supports alarms/alerts */
    supportsAlarms: boolean;
    
    /** Supports device list (inverters, meters, etc.) */
    supportsDeviceList: boolean;
  };
}
```

**Examples**:
```typescript
// Solis
{
  brand: 'SOLIS',
  polling: {
    maxConcurrentRequests: 5,
    maxRequestsPerMinute: 30,
    recommendedMinIntervalSeconds: 600  // 10 minutes
  },
  features: {
    supportsRealtime: true,
    supportsDailySeries: true,
    supportsAlarms: true,
    supportsDeviceList: true
  }
}

// Huawei
{
  brand: 'HUAWEI',
  polling: {
    maxConcurrentRequests: 3,
    maxRequestsPerMinute: 20,
    recommendedMinIntervalSeconds: 600
  },
  features: {
    supportsRealtime: true,
    supportsDailySeries: true,
    supportsAlarms: true,
    supportsDeviceList: false  // Not supported by Northbound API
  }
}
```

---

## Error Handling

### AdapterError Types
```typescript
export type AdapterErrorType =
  | 'AUTH_FAILED'              // 401, 403, invalid credentials
  | 'RATE_LIMIT_EXCEEDED'      // 429, quota exceeded
  | 'NETWORK_TIMEOUT'          // Request timeout, 5xx errors
  | 'INVALID_DATA_FORMAT'      // Unexpected response structure
  | 'PLANT_NOT_FOUND'          // Plant doesn't exist in vendor system
  | 'UNKNOWN_ERROR';           // Catch-all

export class AdapterError extends Error {
  constructor(
    public type: AdapterErrorType,
    message: string,
    public originalError?: Error,
    public retryAfterSeconds?: number  // For RATE_LIMIT_EXCEEDED
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
```

### Error Mapping Rules

| HTTP Status | Adapter Error Type | Action |
|-------------|-------------------|--------|
| 401, 403 | AUTH_FAILED | Pause integration, set `integration_status = PAUSED_AUTH_ERROR` |
| 429 | RATE_LIMIT_EXCEEDED | Backoff using `retryAfterSeconds` |
| Timeout, 5xx | NETWORK_TIMEOUT | Retry 2× with exponential backoff (1s, 3s) |
| Invalid JSON | INVALID_DATA_FORMAT | Log error, skip poll, create PollLog entry |
| 404 (plant) | PLANT_NOT_FOUND | Alert operator, review plant configuration |

**Example**:
```typescript
// In adapter implementation
try {
  const response = await axios.get(url, { timeout: 8000 });
  return normalizeData(response.data);
} catch (err) {
  if (err.response?.status === 401) {
    throw new AdapterError('AUTH_FAILED', 'Invalid credentials', err);
  }
  if (err.response?.status === 429) {
    const retryAfter = parseInt(err.response.headers['retry-after'], 10) || 60;
    throw new AdapterError('RATE_LIMIT_EXCEEDED', 'Rate limit hit', err, retryAfter);
  }
  if (err.code === 'ECONNABORTED') {
    throw new AdapterError('NETWORK_TIMEOUT', 'Request timeout', err);
  }
  throw new AdapterError('UNKNOWN_ERROR', err.message, err);
}
```

---

## Phase 3B: Mock Mode

### BaseMockAdapter

All adapters extend `BaseMockAdapter` for Phase 3B:

**Location**: `packages/integrations/core/src/base-mock-adapter.ts`

```typescript
export abstract class BaseMockAdapter implements VendorAdapter {
  protected mockData: MockDataFormat;

  constructor(
    protected brand: Brand,
    fixturesBasePath?: string
  ) {
    const path = fixturesBasePath || `fixtures/${brand.toLowerCase()}/mock-data.json`;
    this.mockData = JSON.parse(fs.readFileSync(path, 'utf-8'));
  }

  async testConnection(): Promise<TestConnectionResult> {
    return { ok: true, message: 'Mock connection OK' };
  }

  async getPlantSummary(): Promise<NormalizedPlantSummary> {
    return {
      currentPowerW: this.mockData.plant_summary.currentPowerW,
      todayEnergyKWh: this.mockData.plant_summary.todayEnergyKWh,
      lastSeenAt: new Date(this.mockData.plant_summary.lastSeenAt),
      sourceSampledAt: new Date(),
      timezone: this.mockData.plant_summary.timezone
    };
  }

  // ... similar implementations for getDailyEnergySeries, getAlarmsSince
}
```

### Fixture Format

**Location**: `fixtures/<brand>/mock-data.json`

```json
{
  "plant_summary": {
    "currentPowerW": 4500,
    "todayEnergyKWh": 28.5,
    "totalEnergyKWh": 12345.67,
    "lastSeenAt": "2026-02-18T14:30:00Z",
    "timezone": "America/Sao_Paulo"
  },
  "daily_series": [
    { "date": "2026-02-15", "energyKWh": 32.1 },
    { "date": "2026-02-16", "energyKWh": 28.5 }
  ],
  "alarms": [
    {
      "vendorAlarmCode": "SOLIS_GRID_FAULT_001",
      "message": "Grid voltage high",
      "severity": "MEDIUM",
      "occurredAt": "2026-02-18T10:15:00Z",
      "isActive": false,
      "deviceSn": "INV-12345678"
    }
  ]
}
```

**See**: [FIXTURES_SPEC.md](./FIXTURES_SPEC.md) for complete fixture specification.

---

## Adapter Implementation Checklist

### Required Methods
- [ ] `testConnection()` validates credentials
- [ ] `getPlantSummary()` returns normalized summary
- [ ] `getDailyEnergySeries()` returns daily data points
- [ ] `getAlarmsSince()` returns normalized alarms
- [ ] `getCapabilities()` returns brand-specific capabilities

### Normalization Requirements
- [ ] Power in Watts (W), not kW
- [ ] Energy in kWh, not Wh
- [ ] Dates as ISO 8601, parsed to `Date` objects
- [ ] Timezone in IANA format (`America/Sao_Paulo`, not `UTC-3`)
- [ ] `todayEnergyKWh` always present (required field)
- [ ] Severity mapped to LOW | MEDIUM | HIGH | CRITICAL

### Error Handling
- [ ] HTTP errors mapped to `AdapterError` types
- [ ] Timeout configured (8 seconds default)
- [ ] Retry logic for transient failures (2× max)
- [ ] `retryAfterSeconds` set for RATE_LIMIT_EXCEEDED

### Mock Mode
- [ ] Extends `BaseMockAdapter`
- [ ] Loads from `fixtures/<brand>/mock-data.json`
- [ ] Works with `INTEGRATION_MOCK_MODE=true`
- [ ] Never calls real vendor API in tests

---

## Supported Brands (MVP)

### Solis
- **API**: SolisCloud API
- **Documentation**: [SolisCloud API Docs](https://solis-service.solisinverters.com/)
- **Adapter**: `packages/integrations/solis/src/index.ts`
- **Capabilities**:
  - Realtime: ✅
  - Daily series: ✅
  - Alarms: ✅
  - Device list: ✅

### Huawei
- **API**: FusionSolar Northbound API
- **Documentation**: [FusionSolar OpenAPI](https://support.huawei.com/enterprise/en/doc/EDOC1100145710)
- **Adapter**: `packages/integrations/huawei/src/index.ts`
- **Capabilities**:
  - Realtime: ✅
  - Daily series: ✅
  - Alarms: ✅
  - Device list: ❌

### GoodWe
- **API**: SEMS Open API
- **Documentation**: [GoodWe SEMS API](https://www.goodwe.com/sems-api)
- **Adapter**: `packages/integrations/goodwe/src/index.ts`
- **Capabilities**:
  - Realtime: ✅
  - Daily series: ✅
  - Alarms: ✅
  - Device list: ✅

### Dele
- **Status**: Stub (pending vendor documentation)
- **Adapter**: `packages/integrations/dele/src/index.ts`
- **Mock Mode**: Supported (fixture-based)
- **Real API**: Not implemented (Phase 4+)

---

## Contract Validation

### Unit Tests (Required)
```typescript
// packages/integrations/solis/src/index.test.ts
import { SolisAdapter } from './index';

describe('SolisAdapter', () => {
  const adapter = new SolisAdapter();

  it('normalizes power to Watts', async () => {
    const summary = await adapter.getPlantSummary(/* ... */);
    expect(summary.currentPowerW).toBeGreaterThanOrEqual(0);
  });

  it('requires todayEnergyKWh', async () => {
    const summary = await adapter.getPlantSummary(/* ... */);
    expect(summary.todayEnergyKWh).toBeDefined();
  });

  it('maps errors correctly', async () => {
    // Test 401 → AUTH_FAILED
    // Test 429 → RATE_LIMIT_EXCEEDED
    // Test timeout → NETWORK_TIMEOUT
  });
});
```

### Integration Tests (Phase 4+)
- Test against real vendor sandbox APIs
- Validate rate limiting
- Verify error recovery

---

## Non-Negotiable Rules

1. **NEVER expose raw vendor payloads** to UI, API, or Alert Engine
2. **ALWAYS normalize units** (W, kWh, ISO dates, IANA timezones)
3. **ALWAYS implement all interface methods** (even if return empty/mock data)
4. **ALWAYS map errors to AdapterError types** (no raw HTTP exceptions)
5. **ALWAYS respect VendorCapabilities.polling** (rate limits, concurrency)
6. **ALWAYS support mock mode** (extend BaseMockAdapter)
7. **NEVER hardcode timezones** (use plant-specific IANA timezone)

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) – Adapter role in system
- [FIXTURES_SPEC.md](./FIXTURES_SPEC.md) – Mock data format
- [PHASE_3B_MONITORING_LOOP.md](./PHASE_3B_MONITORING_LOOP.md) – How adapters are called
- `packages/integrations/core/src/contracts.ts` – Full TypeScript interface
- `packages/integrations/core/src/base-mock-adapter.ts` – Mock implementation
