import { PublicUser } from './auth-types'
import { AccessGrant, AccessRequest, AuditLog, Device, TelemetryRecord, UserRole } from './mock-data'

const baseUrl = '/api/v1'

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API request failed: ${res.status} ${res.statusText} - ${body}`)
  }

  return (await res.json()) as T
}

export async function registerAccount(payload: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<{ user: PublicUser }> {
  return fetchJson<{ user: PublicUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function loginAccount(payload: {
  email: string
  password: string
}): Promise<{ user: PublicUser }> {
  return fetchJson<{ user: PublicUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutAccount(): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function getCurrentAccount(): Promise<{ user: PublicUser | null }> {
  return fetchJson<{ user: PublicUser | null }>('/api/auth/me')
}

export async function getUsers(): Promise<PublicUser[]> {
  return fetchJson<PublicUser[]>('/api/auth/users')
}

export async function getDevices(): Promise<Device[]> {
  return fetchJson<Device[]>(`${baseUrl}/devices`)
}

export async function getDevice(deviceId: string): Promise<Device | null> {
  return fetchJson<Device | null>(`${baseUrl}/devices/${deviceId}`)
}

export async function registerDevice(payload: Omit<Device, 'id' | 'apiKey' | 'createdAt' | 'status' | 'lastSeen'> & { status?: Device['status']; lastSeen?: string }): Promise<Device> {
  return fetchJson<Device>(`${baseUrl}/devices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateDeviceAction(
  deviceId: string,
  action: 'suspend' | 'reinstate' | 'archive' | 'rotateKey',
  actorId: string,
  actorName: string,
  actorRole: UserRole
): Promise<Device> {
  return fetchJson<Device>(`${baseUrl}/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, actorId, actorName, actorRole }),
  })
}

export async function getAccessRequests(): Promise<AccessRequest[]> {
  return fetchJson<AccessRequest[]>(`${baseUrl}/access-requests`)
}

export async function createAccessRequest(payload: {
  deviceId: string
  purpose: string
  scopes: string[]
  requestedUntil: string
}): Promise<AccessRequest> {
  return fetchJson<AccessRequest>(`${baseUrl}/access-requests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function actionAccessRequest(
  requestId: string,
  action: 'approve' | 'reject',
  actorId: string,
  actorName: string,
  actorRole: UserRole
): Promise<{ request: AccessRequest; grant?: AccessGrant }> {
  return fetchJson<{ request: AccessRequest; grant?: AccessGrant }>(`${baseUrl}/access-requests/${requestId}`, {
    method: 'POST',
    body: JSON.stringify({ action, actorId, actorName, actorRole }),
  })
}

export async function getAccessGrants(): Promise<AccessGrant[]> {
  return fetchJson<AccessGrant[]>(`${baseUrl}/access-grants`)
}

export async function revokeAccessGrant(grantId: string, actorId: string, actorName: string, actorRole: UserRole): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`${baseUrl}/access-grants/${grantId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'revoke', actorId, actorName, actorRole }),
  })
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  return fetchJson<AuditLog[]>(`${baseUrl}/audit-logs`)
}

export async function getLatestTelemetry(deviceId: string): Promise<TelemetryRecord> {
  return fetchJson<TelemetryRecord>(`${baseUrl}/data/devices/${deviceId}/latest`)
}

export async function getTelemetryHistory(deviceId: string, from?: string, to?: string): Promise<TelemetryRecord[]> {
  const url = new URL(`${baseUrl}/data/devices/${deviceId}/history`, window.location.origin)
  if (from) url.searchParams.set('from', from)
  if (to) url.searchParams.set('to', to)
  return fetchJson<TelemetryRecord[]>(url.toString())
}

export async function ingestTelemetry(
  deviceId: string,
  data: Record<string, number | boolean | string>,
  deviceApiKey?: string
): Promise<TelemetryRecord> {
  return fetchJson<TelemetryRecord>(`${baseUrl}/ingestion/telemetry`, {
    method: 'POST',
    headers: {
      'X-Device-Id': deviceId,
      ...(deviceApiKey ? { 'X-Device-Key': deviceApiKey } : {}),
    },
    body: JSON.stringify({ metrics: data }),
  })
}

export async function getTelemetry(deviceId?: string): Promise<TelemetryRecord[]> {
  const url = new URL(`${baseUrl}/telemetry`, window.location.origin)
  if (deviceId) url.searchParams.set('deviceId', deviceId)
  return fetchJson<TelemetryRecord[]>(url.toString())
}
