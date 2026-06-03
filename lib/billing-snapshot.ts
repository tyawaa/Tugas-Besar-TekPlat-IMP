import { BillingSnapshot, Device } from './mock-data'

interface CreateBillingSnapshotInput {
  device: Device
  developerId: string
  createdAt: string
}

function normalizeMoneyAmount(value: unknown): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount)
}

function normalizeCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return currency || 'IDR'
}

function getStringField(value: Record<string, unknown>, fieldName: string): string {
  const fieldValue = value[fieldName]
  return typeof fieldValue === 'string' ? fieldValue.trim() : ''
}

export function createBillingSnapshot(input: CreateBillingSnapshotInput): BillingSnapshot {
  return {
    quotedAmount: normalizeMoneyAmount(input.device.accessPrice),
    currency: normalizeCurrency(input.device.currency),
    deviceId: input.device.id,
    deviceName: input.device.name,
    ownerId: input.device.ownerId,
    developerId: input.developerId,
    createdAt: input.createdAt,
  }
}

export function normalizeBillingSnapshot(value: unknown): BillingSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const snapshot = value as Record<string, unknown>
  const quotedAmount = normalizeMoneyAmount(snapshot.quotedAmount)
  const currency = normalizeCurrency(snapshot.currency)
  const deviceId = getStringField(snapshot, 'deviceId')
  const deviceName = getStringField(snapshot, 'deviceName')
  const ownerId = getStringField(snapshot, 'ownerId')
  const developerId = getStringField(snapshot, 'developerId')
  const createdAt = getStringField(snapshot, 'createdAt')

  if (!quotedAmount || !deviceId || !deviceName || !ownerId || !developerId || !createdAt) {
    return undefined
  }

  return {
    quotedAmount,
    currency,
    deviceId,
    deviceName,
    ownerId,
    developerId,
    createdAt,
  }
}
