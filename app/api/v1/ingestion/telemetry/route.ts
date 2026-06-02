import { NextResponse } from 'next/server'
import { TelemetryService, TelemetryServiceError } from '@/lib/services/telemetry-service'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const deviceId = request.headers.get('x-device-id') || (typeof body.deviceId === 'string' ? body.deviceId : '')
  const deviceKey =
    request.headers.get('x-device-key') ||
    (typeof body.deviceKey === 'string' ? body.deviceKey : '') ||
    (typeof body.apiKey === 'string' ? body.apiKey : '')

  try {
    const record = await TelemetryService.ingestTelemetry({
      deviceId,
      deviceKey,
      metrics: body.metrics ?? body.data,
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if (error instanceof TelemetryServiceError) {
      return NextResponse.json(error.body, { status: error.status })
    }

    throw error
  }
}
