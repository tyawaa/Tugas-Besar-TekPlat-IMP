import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function POST(request: Request) {
  const body = await request.json()
  const { deviceId, data } = body

  if (!deviceId || typeof data !== 'object' || data === null) {
    return NextResponse.json({ error: 'deviceId and data are required to ingest telemetry.' }, { status: 400 })
  }

  const device = ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 })
  }

  const record = {
    id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId,
    timestamp: new Date().toISOString(),
    data,
  }

  ServerDataStore.addTelemetry(record)
  ServerDataStore.updateDevice(deviceId, { lastSeen: record.timestamp })
  ServerDataStore.logAction('system', 'Telemetry Ingestion', 'developer', 'telemetry.ingested', 'device', deviceId)
  return NextResponse.json(record, { status: 201 })
}
