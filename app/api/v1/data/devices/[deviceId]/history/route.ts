import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
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

  const history = ServerDataStore.getTelemetryHistory(deviceId, fromDate, toDate)
  return NextResponse.json(history)
}
