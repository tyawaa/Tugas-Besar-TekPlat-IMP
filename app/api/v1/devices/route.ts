import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { filterDevicesForUser, isGrantActive } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'
import { BillingType, Device } from '@/lib/mock-data'
import { createDeviceApiKey, createSecureId, hashSecret, toDeviceResponse } from '@/lib/secret-storage'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const devices = await ServerDataStore.getAllDevices()
  if (hasUserRole(currentUser, 'admin')) {
    return NextResponse.json(devices.map((device) => toDeviceResponse(device, null)))
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
    return NextResponse.json(Array.from(visibleDevices.values()).map((device) => toDeviceResponse(device, null)))
  }

  return NextResponse.json(filterDevicesForUser(currentUser, devices).map((device) => toDeviceResponse(device, null)))
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
    billingType = 'free',
    accessPrice = 0,
    currency = 'IDR',
  } = body
  const normalizedBillingType: BillingType = billingType === 'one_time' ? 'one_time' : 'free'
  const normalizedAccessPrice = normalizedBillingType === 'one_time'
    ? Math.max(0, Math.round(Number(accessPrice)))
    : 0

  if (
    !name ||
    !type ||
    !location ||
    !visibility ||
    !Number.isFinite(Number(heartbeatInterval)) ||
    !Array.isArray(metrics) ||
    !Number.isFinite(normalizedAccessPrice)
  ) {
    return NextResponse.json({ error: 'Missing required fields to register a device.' }, { status: 400 })
  }

  const apiKey = createDeviceApiKey()
  const device: Device = {
    id: createSecureId('dev'),
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
    // Security-sensitive: persist only the hash and return the plaintext key once.
    apiKeyHash: hashSecret(apiKey),
    createdAt: new Date().toISOString(),
    billingType: normalizedBillingType,
    accessPrice: normalizedAccessPrice,
    currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'IDR',
  }

  await ServerDataStore.addDevice(device)
  await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'device.registered', 'device', device.id)
  return NextResponse.json(toDeviceResponse(device, apiKey), { status: 201 })
}
