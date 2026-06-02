import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { filterDevicesForUser, isGrantActive } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const devices = await ServerDataStore.getAllDevices()
  if (hasUserRole(currentUser, 'admin')) {
    return NextResponse.json(devices)
  }

  if (hasUserRole(currentUser, 'developer')) {
    const grants = await ServerDataStore.getAllAccessGrants()
    const grantedDeviceIds = new Set(
      grants
        .filter(grant => grant.developerId === currentUser.id && isGrantActive(grant))
        .map(grant => grant.deviceId)
    )
    const visibleDevices = new Map(
      filterDevicesForUser(currentUser, devices).map(device => [device.id, device])
    )
    devices
      .filter(device =>
        (device.visibility === 'catalog' && device.status !== 'archived') || grantedDeviceIds.has(device.id)
      )
      .forEach(device => visibleDevices.set(device.id, device))
    return NextResponse.json(Array.from(visibleDevices.values()))
  }

  return NextResponse.json(filterDevicesForUser(currentUser, devices))
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'device_owner') && !hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Only device owners can register devices.' }, { status: 403 })
  }

  const body = await request.json()
  const {
    name,
    type,
    location,
    description = '',
    visibility,
    heartbeatInterval,
    metrics,
  } = body

  if (
    !name ||
    !type ||
    !location ||
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
    ownerId: currentUser.id,
    status: 'online' as const,
    visibility,
    lastSeen: new Date().toISOString(),
    heartbeatInterval: Number(heartbeatInterval),
    metrics,
    apiKey: `iot_key_${Math.random().toString(36).substring(2, 22).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  }

  await ServerDataStore.addDevice(device)
  await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.registered', 'device', device.id)
  return NextResponse.json(device, { status: 201 })
}
