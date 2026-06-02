import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET() {
  const devices = await ServerDataStore.getAllDevices()
  return NextResponse.json(devices)
}

export async function POST(request: Request) {
  const body = await request.json()
  const {
    name,
    type,
    location,
    description = '',
    ownerId,
    visibility,
    heartbeatInterval,
    metrics,
  } = body

  if (
    !name ||
    !type ||
    !location ||
    !ownerId ||
    !visibility ||
    !Number.isFinite(Number(heartbeatInterval)) ||
    !Array.isArray(metrics)
  ) {
    return NextResponse.json({ error: 'Missing required fields to register a device.' }, { status: 400 })
  }

  const device = {
    id: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    name,
    type,
    location,
    description,
    ownerId,
    status: 'online' as const,
    visibility,
    lastSeen: new Date().toISOString(),
    heartbeatInterval: Number(heartbeatInterval),
    metrics,
    apiKey: `iot_key_${Math.random().toString(36).substring(2, 22).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  }

  await ServerDataStore.addDevice(device)
  await ServerDataStore.logAction('system', 'Device Registration', 'device_owner', 'device.registered', 'device', device.id)
  return NextResponse.json(device, { status: 201 })
}
