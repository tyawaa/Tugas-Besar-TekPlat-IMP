import { NextResponse } from 'next/server'
import { normalizeEmail, requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { toPublicUser } from '@/lib/auth-types'

export async function PATCH(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  }

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Email must be valid.' }, { status: 400 })
  }

  const existingUser = await ServerDataStore.getUserByEmail(email)
  if (existingUser && existingUser.id !== currentUser.id) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
  }

  const updatedUser = await ServerDataStore.updateUser(currentUser.id, { name, email })
  if (!updatedUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  await ServerDataStore.logAction(
    currentUser.id,
    name,
    currentUser.role,
    'auth.profile_updated',
    'user',
    currentUser.id
  )

  return NextResponse.json({ user: toPublicUser(updatedUser) })
}
