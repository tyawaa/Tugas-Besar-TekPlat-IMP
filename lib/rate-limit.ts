import { NextResponse } from 'next/server'

export interface RateLimitRule {
  name: string
  limit: number
  windowMs: number
}

export interface RateLimitIdentity {
  name: string
  value: string
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

interface RateLimitOutcome {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

declare global {
  // eslint-disable-next-line no-var
  var iotbridgeRateLimitBuckets: Map<string, RateLimitBucket> | undefined
}

export const AUTH_LOGIN_RATE_LIMIT: RateLimitRule = { name: 'auth.login', limit: 5, windowMs: 15 * 60 * 1000 }
export const AUTH_REGISTER_RATE_LIMIT: RateLimitRule = { name: 'auth.register', limit: 5, windowMs: 60 * 60 * 1000 }
export const PASSWORD_RESET_REQUEST_RATE_LIMIT: RateLimitRule = {
  name: 'auth.password_reset.request',
  limit: 3,
  windowMs: 15 * 60 * 1000,
}
export const PASSWORD_RESET_CONFIRM_RATE_LIMIT: RateLimitRule = {
  name: 'auth.password_reset.confirm',
  limit: 5,
  windowMs: 15 * 60 * 1000,
}
export const TWO_FACTOR_REQUEST_RATE_LIMIT: RateLimitRule = {
  name: 'auth.two_factor.request',
  limit: 5,
  windowMs: 10 * 60 * 1000,
}
export const TWO_FACTOR_CONFIRM_RATE_LIMIT: RateLimitRule = {
  name: 'auth.two_factor.confirm',
  limit: 8,
  windowMs: 10 * 60 * 1000,
}
export const TELEMETRY_INGESTION_RATE_LIMIT: RateLimitRule = {
  name: 'telemetry.ingestion',
  limit: 120,
  windowMs: 60 * 1000,
}
export const ACCESS_REQUEST_RATE_LIMIT: RateLimitRule = {
  name: 'access.request.create',
  limit: 20,
  windowMs: 60 * 60 * 1000,
}
export const ACCESS_REQUEST_ACTION_RATE_LIMIT: RateLimitRule = {
  name: 'access.request.action',
  limit: 60,
  windowMs: 10 * 60 * 1000,
}
export const PAYMENT_TOKEN_RATE_LIMIT: RateLimitRule = {
  name: 'payment.midtrans_token',
  limit: 10,
  windowMs: 10 * 60 * 1000,
}

function getRateLimitStore(): Map<string, RateLimitBucket> {
  if (!globalThis.iotbridgeRateLimitBuckets) {
    globalThis.iotbridgeRateLimitBuckets = new Map<string, RateLimitBucket>()
  }

  return globalThis.iotbridgeRateLimitBuckets
}

function getFirstHeaderValue(value: string | null): string {
  if (!value) return ''
  return value.split(',')[0]?.trim() || ''
}

export function getClientIp(request: Request): string {
  return (
    getFirstHeaderValue(request.headers.get('x-forwarded-for')) ||
    getFirstHeaderValue(request.headers.get('x-real-ip')) ||
    getFirstHeaderValue(request.headers.get('cf-connecting-ip')) ||
    'unknown'
  )
}

function normalizeIdentityValue(value: string): string {
  return value.trim().toLowerCase() || 'unknown'
}

function createRateLimitKey(rule: RateLimitRule, request: Request, identities: RateLimitIdentity[]): string {
  const keyParts = [
    rule.name,
    `ip:${normalizeIdentityValue(getClientIp(request))}`,
    ...identities.map((identity) => `${identity.name}:${normalizeIdentityValue(identity.value)}`),
  ]

  return keyParts.map((part) => encodeURIComponent(part)).join(':')
}

function pruneExpiredBuckets(store: Map<string, RateLimitBucket>, now: number): void {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key)
    }
  }
}

function checkRateLimit(rule: RateLimitRule, key: string): RateLimitOutcome {
  const now = Date.now()
  const store = getRateLimitStore()
  pruneExpiredBuckets(store, now)

  const existingBucket = store.get(key)
  const bucket = existingBucket && existingBucket.resetAt > now
    ? existingBucket
    : { count: 0, resetAt: now + rule.windowMs }

  bucket.count += 1
  store.set(key, bucket)

  const remaining = Math.max(0, rule.limit - bucket.count)
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))

  return {
    allowed: bucket.count <= rule.limit,
    limit: rule.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  }
}

function createRateLimitResponse(outcome: RateLimitOutcome): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(outcome.retryAfterSeconds),
        'X-RateLimit-Limit': String(outcome.limit),
        'X-RateLimit-Remaining': String(outcome.remaining),
        'X-RateLimit-Reset': String(Math.ceil(outcome.resetAt / 1000)),
      },
    }
  )
}

export function consumeRateLimit(
  request: Request,
  rule: RateLimitRule,
  identities: RateLimitIdentity[]
): NextResponse | null {
  // Security-sensitive: this boundary can be replaced with Redis/Upstash without touching route logic.
  const key = createRateLimitKey(rule, request, identities)
  const outcome = checkRateLimit(rule, key)
  return outcome.allowed ? null : createRateLimitResponse(outcome)
}
