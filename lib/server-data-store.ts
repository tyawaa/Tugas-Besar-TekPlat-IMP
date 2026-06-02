import fs from 'fs'
import path from 'path'
import {
  Device,
  AccessRequest,
  AccessGrant,
  TelemetryRecord,
  AuditLog,
  UserRole,
  devices as initialDevices,
  accessRequests as initialAccessRequests,
  accessGrants as initialAccessGrants,
  telemetryRecords as initialTelemetryRecords,
  auditLogs as initialAuditLogs,
} from './mock-data'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILES = {
  devices: 'devices.json',
  accessRequests: 'accessRequests.json',
  accessGrants: 'accessGrants.json',
  telemetry: 'telemetry.json',
  auditLogs: 'auditLogs.json',
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJson<T>(filename: string, fallback: T): T {
  ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8')
    return fallback
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8')
    return fallback
  }
}

function writeJson(filename: string, data: unknown) {
  ensureDataDir()
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf8')
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`
}

export class ServerDataStore {
  private static getDevicesFile() {
    return readJson<Device[]>(FILES.devices, initialDevices)
  }

  private static getAccessRequestsFile() {
    return readJson<AccessRequest[]>(FILES.accessRequests, initialAccessRequests)
  }

  private static getAccessGrantsFile() {
    return readJson<AccessGrant[]>(FILES.accessGrants, initialAccessGrants)
  }

  private static getTelemetryFile() {
    return readJson<TelemetryRecord[]>(FILES.telemetry, initialTelemetryRecords)
  }

  private static getAuditLogsFile() {
    return readJson<AuditLog[]>(FILES.auditLogs, initialAuditLogs)
  }

  private static writeDevices(devices: Device[]) {
    writeJson(FILES.devices, devices)
  }

  private static writeAccessRequests(requests: AccessRequest[]) {
    writeJson(FILES.accessRequests, requests)
  }

  private static writeAccessGrants(grants: AccessGrant[]) {
    writeJson(FILES.accessGrants, grants)
  }

  private static writeTelemetry(records: TelemetryRecord[]) {
    writeJson(FILES.telemetry, records)
  }

  private static writeAuditLogs(logs: AuditLog[]) {
    writeJson(FILES.auditLogs, logs)
  }

  static getAllDevices(): Device[] {
    return this.getDevicesFile()
  }

  static getDeviceById(id: string): Device | null {
    return this.getAllDevices().find(device => device.id === id) || null
  }

  static addDevice(device: Device): Device {
    const devices = this.getAllDevices()
    devices.push(device)
    this.writeDevices(devices)
    return device
  }

  static updateDevice(id: string, updates: Partial<Device>): Device | null {
    const devices = this.getAllDevices()
    const index = devices.findIndex(device => device.id === id)
    if (index < 0) return null
    devices[index] = { ...devices[index], ...updates }
    this.writeDevices(devices)
    return devices[index]
  }

  static getAllAccessRequests(): AccessRequest[] {
    return this.getAccessRequestsFile()
  }

  static getAccessRequestById(id: string): AccessRequest | null {
    return this.getAllAccessRequests().find(request => request.id === id) || null
  }

  static addAccessRequest(request: AccessRequest): AccessRequest {
    const requests = this.getAllAccessRequests()
    requests.push(request)
    this.writeAccessRequests(requests)
    return request
  }

  static updateAccessRequest(id: string, updates: Partial<AccessRequest>): AccessRequest | null {
    const requests = this.getAllAccessRequests()
    const index = requests.findIndex(request => request.id === id)
    if (index < 0) return null
    requests[index] = { ...requests[index], ...updates }
    this.writeAccessRequests(requests)
    return requests[index]
  }

  static getAllAccessGrants(): AccessGrant[] {
    return this.getAccessGrantsFile()
  }

  static addAccessGrant(grant: AccessGrant): AccessGrant {
    const grants = this.getAllAccessGrants()
    grants.push(grant)
    this.writeAccessGrants(grants)
    return grant
  }

  static revokeAccessGrant(id: string): boolean {
    const grants = this.getAllAccessGrants()
    const filtered = grants.filter(grant => grant.id !== id)
    if (filtered.length === grants.length) return false
    this.writeAccessGrants(filtered)
    return true
  }

  static getAllTelemetry(): TelemetryRecord[] {
    return this.getTelemetryFile()
  }

  static getTelemetryByDevice(deviceId: string): TelemetryRecord[] {
    return this.getAllTelemetry().filter(record => record.deviceId === deviceId)
  }

  static getLatestTelemetry(deviceId: string): TelemetryRecord | null {
    const telemetry = this.getTelemetryByDevice(deviceId)
    return telemetry.sort((a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf())[0] ?? null
  }

  static getTelemetryHistory(deviceId: string, from?: Date, to?: Date): TelemetryRecord[] {
    return this.getTelemetryByDevice(deviceId).filter(record => {
      const timestamp = new Date(record.timestamp)
      if (from && timestamp < from) return false
      if (to && timestamp > to) return false
      return true
    })
  }

  static addTelemetry(record: TelemetryRecord): TelemetryRecord {
    const telemetry = this.getAllTelemetry()
    telemetry.push(record)
    this.writeTelemetry(telemetry)
    return record
  }

  static getAllAuditLogs(): AuditLog[] {
    return this.getAuditLogsFile()
  }

  static addAuditLog(log: AuditLog): AuditLog {
    const logs = this.getAllAuditLogs()
    logs.push(log)
    this.writeAuditLogs(logs)
    return log
  }

  static logAction(
    actorId: string,
    actorName: string,
    actorRole: UserRole,
    action: string,
    targetType: 'device' | 'user' | 'access_request' | 'access_grant',
    targetId: string,
    outcome: 'success' | 'failure' = 'success',
    details?: string
  ): AuditLog {
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
    return this.addAuditLog(log)
  }
}
