# Fixture Format Specification

Complete specification for mock data fixtures used in Phase 3B development.

## File Location

```
fixtures/
  solis/mock-data.json
  huawei/mock-data.json
  goodwe/mock-data.json
  dele/mock-data.json
```

## Required Structure

Each `mock-data.json` file MUST follow this exact schema:

```jsonc
{
  "plant_summary": {
    "currentPowerW": 4500,           // Number, in Watts (W)
    "todayEnergyKWh": 28.5,          // Number, in kWh (REQUIRED)
    "totalEnergyKWh": 12543.8,       // Number, lifetime total in kWh
    "gridInjectionPowerW": 4450,     // Number, in Watts (W)
    "lastSeenAt": "2026-02-02T14:30:00Z",    // ISO 8601 string
    "sourceSampledAt": "2026-02-02T14:29:45Z", // ISO 8601 string
    "timezone": "America/Sao_Paulo"  // IANA timezone string
  },
  "daily_series": [
    {"date": "2026-01-30", "energyKWh": 32.1},  // YYYY-MM-DD + kWh
    {"date": "2026-01-31", "energyKWh": 29.7}
  ],
  "alarms": [
    {
      "vendorAlarmCode": "SOLIS_GRID_FAULT_001",  // String, vendor-specific code
      "deviceSn": "SOL-INV-2024-001",             // String, device serial (optional)
      "message": "Grid voltage out of range",      // String, human-readable
      "occurredAt": "2026-02-01T10:15:30Z",       // ISO 8601 string
      "isActive": false,                           // Boolean, current status
      "severity": "MEDIUM"                         // LOW | MEDIUM | HIGH | CRITICAL
    }
  ]
}
```

## Normalization Rules (MANDATORY)

### Power Units
- **ALWAYS in Watts (W)**, never kW or MW
- Examples:
  - ✅ `"currentPowerW": 4500` (4.5 kW)
  - ❌ `"currentPowerKW": 4.5`
  - ❌ `"currentPowerMW": 0.0045`

### Energy Units
- **ALWAYS in kWh**, never Wh or MWh
- Examples:
  - ✅ `"todayEnergyKWh": 28.5`
  - ❌ `"todayEnergyWh": 28500`
  - ❌ `"todayEnergyMWh": 0.0285`

### Timestamps
- **ISO 8601 format**: `YYYY-MM-DDTHH:mm:ssZ`
- Always UTC (Z suffix)
- Examples:
  - ✅ `"2026-02-02T14:30:00Z"`
  - ❌ `"2026-02-02 14:30:00"`
  - ❌ `"02/02/2026 14:30"`

### Daily Series Dates
- **YYYY-MM-DD format** (no time component)
- Examples:
  - ✅ `"date": "2026-01-30"`
  - ❌ `"date": "2026-01-30T00:00:00Z"`
  - ❌ `"date": "30/01/2026"`

### Timezone
- **IANA timezone string**, not GMT offsets
- Examples:
  - ✅ `"America/Sao_Paulo"`
  - ✅ `"America/Fortaleza"`
  - ❌ `"GMT-3"`
  - ❌ `"BRT"`

### Severity Mapping
- **Must use AlertSeverity enum values**
- Valid values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- Examples:
  - ✅ `"severity": "CRITICAL"`
  - ❌ `"severity": "critical"` (wrong case)
  - ❌ `"severity": "ERROR"` (not in enum)

## Required Fields

### plant_summary (ALL required)
- `currentPowerW` (number)
- `todayEnergyKWh` (number) - **CRITICAL: Database constraint**
- `lastSeenAt` (ISO 8601 string)
- `sourceSampledAt` (ISO 8601 string)
- `timezone` (IANA string)

### plant_summary (optional)
- `totalEnergyKWh` (number)
- `gridInjectionPowerW` (number)

### daily_series items
- `date` (YYYY-MM-DD string)
- `energyKWh` (number)

### alarms items
- `vendorAlarmCode` (string)
- `message` (string)
- `occurredAt` (ISO 8601 string)
- `isActive` (boolean)
- `severity` (enum string)
- `deviceSn` (string, optional)

## Hard Rules

### 1. No Vendor-Specific Field Names
❌ **WRONG** (Solis-specific):
```json
{
  "realKpi": {
    "day_power": 28500,  // Vendor-specific structure
    "pac": 4500
  }
}
```

✅ **CORRECT** (normalized):
```json
{
  "plant_summary": {
    "todayEnergyKWh": 28.5,  // Standardized
    "currentPowerW": 4500
  }
}
```

### 2. No Raw Vendor Payloads
Fixtures contain **already normalized** data, not raw API responses.

❌ **WRONG**:
```json
{
  "raw_vendor_response": {
    "status": 0,
    "data": {...}  // Direct vendor payload
  }
}
```

✅ **CORRECT**:
```json
{
  "plant_summary": {...},  // Normalized from vendor payload
  "daily_series": [...],
  "alarms": [...]
}
```

### 3. BaseMockAdapter Loading
- Fixtures loaded automatically via constructor: `super('SOLIS', fixturesBasePath)`
- Default path: `fixtures/<brand>/mock-data.json` (from repo root)
- No manual JSON parsing in adapter code

### 4. Fixture Isolation
- Each brand's fixture is **independent**
- Changing `solis/mock-data.json` does NOT affect Huawei, GoodWe, or Dele
- Use brand-specific alarm codes: `SOLIS_*`, `HUAWEI_*`, `GOODWE_*`, `DELE_*`

## Example: Complete Solis Fixture

```json
{
  "plant_summary": {
    "currentPowerW": 4500,
    "todayEnergyKWh": 28.5,
    "totalEnergyKWh": 12543.8,
    "gridInjectionPowerW": 4450,
    "lastSeenAt": "2026-02-02T14:30:00Z",
    "sourceSampledAt": "2026-02-02T14:29:45Z",
    "timezone": "America/Sao_Paulo"
  },
  "daily_series": [
    {"date": "2026-01-30", "energyKWh": 32.1},
    {"date": "2026-01-31", "energyKWh": 29.7},
    {"date": "2026-02-01", "energyKWh": 31.5},
    {"date": "2026-02-02", "energyKWh": 28.5}
  ],
  "alarms": [
    {
      "vendorAlarmCode": "SOLIS_GRID_FAULT_001",
      "deviceSn": "SOL-INV-2024-001",
      "message": "Grid voltage out of range",
      "occurredAt": "2026-02-01T10:15:30Z",
      "isActive": false,
      "severity": "MEDIUM"
    },
    {
      "vendorAlarmCode": "SOLIS_INVERTER_OVERHEAT",
      "deviceSn": "SOL-INV-2024-001",
      "message": "Inverter temperature exceeds threshold",
      "occurredAt": "2026-02-02T13:45:00Z",
      "isActive": true,
      "severity": "HIGH"
    }
  ]
}
```

## Validation Checklist

Before committing fixture changes:

- [ ] All power values in Watts (W)
- [ ] All energy values in kWh
- [ ] All timestamps in ISO 8601 format with Z suffix
- [ ] Daily series dates in YYYY-MM-DD format
- [ ] Timezone is valid IANA string
- [ ] Severity values are enum-compliant (uppercase)
- [ ] `todayEnergyKWh` is present (database constraint)
- [ ] No vendor-specific field names
- [ ] No raw vendor payloads
- [ ] Alarm codes follow brand prefix convention
