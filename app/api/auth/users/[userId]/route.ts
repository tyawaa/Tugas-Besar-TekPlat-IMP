import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { USER_ROLES, hasUserRole, normalizeUserRoles, toPublicUser } from '@/lib/auth-types'
import { UserRole } from '@/lib/mock-data'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const { userId } = await params
  const body = await request.json().catch(() => ({}))
  const action = body.action

  if (action !== 'suspend' && action !== 'reinstate' && action !== 'setRoles') {
    return NextResponse.json({ error: 'Unsupported user action.' }, { status: 400 })
  }

  const targetUser = await ServerDataStore.getUserById(userId)
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  if (action === 'setRoles') {
    const roles = Array.isArray(body.roles) ? (body.roles as unknown[]) : []
    const hasInvalidRole = roles.some((role) => !USER_ROLES.includes(role as UserRole))
    const requestedRoles: UserRole[] = Array.from(new Set(roles as UserRole[]))

    if (requestedRoles.length === 0 || hasInvalidRole) {
      return NextResponse.json({ error: 'At least one valid role is required.' }, { status: 400 })
    }

    const currentRoles = normalizeUserRoles(targetUser.role, targetUser.roles)
    const removesAdminRole = currentRoles.includes('admin') && !requestedRoles.includes('admin')

    if (targetUser.id === currentUser.id && removesAdminRole) {
      return NextResponse.json({ error: 'You cannot remove your own admin role.' }, { status: 400 })
    }

    if (removesAdminRole) {
      const users = await ServerDataStore.getAllUsers()
      const otherActiveAdmins = users.filter(
        (user) => user.id !== targetUser.id && hasUserRole(user, 'admin') && user.status === 'active'
      )

      if (otherActiveAdmins.length === 0) {
        return NextResponse.json({ error: 'At least one active admin account is required.' }, { status: 400 })
      }
    }

    const primaryRole = requestedRoles.includes(targetUser.role) ? targetUser.role : requestedRoles[0]
    const updatedUser = await ServerDataStore.updateUser(userId, { role: primaryRole, roles: requestedRoles })

    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update user roles.' }, { status: 500 })
    }

    await ServerDataStore.logAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'user.roles_updated',
      'user',
      updatedUser.id,
      'success',
      `${updatedUser.email} roles set to ${requestedRoles.join(', ')}`
    )

    return NextResponse.json(toPublicUser(updatedUser))
  }

  if (action === 'suspend') {
    if (targetUser.id === currentUser.id) {
      return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 })
    }

    if (hasUserRole(targetUser, 'admin')) {
      const users = await ServerDataStore.getAllUsers()
      const otherActiveAdmins = users.filter(
        (user) => user.id !== targetUser.id && hasUserRole(user, 'admin') && user.status === 'active'
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
