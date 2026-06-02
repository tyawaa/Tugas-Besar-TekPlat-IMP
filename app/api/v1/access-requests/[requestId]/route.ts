import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }
  return NextResponse.json(requestItem)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const body = await request.json()
  const { action, actorId, actorName, actorRole } = body

  if (!action || !actorId || !actorName || !actorRole) {
    return NextResponse.json({ error: 'Missing action or actor details' }, { status: 400 })
  }

  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  if (requestItem.status !== 'pending') {
    return NextResponse.json({ error: 'Access request is not pending' }, { status: 400 })
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
    await ServerDataStore.logAction(actorId, actorName, actorRole, 'access.approved', 'access_request', requestId)

    result = { request: updatedRequest, grant }
  } else if (action === 'reject') {
    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'rejected' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to update access request' }, { status: 500 })
    }
    await ServerDataStore.logAction(actorId, actorName, actorRole, 'access.rejected', 'access_request', requestId)
    result = { request: updatedRequest }
  } else {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }

  return NextResponse.json(result)
}
