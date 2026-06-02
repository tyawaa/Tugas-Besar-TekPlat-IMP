import { NextResponse } from 'next/server'
import { createSession, ensureBootstrapAdmin, normalizeEmail, setSessionCookie, verifyPassword } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { toPublicUser } from '@/lib/auth-types'

export async function POST(request: Request) {
  await ensureBootstrapAdmin()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const user = await ServerDataStore.getUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  if (user.status !== 'active') {
    return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 })
  }

  const { token } = await createSession(user.id)
  await ServerDataStore.logAction(user.id, user.name, user.role, 'auth.logged_in', 'user', user.id)

  const response = NextResponse.json({ user: toPublicUser(user) })
  setSessionCookie(response, token)
  return response
}
