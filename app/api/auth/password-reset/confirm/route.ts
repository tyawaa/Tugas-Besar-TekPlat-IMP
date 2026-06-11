import { NextResponse } from 'next/server'
import { ensureBootstrapAdmin, hashPassword, normalizeEmail, verifySecurityCode } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { consumeRateLimit, PASSWORD_RESET_CONFIRM_RATE_LIMIT } from '@/lib/rate-limit'

export async function POST(request: Request) {
  await ensureBootstrapAdmin()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !code || !password) {
    return NextResponse.json({ error: 'Email, code, and new password are required.' }, { status: 400 })
  }

  const rateLimitResponse = consumeRateLimit(request, PASSWORD_RESET_CONFIRM_RATE_LIMIT, [{ name: 'email', value: email }])
  if (rateLimitResponse) return rateLimitResponse

  if (password.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 })
  }

  const user = await ServerDataStore.getUserByEmail(email)
  if (
    !user ||
    !verifySecurityCode(code, user.passwordResetCodeHash, user.passwordResetCodeExpiresAt)
  ) {
    return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 401 })
  }

  await ServerDataStore.updateUser(user.id, {
    passwordHash: hashPassword(password),
    passwordResetCodeHash: undefined,
    passwordResetCodeExpiresAt: undefined,
  })

  await ServerDataStore.logAction(user.id, user.name, user.role, 'auth.password_reset', 'user', user.id)
  return NextResponse.json({ success: true })
}
