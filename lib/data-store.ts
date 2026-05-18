import { Device, AccessRequest, AccessGrant, TelemetryRecord, AuditLog, UserRole } from './mock-data'

// Helper to generate short IDs
function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`
}

export class IoTBridgeDataStore {
  private static readonly DEVICES_KEY = 'iotbridge_devices'
  private static readonly ACCESS_REQUESTS_KEY = 'iotbridge_access_requests'
  private static readonly ACCESS_GRANTS_KEY = 'iotbridge_access_grants'
  private static readonly TELEMETRY_KEY = 'iotbridge_telemetry'
  private static readonly AUDIT_LOGS_KEY = 'iotbridge_audit_logs'

  // Devices
  static getAllDevices(): Device[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(this.DEVICES_KEY)
    return stored ? JSON.parse(stored) : []
  }

  static getDeviceById(id: string): Device | null {
    return this.getAllDevices().find(d => d.id === id) || null
  }

  static getDevicesByOwner(ownerId: string): Device[] {
    return this.getAllDevices().filter(d => d.ownerId === ownerId)
  }

  static addDevice(device: Device): void {
    const devices = this.getAllDevices()
    devices.push(device)
    localStorage.setItem(this.DEVICES_KEY, JSON.stringify(devices))
  }

  static updateDevice(id: string, updates: Partial<Device>): void {
    const devices = this.getAllDevices()
    const index = devices.findIndex(d => d.id === id)
    if (index >= 0) {
      devices[index] = { ...devices[index], ...updates }
      localStorage.setItem(this.DEVICES_KEY, JSON.stringify(devices))
    }
  }

  // Access Requests
  static getAllAccessRequests(): AccessRequest[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(this.ACCESS_REQUESTS_KEY)
    return stored ? JSON.parse(stored) : []
  }

  static getAccessRequestsByDevice(deviceId: string): AccessRequest[] {
    return this.getAllAccessRequests().filter(ar => ar.deviceId === deviceId)
  }

  static getAccessRequestsByDeveloper(developerId: string): AccessRequest[] {
    return this.getAllAccessRequests().filter(ar => ar.developerId === developerId)
  }

  static addAccessRequest(request: AccessRequest): void {
    const requests = this.getAllAccessRequests()
    requests.push(request)
    localStorage.setItem(this.ACCESS_REQUESTS_KEY, JSON.stringify(requests))
  }

  static updateAccessRequest(id: string, updates: Partial<AccessRequest>): void {
    const requests = this.getAllAccessRequests()
    const index = requests.findIndex(r => r.id === id)
    if (index >= 0) {
      requests[index] = { ...requests[index], ...updates }
      localStorage.setItem(this.ACCESS_REQUESTS_KEY, JSON.stringify(requests))
    }
  }

  // Access Grants
  static getAllAccessGrants(): AccessGrant[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(this.ACCESS_GRANTS_KEY)
    return stored ? JSON.parse(stored) : []
  }

  static getAccessGrantsByDeveloper(developerId: string): AccessGrant[] {
    return this.getAllAccessGrants().filter(g => g.developerId === developerId)
  }

  static getAccessGrantByDeviceAndDeveloper(deviceId: string, developerId: string): AccessGrant | null {
    return this.getAllAccessGrants().find(g => g.deviceId === deviceId && g.developerId === developerId) || null
  }

  static addAccessGrant(grant: AccessGrant): void {
    const grants = this.getAllAccessGrants()
    grants.push(grant)
    localStorage.setItem(this.ACCESS_GRANTS_KEY, JSON.stringify(grants))
  }

  static updateAccessGrant(id: string, updates: Partial<AccessGrant>): void {
    const grants = this.getAllAccessGrants()
    const index = grants.findIndex(g => g.id === id)
    if (index >= 0) {
      grants[index] = { ...grants[index], ...updates }
      localStorage.setItem(this.ACCESS_GRANTS_KEY, JSON.stringify(grants))
    }
  }

  static revokeAccessGrant(id: string): void {
    const grants = this.getAllAccessGrants()
    const filtered = grants.filter(g => g.id !== id)
    localStorage.setItem(this.ACCESS_GRANTS_KEY, JSON.stringify(filtered))
  }

  // Telemetry
  static getAllTelemetry(): TelemetryRecord[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(this.TELEMETRY_KEY)
    return stored ? JSON.parse(stored) : []
  }

  static getTelemetryByDevice(deviceId: string): TelemetryRecord[] {
    return this.getAllTelemetry().filter((t: TelemetryRecord) => t.deviceId === deviceId)
  }

  static addTelemetry(record: TelemetryRecord): void {
    const allTelemetry = this.getAllTelemetry()
    allTelemetry.push(record)
    localStorage.setItem(this.TELEMETRY_KEY, JSON.stringify(allTelemetry))
  }

  // Audit Logs
  static getAllAuditLogs(): AuditLog[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(this.AUDIT_LOGS_KEY)
    return stored ? JSON.parse(stored) : []
  }

  static addAuditLog(log: AuditLog): void {
    const logs = this.getAllAuditLogs()
    logs.push(log)
    localStorage.setItem(this.AUDIT_LOGS_KEY, JSON.stringify(logs))
  }

  // Helper: Create audit log entry
  static logAction(
    actorId: string,
    actorName: string,
    actorRole: UserRole,
    action: string,
    targetType: 'device' | 'user' | 'access_request' | 'access_grant',
    targetId: string,
    outcome: 'success' | 'failure' = 'success',
    details?: string
  ): void {
    const log: AuditLog = {
      id: generateId('log'),
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorRole,
      action,
      targetType,
      targetId,
      outcome,
      details,
    }
    this.addAuditLog(log)
  }
}
