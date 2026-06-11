import { NextResponse } from 'next/server'
import { TelemetryService, TelemetryServiceError } from '@/lib/services/telemetry-service'
import { consumeRateLimit, TELEMETRY_INGESTION_RATE_LIMIT } from '@/lib/rate-limit'

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

  const rateLimitResponse = consumeRateLimit(request, TELEMETRY_INGESTION_RATE_LIMIT, [
    { name: 'device', value: deviceId },
  ])
  if (rateLimitResponse) return rateLimitResponse

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
