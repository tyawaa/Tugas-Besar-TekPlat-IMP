import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { isGrantActive } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'
import { createBillingSnapshot } from '@/lib/billing-snapshot'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const requests = await ServerDataStore.getAllAccessRequests()
  if (hasUserRole(currentUser, 'admin')) return NextResponse.json(requests)

  const visibleRequestIds = new Set<string>()
  if (hasUserRole(currentUser, 'developer')) {
    requests
      .filter(request => request.developerId === currentUser.id)
      .forEach(request => visibleRequestIds.add(request.id))
  }

  if (hasUserRole(currentUser, 'device_owner')) {
    const devices = await ServerDataStore.getAllDevices()
    const ownerDeviceIds = new Set(devices.filter(device => device.ownerId === currentUser.id).map(device => device.id))
    requests
      .filter(request => ownerDeviceIds.has(request.deviceId))
      .forEach(request => visibleRequestIds.add(request.id))
  }

  return NextResponse.json(requests.filter(request => visibleRequestIds.has(request.id)))
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'developer')) {
    return NextResponse.json({ error: 'Only developers can request device access.' }, { status: 403 })
  }

  const body = await request.json()
  const {
    deviceId,
    purpose,
    scopes,
    requestedUntil,
  } = body

  if (
    !deviceId ||
    !purpose ||
    !Array.isArray(scopes) ||
    !requestedUntil
  ) {
    return NextResponse.json({ error: 'Missing required fields to create access request.' }, { status: 400 })
  }

  const requests = await ServerDataStore.getAllAccessRequests()
  const hasPendingRequest = requests.some(request =>
    request.deviceId === deviceId &&
    request.developerId === currentUser.id &&
    (request.status === 'pending' || request.status === 'pending_payment')
  )

  if (hasPendingRequest) {
    return NextResponse.json({ error: 'You already have a pending request for this device.' }, { status: 409 })
  }

  const grants = await ServerDataStore.getAllAccessGrants()
  const hasActiveGrant = grants.some(grant =>
    grant.deviceId === deviceId &&
    grant.developerId === currentUser.id &&
    isGrantActive(grant)
  )

  if (hasActiveGrant) {
    return NextResponse.json({ error: 'You already have active access to this device.' }, { status: 409 })
  }

  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device || device.visibility !== 'catalog' || device.status === 'archived') {
    return NextResponse.json({ error: 'Device is not available in the catalog.' }, { status: 404 })
  }

  const requiresPayment = device.billingType === 'one_time' && Number(device.accessPrice || 0) > 0
  const createdAt = new Date().toISOString()
  const billingSnapshot = requiresPayment
    ? createBillingSnapshot({
        device,
        developerId: currentUser.id,
        createdAt,
      })
    : undefined

  const requestItem = {
    id: `ar_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId,
    developerId: currentUser.id,
    developerName: currentUser.name,
    developerEmail: currentUser.email,
    purpose,
    scopes,
    requestedUntil,
    status: requiresPayment ? 'pending_payment' as const : 'pending' as const,
    billingSnapshot,
    createdAt,
  }

  await ServerDataStore.addAccessRequest(requestItem)
  await ServerDataStore.logAction(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    requiresPayment ? 'access.payment_required' : 'access.requested',
    'access_request',
    requestItem.id
  )

  return NextResponse.json(requestItem, { status: 201 })
}
