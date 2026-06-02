import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const grants = await ServerDataStore.getAllAccessGrants()
  if (currentUser.role === 'admin') return NextResponse.json(grants)
  if (currentUser.role === 'developer') {
    return NextResponse.json(grants.filter(grant => grant.developerId === currentUser.id))
  }

  const devices = await ServerDataStore.getAllDevices()
  const ownerDeviceIds = new Set(devices.filter(device => device.ownerId === currentUser.id).map(device => device.id))
  return NextResponse.json(grants.filter(grant => ownerDeviceIds.has(grant.deviceId)))
}
