import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { ServerDataStore } from '@/lib/server-data-store'
import { PaymentStatus } from '@/lib/mock-data'

export const dynamic = 'force-dynamic'

function getMidtransConfig() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY

  if (!serverKey || !clientKey) {
    throw new Error('Midtrans keys are not configured.')
  }

  return {
    isProduction: false,
    serverKey,
    clientKey,
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function mapPaymentStatus(transactionStatus: string, fraudStatus: string): PaymentStatus | null {
  if (transactionStatus === 'settlement') return 'PAID'
  if (transactionStatus === 'capture') return fraudStatus === 'accept' ? 'PAID' : 'PENDING'
  if (transactionStatus === 'pending') return 'PENDING'
  if (transactionStatus === 'expire') return 'EXPIRED'
  if (transactionStatus === 'cancel' || transactionStatus === 'deny') return 'FAILED'
  return null
}

async function markRequestReadyForOwnerApproval(orderId: string) {
  const order = await ServerDataStore.getOrderById(orderId)
  if (!order) return null

  const accessRequest = await ServerDataStore.getAccessRequestById(order.accessRequestId)
  if (!accessRequest) return null

  if (accessRequest.status !== 'pending_payment') {
    return { request: accessRequest }
  }

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { status: 'pending' })
  return { request: updatedRequest }
}

export async function POST(request: Request) {
  let notification: Record<string, unknown>
  try {
    notification = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const coreApi = new midtransClient.CoreApi(getMidtransConfig())
  const statusResponse = await coreApi.transaction.notification(notification).catch(() => notification)

  const midtransOrderId = asString(statusResponse.order_id)
  const transactionStatus = asString(statusResponse.transaction_status)
  const fraudStatus = asString(statusResponse.fraud_status)
  const paymentType = asString(statusResponse.payment_type)
  const paymentStatus = mapPaymentStatus(transactionStatus, fraudStatus)

  if (!midtransOrderId || !paymentStatus) {
    return NextResponse.json({ error: 'Unsupported Midtrans notification.' }, { status: 400 })
  }

  const order = await ServerDataStore.getOrderByMidtransOrderId(midtransOrderId)
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  const updatedOrder = await ServerDataStore.updateOrder(order.id, {
    paymentStatus,
    paymentMethod: paymentType || order.paymentMethod,
    updatedAt: new Date().toISOString(),
  })

  if (!updatedOrder) {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 })
  }

  let accessResult = null
  if (paymentStatus === 'PAID') {
    accessResult = await markRequestReadyForOwnerApproval(updatedOrder.id)
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.paid',
      'access_request',
      updatedOrder.accessRequestId,
      'success',
      `Order ${updatedOrder.midtransOrderId} paid; waiting for owner approval`
    )
  } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
    await ServerDataStore.updateAccessRequest(updatedOrder.accessRequestId, {
      status: 'cancelled',
    })
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      paymentStatus === 'EXPIRED' ? 'payment.expired' : 'payment.failed',
      'access_request',
      updatedOrder.accessRequestId,
      'success',
      `Order ${updatedOrder.midtransOrderId} ${paymentStatus.toLowerCase()}`
    )
  }

  return NextResponse.json({
    success: true,
    order: updatedOrder,
    access: accessResult,
  })
}
