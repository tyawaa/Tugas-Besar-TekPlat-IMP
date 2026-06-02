import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canManageDevice } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { requestId } = await params
  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  const device = await ServerDataStore.getDeviceById(requestItem.deviceId)
  const canView =
    hasUserRole(currentUser, 'admin') ||
    requestItem.developerId === currentUser.id ||
    (device ? canManageDevice(currentUser, device) : false)
  if (!canView) {
    return NextResponse.json({ error: 'You do not have access to this request.' }, { status: 403 })
  }
  return NextResponse.json(requestItem)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { requestId } = await params
  const body = await request.json()
  const { action } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  if (action === 'cancel') {
    if (!hasUserRole(currentUser, 'developer') || requestItem.developerId !== currentUser.id) {
      return NextResponse.json({ error: 'Only the requesting developer can cancel this request.' }, { status: 403 })
    }

    if (requestItem.status !== 'pending' && requestItem.status !== 'pending_payment') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled.' }, { status: 400 })
    }

    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'cancelled' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to cancel access request' }, { status: 500 })
    }

    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.cancelled', 'access_request', requestId)
    return NextResponse.json({ request: updatedRequest })
  }

  if (requestItem.status !== 'pending') {
    return NextResponse.json({ error: 'Access request is not pending' }, { status: 400 })
  }

  const device = await ServerDataStore.getDeviceById(requestItem.deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  if (!canManageDevice(currentUser, device)) {
    return NextResponse.json({ error: 'Only the device owner or an admin can action this request.' }, { status: 403 })
  }

  let result: { request: typeof requestItem; grant?: any } = { request: requestItem }

  if (action === 'approve') {
    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'approved' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to update access request' }, { status: 500 })
    }

    const grant = {
      id: `ag_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      deviceId: updatedRequest.deviceId,
      developerId: updatedRequest.developerId,
      developerName: updatedRequest.developerName,
      scopes: updatedRequest.scopes,
      token: `token_${Math.random().toString(36).substring(2, 32).toUpperCase()}`,
      expiresAt: updatedRequest.requestedUntil,
      createdAt: new Date().toISOString(),
    }

    await ServerDataStore.addAccessGrant(grant)
    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.approved', 'access_request', requestId)

    result = { request: updatedRequest, grant }
  } else if (action === 'reject') {
    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'rejected' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to update access request' }, { status: 500 })
    }
    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.rejected', 'access_request', requestId)
    result = { request: updatedRequest }
  } else {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }

  return NextResponse.json(result)
}
