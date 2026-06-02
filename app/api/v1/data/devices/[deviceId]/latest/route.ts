import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const telemetry = ServerDataStore.getLatestTelemetry(deviceId)

  if (!telemetry) {
    return NextResponse.json({ error: 'Telemetry not found for device.' }, { status: 404 })
  }

  return NextResponse.json(telemetry)
}
