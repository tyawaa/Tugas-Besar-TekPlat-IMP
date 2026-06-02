import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canReadTelemetry, getGrantFromBearerToken } from '@/lib/access-control'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  const bearerGrant = await getGrantFromBearerToken(request, deviceId)
  if (!bearerGrant) {
    const currentUser = await requireCurrentUser(request)
    if (currentUser instanceof NextResponse) return currentUser

    if (!(await canReadTelemetry(currentUser, device))) {
      return NextResponse.json({ error: 'You do not have access to this telemetry.' }, { status: 403 })
    }
  }

  const telemetry = await ServerDataStore.getLatestTelemetry(deviceId)

  if (!telemetry) {
    return NextResponse.json({ error: 'Telemetry not found for device.' }, { status: 404 })
  }

  return NextResponse.json(telemetry)
}
