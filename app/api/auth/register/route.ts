import { NextResponse } from 'next/server'
import {
  createSession,
  createStoredUser,
  ensureBootstrapAdmin,
  isValidRole,
  normalizeEmail,
  setSessionCookie,
} from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { toPublicUser } from '@/lib/auth-types'
import { AUTH_REGISTER_RATE_LIMIT, consumeRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  await ensureBootstrapAdmin()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role

  if (!name || !email || !password || !isValidRole(role)) {
    return NextResponse.json({ error: 'Name, email, password, and role are required.' }, { status: 400 })
  }

  const rateLimitResponse = consumeRateLimit(request, AUTH_REGISTER_RATE_LIMIT, [{ name: 'email', value: email }])
  if (rateLimitResponse) return rateLimitResponse

  if (role === 'admin') {
    return NextResponse.json({ error: 'Admin accounts are managed by the system.' }, { status: 403 })
  }

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Email must be valid.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const existingUser = await ServerDataStore.getUserByEmail(email)
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
  }

  const user = await createStoredUser({ name, email, password, role })
  const { token } = await createSession(user.id)
  await ServerDataStore.logAction(user.id, user.name, user.role, 'auth.registered', 'user', user.id)

  const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 })
  setSessionCookie(response, token)
  return response
}
