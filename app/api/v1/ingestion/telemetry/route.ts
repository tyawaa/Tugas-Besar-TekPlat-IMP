import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

function isTelemetryData(value: unknown): value is Record<string, number | boolean | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(
    (item) => typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string'
  )
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const deviceId = request.headers.get('x-device-id') || (typeof body.deviceId === 'string' ? body.deviceId : '')
  const deviceKey =
    request.headers.get('x-device-key') ||
    (typeof body.deviceKey === 'string' ? body.deviceKey : '') ||
    (typeof body.apiKey === 'string' ? body.apiKey : '')
  const data = body.metrics ?? body.data

  if (!deviceId) {
    return NextResponse.json({ error: 'X-Device-Id header is required.' }, { status: 400 })
  }

  if (!deviceKey) {
    return NextResponse.json({ error: 'X-Device-Key header is required.' }, { status: 401 })
  }

  if (!isTelemetryData(data) || Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'metrics must be a non-empty object of number, boolean, or string values.' }, { status: 400 })
  }

  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 })
  }

  if (device.apiKey !== deviceKey) {
    return NextResponse.json({ error: 'Invalid device key.' }, { status: 401 })
  }

  if (device.status === 'suspended' || device.status === 'archived') {
    return NextResponse.json({ error: `Device is ${device.status} and cannot ingest telemetry.` }, { status: 403 })
  }

  const metricDefinitions = new Map(device.metrics.map((metric) => [metric.key, metric.valueType]))
  const invalidMetrics = Object.entries(data).filter(([key, value]) => {
    const expectedType = metricDefinitions.get(key)
    return expectedType ? typeof value !== expectedType : false
  })

  if (invalidMetrics.length > 0) {
    return NextResponse.json(
      { error: 'Telemetry contains metrics with invalid value types.', invalidMetrics: invalidMetrics.map(([key]) => key) },
      { status: 400 }
    )
  }

  const record = {
    id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId,
    timestamp: new Date().toISOString(),
    data,
  }

  await ServerDataStore.addTelemetry(record)
  await ServerDataStore.updateDevice(deviceId, { lastSeen: record.timestamp, status: 'online' })
  await ServerDataStore.logAction('system', 'Telemetry Ingestion', 'developer', 'telemetry.ingested', 'device', deviceId)
  return NextResponse.json(record, { status: 201 })
}
