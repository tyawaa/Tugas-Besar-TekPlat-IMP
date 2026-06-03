import { AccessRequest, Order, PaymentStatus } from './mock-data'
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
  return typeof value === 'string' ? value : ''
}

export function getMidtransOrderId(statusResponse: Record<string, unknown>): string {
  return asString(statusResponse.order_id)
}

export function mapPaymentStatus(transactionStatus: string, fraudStatus: string): PaymentStatus | null {
  if (transactionStatus === 'settlement') return 'PAID'
  if (transactionStatus === 'capture') return fraudStatus === 'accept' ? 'PAID' : 'PENDING'
  if (transactionStatus === 'pending') return 'PENDING'
  if (transactionStatus === 'expire') return 'EXPIRED'
  if (transactionStatus === 'cancel' || transactionStatus === 'deny') return 'FAILED'
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

  if (accessRequest.status !== 'pending_payment') {
    return { request: accessRequest }
  }

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { status: 'pending' })
  return { request: updatedRequest }
}

async function cancelRequestWaitingForPayment(order: Order): Promise<PaymentAccessSyncResult> {
  const accessRequest = await ServerDataStore.getAccessRequestById(order.accessRequestId)
  if (!accessRequest) return { request: null }

  if (accessRequest.status !== 'pending_payment') {
    return { request: accessRequest }
  }

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { status: 'cancelled' })
  return { request: updatedRequest }
}

export async function applyMidtransStatusToOrder(
  statusResponse: Record<string, unknown>
): Promise<PaymentOrderSyncResult | null> {
  const midtransOrderId = getMidtransOrderId(statusResponse)
  const paymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)

  if (!midtransOrderId || !paymentStatus) return null

  const order = await ServerDataStore.getOrderByMidtransOrderId(midtransOrderId)
  if (!order) return null

  const paymentType = asString(statusResponse.payment_type)
  const updatedOrder = await ServerDataStore.updateOrder(order.id, {
    paymentStatus,
    payoutStatus: paymentStatus === 'PAID' ? 'NOT_ELIGIBLE' : order.payoutStatus,
    paymentMethod: paymentType || order.paymentMethod,
    updatedAt: new Date().toISOString(),
  })

  if (!updatedOrder) {
    throw new Error(`Failed to update order ${order.id} for Midtrans order ${midtransOrderId}.`)
  }

  if (paymentStatus === 'PAID') {
    return {
      order: updatedOrder,
      access: await markRequestReadyForOwnerApproval(updatedOrder),
    }
  }

  if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
    return {
      order: updatedOrder,
      access: await cancelRequestWaitingForPayment(updatedOrder),
    }
  }

  return {
    order: updatedOrder,
    access: null,
  }
}
