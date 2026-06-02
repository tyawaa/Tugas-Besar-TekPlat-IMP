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

const DATA_DIR =
  process.env.IOTBRIDGE_DATA_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'iotbridge-data') : path.join(process.cwd(), 'data'))

const FILES = {
  devices: 'devices.json',
  accessRequests: 'accessRequests.json',
  accessGrants: 'accessGrants.json',
  telemetry: 'telemetry.json',
  auditLogs: 'auditLogs.json',
}

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_KV_REST_API_URL ||
  process.env.KV_REST_API_URL
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_KV_REST_API_TOKEN ||
  process.env.KV_REST_API_TOKEN
const REDIS_PREFIX = process.env.IOTBRIDGE_REDIS_PREFIX || 'iotbridge'

type CollectionName = keyof typeof FILES

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function cloneFallback<T>(fallback: T): T {
  return JSON.parse(JSON.stringify(fallback)) as T
}

function readJsonFile<T>(filename: string, fallback: T): T {
  ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8')
    return cloneFallback(fallback)
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8')
    return cloneFallback(fallback)
  }
}

function writeJsonFile(filename: string, data: unknown) {
  ensureDataDir()
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf8')
}

function getRedisKey(collection: CollectionName): string {
  return `${REDIS_PREFIX}:${collection}`
}

function isRedisConfigured(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN)
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis is not configured.')
  }

  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Redis command failed: ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as { result?: T; error?: string }
  if (body.error) {
    throw new Error(`Redis command failed: ${body.error}`)
  }

  return body.result as T
}

async function readCollection<T>(collection: CollectionName, fallback: T): Promise<T> {
  if (!isRedisConfigured()) {
    return readJsonFile(FILES[collection], fallback)
  }

  const key = getRedisKey(collection)
  const raw = await redisCommand<string | null>(['GET', key])
  if (!raw) {
    const initialValue = cloneFallback(fallback)
    await redisCommand(['SET', key, JSON.stringify(initialValue)])
    return initialValue
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    const initialValue = cloneFallback(fallback)
    await redisCommand(['SET', key, JSON.stringify(initialValue)])
    return initialValue
  }
}

async function writeCollection(collection: CollectionName, data: unknown): Promise<void> {
  if (!isRedisConfigured()) {
    writeJsonFile(FILES[collection], data)
    return
  }

  await redisCommand(['SET', getRedisKey(collection), JSON.stringify(data)])
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`
}

export class ServerDataStore {
  private static getDevicesFile(): Promise<Device[]> {
    return readCollection<Device[]>('devices', initialDevices)
  }

  private static getAccessRequestsFile(): Promise<AccessRequest[]> {
    return readCollection<AccessRequest[]>('accessRequests', initialAccessRequests)
  }

  private static getAccessGrantsFile(): Promise<AccessGrant[]> {
    return readCollection<AccessGrant[]>('accessGrants', initialAccessGrants)
  }

  private static getTelemetryFile(): Promise<TelemetryRecord[]> {
    return readCollection<TelemetryRecord[]>('telemetry', initialTelemetryRecords)
  }

  private static getAuditLogsFile(): Promise<AuditLog[]> {
    return readCollection<AuditLog[]>('auditLogs', initialAuditLogs)
  }

  private static writeDevices(devices: Device[]) {
    return writeCollection('devices', devices)
  }

  private static writeAccessRequests(requests: AccessRequest[]) {
    return writeCollection('accessRequests', requests)
  }

  private static writeAccessGrants(grants: AccessGrant[]) {
    return writeCollection('accessGrants', grants)
  }

  private static writeTelemetry(records: TelemetryRecord[]) {
    return writeCollection('telemetry', records)
  }

  private static writeAuditLogs(logs: AuditLog[]) {
    return writeCollection('auditLogs', logs)
  }

  static async getAllDevices(): Promise<Device[]> {
    return this.getDevicesFile()
  }

  static async getDeviceById(id: string): Promise<Device | null> {
    const devices = await this.getAllDevices()
    return devices.find(device => device.id === id) || null
  }

  static async addDevice(device: Device): Promise<Device> {
    const devices = await this.getAllDevices()
    devices.push(device)
    await this.writeDevices(devices)
    return device
  }

  static async updateDevice(id: string, updates: Partial<Device>): Promise<Device | null> {
    const devices = await this.getAllDevices()
    const index = devices.findIndex(device => device.id === id)
    if (index < 0) return null
    devices[index] = { ...devices[index], ...updates }
    await this.writeDevices(devices)
    return devices[index]
  }

  static async getAllAccessRequests(): Promise<AccessRequest[]> {
    return this.getAccessRequestsFile()
  }

  static async getAccessRequestById(id: string): Promise<AccessRequest | null> {
    const requests = await this.getAllAccessRequests()
    return requests.find(request => request.id === id) || null
  }

  static async addAccessRequest(request: AccessRequest): Promise<AccessRequest> {
    const requests = await this.getAllAccessRequests()
    requests.push(request)
    await this.writeAccessRequests(requests)
    return request
  }

  static async updateAccessRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    const requests = await this.getAllAccessRequests()
    const index = requests.findIndex(request => request.id === id)
    if (index < 0) return null
    requests[index] = { ...requests[index], ...updates }
    await this.writeAccessRequests(requests)
    return requests[index]
  }

  static async getAllAccessGrants(): Promise<AccessGrant[]> {
    return this.getAccessGrantsFile()
  }

  static async addAccessGrant(grant: AccessGrant): Promise<AccessGrant> {
    const grants = await this.getAllAccessGrants()
    grants.push(grant)
    await this.writeAccessGrants(grants)
    return grant
  }

  static async revokeAccessGrant(id: string): Promise<boolean> {
    const grants = await this.getAllAccessGrants()
    const filtered = grants.filter(grant => grant.id !== id)
    if (filtered.length === grants.length) return false
    await this.writeAccessGrants(filtered)
    return true
  }

  static async getAllTelemetry(): Promise<TelemetryRecord[]> {
    return this.getTelemetryFile()
  }

  static async getTelemetryByDevice(deviceId: string): Promise<TelemetryRecord[]> {
    const telemetry = await this.getAllTelemetry()
    return telemetry
      .filter(record => record.deviceId === deviceId)
      .sort((a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf())
  }

  static async getLatestTelemetry(deviceId: string): Promise<TelemetryRecord | null> {
    const telemetry = await this.getTelemetryByDevice(deviceId)
    return telemetry.sort((a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf())[0] ?? null
  }

  static async getTelemetryHistory(deviceId: string, from?: Date, to?: Date): Promise<TelemetryRecord[]> {
    const telemetry = await this.getTelemetryByDevice(deviceId)
    return telemetry
      .filter(record => {
        const timestamp = new Date(record.timestamp)
        if (from && timestamp < from) return false
        if (to && timestamp > to) return false
        return true
      })
      .sort((a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf())
  }

  static async addTelemetry(record: TelemetryRecord): Promise<TelemetryRecord> {
    const telemetry = await this.getAllTelemetry()
    telemetry.push(record)
    await this.writeTelemetry(telemetry)
    return record
  }

  static async getAllAuditLogs(): Promise<AuditLog[]> {
    return this.getAuditLogsFile()
  }

  static async addAuditLog(log: AuditLog): Promise<AuditLog> {
    const logs = await this.getAllAuditLogs()
    logs.push(log)
    await this.writeAuditLogs(logs)
    return log
  }

  static async logAction(
    actorId: string,
    actorName: string,
    actorRole: UserRole,
    action: string,
    targetType: 'device' | 'user' | 'access_request' | 'access_grant',
    targetId: string,
    outcome: 'success' | 'failure' = 'success',
    details?: string
  ): Promise<AuditLog> {
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
