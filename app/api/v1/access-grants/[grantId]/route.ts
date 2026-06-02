import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canManageDevice } from '@/lib/access-control'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { grantId } = await params
  const body = await request.json()
  const { action } = body

  if (!action || action !== 'revoke') {
    return NextResponse.json({ error: 'Missing revoke action' }, { status: 400 })
  }

  const grants = await ServerDataStore.getAllAccessGrants()
  const grant = grants.find(g => g.id === grantId)
  if (!grant) {
    return NextResponse.json({ error: 'Access grant not found' }, { status: 404 })
  }

  const device = await ServerDataStore.getDeviceById(grant.deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  if (!canManageDevice(currentUser, device)) {
    return NextResponse.json({ error: 'Only the device owner or an admin can revoke this grant.' }, { status: 403 })
  }

  // Revoke every duplicate grant for this developer/device pair. Older duplicated grants
  // would otherwise keep telemetry access alive after the visible grant is revoked.
  const matchingGrants = grants.filter(
    (g) => g.deviceId === grant.deviceId && g.developerId === grant.developerId
  )

  // Update request statuses if matching approved requests exist.
  const allRequests = await ServerDataStore.getAllAccessRequests()
  const requestItems = allRequests.filter(
    (r) => r.deviceId === grant.deviceId && r.developerId === grant.developerId && r.status === 'approved'
  )

  await Promise.all(requestItems.map((requestItem) =>
    ServerDataStore.updateAccessRequest(requestItem.id, { status: 'revoked' })
  ))

  const revokedResults = await Promise.all(matchingGrants.map((matchingGrant) =>
    ServerDataStore.revokeAccessGrant(matchingGrant.id)
  ))

  if (!revokedResults.some(Boolean)) {
    return NextResponse.json({ error: 'Failed to revoke access grant' }, { status: 500 })
  }

  await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.revoked', 'access_grant', grantId)
  return NextResponse.json({ success: true })
}
