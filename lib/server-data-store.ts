import fs from 'fs'
import path from 'path'
import {
  Device,
  AccessRequest,
  AccessGrant,
  Order,
  TelemetryRecord,
  AuditLog,
  UserRole,
  devices as initialDevices,
  accessRequests as initialAccessRequests,
  accessGrants as initialAccessGrants,
  orders as initialOrders,
  telemetryRecords as initialTelemetryRecords,
  auditLogs as initialAuditLogs,
} from './mock-data'
import { AuthSession, StoredUser, normalizeStoredUser } from './auth-types'
import { createInitialDemoUsers, shouldSeedDemoUsers } from './demo-users'
import { isPostgresConfigured, PostgresDataStore } from './postgres-data-store'
import { normalizeOrderPayout } from './order-payouts'
import { getLatestOrder } from './payment-state'
import { createSecureId, normalizeStoredAccessGrantSecret, normalizeStoredDeviceSecret } from './secret-storage'

const DATA_DIR =
  process.env.IOTBRIDGE_DATA_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'iotbridge-data') : path.join(process.cwd(), 'data'))

const FILES = {
  users: 'users.json',
  sessions: 'sessions.json',
  devices: 'devices.json',
  accessRequests: 'accessRequests.json',
  accessGrants: 'accessGrants.json',
  orders: 'orders.json',
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

interface OrderUpdateOperation {
  orderId: string
  updates: Partial<Order>
}

export interface AuditLogInput {
  actorId: string
  actorName: string
  actorRole: UserRole
  action: string
  targetType: AuditLog['targetType']
  targetId: string
  outcome: AuditLog['outcome']
  details?: string
}

interface ApproveAccessRequestWithPaymentInput {
  requestId: string
  payoutOrderUpdate: OrderUpdateOperation | null
  duplicateRefundUpdates: OrderUpdateOperation[]
  grant: AccessGrant
  auditLog: AuditLogInput
}

interface RejectAccessRequestWithRefundInput {
  requestId: string
  refundUpdates: OrderUpdateOperation[]
  auditLog: AuditLogInput
}

interface CancelAccessRequestWithPaymentInput {
  requestId: string
  orderUpdates: OrderUpdateOperation[]
  auditLog: AuditLogInput
}

interface AdminOrderActionInput {
  orderId: string
  updates: Partial<Order>
  auditLog: AuditLogInput
}

export interface PaymentSyncState {
  order: Order
  accessRequest: AccessRequest | null
}

export interface PaymentSyncPlan<T> {
  orderUpdates?: Partial<Order>
  accessRequestUpdates?: Partial<AccessRequest>
  auditLog?: AuditLogInput
  getResult: (state: PaymentSyncState) => T
}

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
  return createSecureId(prefix)
}

function createAuditLog(input: AuditLogInput): AuditLog {
  return {
    id: generateId('log'),
    timestamp: new Date().toISOString(),
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    details: input.details,
  }
}

export class ServerDataStore {
  private static getUsersFile(): Promise<StoredUser[]> {
    return readCollection<StoredUser[]>('users', createInitialDemoUsers())
  }

  private static getSessionsFile(): Promise<AuthSession[]> {
    return readCollection<AuthSession[]>('sessions', [])
  }

  private static getDevicesFile(): Promise<Device[]> {
    return readCollection<Device[]>('devices', initialDevices)
  }

  private static getAccessRequestsFile(): Promise<AccessRequest[]> {
    return readCollection<AccessRequest[]>('accessRequests', initialAccessRequests)
  }

  private static getAccessGrantsFile(): Promise<AccessGrant[]> {
    return readCollection<AccessGrant[]>('accessGrants', initialAccessGrants)
  }

  private static getOrdersFile(): Promise<Order[]> {
    return readCollection<Order[]>('orders', initialOrders)
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

  private static writeOrders(orders: Order[]) {
    return writeCollection('orders', orders)
  }

  private static writeTelemetry(records: TelemetryRecord[]) {
    return writeCollection('telemetry', records)
  }

  private static writeAuditLogs(logs: AuditLog[]) {
    return writeCollection('auditLogs', logs)
  }

  private static writeUsers(users: StoredUser[]) {
    return writeCollection('users', users)
  }

  private static writeSessions(sessions: AuthSession[]) {
    return writeCollection('sessions', sessions)
  }

  static async getAllUsers(): Promise<StoredUser[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllUsers()
    const users = await this.getUsersFile()
    const normalizedUsers = users.map(normalizeStoredUser)
    if (!shouldSeedDemoUsers()) return normalizedUsers

    const existingIds = new Set(normalizedUsers.map(user => user.id))
    const existingEmails = new Set(normalizedUsers.map(user => user.email.toLowerCase()))
    const missingSeedUsers = createInitialDemoUsers().filter(
      user => !existingIds.has(user.id) && !existingEmails.has(user.email.toLowerCase())
    )

    if (missingSeedUsers.length === 0) return normalizedUsers

    const mergedUsers = [...normalizedUsers, ...missingSeedUsers.map(normalizeStoredUser)]
    await this.writeUsers(mergedUsers)
    return mergedUsers
  }

  static async getUserById(id: string): Promise<StoredUser | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getUserById(id)
    const users = await this.getAllUsers()
    return users.find(user => user.id === id) || null
  }

  static async getUserByEmail(email: string): Promise<StoredUser | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getUserByEmail(email)
    const normalizedEmail = email.trim().toLowerCase()
    const users = await this.getAllUsers()
    return users.find(user => user.email.toLowerCase() === normalizedEmail) || null
  }

  static async addUser(user: StoredUser): Promise<StoredUser> {
    if (isPostgresConfigured()) return PostgresDataStore.addUser(user)
    const normalizedUser = normalizeStoredUser(user)
    const users = await this.getAllUsers()
    users.push(normalizedUser)
    await this.writeUsers(users)
    return normalizedUser
  }

  static async updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser | null> {
    if (isPostgresConfigured()) return PostgresDataStore.updateUser(id, updates)
    const users = await this.getAllUsers()
    const index = users.findIndex(user => user.id === id)
    if (index < 0) return null
    users[index] = normalizeStoredUser({ ...users[index], ...updates })
    await this.writeUsers(users)
    return users[index]
  }

  static async getAllSessions(): Promise<AuthSession[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllSessions()
    return this.getSessionsFile()
  }

  static async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getSessionByTokenHash(tokenHash)
    const sessions = await this.getAllSessions()
    return sessions.find(session => session.tokenHash === tokenHash) || null
  }

  static async addSession(session: AuthSession): Promise<AuthSession> {
    if (isPostgresConfigured()) return PostgresDataStore.addSession(session)
    const sessions = await this.getAllSessions()
    sessions.push(session)
    await this.writeSessions(sessions)
    return session
  }

  static async deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
    if (isPostgresConfigured()) return PostgresDataStore.deleteSessionByTokenHash(tokenHash)
    const sessions = await this.getAllSessions()
    const filtered = sessions.filter(session => session.tokenHash !== tokenHash)
    if (filtered.length === sessions.length) return false
    await this.writeSessions(filtered)
    return true
  }

  static async pruneExpiredSessions(now = new Date()): Promise<void> {
    if (isPostgresConfigured()) return PostgresDataStore.pruneExpiredSessions(now)
    const sessions = await this.getAllSessions()
    const filtered = sessions.filter(session => new Date(session.expiresAt) > now)
    if (filtered.length !== sessions.length) {
      await this.writeSessions(filtered)
    }
  }

  static async getAllDevices(): Promise<Device[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllDevices()
    const devices = await this.getDevicesFile()
    const normalizedResults = devices.map(normalizeStoredDeviceSecret)
    const normalizedDevices = normalizedResults.map((result) => result.device)
    if (normalizedResults.some((result) => result.migrated)) {
      await this.writeDevices(normalizedDevices)
    }
    return normalizedDevices
  }

  static async getDeviceById(id: string): Promise<Device | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getDeviceById(id)
    const devices = await this.getAllDevices()
    return devices.find(device => device.id === id) || null
  }

  static async addDevice(device: Device): Promise<Device> {
    if (isPostgresConfigured()) return PostgresDataStore.addDevice(device)
    const normalizedDevice = normalizeStoredDeviceSecret(device).device
    const devices = await this.getAllDevices()
    devices.push(normalizedDevice)
    await this.writeDevices(devices)
    return normalizedDevice
  }

  static async updateDevice(id: string, updates: Partial<Device>): Promise<Device | null> {
    if (isPostgresConfigured()) return PostgresDataStore.updateDevice(id, updates)
    const devices = await this.getAllDevices()
    const index = devices.findIndex(device => device.id === id)
    if (index < 0) return null
    devices[index] = normalizeStoredDeviceSecret({ ...devices[index], ...updates }).device
    await this.writeDevices(devices)
    return devices[index]
  }

  static async getAllAccessRequests(): Promise<AccessRequest[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllAccessRequests()
    return this.getAccessRequestsFile()
  }

  static async getAccessRequestById(id: string): Promise<AccessRequest | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getAccessRequestById(id)
    const requests = await this.getAllAccessRequests()
    return requests.find(request => request.id === id) || null
  }

  static async addAccessRequest(request: AccessRequest): Promise<AccessRequest> {
    if (isPostgresConfigured()) return PostgresDataStore.addAccessRequest(request)
    const requests = await this.getAllAccessRequests()
    requests.push(request)
    await this.writeAccessRequests(requests)
    return request
  }

  static async updateAccessRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    if (isPostgresConfigured()) return PostgresDataStore.updateAccessRequest(id, updates)
    const requests = await this.getAllAccessRequests()
    const index = requests.findIndex(request => request.id === id)
    if (index < 0) return null
    requests[index] = { ...requests[index], ...updates }
    await this.writeAccessRequests(requests)
    return requests[index]
  }

  static async getAllAccessGrants(): Promise<AccessGrant[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllAccessGrants()
    const grants = await this.getAccessGrantsFile()
    const normalizedResults = grants.map(normalizeStoredAccessGrantSecret)
    const normalizedGrants = normalizedResults.map((result) => result.grant)
    if (normalizedResults.some((result) => result.migrated)) {
      await this.writeAccessGrants(normalizedGrants)
    }
    return normalizedGrants
  }

  static async addAccessGrant(grant: AccessGrant): Promise<AccessGrant> {
    if (isPostgresConfigured()) return PostgresDataStore.addAccessGrant(grant)
    const normalizedGrant = normalizeStoredAccessGrantSecret(grant).grant
    const grants = await this.getAllAccessGrants()
    grants.push(normalizedGrant)
    await this.writeAccessGrants(grants)
    return normalizedGrant
  }

  static async revokeAccessGrant(id: string): Promise<boolean> {
    if (isPostgresConfigured()) return PostgresDataStore.revokeAccessGrant(id)
    const grants = await this.getAllAccessGrants()
    const filtered = grants.filter(grant => grant.id !== id)
    if (filtered.length === grants.length) return false
    await this.writeAccessGrants(filtered)
    return true
  }

  static async getAllOrders(): Promise<Order[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllOrders()
    const orders = await this.getOrdersFile()
    return orders.map(normalizeOrderPayout)
  }

  static async getOrderById(id: string): Promise<Order | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getOrderById(id)
    const orders = await this.getAllOrders()
    return orders.find(order => order.id === id) || null
  }

  static async getOrderByMidtransOrderId(midtransOrderId: string): Promise<Order | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getOrderByMidtransOrderId(midtransOrderId)
    const orders = await this.getAllOrders()
    return orders.find(order => order.midtransOrderId === midtransOrderId) || null
  }

  static async getOrderByAccessRequestId(accessRequestId: string): Promise<Order | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getOrderByAccessRequestId(accessRequestId)
    const orders = await this.getAllOrders()
    return getLatestOrder(orders.filter(order => order.accessRequestId === accessRequestId))
  }

  static async getOrdersByAccessRequestId(accessRequestId: string): Promise<Order[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getOrdersByAccessRequestId(accessRequestId)
    const orders = await this.getAllOrders()
    return orders.filter(order => order.accessRequestId === accessRequestId)
  }

  static async addOrder(order: Order): Promise<Order> {
    if (isPostgresConfigured()) return PostgresDataStore.addOrder(order)
    // JSON/Redis demo storage cannot enforce the Postgres partial unique index
    // that protects one active PENDING payment per access request in production.
    const orders = await this.getAllOrders()
    orders.push(order)
    await this.writeOrders(orders)
    return order
  }

  static async updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
    if (isPostgresConfigured()) return PostgresDataStore.updateOrder(id, updates)
    const orders = await this.getAllOrders()
    const index = orders.findIndex(order => order.id === id)
    if (index < 0) return null
    orders[index] = { ...orders[index], ...updates, updatedAt: updates.updatedAt || new Date().toISOString() }
    await this.writeOrders(orders)
    return orders[index]
  }

  static async approveAccessRequestWithPayment(
    input: ApproveAccessRequestWithPaymentInput
  ): Promise<{ request: AccessRequest; grant: AccessGrant; order?: Order }> {
    const auditLog = createAuditLog(input.auditLog)

    if (isPostgresConfigured()) {
      const result = await PostgresDataStore.approveAccessRequestWithPaymentTransaction({
        requestId: input.requestId,
        allowedCurrentStatuses: ['pending'],
        payoutOrderUpdate: input.payoutOrderUpdate,
        duplicateRefundUpdates: input.duplicateRefundUpdates,
        grant: input.grant,
        auditLog,
      })
      return {
        request: result.request,
        grant: result.grant,
        order: result.order || undefined,
      }
    }

    let payoutOrder: Order | undefined
    if (input.payoutOrderUpdate) {
      const updatedOrder = await this.updateOrder(input.payoutOrderUpdate.orderId, input.payoutOrderUpdate.updates)
      if (!updatedOrder) throw new Error(`Failed to update payout order ${input.payoutOrderUpdate.orderId}.`)
      payoutOrder = updatedOrder
    }

    for (const refundUpdate of input.duplicateRefundUpdates) {
      const updatedOrder = await this.updateOrder(refundUpdate.orderId, refundUpdate.updates)
      if (!updatedOrder) throw new Error(`Failed to mark duplicate order ${refundUpdate.orderId} for refund review.`)
    }

    const updatedRequest = await this.updateAccessRequest(input.requestId, { status: 'approved' })
    if (!updatedRequest) throw new Error(`Failed to approve access request ${input.requestId}.`)

    const grant = await this.addAccessGrant(input.grant)
    await this.addAuditLog(auditLog)

    return {
      request: updatedRequest,
      grant,
      order: payoutOrder,
    }
  }

  static async rejectAccessRequestWithRefund(
    input: RejectAccessRequestWithRefundInput
  ): Promise<{ request: AccessRequest; order?: Order }> {
    const auditLog = createAuditLog(input.auditLog)

    if (isPostgresConfigured()) {
      const result = await PostgresDataStore.rejectAccessRequestWithRefundTransaction({
        requestId: input.requestId,
        allowedCurrentStatuses: ['pending'],
        refundUpdates: input.refundUpdates,
        auditLog,
      })
      return {
        request: result.request,
        order: result.order || undefined,
      }
    }

    let refundOrder: Order | undefined
    for (const refundUpdate of input.refundUpdates) {
      const updatedOrder = await this.updateOrder(refundUpdate.orderId, refundUpdate.updates)
      if (!updatedOrder) throw new Error(`Failed to mark order ${refundUpdate.orderId} for refund review.`)
      refundOrder = refundOrder || updatedOrder
    }

    const updatedRequest = await this.updateAccessRequest(input.requestId, { status: 'rejected' })
    if (!updatedRequest) throw new Error(`Failed to reject access request ${input.requestId}.`)

    await this.addAuditLog(auditLog)

    return {
      request: updatedRequest,
      order: refundOrder,
    }
  }

  static async cancelAccessRequestWithPayment(
    input: CancelAccessRequestWithPaymentInput
  ): Promise<{ request: AccessRequest; orders: Order[] }> {
    const auditLog = createAuditLog(input.auditLog)

    if (isPostgresConfigured()) {
      return PostgresDataStore.cancelAccessRequestWithPaymentTransaction({
        requestId: input.requestId,
        allowedCurrentStatuses: ['pending', 'pending_payment'],
        orderUpdates: input.orderUpdates,
        auditLog,
      })
    }

    const updatedOrders: Order[] = []
    for (const orderUpdate of input.orderUpdates) {
      const updatedOrder = await this.updateOrder(orderUpdate.orderId, orderUpdate.updates)
      if (!updatedOrder) throw new Error(`Failed to update order ${orderUpdate.orderId} during cancellation.`)
      updatedOrders.push(updatedOrder)
    }

    const updatedRequest = await this.updateAccessRequest(input.requestId, { status: 'cancelled' })
    if (!updatedRequest) throw new Error(`Failed to cancel access request ${input.requestId}.`)

    await this.addAuditLog(auditLog)

    return {
      request: updatedRequest,
      orders: updatedOrders,
    }
  }

  static async markOrderPaidOutWithAudit(input: AdminOrderActionInput): Promise<Order> {
    const auditLog = createAuditLog(input.auditLog)

    if (isPostgresConfigured()) {
      return PostgresDataStore.markOrderPaidOutWithAuditTransaction({
        orderId: input.orderId,
        updates: input.updates,
        allowedPaymentStatuses: ['PAID'],
        allowedPayoutStatuses: ['ELIGIBLE'],
        auditLog,
      })
    }

    const updatedOrder = await this.updateOrder(input.orderId, input.updates)
    if (!updatedOrder) throw new Error(`Failed to mark order ${input.orderId} paid out.`)
    await this.addAuditLog(auditLog)
    return updatedOrder
  }

  static async markOrderRefundedWithAudit(input: AdminOrderActionInput): Promise<Order> {
    const auditLog = createAuditLog(input.auditLog)

    if (isPostgresConfigured()) {
      return PostgresDataStore.markOrderRefundedWithAuditTransaction({
        orderId: input.orderId,
        updates: input.updates,
        allowedPaymentStatuses: ['PAID', 'REFUNDED', 'PARTIAL_REFUND', 'CHARGEBACK', 'PARTIAL_CHARGEBACK'],
        allowedPayoutStatuses: ['REFUND_REQUIRED'],
        auditLog,
      })
    }

    const updatedOrder = await this.updateOrder(input.orderId, input.updates)
    if (!updatedOrder) throw new Error(`Failed to mark order ${input.orderId} refunded.`)
    await this.addAuditLog(auditLog)
    return updatedOrder
  }

  static async runPaymentSyncOperation<T>(
    midtransOrderId: string,
    buildPlan: (state: PaymentSyncState) => Promise<PaymentSyncPlan<T>>
  ): Promise<T | null> {
    if (isPostgresConfigured()) {
      return PostgresDataStore.runPaymentSyncTransaction(midtransOrderId, async (state) => {
        const plan = await buildPlan(state)
        return {
          ...plan,
          auditLog: plan.auditLog ? createAuditLog(plan.auditLog) : undefined,
        }
      })
    }

    const order = await this.getOrderByMidtransOrderId(midtransOrderId)
    if (!order) return null

    const accessRequest = await this.getAccessRequestById(order.accessRequestId)
    const plan = await buildPlan({ order, accessRequest })

    let updatedOrder = order
    if (plan.orderUpdates) {
      const orderUpdate = await this.updateOrder(order.id, plan.orderUpdates)
      if (!orderUpdate) throw new Error(`Failed to update order ${order.id} during payment sync.`)
      updatedOrder = orderUpdate
    }

    let updatedAccessRequest = accessRequest
    if (accessRequest && plan.accessRequestUpdates) {
      const requestUpdate = await this.updateAccessRequest(accessRequest.id, plan.accessRequestUpdates)
      if (!requestUpdate) {
        throw new Error(`Failed to update access request ${accessRequest.id} during payment sync.`)
      }
      updatedAccessRequest = requestUpdate
    }

    if (plan.auditLog) {
      await this.addAuditLog(createAuditLog(plan.auditLog))
    }

    return plan.getResult({
      order: updatedOrder,
      accessRequest: updatedAccessRequest,
    })
  }

  static async getAllTelemetry(): Promise<TelemetryRecord[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllTelemetry()
    return this.getTelemetryFile()
  }

  static async getTelemetryByDevice(deviceId: string): Promise<TelemetryRecord[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getTelemetryByDevice(deviceId)
    const telemetry = await this.getAllTelemetry()
    return telemetry
      .filter(record => record.deviceId === deviceId)
      .sort((a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf())
  }

  static async getLatestTelemetry(deviceId: string): Promise<TelemetryRecord | null> {
    if (isPostgresConfigured()) return PostgresDataStore.getLatestTelemetry(deviceId)
    const telemetry = await this.getTelemetryByDevice(deviceId)
    return telemetry.sort((a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf())[0] ?? null
  }

  static async getTelemetryHistory(deviceId: string, from?: Date, to?: Date): Promise<TelemetryRecord[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getTelemetryHistory(deviceId, from, to)
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
    if (isPostgresConfigured()) return PostgresDataStore.addTelemetry(record)
    const telemetry = await this.getAllTelemetry()
    telemetry.push(record)
    await this.writeTelemetry(telemetry)
    return record
  }

  static async getAllAuditLogs(): Promise<AuditLog[]> {
    if (isPostgresConfigured()) return PostgresDataStore.getAllAuditLogs()
    return this.getAuditLogsFile()
  }

  static async addAuditLog(log: AuditLog): Promise<AuditLog> {
    if (isPostgresConfigured()) return PostgresDataStore.addAuditLog(log)
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
    const log = createAuditLog({
      actorId,
      actorName,
      actorRole,
      action,
      targetType,
      targetId,
      outcome,
      details,
    })
    return this.addAuditLog(log)
  }
}
