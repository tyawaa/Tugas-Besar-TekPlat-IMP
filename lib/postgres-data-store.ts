import { Pool, PoolClient, PoolConfig } from 'pg'
import {
  AccessGrant,
  AccessRequest,
  AuditLog,
  Device,
  TelemetryRecord,
  UserRole,
  accessGrants as initialAccessGrants,
  accessRequests as initialAccessRequests,
  auditLogs as initialAuditLogs,
  devices as initialDevices,
  telemetryRecords as initialTelemetryRecords,
} from './mock-data'
import { AuthSession, StoredUser } from './auth-types'
import { createInitialDemoUsers } from './demo-users'

const POSTGRES_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING

declare global {
  // eslint-disable-next-line no-var
  var iotbridgePostgresPool: Pool | undefined
  // eslint-disable-next-line no-var
  var iotbridgePostgresReady: Promise<void> | undefined
}

type JsonObject = Record<string, unknown>

interface UserRow {
  id: string
  name: string
  email: string
  role: UserRole
  password_hash: string
  created_at: string
  status: 'active' | 'suspended'
}

interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  created_at: Date | string
  expires_at: Date | string
}

interface DeviceRow {
  id: string
  name: string
  type: string
  location: string
  description: string
  owner_id: string
  status: Device['status']
  visibility: Device['visibility']
  last_seen: string
  heartbeat_interval: number
  metrics: unknown
  api_key: string
  created_at: string
}

interface TelemetryRow {
  id: string
  device_id: string
  observed_at: Date | string
  data: unknown
}

interface AccessRequestRow {
  id: string
  device_id: string
  developer_id: string
  developer_name: string
  developer_email: string
  purpose: string
  scopes: unknown
  requested_until: string
  status: AccessRequest['status']
  created_at: string
}

interface AccessGrantRow {
  id: string
  device_id: string
  developer_id: string
  developer_name: string
  scopes: unknown
  expires_at: string
  token: string
  created_at: string
}

interface AuditLogRow {
  id: string
  occurred_at: Date | string
  actor_id: string
  actor_name: string
  actor_role: UserRole
  action: string
  target_type: AuditLog['targetType']
  target_id: string
  outcome: AuditLog['outcome']
  details: string | null
}

export function isPostgresConfigured(): boolean {
  return Boolean(POSTGRES_URL)
}

function getPostgresPool(): Pool {
  if (!POSTGRES_URL) {
    throw new Error('PostgreSQL is not configured. Set DATABASE_URL or POSTGRES_URL.')
  }

  if (!globalThis.iotbridgePostgresPool) {
    const config: PoolConfig = {
      connectionString: POSTGRES_URL,
      max: Number(process.env.IOTBRIDGE_POSTGRES_POOL_MAX || 5),
    }

    if (process.env.IOTBRIDGE_POSTGRES_SSL === 'true') {
      config.ssl = { rejectUnauthorized: false }
    } else if (process.env.IOTBRIDGE_POSTGRES_SSL === 'false') {
      config.ssl = false
    }

    globalThis.iotbridgePostgresPool = new Pool(config)
  }

  return globalThis.iotbridgePostgresPool
}

async function ensureDatabaseReady(): Promise<void> {
  if (!globalThis.iotbridgePostgresReady) {
    globalThis.iotbridgePostgresReady = initializeDatabase().catch((error) => {
      globalThis.iotbridgePostgresReady = undefined
      throw error
    })
  }

  return globalThis.iotbridgePostgresReady
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureDatabaseReady()
  const result = await getPostgresPool().query(sql, params)
  return result.rows as T[]
}

async function initializeDatabase(): Promise<void> {
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await createTables(client)
    await seedInitialData(client)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function createTables(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('device_owner', 'developer', 'admin')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'suspended'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'suspended', 'archived')),
      visibility TEXT NOT NULL CHECK (visibility IN ('private', 'catalog')),
      last_seen TEXT NOT NULL,
      heartbeat_interval INTEGER NOT NULL,
      metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      developer_id TEXT NOT NULL,
      developer_name TEXT NOT NULL,
      developer_email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
      requested_until TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_grants (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      developer_id TEXT NOT NULL,
      developer_name TEXT NOT NULL,
      scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
      expires_at TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL CHECK (actor_role IN ('device_owner', 'developer', 'admin')),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('device', 'user', 'access_request', 'access_grant')),
      target_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_devices_owner_id ON devices (owner_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_device_observed_at ON telemetry (device_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_access_requests_device_id ON access_requests (device_id);
    CREATE INDEX IF NOT EXISTS idx_access_requests_developer_id ON access_requests (developer_id);
    CREATE INDEX IF NOT EXISTS idx_access_grants_device_id ON access_grants (device_id);
    CREATE INDEX IF NOT EXISTS idx_access_grants_developer_id ON access_grants (developer_id);
    CREATE INDEX IF NOT EXISTS idx_access_grants_token ON access_grants (token);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);
  `)
}

async function seedInitialData(client: PoolClient): Promise<void> {
  await seedDemoUsers(client)

  if (await isTableEmpty(client, 'devices')) {
    for (const device of initialDevices) {
      await client.query(
        `INSERT INTO devices (
          id, name, type, location, description, owner_id, status, visibility,
          last_seen, heartbeat_interval, metrics, api_key, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)`,
        deviceParams(device)
      )
    }
  }

  if (await isTableEmpty(client, 'telemetry')) {
    for (const record of initialTelemetryRecords) {
      await client.query(
        'INSERT INTO telemetry (id, device_id, observed_at, data) VALUES ($1, $2, $3, $4::jsonb)',
        telemetryParams(record)
      )
    }
  }

  if (await isTableEmpty(client, 'access_requests')) {
    for (const request of initialAccessRequests) {
      await client.query(
        `INSERT INTO access_requests (
          id, device_id, developer_id, developer_name, developer_email, purpose,
          scopes, requested_until, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
        accessRequestParams(request)
      )
    }
  }

  if (await isTableEmpty(client, 'access_grants')) {
    for (const grant of initialAccessGrants) {
      await client.query(
        `INSERT INTO access_grants (
          id, device_id, developer_id, developer_name, scopes, expires_at, token, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        accessGrantParams(grant)
      )
    }
  }

  if (await isTableEmpty(client, 'audit_logs')) {
    for (const log of initialAuditLogs) {
      await client.query(
        `INSERT INTO audit_logs (
          id, occurred_at, actor_id, actor_name, actor_role, action,
          target_type, target_id, outcome, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        auditLogParams(log)
      )
    }
  }
}

async function seedDemoUsers(client: PoolClient): Promise<void> {
  const users = createInitialDemoUsers()
  for (const user of users) {
    await client.query(
      `INSERT INTO users (id, name, email, role, password_hash, created_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      userParams(user)
    )
  }
}

async function isTableEmpty(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${tableName}`)
  return Number(result.rows[0]?.count || 0) === 0
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function parseJsonObject<T extends JsonObject>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T)
    } catch {
      return {} as T
    }
  }
  return {} as T
}

function mapUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    status: row.status,
  }
}

function mapSession(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
  }
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    location: row.location,
    description: row.description,
    ownerId: row.owner_id,
    status: row.status,
    visibility: row.visibility,
    lastSeen: row.last_seen,
    heartbeatInterval: row.heartbeat_interval,
    metrics: parseJsonArray<Device['metrics'][number]>(row.metrics),
    apiKey: row.api_key,
    createdAt: row.created_at,
  }
}

function mapTelemetry(row: TelemetryRow): TelemetryRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    timestamp: toIsoString(row.observed_at),
    data: parseJsonObject<TelemetryRecord['data']>(row.data),
  }
}

function mapAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    deviceId: row.device_id,
    developerId: row.developer_id,
    developerName: row.developer_name,
    developerEmail: row.developer_email,
    purpose: row.purpose,
    scopes: parseJsonArray<string>(row.scopes),
    requestedUntil: row.requested_until,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapAccessGrant(row: AccessGrantRow): AccessGrant {
  return {
    id: row.id,
    deviceId: row.device_id,
    developerId: row.developer_id,
    developerName: row.developer_name,
    scopes: parseJsonArray<string>(row.scopes),
    expiresAt: row.expires_at,
    token: row.token,
    createdAt: row.created_at,
  }
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    timestamp: toIsoString(row.occurred_at),
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    details: row.details || undefined,
  }
}

function userParams(user: StoredUser): unknown[] {
  return [user.id, user.name, user.email, user.role, user.passwordHash, user.createdAt, user.status]
}

function sessionParams(session: AuthSession): unknown[] {
  return [session.id, session.userId, session.tokenHash, new Date(session.createdAt), new Date(session.expiresAt)]
}

function deviceParams(device: Device): unknown[] {
  return [
    device.id,
    device.name,
    device.type,
    device.location,
    device.description,
    device.ownerId,
    device.status,
    device.visibility,
    device.lastSeen,
    device.heartbeatInterval,
    JSON.stringify(device.metrics),
    device.apiKey,
    device.createdAt,
  ]
}

function telemetryParams(record: TelemetryRecord): unknown[] {
  return [record.id, record.deviceId, new Date(record.timestamp), JSON.stringify(record.data)]
}

function accessRequestParams(request: AccessRequest): unknown[] {
  return [
    request.id,
    request.deviceId,
    request.developerId,
    request.developerName,
    request.developerEmail,
    request.purpose,
    JSON.stringify(request.scopes),
    request.requestedUntil,
    request.status,
    request.createdAt,
  ]
}

function accessGrantParams(grant: AccessGrant): unknown[] {
  return [
    grant.id,
    grant.deviceId,
    grant.developerId,
    grant.developerName,
    JSON.stringify(grant.scopes),
    grant.expiresAt,
    grant.token,
    grant.createdAt,
  ]
}

function auditLogParams(log: AuditLog): unknown[] {
  return [
    log.id,
    new Date(log.timestamp),
    log.actorId,
    log.actorName,
    log.actorRole,
    log.action,
    log.targetType,
    log.targetId,
    log.outcome,
    log.details || null,
  ]
}

async function upsertUser(user: StoredUser): Promise<StoredUser> {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, name, email, role, password_hash, created_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash,
       created_at = EXCLUDED.created_at,
       status = EXCLUDED.status
     RETURNING *`,
    userParams(user)
  )
  return mapUser(rows[0])
}

async function upsertDevice(device: Device): Promise<Device> {
  const rows = await query<DeviceRow>(
    `INSERT INTO devices (
       id, name, type, location, description, owner_id, status, visibility,
       last_seen, heartbeat_interval, metrics, api_key, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       type = EXCLUDED.type,
       location = EXCLUDED.location,
       description = EXCLUDED.description,
       owner_id = EXCLUDED.owner_id,
       status = EXCLUDED.status,
       visibility = EXCLUDED.visibility,
       last_seen = EXCLUDED.last_seen,
       heartbeat_interval = EXCLUDED.heartbeat_interval,
       metrics = EXCLUDED.metrics,
       api_key = EXCLUDED.api_key,
       created_at = EXCLUDED.created_at
     RETURNING *`,
    deviceParams(device)
  )
  return mapDevice(rows[0])
}

async function upsertAccessRequest(request: AccessRequest): Promise<AccessRequest> {
  const rows = await query<AccessRequestRow>(
    `INSERT INTO access_requests (
       id, device_id, developer_id, developer_name, developer_email, purpose,
       scopes, requested_until, status, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       device_id = EXCLUDED.device_id,
       developer_id = EXCLUDED.developer_id,
       developer_name = EXCLUDED.developer_name,
       developer_email = EXCLUDED.developer_email,
       purpose = EXCLUDED.purpose,
       scopes = EXCLUDED.scopes,
       requested_until = EXCLUDED.requested_until,
       status = EXCLUDED.status,
       created_at = EXCLUDED.created_at
     RETURNING *`,
    accessRequestParams(request)
  )
  return mapAccessRequest(rows[0])
}

export class PostgresDataStore {
  static async getAllUsers(): Promise<StoredUser[]> {
    const rows = await query<UserRow>('SELECT * FROM users ORDER BY created_at ASC, id ASC')
    return rows.map(mapUser)
  }

  static async getUserById(id: string): Promise<StoredUser | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id])
    return rows[0] ? mapUser(rows[0]) : null
  }

  static async getUserByEmail(email: string): Promise<StoredUser | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email.trim()])
    return rows[0] ? mapUser(rows[0]) : null
  }

  static async addUser(user: StoredUser): Promise<StoredUser> {
    return upsertUser(user)
  }

  static async updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser | null> {
    const current = await this.getUserById(id)
    if (!current) return null
    return upsertUser({ ...current, ...updates })
  }

  static async getAllSessions(): Promise<AuthSession[]> {
    const rows = await query<SessionRow>('SELECT * FROM sessions ORDER BY created_at ASC, id ASC')
    return rows.map(mapSession)
  }

  static async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const rows = await query<SessionRow>('SELECT * FROM sessions WHERE token_hash = $1 LIMIT 1', [tokenHash])
    return rows[0] ? mapSession(rows[0]) : null
  }

  static async addSession(session: AuthSession): Promise<AuthSession> {
    const rows = await query<SessionRow>(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         token_hash = EXCLUDED.token_hash,
         created_at = EXCLUDED.created_at,
         expires_at = EXCLUDED.expires_at
       RETURNING *`,
      sessionParams(session)
    )
    return mapSession(rows[0])
  }

  static async deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const rows = await query<{ id: string }>('DELETE FROM sessions WHERE token_hash = $1 RETURNING id', [tokenHash])
    return rows.length > 0
  }

  static async pruneExpiredSessions(now = new Date()): Promise<void> {
    await query('DELETE FROM sessions WHERE expires_at <= $1', [now])
  }

  static async getAllDevices(): Promise<Device[]> {
    const rows = await query<DeviceRow>('SELECT * FROM devices ORDER BY created_at ASC, id ASC')
    return rows.map(mapDevice)
  }

  static async getDeviceById(id: string): Promise<Device | null> {
    const rows = await query<DeviceRow>('SELECT * FROM devices WHERE id = $1 LIMIT 1', [id])
    return rows[0] ? mapDevice(rows[0]) : null
  }

  static async addDevice(device: Device): Promise<Device> {
    return upsertDevice(device)
  }

  static async updateDevice(id: string, updates: Partial<Device>): Promise<Device | null> {
    const current = await this.getDeviceById(id)
    if (!current) return null
    return upsertDevice({ ...current, ...updates })
  }

  static async getAllAccessRequests(): Promise<AccessRequest[]> {
    const rows = await query<AccessRequestRow>('SELECT * FROM access_requests ORDER BY created_at ASC, id ASC')
    return rows.map(mapAccessRequest)
  }

  static async getAccessRequestById(id: string): Promise<AccessRequest | null> {
    const rows = await query<AccessRequestRow>('SELECT * FROM access_requests WHERE id = $1 LIMIT 1', [id])
    return rows[0] ? mapAccessRequest(rows[0]) : null
  }

  static async addAccessRequest(request: AccessRequest): Promise<AccessRequest> {
    return upsertAccessRequest(request)
  }

  static async updateAccessRequest(
    id: string,
    updates: Partial<AccessRequest>
  ): Promise<AccessRequest | null> {
    const current = await this.getAccessRequestById(id)
    if (!current) return null
    return upsertAccessRequest({ ...current, ...updates })
  }

  static async getAllAccessGrants(): Promise<AccessGrant[]> {
    const rows = await query<AccessGrantRow>('SELECT * FROM access_grants ORDER BY created_at ASC, id ASC')
    return rows.map(mapAccessGrant)
  }

  static async addAccessGrant(grant: AccessGrant): Promise<AccessGrant> {
    const rows = await query<AccessGrantRow>(
      `INSERT INTO access_grants (
         id, device_id, developer_id, developer_name, scopes, expires_at, token, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         device_id = EXCLUDED.device_id,
         developer_id = EXCLUDED.developer_id,
         developer_name = EXCLUDED.developer_name,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         token = EXCLUDED.token,
         created_at = EXCLUDED.created_at
       RETURNING *`,
      accessGrantParams(grant)
    )
    return mapAccessGrant(rows[0])
  }

  static async revokeAccessGrant(id: string): Promise<boolean> {
    const rows = await query<{ id: string }>('DELETE FROM access_grants WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  }

  static async getAllTelemetry(): Promise<TelemetryRecord[]> {
    const rows = await query<TelemetryRow>('SELECT * FROM telemetry ORDER BY observed_at ASC, id ASC')
    return rows.map(mapTelemetry)
  }

  static async getTelemetryByDevice(deviceId: string): Promise<TelemetryRecord[]> {
    const rows = await query<TelemetryRow>(
      'SELECT * FROM telemetry WHERE device_id = $1 ORDER BY observed_at ASC, id ASC',
      [deviceId]
    )
    return rows.map(mapTelemetry)
  }

  static async getLatestTelemetry(deviceId: string): Promise<TelemetryRecord | null> {
    const rows = await query<TelemetryRow>(
      'SELECT * FROM telemetry WHERE device_id = $1 ORDER BY observed_at DESC, id DESC LIMIT 1',
      [deviceId]
    )
    return rows[0] ? mapTelemetry(rows[0]) : null
  }

  static async getTelemetryHistory(deviceId: string, from?: Date, to?: Date): Promise<TelemetryRecord[]> {
    const conditions = ['device_id = $1']
    const params: unknown[] = [deviceId]

    if (from) {
      params.push(from)
      conditions.push(`observed_at >= $${params.length}`)
    }

    if (to) {
      params.push(to)
      conditions.push(`observed_at <= $${params.length}`)
    }

    const rows = await query<TelemetryRow>(
      `SELECT * FROM telemetry WHERE ${conditions.join(' AND ')} ORDER BY observed_at ASC, id ASC`,
      params
    )
    return rows.map(mapTelemetry)
  }

  static async addTelemetry(record: TelemetryRecord): Promise<TelemetryRecord> {
    const rows = await query<TelemetryRow>(
      `INSERT INTO telemetry (id, device_id, observed_at, data)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      telemetryParams(record)
    )
    return mapTelemetry(rows[0])
  }

  static async getAllAuditLogs(): Promise<AuditLog[]> {
    const rows = await query<AuditLogRow>('SELECT * FROM audit_logs ORDER BY occurred_at DESC, id DESC')
    return rows.map(mapAuditLog)
  }

  static async addAuditLog(log: AuditLog): Promise<AuditLog> {
    const rows = await query<AuditLogRow>(
      `INSERT INTO audit_logs (
         id, occurred_at, actor_id, actor_name, actor_role, action,
         target_type, target_id, outcome, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      auditLogParams(log)
    )
    return mapAuditLog(rows[0])
  }
}
