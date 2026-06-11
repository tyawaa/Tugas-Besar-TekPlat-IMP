import { TelemetryRecord } from '@/lib/mock-data'
import { ServerDataStore } from '@/lib/server-data-store'
import { createSecureId, verifySecret } from '@/lib/secret-storage'

export type TelemetryData = Record<string, number | boolean | string>

type ErrorBody = {
  error: string
  invalidMetrics?: string[]
}

export class TelemetryServiceError extends Error {
  status: number
  body: ErrorBody

  constructor(status: number, body: ErrorBody) {
    super(body.error)
    this.name = 'TelemetryServiceError'
    this.status = status
    this.body = body
  }
}

export function isTelemetryData(value: unknown): value is TelemetryData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(
    (item) => typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string'
  )
}

export class TelemetryService {
  static async ingestTelemetry(input: {
    deviceId: string
    deviceKey: string
    metrics: unknown
  }): Promise<TelemetryRecord> {
    const deviceId = input.deviceId.trim()
    const deviceKey = input.deviceKey.trim()

    if (!deviceId) {
      throw new TelemetryServiceError(400, { error: 'X-Device-Id header is required.' })
    }

    if (!deviceKey) {
      throw new TelemetryServiceError(401, { error: 'X-Device-Key header is required.' })
    }

    if (!isTelemetryData(input.metrics) || Object.keys(input.metrics).length === 0) {
      throw new TelemetryServiceError(400, {
        error: 'metrics must be a non-empty object of number, boolean, or string values.',
      })
    }

    const device = await ServerDataStore.getDeviceById(deviceId)
    if (!device) {
      throw new TelemetryServiceError(404, { error: 'Device not found.' })
    }

    // Security-sensitive: compare the presented device key with the stored hash only.
    if (!verifySecret(deviceKey, device.apiKeyHash || '')) {
      throw new TelemetryServiceError(401, { error: 'Invalid device key.' })
    }

    if (device.status === 'suspended' || device.status === 'archived') {
      throw new TelemetryServiceError(403, {
        error: `Device is ${device.status} and cannot ingest telemetry.`,
      })
    }

    const metricDefinitions = new Map(device.metrics.map((metric) => [metric.key, metric.valueType]))
    const invalidMetrics = Object.entries(input.metrics).filter(([key, value]) => {
      const expectedType = metricDefinitions.get(key)
      return expectedType ? typeof value !== expectedType : false
    })

    if (invalidMetrics.length > 0) {
      throw new TelemetryServiceError(400, {
        error: 'Telemetry contains metrics with invalid value types.',
        invalidMetrics: invalidMetrics.map(([key]) => key),
      })
    }

    const record: TelemetryRecord = {
      id: createSecureId('tel'),
      deviceId,
      timestamp: new Date().toISOString(),
      data: input.metrics,
    }

    await ServerDataStore.addTelemetry(record)
    await ServerDataStore.updateDevice(deviceId, { lastSeen: record.timestamp, status: 'online' })
    await ServerDataStore.logAction(
      'system',
      'Telemetry Ingestion',
      'developer',
      'telemetry.ingested',
      'device',
      deviceId
    )

    return record
  }
}
