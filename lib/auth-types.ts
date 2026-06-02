import { UserRole } from './mock-data'

export interface StoredUser {
  id: string
  name: string
  email: string
  role: UserRole
  roles: UserRole[]
  passwordHash: string
  createdAt: string
  status: 'active' | 'suspended'
}

export interface PublicUser {
  id: string
  name: string
  email: string
  role: UserRole
  roles: UserRole[]
  createdAt: string
  status: 'active' | 'suspended'
}

export interface AuthSession {
  id: string
  userId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
}

export const USER_ROLES: UserRole[] = ['device_owner', 'developer', 'admin']

export function normalizeUserRoles(primaryRole: UserRole, roles?: unknown): UserRole[] {
  const values = Array.isArray(roles) ? roles : [primaryRole]
  const normalized = values.filter((role): role is UserRole => USER_ROLES.includes(role as UserRole))

  if (!normalized.includes(primaryRole)) {
    normalized.unshift(primaryRole)
  }

  return Array.from(new Set(normalized))
}

export function normalizeStoredUser(user: StoredUser): StoredUser {
  return {
    ...user,
    roles: normalizeUserRoles(user.role, user.roles),
  }
}

export function hasUserRole(user: Pick<PublicUser, 'role' | 'roles'>, role: UserRole): boolean {
  return normalizeUserRoles(user.role, user.roles).includes(role)
}

export function toPublicUser(user: StoredUser): PublicUser {
  const roles = normalizeUserRoles(user.role, user.roles)

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roles,
    createdAt: user.createdAt,
    status: user.status,
  }
}
