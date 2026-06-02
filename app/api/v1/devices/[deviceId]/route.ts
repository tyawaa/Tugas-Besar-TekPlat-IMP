import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canManageDevice, canViewDevice } from '@/lib/access-control'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { deviceId } = await params
  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }
  if (!(await canViewDevice(currentUser, device))) {
    return NextResponse.json({ error: 'You do not have access to this device.' }, { status: 403 })
  }
  return NextResponse.json(device)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { deviceId } = await params
  const body = await request.json()
  const { action } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  if (!canManageDevice(currentUser, device)) {
    return NextResponse.json({ error: 'You cannot manage this device.' }, { status: 403 })
  }

  let updatedDevice = null

  switch (action) {
    case 'suspend':
      updatedDevice = await ServerDataStore.updateDevice(deviceId, { status: 'suspended' })
      await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.suspended', 'device', deviceId)
      break
    case 'reinstate':
      updatedDevice = await ServerDataStore.updateDevice(deviceId, { status: 'online' })
      await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.reinstated', 'device', deviceId)
      break
    case 'archive':
      updatedDevice = await ServerDataStore.updateDevice(deviceId, { status: 'archived' })
      await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.archived', 'device', deviceId)
      break
    case 'rotateKey': {
      const apiKey = `iot_key_${Math.random().toString(36).substring(2, 22).toUpperCase()}`
      updatedDevice = await ServerDataStore.updateDevice(deviceId, { apiKey })
      await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.api_key_rotated', 'device', deviceId)
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
