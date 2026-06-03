import { NextResponse } from 'next/server'
import {
  createSecurityCode,
  getSecurityCodeExpiresAt,
  hashSecurityCode,
  requireCurrentUser,
  sendSecurityEmail,
  verifySecurityCode,
} from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { toPublicUser } from '@/lib/auth-types'

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const code = createSecurityCode()
  const delivery = await sendSecurityEmail({
    to: currentUser.email,
    subject: 'Your IoTBridge two-factor code',
    message: 'Use this code to confirm two-factor authentication changes.',
    code,
  })

  await ServerDataStore.updateUser(currentUser.id, {
    twoFactorCodeHash: hashSecurityCode(code),
    twoFactorCodeExpiresAt: getSecurityCodeExpiresAt(),
  })

  return NextResponse.json({
    message: delivery === 'sent' ? 'Verification code sent to your email.' : 'Development verification code generated.',
    devCode: delivery === 'dev' ? code : undefined,
  })
}

export async function PATCH(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const enabled = Boolean(body.enabled)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const user = await ServerDataStore.getUserById(currentUser.id)

  if (!user || !verifySecurityCode(code, user.twoFactorCodeHash, user.twoFactorCodeExpiresAt)) {
    return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 401 })
  }

  const updatedUser = await ServerDataStore.updateUser(currentUser.id, {
    twoFactorEnabled: enabled,
    twoFactorCodeHash: undefined,
    twoFactorCodeExpiresAt: undefined,
  })

  if (!updatedUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  await ServerDataStore.logAction(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    enabled ? 'auth.two_factor_enabled' : 'auth.two_factor_disabled',
    'user',
    currentUser.id
  )

  return NextResponse.json({ user: toPublicUser(updatedUser) })
}
