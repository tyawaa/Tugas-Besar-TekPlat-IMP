import { NextResponse } from 'next/server'
import {
  createSecurityCode,
  ensureBootstrapAdmin,
  getSecurityCodeExpiresAt,
  hashSecurityCode,
  normalizeEmail,
  sendSecurityEmail,
} from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function POST(request: Request) {
  await ensureBootstrapAdmin()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const user = await ServerDataStore.getUserByEmail(email)
  if (!user || user.status !== 'active') {
    return NextResponse.json({ message: 'If the account exists, a reset code has been sent.' })
  }

  const code = createSecurityCode()
  const delivery = await sendSecurityEmail({
    to: user.email,
    subject: 'Your IoTBridge password reset code',
    message: 'Use this code to reset your IoTBridge password.',
    code,
  })

  await ServerDataStore.updateUser(user.id, {
    passwordResetCodeHash: hashSecurityCode(code),
    passwordResetCodeExpiresAt: getSecurityCodeExpiresAt(),
  })

  return NextResponse.json({
    message: delivery === 'sent' ? 'Reset code sent to your email.' : 'Development reset code generated.',
    devCode: delivery === 'dev' ? code : undefined,
  })
}
