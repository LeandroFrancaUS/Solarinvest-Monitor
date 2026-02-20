export interface PlantReading {
  plantId: string
  timestamp: Date
  powerKw: number
  energyKwh: number
  manufacturer: 'huawei' | 'solis' | 'goodwe' | 'dele'
}

export interface AlertPayload {
  plantId: string
  type: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}
