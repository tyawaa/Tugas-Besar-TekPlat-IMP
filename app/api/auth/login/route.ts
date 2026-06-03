import { NextResponse } from 'next/server'
import {
  createSecurityCode,
  createSession,
  ensureBootstrapAdmin,
  getSecurityCodeExpiresAt,
  hashSecurityCode,
  normalizeEmail,
  sendSecurityEmail,
  setSessionCookie,
  verifyPassword,
  verifySecurityCode,
} from '@/lib/auth-server'
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
  const twoFactorCode = typeof body.twoFactorCode === 'string' ? body.twoFactorCode.trim() : ''

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

  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      const code = createSecurityCode()
      const delivery = await sendSecurityEmail({
        to: user.email,
        subject: 'Your IoTBridge sign-in code',
        message: 'Use this code to finish signing in to IoTBridge.',
        code,
      })

      await ServerDataStore.updateUser(user.id, {
        twoFactorCodeHash: hashSecurityCode(code),
        twoFactorCodeExpiresAt: getSecurityCodeExpiresAt(),
      })

      return NextResponse.json({
        requiresTwoFactor: true,
        message: delivery === 'sent' ? 'Verification code sent to your email.' : 'Development verification code generated.',
        devCode: delivery === 'dev' ? code : undefined,
      })
    }

    if (!verifySecurityCode(twoFactorCode, user.twoFactorCodeHash, user.twoFactorCodeExpiresAt)) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 401 })
    }

    await ServerDataStore.updateUser(user.id, {
      twoFactorCodeHash: undefined,
      twoFactorCodeExpiresAt: undefined,
    })
  }

  const { token } = await createSession(user.id)
  await ServerDataStore.logAction(user.id, user.name, user.role, 'auth.logged_in', 'user', user.id)

  const response = NextResponse.json({ user: toPublicUser(user) })
  setSessionCookie(response, token)
  return response
}
