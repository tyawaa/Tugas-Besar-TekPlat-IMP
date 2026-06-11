import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import { toAccessGrantResponse } from '@/lib/secret-storage'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const grants = await ServerDataStore.getAllAccessGrants()
  if (hasUserRole(currentUser, 'admin')) {
    return NextResponse.json(grants.map((grant) => toAccessGrantResponse(grant, null)))
  }

  const visibleGrantIds = new Set<string>()
  if (hasUserRole(currentUser, 'developer')) {
    grants
      .filter(grant => grant.developerId === currentUser.id)
      .forEach(grant => visibleGrantIds.add(grant.id))
  }

  if (hasUserRole(currentUser, 'device_owner')) {
    const devices = await ServerDataStore.getAllDevices()
    const ownerDeviceIds = new Set(devices.filter(device => device.ownerId === currentUser.id).map(device => device.id))
    grants
      .filter(grant => ownerDeviceIds.has(grant.deviceId))
      .forEach(grant => visibleGrantIds.add(grant.id))
  }

  return NextResponse.json(
    grants
      .filter(grant => visibleGrantIds.has(grant.id))
      .map((grant) => toAccessGrantResponse(grant, null))
  )
}
