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

  const url = new URL(request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const fromDate = fromParam ? new Date(fromParam) : undefined
  const toDate = toParam ? new Date(toParam) : undefined

  if (fromParam && isNaN(fromDate?.valueOf() ?? NaN)) {
    return NextResponse.json({ error: 'Invalid from query parameter' }, { status: 400 })
  }

  if (toParam && isNaN(toDate?.valueOf() ?? NaN)) {
    return NextResponse.json({ error: 'Invalid to query parameter' }, { status: 400 })
  }

  const history = await ServerDataStore.getTelemetryHistory(deviceId, fromDate, toDate)
  return NextResponse.json(history)
}
