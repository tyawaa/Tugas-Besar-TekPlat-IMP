import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { hasUserRole } from '@/lib/auth-types'
import { Order } from '@/lib/mock-data'
import { getMidtransConfig } from '@/lib/midtrans-payments'

export const dynamic = 'force-dynamic'

function getOrderTotal(value: unknown): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount)
}

function getSnapRedirectUrl(token: string) {
  return `https://app.sandbox.midtrans.com/snap/v2/vtweb/${token}`
}

function createMidtransOrderId(accessRequestId: string): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8)
  return `iotbridge-${accessRequestId}-${Date.now()}-${randomSuffix}`
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'developer')) {
    return NextResponse.json({ error: 'Only developers can pay for device access.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  const totalAmount = getOrderTotal(body.totalAmount)
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : currentUser.name
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : currentUser.email

  if (!orderId || !totalAmount || !customerName || !customerEmail) {
    return NextResponse.json({ error: 'orderId, totalAmount, customerName, and customerEmail are required.' }, { status: 400 })
  }

  const accessRequest = await ServerDataStore.getAccessRequestById(orderId)
  if (!accessRequest) {
    return NextResponse.json({ error: 'Access request not found for this orderId.' }, { status: 404 })
  }

  if (accessRequest.developerId !== currentUser.id) {
    return NextResponse.json({ error: 'You can only pay for your own access request.' }, { status: 403 })
  }

  if (accessRequest.status !== 'pending_payment') {
    return NextResponse.json({ error: 'This access request is not waiting for payment.' }, { status: 400 })
  }

  const device = await ServerDataStore.getDeviceById(accessRequest.deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 })
  }

  const expectedAmount = Math.round(Number(device.accessPrice || 0))
  if (device.billingType !== 'one_time' || expectedAmount <= 0) {
    return NextResponse.json({ error: 'This device does not require payment.' }, { status: 400 })
  }

  if (totalAmount !== expectedAmount) {
    return NextResponse.json({ error: 'Payment amount does not match the device access price.' }, { status: 400 })
  }

  const snap = new midtransClient.Snap(getMidtransConfig())
  const now = new Date().toISOString()
  const existingOrder = await ServerDataStore.getOrderByAccessRequestId(accessRequest.id)

  if (existingOrder?.paymentStatus === 'PAID') {
    return NextResponse.json(
      { error: 'Payment is already completed for this access request. Wait for owner approval.' },
      { status: 409 }
    )
  }

  const midtransOrderId = createMidtransOrderId(accessRequest.id)
  const order: Order = {
    id: existingOrder?.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    accessRequestId: accessRequest.id,
    deviceId: device.id,
    buyerId: currentUser.id,
    sellerId: device.ownerId,
    totalAmount,
    currency: device.currency || 'IDR',
    paymentStatus: 'PENDING',
    midtransOrderId,
    createdAt: existingOrder?.createdAt || now,
    updatedAt: now,
  }

  const transaction = await snap.createTransaction({
    transaction_details: {
      order_id: order.midtransOrderId,
      gross_amount: order.totalAmount,
    },
    customer_details: {
      first_name: customerName,
      email: customerEmail,
    },
    item_details: [
      {
        id: device.id,
        name: `Access to ${device.name}`.slice(0, 50),
        price: order.totalAmount,
        quantity: 1,
      },
    ],
  })

  const savedOrder = existingOrder
    ? await ServerDataStore.updateOrder(existingOrder.id, {
        totalAmount,
        currency: order.currency,
        paymentStatus: 'PENDING',
        snapToken: transaction.token,
        midtransOrderId: order.midtransOrderId,
        updatedAt: now,
      })
    : await ServerDataStore.addOrder({
        ...order,
        snapToken: transaction.token,
        updatedAt: now,
      })

  if (!savedOrder) {
    return NextResponse.json({ error: 'Failed to save Midtrans order.' }, { status: 500 })
  }

  await ServerDataStore.logAction(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    'payment.midtrans_token_created',
    'access_request',
    accessRequest.id,
    'success',
    `Midtrans order ${savedOrder.midtransOrderId}`
  )

  return NextResponse.json({
    token: transaction.token,
    redirect_url: transaction.redirect_url,
    order: savedOrder,
  })
}
