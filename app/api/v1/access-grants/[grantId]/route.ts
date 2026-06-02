import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const { grantId } = await params
  const body = await request.json()
  const { action, actorId, actorName, actorRole } = body

  if (!action || action !== 'revoke' || !actorId || !actorName || !actorRole) {
    return NextResponse.json({ error: 'Missing revoke action or actor details' }, { status: 400 })
  }

  const grants = await ServerDataStore.getAllAccessGrants()
  const grant = grants.find(g => g.id === grantId)
  if (!grant) {
    return NextResponse.json({ error: 'Access grant not found' }, { status: 404 })
  }

  // Update request status if matching request exists
  const allRequests = await ServerDataStore.getAllAccessRequests()
  const requestItem = allRequests.find(
    (r) => r.deviceId === grant.deviceId && r.developerId === grant.developerId && r.status === 'approved'
  )

  if (requestItem) {
    await ServerDataStore.updateAccessRequest(requestItem.id, { status: 'revoked' })
  }

  const success = await ServerDataStore.revokeAccessGrant(grantId)
  if (!success) {
    return NextResponse.json({ error: 'Failed to revoke access grant' }, { status: 500 })
  }

  await ServerDataStore.logAction(actorId, actorName, actorRole, 'access.revoked', 'access_grant', grantId)
  return NextResponse.json({ success: true })
}
