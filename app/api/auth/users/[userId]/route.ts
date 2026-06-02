import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { toPublicUser } from '@/lib/auth-types'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const { userId } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action

  if (action !== 'suspend' && action !== 'reinstate') {
    return NextResponse.json({ error: 'Unsupported user action.' }, { status: 400 })
  }

  const targetUser = await ServerDataStore.getUserById(userId)
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  if (action === 'suspend') {
    if (targetUser.id === currentUser.id) {
      return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 })
    }

    if (targetUser.role === 'admin') {
      const users = await ServerDataStore.getAllUsers()
      const otherActiveAdmins = users.filter(
        (user) => user.id !== targetUser.id && user.role === 'admin' && user.status === 'active'
      )

      if (otherActiveAdmins.length === 0) {
        return NextResponse.json({ error: 'At least one active admin account is required.' }, { status: 400 })
      }
    }
  }

  const nextStatus = action === 'suspend' ? 'suspended' : 'active'
  const updatedUser = await ServerDataStore.updateUser(userId, { status: nextStatus })

  if (!updatedUser) {
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 })
  }

  await ServerDataStore.logAction(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    action === 'suspend' ? 'user.suspended' : 'user.reinstated',
    'user',
    updatedUser.id,
    'success',
    `${updatedUser.email} set to ${updatedUser.status}`
  )

  return NextResponse.json(toPublicUser(updatedUser))
}
