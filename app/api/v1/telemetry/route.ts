import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || undefined
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(toParam) : undefined

  if ((fromParam && isNaN(from?.valueOf() ?? NaN)) || (toParam && isNaN(to?.valueOf() ?? NaN))) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const records = deviceId
    ? await ServerDataStore.getTelemetryHistory(deviceId, from, to)
    : await ServerDataStore.getAllTelemetry()

  return NextResponse.json(records)
}
