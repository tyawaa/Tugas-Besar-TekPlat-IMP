import { UserRole } from './mock-data'

export interface StoredUser {
  id: string
  name: string
  email: string
  role: UserRole
  passwordHash: string
  createdAt: string
  status: 'active' | 'suspended'
}

export interface PublicUser {
  id: string
  name: string
  email: string
  role: UserRole
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

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    status: user.status,
  }
}
