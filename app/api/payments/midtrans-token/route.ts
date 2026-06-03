import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { hasUserRole } from '@/lib/auth-types'
import { AccessRequest, BillingSnapshot, Order } from '@/lib/mock-data'
import { createBillingSnapshot } from '@/lib/billing-snapshot'
import {
  applyMidtransStatusToOrder,
  getMidtransConfig,
  MidtransPaymentValidationError,
} from '@/lib/midtrans-payments'
import { createOrderPayoutFields } from '@/lib/order-payouts'
import {
  getPaidOrders,
  getReusablePendingOrder,
  isPaidOrLaterPaymentStatus,
} from '@/lib/payment-state'

export const dynamic = 'force-dynamic'

const MIDTRANS_STATUS_RETRY_ATTEMPTS = [1, 2]

function getClientSubmittedAmount(value: unknown): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount)
}

function createMidtransOrderId(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 10)
  return `iot-${Date.now()}-${randomSuffix}`
}

function createOrderId(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 10)
  return `ord_${Date.now()}_${randomSuffix}`
}

function getSnapRedirectUrl(isProduction: boolean, snapToken: string): string {
  const origin = isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'
  return `${origin}/snap/v2/vtweb/${encodeURIComponent(snapToken)}`
}

async function ensureBillingSnapshot(
  accessRequest: AccessRequest,
  deviceId: string,
  createdAt: string
): Promise<AccessRequest> {
  if (accessRequest.billingSnapshot) return accessRequest

  const device = await ServerDataStore.getDeviceById(deviceId)
  if (!device) {
    throw new Error(`Device ${deviceId} was not found while creating billing snapshot.`)
  }

  const billingSnapshot = createBillingSnapshot({
    device,
    developerId: accessRequest.developerId,
    createdAt,
  })

  if (device.billingType !== 'one_time' || billingSnapshot.quotedAmount <= 0) {
    throw new Error(`Access request ${accessRequest.id} does not have a payable billing snapshot.`)
  }

  const updatedRequest = await ServerDataStore.updateAccessRequest(accessRequest.id, { billingSnapshot })
  if (!updatedRequest) {
    throw new Error(`Failed to persist billing snapshot for access request ${accessRequest.id}.`)
  }

  return updatedRequest
}

function createPaymentOrder(
  accessRequest: AccessRequest,
  billingSnapshot: BillingSnapshot,
  now: string
): Order {
  const totalAmount = billingSnapshot.quotedAmount
  return {
    id: createOrderId(),
    accessRequestId: accessRequest.id,
    deviceId: billingSnapshot.deviceId,
    buyerId: accessRequest.developerId,
    sellerId: billingSnapshot.ownerId,
    totalAmount,
    currency: billingSnapshot.currency,
    paymentStatus: 'PENDING',
    ...createOrderPayoutFields(totalAmount),
    midtransOrderId: createMidtransOrderId(),
    billingSnapshot,
    createdAt: now,
    updatedAt: now,
  }
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
      console.warn('midtrans.token_reuse_status_failed', {
        orderId: order.id,
        midtransOrderId: order.midtransOrderId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Failed to check Midtrans status for order ${order.id}.`)
}

async function syncReusableOrder(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order
): Promise<Order> {
  const statusResponse = await getMidtransStatusWithRetry(coreApi, order)
  const syncResult = await applyMidtransStatusToOrder(statusResponse)
  return syncResult?.order || order
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
  const clientSubmittedAmount = getClientSubmittedAmount(body.totalAmount)
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : currentUser.name
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : currentUser.email

  if (!orderId || !customerName || !customerEmail) {
    return NextResponse.json({ error: 'orderId, customerName, and customerEmail are required.' }, { status: 400 })
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

  let payableAccessRequest: AccessRequest
  try {
    payableAccessRequest = await ensureBillingSnapshot(accessRequest, accessRequest.deviceId, accessRequest.createdAt)
  } catch (error) {
    console.error('midtrans.billing_snapshot_failed', {
      accessRequestId: accessRequest.id,
      deviceId: accessRequest.deviceId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to prepare payment billing snapshot.' }, { status: 500 })
  }

  const billingSnapshot = payableAccessRequest.billingSnapshot
  if (!billingSnapshot) {
    return NextResponse.json({ error: 'Payment billing snapshot is missing.' }, { status: 500 })
  }

  if (billingSnapshot.quotedAmount <= 0) {
    return NextResponse.json({ error: 'Payment billing snapshot amount is invalid.' }, { status: 400 })
  }

  if (clientSubmittedAmount !== null && clientSubmittedAmount !== billingSnapshot.quotedAmount) {
    console.warn('midtrans.client_amount_ignored', {
      accessRequestId: accessRequest.id,
      clientSubmittedAmount,
      quotedAmount: billingSnapshot.quotedAmount,
    })
  }

  const midtransConfig = getMidtransConfig()
  const snap = new midtransClient.Snap(midtransConfig)
  const coreApi = new midtransClient.CoreApi(midtransConfig)
  const now = new Date().toISOString()
  const existingOrders = await ServerDataStore.getOrdersByAccessRequestId(accessRequest.id)
  const paidOrder = getPaidOrders(existingOrders)[0] || null

  if (paidOrder) {
    return NextResponse.json(
      { error: 'Payment is already completed or under refund review for this access request. Wait for owner/admin review.' },
      { status: 409 }
    )
  }

  const reusableOrder = getReusablePendingOrder(existingOrders)
  if (reusableOrder) {
    let syncedOrder: Order
    try {
      syncedOrder = await syncReusableOrder(coreApi, reusableOrder)
    } catch (error) {
      if (error instanceof MidtransPaymentValidationError) {
        console.error('midtrans.token_reuse_validation_failed', {
          orderId: reusableOrder.id,
          midtransOrderId: reusableOrder.midtransOrderId,
          validationContext: error.context,
        })
        return NextResponse.json({ error: 'Existing Midtrans payment data failed validation.' }, { status: 400 })
      }

      console.error('midtrans.token_reuse_sync_failed', {
        orderId: reusableOrder.id,
        midtransOrderId: reusableOrder.midtransOrderId,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to check existing Midtrans payment status.' }, { status: 502 })
    }

    if (syncedOrder.paymentStatus === 'PENDING' && syncedOrder.snapToken) {
      await ServerDataStore.logAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'payment.midtrans_token_reused',
        'access_request',
        accessRequest.id,
        'success',
        `Midtrans order ${syncedOrder.midtransOrderId}`
      )

      return NextResponse.json({
        token: syncedOrder.snapToken,
        redirect_url: syncedOrder.snapRedirectUrl || getSnapRedirectUrl(midtransConfig.isProduction, syncedOrder.snapToken),
        order: syncedOrder,
      })
    }

    if (isPaidOrLaterPaymentStatus(syncedOrder.paymentStatus)) {
      return NextResponse.json(
        { error: 'Payment is already completed or under refund review for this access request. Wait for owner/admin review.' },
        { status: 409 }
      )
    }
  }

  const order = createPaymentOrder(payableAccessRequest, billingSnapshot, now)

  let transaction: { token: string; redirect_url: string }
  try {
    transaction = await snap.createTransaction({
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
          id: billingSnapshot.deviceId,
          name: `Access to ${billingSnapshot.deviceName}`.slice(0, 50),
          price: order.totalAmount,
          quantity: 1,
        },
      ],
    })
  } catch (error) {
    const validationContext = error instanceof MidtransPaymentValidationError ? error.context : undefined
    console.error('midtrans.token_create_failed', {
      accessRequestId: accessRequest.id,
      midtransOrderId: order.midtransOrderId,
      validationContext,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to create Midtrans payment token.' }, { status: 502 })
  }

  const savedOrder = await ServerDataStore.addOrder({
    ...order,
    snapToken: transaction.token,
    snapRedirectUrl: transaction.redirect_url,
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
