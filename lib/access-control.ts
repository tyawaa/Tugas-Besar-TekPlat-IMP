import { AccessGrant, Device } from './mock-data'
import { ServerDataStore } from './server-data-store'
import { AuthenticatedUser } from './auth-server'

export function isGrantActive(grant: AccessGrant): boolean {
  return new Date(grant.expiresAt) >= new Date()
}

export async function getActiveGrantForDeveloper(deviceId: string, developerId: string): Promise<AccessGrant | null> {
  const grants = await ServerDataStore.getAllAccessGrants()
  return grants.find(
    grant => grant.deviceId === deviceId && grant.developerId === developerId && isGrantActive(grant)
  ) || null
}

export async function getGrantFromBearerToken(request: Request, deviceId: string): Promise<AccessGrant | null> {
  const authorization = request.headers.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null

  const grants = await ServerDataStore.getAllAccessGrants()
  return grants.find(
    grant => grant.deviceId === deviceId && grant.token === token && isGrantActive(grant)
  ) || null
}

export function canManageDevice(user: AuthenticatedUser, device: Device): boolean {
  return user.role === 'admin' || device.ownerId === user.id
}

export async function canViewDevice(user: AuthenticatedUser, device: Device): Promise<boolean> {
  if (user.role === 'admin' || device.ownerId === user.id) return true
  if (device.visibility === 'catalog' && device.status !== 'archived') return true
  return Boolean(await getActiveGrantForDeveloper(device.id, user.id))
}

export async function canReadTelemetry(user: AuthenticatedUser, device: Device): Promise<boolean> {
  if (user.role === 'admin' || device.ownerId === user.id) return true
  return Boolean(await getActiveGrantForDeveloper(device.id, user.id))
}

export function filterDevicesForUser(user: AuthenticatedUser, devices: Device[]): Device[] {
  if (user.role === 'admin') return devices
  if (user.role === 'device_owner') return devices.filter(device => device.ownerId === user.id)
  return devices.filter(device => device.visibility === 'catalog' && device.status !== 'archived')
}
