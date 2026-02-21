import {
  VendorAdapter,
  VendorCredentials,
  PlantReference,
  DateRange,
  TestConnectionResult,
  NormalizedPlantSummary,
  NormalizedDailySeries,
  NormalizedAlarm,
  VendorCapabilities,
  AdapterError,
  AdapterErrorType,
} from '@solarinvest/integrations-core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Base Mock Adapter
 * 
 * Shared logic for all fixture-based adapters in Phase 3B
 */
export abstract class BaseMockAdapter implements VendorAdapter {
  protected mockData: any;
  protected fixturesPath: string;

  constructor(
    protected brand: 'SOLIS' | 'HUAWEI' | 'GOODWE' | 'DELE',
    fixturesBasePath?: string
  ) {
    // Default to fixtures/ in repo root
    const brandLower = brand.toLowerCase();
    this.fixturesPath = fixturesBasePath || path.join(process.cwd(), `../../fixtures/${brandLower}`);
    this.loadMockData();
  }

  private loadMockData(): void {
    try {
      const dataPath = path.join(this.fixturesPath, 'mock-data.json');
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      this.mockData = JSON.parse(rawData);
    } catch (error) {
      throw new AdapterError(
        AdapterErrorType.INVALID_DATA_FORMAT,
        `Failed to load ${this.brand} mock data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async testConnection(creds: VendorCredentials): Promise<TestConnectionResult> {
    // Mock mode: always successful
    return {
      ok: true,
      message: `Mock connection successful (${this.brand})`,
      plants: [
        { id: `mock-${this.brand.toLowerCase()}-plant-1`, name: `${this.brand} Test Plant` },
      ],
    };
  }

  async getPlantSummary(
    ref: PlantReference,
    creds: VendorCredentials
  ): Promise<NormalizedPlantSummary> {
    const summary = this.mockData.plant_summary;
    
    return {
      currentPowerW: summary.currentPowerW,
      todayEnergyKWh: summary.todayEnergyKWh,
      totalEnergyKWh: summary.totalEnergyKWh,
      gridInjectionPowerW: summary.gridInjectionPowerW,
      lastSeenAt: new Date(summary.lastSeenAt),
      sourceSampledAt: new Date(summary.sourceSampledAt),
      timezone: summary.timezone,
    };
  }

  async getDailyEnergySeries(
    ref: PlantReference,
    creds: VendorCredentials,
    range: DateRange
  ): Promise<NormalizedDailySeries> {
    const series = this.mockData.daily_series;
    
    // Filter by date range
    const filtered = series.filter((point: any) => {
      const pointDate = new Date(point.date);
      return pointDate >= range.startDate && pointDate <= range.endDate;
    });

    return {
      dataPoints: filtered.map((point: any) => ({
        date: point.date,
        energyKWh: point.energyKWh,
      })),
    };
  }

  async getAlarmsSince(
    ref: PlantReference,
    creds: VendorCredentials,
    since: Date
  ): Promise<NormalizedAlarm[]> {
    const alarms = this.mockData.alarms || [];
    
    // Filter alarms since the given timestamp
    return alarms
      .filter((alarm: any) => new Date(alarm.occurredAt) >= since)
      .map((alarm: any) => ({
        vendorAlarmCode: alarm.vendorAlarmCode,
        deviceSn: alarm.deviceSn,
        message: alarm.message,
        occurredAt: new Date(alarm.occurredAt),
        isActive: alarm.isActive,
        severity: alarm.severity,
      }));
  }

  abstract getCapabilities(): VendorCapabilities;
}
