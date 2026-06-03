import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import {
  applyMidtransStatusToOrder,
  assertProductionPaymentStorage,
  getMidtransConfig,
  getPaymentStatusFromMidtransResponse,
  MidtransPaymentValidationError,
  ProductionPaymentStorageError,
  validateMidtransPaymentResponse,
} from '@/lib/midtrans-payments'
import { Order } from '@/lib/mock-data'
import { ServerDataStore } from '@/lib/server-data-store'

export const dynamic = 'force-dynamic'

const DEFAULT_PENDING_AGE_MINUTES = 30
const MAX_RECONCILE_LIMIT = 50
const MIDTRANS_STATUS_RETRY_ATTEMPTS = [1, 2]

interface ReconcileResultItem {
  orderId: string
  accessRequestId: string
  midtransOrderId: string
  outcome: 'changed' | 'unchanged' | 'skipped' | 'failed'
  beforePaymentStatus: Order['paymentStatus']
  beforePayoutStatus: Order['payoutStatus']
  afterPaymentStatus: Order['paymentStatus']
  afterPayoutStatus: Order['payoutStatus']
  midtransPaymentStatus?: Order['paymentStatus']
  error?: string
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const bodyText = await request.text()
  if (!bodyText.trim()) return {}

  const parsed = JSON.parse(bodyText) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.')
  }

  return parsed as Record<string, unknown>
}

function getPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function getThresholdMinutes(body: Record<string, unknown>): number {
  const thresholdMinutes = getPositiveInteger(body.thresholdMinutes)
  return thresholdMinutes || DEFAULT_PENDING_AGE_MINUTES
}

function getLimit(body: Record<string, unknown>): number {
  const requestedLimit = getPositiveInteger(body.limit)
  if (!requestedLimit) return MAX_RECONCILE_LIMIT
  return Math.min(requestedLimit, MAX_RECONCILE_LIMIT)
}

function getDryRun(body: Record<string, unknown>): boolean {
  return body.dryRun === true
}

function isOldPendingOrder(order: Order, cutoffTimestamp: number): boolean {
  if (order.paymentStatus !== 'PENDING') return false
  const createdAtTimestamp = new Date(order.createdAt).valueOf()
  if (!Number.isFinite(createdAtTimestamp)) return false
  return createdAtTimestamp <= cutoffTimestamp
}

async function getMidtransStatusWithRetry(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order
): Promise<Record<string, unknown>> {
  let lastError: unknown = null

  for (const attempt of MIDTRANS_STATUS_RETRY_ATTEMPTS) {
    try {
      return await coreApi.transaction.status(order.midtransOrderId)
    } catch (error) {
      lastError = error
      console.warn('midtrans.reconcile_status_failed', {
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        midtransOrderId: order.midtransOrderId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Failed to reconcile Midtrans status for order ${order.id}.`)
}

function getResultOutcome(result: Awaited<ReturnType<typeof applyMidtransStatusToOrder>>): 'changed' | 'unchanged' {
  if (!result) return 'unchanged'
  if (result.orderStatusChanged) return 'changed'
  if (result.accessStatusChanged) return 'changed'
  if (result.refundRequired) return 'changed'
  if (result.latePaidAfterCancellation) return 'changed'
  return 'unchanged'
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Only admins can reconcile Midtrans payments.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Request body must be valid JSON.',
        context: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 400 }
    )
  }

  const thresholdMinutes = getThresholdMinutes(body)
  const limit = getLimit(body)
  const dryRun = getDryRun(body)
  const cutoffTimestamp = Date.now() - thresholdMinutes * 60 * 1000
  const allOrders = await ServerDataStore.getAllOrders()
  const pendingOrders = allOrders
    .filter(order => isOldPendingOrder(order, cutoffTimestamp))
    .sort((first, second) => new Date(first.createdAt).valueOf() - new Date(second.createdAt).valueOf())
    .slice(0, limit)

  const midtransConfig = getMidtransConfig()
  try {
    assertProductionPaymentStorage(midtransConfig)
  } catch (error) {
    if (error instanceof ProductionPaymentStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    throw error
  }

  const coreApi = new midtransClient.CoreApi(midtransConfig)
  const results: ReconcileResultItem[] = []

  for (const order of pendingOrders) {
    try {
      const statusResponse = await getMidtransStatusWithRetry(coreApi, order)
      const midtransPaymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)

      if (!midtransPaymentStatus) {
        console.warn('midtrans.reconcile_order_skipped_unknown_status', {
          orderId: order.id,
          accessRequestId: order.accessRequestId,
          midtransOrderId: order.midtransOrderId,
          transactionStatus: typeof statusResponse.transaction_status === 'string' ? statusResponse.transaction_status : '',
          fraudStatus: typeof statusResponse.fraud_status === 'string' ? statusResponse.fraud_status : '',
        })

        results.push({
          orderId: order.id,
          accessRequestId: order.accessRequestId,
          midtransOrderId: order.midtransOrderId,
          outcome: 'skipped',
          beforePaymentStatus: order.paymentStatus,
          beforePayoutStatus: order.payoutStatus,
          afterPaymentStatus: order.paymentStatus,
          afterPayoutStatus: order.payoutStatus,
        })
        continue
      }

      validateMidtransPaymentResponse(statusResponse, order)

      if (dryRun) {
        console.info('midtrans.reconcile_order_dry_run', {
          orderId: order.id,
          accessRequestId: order.accessRequestId,
          midtransOrderId: order.midtransOrderId,
          beforePaymentStatus: order.paymentStatus,
          midtransPaymentStatus,
        })

        results.push({
          orderId: order.id,
          accessRequestId: order.accessRequestId,
          midtransOrderId: order.midtransOrderId,
          outcome: 'skipped',
          beforePaymentStatus: order.paymentStatus,
          beforePayoutStatus: order.payoutStatus,
          afterPaymentStatus: order.paymentStatus,
          afterPayoutStatus: order.payoutStatus,
          midtransPaymentStatus,
        })
        continue
      }

      const syncResult = await applyMidtransStatusToOrder(statusResponse, {
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        source: 'reconcile',
      })
      const latestOrder = syncResult?.order || order
      const outcome = getResultOutcome(syncResult)

      console.info('midtrans.reconcile_order_checked', {
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        midtransOrderId: order.midtransOrderId,
        outcome,
        beforePaymentStatus: order.paymentStatus,
        beforePayoutStatus: order.payoutStatus,
        afterPaymentStatus: latestOrder.paymentStatus,
        afterPayoutStatus: latestOrder.payoutStatus,
        midtransPaymentStatus,
      })

      results.push({
        orderId: latestOrder.id,
        accessRequestId: latestOrder.accessRequestId,
        midtransOrderId: latestOrder.midtransOrderId,
        outcome,
        beforePaymentStatus: order.paymentStatus,
        beforePayoutStatus: order.payoutStatus,
        afterPaymentStatus: latestOrder.paymentStatus,
        afterPayoutStatus: latestOrder.payoutStatus,
        midtransPaymentStatus,
      })
    } catch (error) {
      const validationContext = error instanceof MidtransPaymentValidationError ? error.context : undefined
      console.error('midtrans.reconcile_order_failed', {
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        midtransOrderId: order.midtransOrderId,
        validationContext,
        error: error instanceof Error ? error.message : String(error),
      })

      results.push({
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        midtransOrderId: order.midtransOrderId,
        outcome: 'failed',
        beforePaymentStatus: order.paymentStatus,
        beforePayoutStatus: order.payoutStatus,
        afterPaymentStatus: order.paymentStatus,
        afterPayoutStatus: order.payoutStatus,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const changed = results.filter(result => result.outcome === 'changed').length
  const skipped = results.filter(result => result.outcome === 'skipped').length
  const failed = results.filter(result => result.outcome === 'failed').length
  const unchanged = results.length - changed - skipped - failed

  console.info('midtrans.reconcile_summary', {
    thresholdMinutes,
    limit,
    dryRun,
    checked: results.length,
    changed,
    unchanged,
    skipped,
    failed,
  })

  return NextResponse.json({
    thresholdMinutes,
    limit,
    dryRun,
    cutoff: new Date(cutoffTimestamp).toISOString(),
    checked: results.length,
    changed,
    unchanged,
    skipped,
    failed,
    results,
  })
}
