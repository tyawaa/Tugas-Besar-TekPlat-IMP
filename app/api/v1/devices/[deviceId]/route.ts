import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const device = ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }
  return NextResponse.json(device)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const body = await request.json()
  const { action, actorId, actorName, actorRole } = body

  if (!action || !actorId || !actorName || !actorRole) {
    return NextResponse.json({ error: 'Missing action or actor details' }, { status: 400 })
  }

  const device = ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  let updatedDevice = null

  switch (action) {
    case 'suspend':
      updatedDevice = ServerDataStore.updateDevice(deviceId, { status: 'suspended' })
      ServerDataStore.logAction(actorId, actorName, actorRole, 'device.suspended', 'device', deviceId)
      break
    case 'reinstate':
      updatedDevice = ServerDataStore.updateDevice(deviceId, { status: 'online' })
      ServerDataStore.logAction(actorId, actorName, actorRole, 'device.reinstated', 'device', deviceId)
      break
    case 'archive':
      updatedDevice = ServerDataStore.updateDevice(deviceId, { status: 'archived' })
      ServerDataStore.logAction(actorId, actorName, actorRole, 'device.archived', 'device', deviceId)
      break
    case 'rotateKey': {
      const apiKey = `iot_key_${Math.random().toString(36).substring(2, 22).toUpperCase()}`
      updatedDevice = ServerDataStore.updateDevice(deviceId, { apiKey })
      ServerDataStore.logAction(actorId, actorName, actorRole, 'device.api_key_rotated', 'device', deviceId)
      break
    }
    default:
      return NextResponse.json({ error: 'Unsupported device action' }, { status: 400 })
  }

  if (!updatedDevice) {
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 })
  }

  return NextResponse.json(updatedDevice)
}
