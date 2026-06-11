import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { AccessGrant, Device } from './mock-data'

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i

interface DeviceSecretNormalizationResult {
  device: Device
  migrated: boolean
}

interface AccessGrantSecretNormalizationResult {
  grant: AccessGrant
  migrated: boolean
}

export function hashSecret(secret: string): string {
  if (!secret) {
    throw new Error('Cannot hash an empty secret.')
  }

  return createHash('sha256').update(secret).digest('hex')
}

export function isSecretHash(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value)
}

export function ensureSecretHash(secretOrHash: string): string {
  if (!secretOrHash) {
    throw new Error('Missing secret value to hash.')
  }

  return isSecretHash(secretOrHash) ? secretOrHash.toLowerCase() : hashSecret(secretOrHash)
}

export function verifySecret(secret: string, storedHash: string): boolean {
  if (!secret || !storedHash) return false

  const candidate = Buffer.from(hashSecret(secret), 'hex')
  const expected = Buffer.from(ensureSecretHash(storedHash), 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

export function createSecureId(prefix: string): string {
  if (!prefix) {
    throw new Error('Secure id prefix is required.')
  }

  return `${prefix}_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
}

export function createDeviceApiKey(): string {
  return `iot_key_${randomBytes(32).toString('base64url')}`
}

export function createAccessGrantToken(): string {
  return `grant_tok_${randomBytes(32).toString('base64url')}`
}

export function normalizeStoredDeviceSecret(device: Device): DeviceSecretNormalizationResult {
  const currentHash = typeof device.apiKeyHash === 'string' ? device.apiKeyHash : ''
  const legacyPlaintext = typeof device.apiKey === 'string' ? device.apiKey : ''
  const sourceSecret = currentHash || legacyPlaintext
  if (!sourceSecret) {
    throw new Error(`Device ${device.id} is missing an API key hash.`)
  }

  const apiKeyHash = ensureSecretHash(sourceSecret)
  const { apiKey, ...deviceWithoutPlaintext } = device

  return {
    device: {
      ...deviceWithoutPlaintext,
      apiKeyHash,
    },
    migrated: apiKeyHash !== currentHash || Boolean(apiKey),
  }
}

export function normalizeStoredAccessGrantSecret(grant: AccessGrant): AccessGrantSecretNormalizationResult {
  const currentHash = typeof grant.tokenHash === 'string' ? grant.tokenHash : ''
  const legacyPlaintext = typeof grant.token === 'string' ? grant.token : ''
  const sourceSecret = currentHash || legacyPlaintext
  if (!sourceSecret) {
    throw new Error(`Access grant ${grant.id} is missing a token hash.`)
  }

  const tokenHash = ensureSecretHash(sourceSecret)
  const { token, ...grantWithoutPlaintext } = grant

  return {
    grant: {
      ...grantWithoutPlaintext,
      tokenHash,
    },
    migrated: tokenHash !== currentHash || Boolean(token),
  }
}

export function toDeviceResponse(device: Device, oneTimeApiKey: string | null): Device {
  const { apiKeyHash, apiKey, ...safeDevice } = device

  // Security-sensitive: only include plaintext API keys in one-time responses.
  if (oneTimeApiKey) {
    return { ...safeDevice, apiKey: oneTimeApiKey }
  }

  return safeDevice
}

export function toAccessGrantResponse(grant: AccessGrant, oneTimeToken: string | null): AccessGrant {
  const { tokenHash, token, ...safeGrant } = grant

  // Security-sensitive: grant bearer tokens are shown once, never listed later.
  if (oneTimeToken) {
    return { ...safeGrant, token: oneTimeToken }
  }

  return safeGrant
}
