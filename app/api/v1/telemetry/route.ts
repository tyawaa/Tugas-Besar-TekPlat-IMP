import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canReadTelemetry } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || undefined
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(toParam) : undefined

  if ((fromParam && isNaN(from?.valueOf() ?? NaN)) || (toParam && isNaN(to?.valueOf() ?? NaN))) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  if (!deviceId && !hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'deviceId is required unless you are an admin.' }, { status: 403 })
  }

  if (deviceId) {
    const device = await ServerDataStore.getDeviceById(deviceId)
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }
    if (!(await canReadTelemetry(currentUser, device))) {
      return NextResponse.json({ error: 'You do not have access to this telemetry.' }, { status: 403 })
    }
  }

  const records = deviceId
    ? await ServerDataStore.getTelemetryHistory(deviceId, from, to)
    : await ServerDataStore.getAllTelemetry()

  return NextResponse.json(records)
}
