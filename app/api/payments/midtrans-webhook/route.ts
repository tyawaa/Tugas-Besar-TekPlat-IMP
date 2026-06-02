import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { ServerDataStore } from '@/lib/server-data-store'
import { AccessGrant, PaymentStatus } from '@/lib/mock-data'

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

async function ensurePaidAccessGrant(orderId: string) {
  const order = await ServerDataStore.getOrderById(orderId)
  if (!order) return null

  const accessRequest = await ServerDataStore.getAccessRequestById(order.accessRequestId)
  if (!accessRequest) return null

  const grants = await ServerDataStore.getAllAccessGrants()
  const existingGrant = grants.find(
    (grant) => grant.deviceId === accessRequest.deviceId && grant.developerId === accessRequest.developerId
  )

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { status: 'approved' })

  if (existingGrant) {
    return { request: updatedRequest, grant: existingGrant }
  }

  const grant: AccessGrant = {
    id: `ag_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    deviceId: accessRequest.deviceId,
    developerId: accessRequest.developerId,
    developerName: accessRequest.developerName,
    scopes: accessRequest.scopes,
    token: `token_${Math.random().toString(36).substring(2, 32).toUpperCase()}`,
    expiresAt: accessRequest.requestedUntil,
    createdAt: new Date().toISOString(),
  }

  const savedGrant = await ServerDataStore.addAccessGrant(grant)
  return { request: updatedRequest, grant: savedGrant }
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

  let grantResult = null
  if (paymentStatus === 'PAID') {
    grantResult = await ensurePaidAccessGrant(updatedOrder.id)
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.paid',
      'access_request',
      updatedOrder.accessRequestId,
      'success',
      `Order ${updatedOrder.midtransOrderId} paid`
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
    access: grantResult,
  })
}
