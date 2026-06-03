import { AccessRequest, Order, PaymentStatus } from './mock-data'
import {
  canMarkRefundRequired,
  canTransitionAccessRequestStatus,
  canTransitionOrderStatus,
  getPayoutStatusAfterPaymentSync,
  isUnpaidTerminalPaymentStatus,
  markPaymentCancelled,
  markPaymentDenied,
  markPaymentExpired,
  markPaymentFailed,
  markPaymentPaid,
  markRefundRequired,
} from './payment-state'
import { ServerDataStore } from './server-data-store'

interface MidtransConfig {
  isProduction: boolean
  serverKey: string
  clientKey: string
}

export interface PaymentAccessSyncResult {
  request: AccessRequest | null
}

export interface PaymentOrderSyncResult {
  order: Order
  access: PaymentAccessSyncResult | null
}

export class MidtransPaymentValidationError extends Error {
  context: Record<string, unknown>

  constructor(message: string, context: Record<string, unknown>) {
    super(message)
    this.name = 'MidtransPaymentValidationError'
    this.context = context
  }
}

function getMidtransIsProduction(): boolean {
  const rawValue = process.env.MIDTRANS_IS_PRODUCTION
  if (!rawValue) return false
  if (rawValue === 'true') return true
  if (rawValue === 'false') return false

  throw new Error('MIDTRANS_IS_PRODUCTION must be either "true" or "false".')
}

export function getMidtransConfig(): MidtransConfig {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY

  if (!serverKey || !clientKey) {
    throw new Error('Midtrans keys are not configured.')
  }

  return {
    isProduction: getMidtransIsProduction(),
    serverKey,
    clientKey,
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getMidtransOrderId(statusResponse: Record<string, unknown>): string {
  return asString(statusResponse.order_id)
}

export function mapPaymentStatus(transactionStatus: string, fraudStatus: string): PaymentStatus | null {
  if (transactionStatus === 'settlement') return 'PAID'
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'accept') return 'PAID'
    if (fraudStatus === 'deny') return 'DENIED'
    return 'PENDING'
  }
  if (transactionStatus === 'pending') return 'PENDING'
  if (transactionStatus === 'expire') return 'EXPIRED'
  if (transactionStatus === 'cancel') return 'CANCELLED'
  if (transactionStatus === 'deny') return 'DENIED'
  if (transactionStatus === 'failure') return 'FAILED'
  if (transactionStatus === 'refund') return 'REFUNDED'
  if (transactionStatus === 'partial_refund') return 'PARTIAL_REFUND'
  if (transactionStatus === 'chargeback') return 'CHARGEBACK'
  if (transactionStatus === 'partial_chargeback') return 'PARTIAL_CHARGEBACK'
  return null
}

export function getPaymentStatusFromMidtransResponse(statusResponse: Record<string, unknown>): PaymentStatus | null {
  return mapPaymentStatus(
    asString(statusResponse.transaction_status),
    asString(statusResponse.fraud_status)
  )
}

async function markRequestReadyForOwnerApproval(order: Order): Promise<PaymentAccessSyncResult> {
  const accessRequest = await ServerDataStore.getAccessRequestById(order.accessRequestId)
  if (!accessRequest) return { request: null }

  if (!canTransitionAccessRequestStatus(accessRequest.status, 'pending')) {
    return { request: accessRequest }
  }

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { status: 'pending' })
  return { request: updatedRequest }
}

function getMidtransGrossAmount(value: unknown): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount)
}

function getPaymentUpdate(
  order: Order,
  paymentStatus: PaymentStatus,
  paymentMethod: string,
  updatedAt: string
): Partial<Order> {
  const payoutStatus = getPayoutStatusAfterPaymentSync(order.payoutStatus, paymentStatus)

  if (paymentStatus === 'PAID') {
    return {
      ...markPaymentPaid(order, paymentMethod, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'EXPIRED') {
    return {
      ...markPaymentExpired(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'CANCELLED') {
    return {
      ...markPaymentCancelled(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'DENIED') {
    return {
      ...markPaymentDenied(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'FAILED') {
    return {
      ...markPaymentFailed(order, updatedAt),
      payoutStatus,
    }
  }

  return {
    paymentStatus,
    paymentMethod: paymentMethod || order.paymentMethod,
    payoutStatus,
    updatedAt,
  }
}

function validateMidtransPaymentResponse(statusResponse: Record<string, unknown>, order: Order): void {
  const midtransOrderId = getMidtransOrderId(statusResponse)
  const grossAmount = getMidtransGrossAmount(statusResponse.gross_amount)
  const currency = asString(statusResponse.currency).toUpperCase()

  if (midtransOrderId !== order.midtransOrderId) {
    throw new MidtransPaymentValidationError('Midtrans order_id does not match the local order.', {
      orderId: order.id,
      localMidtransOrderId: order.midtransOrderId,
      responseMidtransOrderId: midtransOrderId,
    })
  }

  if (grossAmount === null || grossAmount !== order.totalAmount) {
    throw new MidtransPaymentValidationError('Midtrans gross_amount does not match the local order amount.', {
      orderId: order.id,
      midtransOrderId,
      expectedAmount: order.totalAmount,
      grossAmount: statusResponse.gross_amount,
    })
  }

  if (currency && currency !== order.currency.toUpperCase()) {
    throw new MidtransPaymentValidationError('Midtrans currency does not match the local order currency.', {
      orderId: order.id,
      midtransOrderId,
      expectedCurrency: order.currency,
      currency,
    })
  }
}

async function markPaidCancelledOrRejectedRequestAsRefundRequired(order: Order): Promise<Order> {
  const accessRequest = await ServerDataStore.getAccessRequestById(order.accessRequestId)
  if (!accessRequest || (accessRequest.status !== 'cancelled' && accessRequest.status !== 'rejected')) {
    return order
  }

  if (!canMarkRefundRequired(order)) return order

  const updatedOrder = await ServerDataStore.updateOrder(order.id, markRefundRequired(order, new Date().toISOString()))
  if (!updatedOrder) {
    throw new Error(`Failed to mark refund required for order ${order.id}.`)
  }

  return updatedOrder
}

export async function applyMidtransStatusToOrder(
  statusResponse: Record<string, unknown>
): Promise<PaymentOrderSyncResult | null> {
  const midtransOrderId = getMidtransOrderId(statusResponse)
  const paymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)
  const transactionStatus = asString(statusResponse.transaction_status)
  const fraudStatus = asString(statusResponse.fraud_status)

  console.info('midtrans.status_received', {
    midtransOrderId,
    transactionStatus,
    fraudStatus,
  })

  if (!midtransOrderId) return null

  if (!paymentStatus) {
    console.warn('midtrans.status_ignored_unknown', {
      midtransOrderId,
      transactionStatus,
      fraudStatus,
    })
    return null
  }

  const order = await ServerDataStore.getOrderByMidtransOrderId(midtransOrderId)
  console.info('midtrans.local_order_lookup', {
    midtransOrderId,
    found: Boolean(order),
    orderId: order?.id,
  })

  if (!order) return null

  validateMidtransPaymentResponse(statusResponse, order)

  if (order.paymentStatus === paymentStatus) {
    console.info('midtrans.status_duplicate', {
      orderId: order.id,
      midtransOrderId,
      paymentStatus,
    })
  }

  if (!canTransitionOrderStatus(order.paymentStatus, paymentStatus)) {
    console.warn('midtrans.status_transition_ignored', {
      orderId: order.id,
      midtransOrderId,
      currentPaymentStatus: order.paymentStatus,
      nextPaymentStatus: paymentStatus,
    })
    return {
      order,
      access: null,
    }
  }

  const paymentType = asString(statusResponse.payment_type)
  const updatedOrder = await ServerDataStore.updateOrder(
    order.id,
    getPaymentUpdate(order, paymentStatus, paymentType, new Date().toISOString())
  )

  if (!updatedOrder) {
    throw new Error(`Failed to update order ${order.id} for Midtrans order ${midtransOrderId}.`)
  }

  if (paymentStatus === 'PAID') {
    const reconciledOrder = await markPaidCancelledOrRejectedRequestAsRefundRequired(updatedOrder)
    return {
      order: reconciledOrder,
      access: await markRequestReadyForOwnerApproval(reconciledOrder),
    }
  }

  if (isUnpaidTerminalPaymentStatus(paymentStatus)) {
    return {
      order: updatedOrder,
      access: null,
    }
  }

  return {
    order: updatedOrder,
    access: null,
  }
}
