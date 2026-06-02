import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET() {
  const requests = await ServerDataStore.getAllAccessRequests()
  return NextResponse.json(requests)
}

export async function POST(request: Request) {
  const body = await request.json()
  const {
    deviceId,
    developerId,
    developerName,
    developerEmail,
    purpose,
    scopes,
    requestedUntil,
  } = body

  if (
    !deviceId ||
    !developerId ||
    !developerName ||
    !developerEmail ||
    !purpose ||
    !Array.isArray(scopes) ||
    !requestedUntil
  ) {
    return NextResponse.json({ error: 'Missing required fields to create access request.' }, { status: 400 })
  }

  const requestItem = {
    id: `ar_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId,
    developerId,
    developerName,
    developerEmail,
    purpose,
    scopes,
    requestedUntil,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  }

  await ServerDataStore.addAccessRequest(requestItem)
  await ServerDataStore.logAction(developerId, developerName, 'developer', 'access.requested', 'access_request', requestItem.id)

  return NextResponse.json(requestItem, { status: 201 })
}
