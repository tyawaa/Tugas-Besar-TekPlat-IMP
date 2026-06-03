import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ServerDataStore } from './server-data-store'
import { AuthSession, PublicUser, StoredUser, toPublicUser } from './auth-types'
import { UserRole } from './mock-data'

export const SESSION_COOKIE_NAME = 'iotbridge_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PASSWORD_KEY_LENGTH = 64
const SECURITY_CODE_TTL_MS = 10 * 60 * 1000
const LOCAL_DEFAULT_ADMIN_EMAIL = 'admin@iotbridge.local'
const LOCAL_DEFAULT_ADMIN_PASSWORD = 'Admin12345!'
const DEFAULT_ADMIN_NAME = 'IoTBridge Admin'

export interface AuthenticatedUser extends PublicUser {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidRole(role: unknown): role is UserRole {
  return role === 'device_owner' || role === 'developer' || role === 'admin'
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function createSecurityCode(): string {
  return String(randomInt(100000, 1000000))
}

export function hashSecurityCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

export function verifySecurityCode(
  code: string,
  storedHash?: string,
  expiresAt?: string
): boolean {
  if (!code || !storedHash || !expiresAt) return false
  if (new Date(expiresAt) <= new Date()) return false

  const candidate = Buffer.from(hashSecurityCode(code), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

export function getSecurityCodeExpiresAt(): string {
  return new Date(Date.now() + SECURITY_CODE_TTL_MS).toISOString()
}

export async function sendSecurityEmail(input: {
  to: string
  subject: string
  message: string
  code: string
}): Promise<'sent' | 'dev'> {
  const resendApiKey = process.env.RESEND_API_KEY
  const from = process.env.IOTBRIDGE_EMAIL_FROM || 'IoTBridge <onboarding@resend.dev>'

  if (!resendApiKey) {
    console.info(`[IoTBridge security code] ${input.to}: ${input.code}`)
    return 'dev'
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: `${input.message}\n\nCode: ${input.code}\n\nThis code expires in 10 minutes.`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Email delivery failed: ${response.status} ${response.statusText}`)
  }

  return 'sent'
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hash] = storedHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !hash) return false

  const candidate = Buffer.from(scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex'), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

function getBootstrapAdminConfig() {
  const email = process.env.IOTBRIDGE_ADMIN_EMAIL || (process.env.VERCEL ? '' : LOCAL_DEFAULT_ADMIN_EMAIL)
  const password =
    process.env.IOTBRIDGE_ADMIN_PASSWORD || (process.env.VERCEL ? '' : LOCAL_DEFAULT_ADMIN_PASSWORD)

  if (!email || !password) return null

  return {
    name: process.env.IOTBRIDGE_ADMIN_NAME || DEFAULT_ADMIN_NAME,
    email: normalizeEmail(email),
    password,
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') || ''
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (!rawName) return cookies
    cookies[rawName] = decodeURIComponent(rawValue.join('='))
    return cookies
  }, {})
}

async function getSessionTokenFromRequest(request: Request): Promise<string | null> {
  const headerToken = parseCookies(request)[SESSION_COOKIE_NAME]
  if (headerToken) return headerToken

  try {
    const cookieStore = await cookies()
    return cookieStore.get(SESSION_COOKIE_NAME)?.value || null
  } catch {
    return null
  }
}

export async function createStoredUser(input: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<StoredUser> {
  const user: StoredUser = {
    id: `user_${Date.now()}_${randomBytes(4).toString('hex')}`,
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    role: input.role,
    roles: [input.role],
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
    status: 'active',
  }

  return ServerDataStore.addUser(user)
}

export async function ensureBootstrapAdmin(): Promise<StoredUser | null> {
  const adminConfig = getBootstrapAdminConfig()
  if (!adminConfig) return null

  const existingAdmin = await ServerDataStore.getUserByEmail(adminConfig.email)
  if (existingAdmin) return existingAdmin

  const admin = await createStoredUser({
    name: adminConfig.name,
    email: adminConfig.email,
    password: adminConfig.password,
    role: 'admin',
  })

  await ServerDataStore.logAction(
    admin.id,
    admin.name,
    admin.role,
    'auth.bootstrap_admin_created',
    'user',
    admin.id
  )

  return admin
}

export async function createSession(userId: string): Promise<{ token: string; session: AuthSession }> {
  await ServerDataStore.pruneExpiredSessions()

  const token = createSessionToken()
  const now = new Date()
  const session: AuthSession = {
    id: `sess_${Date.now()}_${randomBytes(4).toString('hex')}`,
    userId,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  }

  await ServerDataStore.addSession(session)
  return { token, session }
}

export async function destroySessionFromRequest(request: Request): Promise<void> {
  const token = await getSessionTokenFromRequest(request)
  if (!token) return
  await ServerDataStore.deleteSessionByTokenHash(hashToken(token))
}

export async function getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = await getSessionTokenFromRequest(request)
  if (!token) return null

  const session = await ServerDataStore.getSessionByTokenHash(hashToken(token))
  if (!session) return null

  if (new Date(session.expiresAt) <= new Date()) {
    await ServerDataStore.deleteSessionByTokenHash(session.tokenHash)
    return null
  }

  const user = await ServerDataStore.getUserById(session.userId)
  if (!user || user.status !== 'active') return null

  return toPublicUser(user)
}

export async function requireCurrentUser(request: Request): Promise<AuthenticatedUser | NextResponse> {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }
  return user
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}
