import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { isGrantActive } from '@/lib/access-control'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const requests = await ServerDataStore.getAllAccessRequests()
  if (currentUser.role === 'admin') return NextResponse.json(requests)

  if (currentUser.role === 'developer') {
    return NextResponse.json(requests.filter(request => request.developerId === currentUser.id))
  }

  const devices = await ServerDataStore.getAllDevices()
  const ownerDeviceIds = new Set(devices.filter(device => device.ownerId === currentUser.id).map(device => device.id))
  return NextResponse.json(requests.filter(request => ownerDeviceIds.has(request.deviceId)))
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (currentUser.role !== 'developer') {
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
    request.status === 'pending'
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

  const requestItem = {
    id: `ar_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId,
    developerId: currentUser.id,
    developerName: currentUser.name,
    developerEmail: currentUser.email,
    purpose,
    scopes,
    requestedUntil,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  }

  await ServerDataStore.addAccessRequest(requestItem)
  await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.requested', 'access_request', requestItem.id)

  return NextResponse.json(requestItem, { status: 201 })
}
