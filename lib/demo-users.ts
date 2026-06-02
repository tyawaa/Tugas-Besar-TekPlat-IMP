import { scryptSync } from 'crypto'
import { StoredUser } from './auth-types'
import { users as mockUsers } from './mock-data'

const DEMO_USER_PASSWORD = process.env.IOTBRIDGE_DEMO_USER_PASSWORD || 'Demo12345!'
const SHOULD_SEED_DEMO_USERS = process.env.IOTBRIDGE_SEED_DEMO_USERS !== 'false'

function createDemoPasswordHash(email: string): string {
  const salt = `iotbridge-demo-${email.toLowerCase()}`
  const hash = scryptSync(DEMO_USER_PASSWORD, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function shouldSeedDemoUsers(): boolean {
  return SHOULD_SEED_DEMO_USERS
}

export function createInitialDemoUsers(): StoredUser[] {
  if (!SHOULD_SEED_DEMO_USERS) return []

  return mockUsers.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email.toLowerCase(),
    role: user.role,
    passwordHash: createDemoPasswordHash(user.email),
    createdAt: new Date(user.createdAt).toISOString(),
    status: user.status,
  }))
}
