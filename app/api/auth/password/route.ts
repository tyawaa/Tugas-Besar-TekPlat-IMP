import { NextResponse } from 'next/server'
import { hashPassword, requireCurrentUser, verifyPassword } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function PATCH(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current password and new password are required.' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 })
  }

  const user = await ServerDataStore.getUserById(currentUser.id)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
  }

  await ServerDataStore.updateUser(currentUser.id, { passwordHash: hashPassword(newPassword) })
  await ServerDataStore.logAction(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    'auth.password_changed',
    'user',
    currentUser.id
  )

  return NextResponse.json({ success: true })
}
