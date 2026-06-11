import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { hasUserRole } from '@/lib/auth-types'
import { AccessRequest, BillingSnapshot, Order } from '@/lib/mock-data'
import { createBillingSnapshot } from '@/lib/billing-snapshot'
import {
  applyMidtransStatusToOrder,
  assertProductionPaymentStorage,
  getMidtransConfig,
  MidtransPaymentValidationError,
  ProductionPaymentStorageError,
} from '@/lib/midtrans-payments'
import { createOrderPayoutFields } from '@/lib/order-payouts'
import {
  getActivePendingOrder,
  getPaidOrders,
  isPaidOrLaterPaymentStatus,
  markPaymentCancelled,
  markPaymentFailed,
} from '@/lib/payment-state'
import { consumeRateLimit, PAYMENT_TOKEN_RATE_LIMIT } from '@/lib/rate-limit'
import { createSecureId } from '@/lib/secret-storage'

export const dynamic = 'force-dynamic'

const MIDTRANS_STATUS_RETRY_ATTEMPTS = [1, 2]

function getClientSubmittedAmount(value: unknown): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount)
}

function createMidtransOrderId(): string {
  return createSecureId('iot').replaceAll('_', '-')
}

function createOrderId(): string {
  return createSecureId('ord')
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

async function cancelPreparedMidtransTransaction(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order
): Promise<void> {
  try {
    await coreApi.transaction.cancel(order.midtransOrderId)
    console.info('midtrans.token_preparation_cancelled', {
      orderId: order.id,
      midtransOrderId: order.midtransOrderId,
    })
  } catch (error) {
    console.warn('midtrans.token_preparation_cancel_failed', {
      orderId: order.id,
      midtransOrderId: order.midtransOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function getPaymentTokenFromActivePendingOrder(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order,
  accessRequestId: string,
  isProduction: boolean
): Promise<{ response: NextResponse | null; order: Order }> {
  if (!order.snapToken) {
    return {
      response: NextResponse.json(
        { error: 'Payment is already being prepared. Please retry in a moment.' },
        { status: 409 }
      ),
      order,
    }
  }

  const syncedOrder = await syncReusableOrder(coreApi, order)
  if (syncedOrder.paymentStatus === 'PENDING' && syncedOrder.snapToken) {
    return {
      response: NextResponse.json({
        token: syncedOrder.snapToken,
        redirect_url: syncedOrder.snapRedirectUrl || getSnapRedirectUrl(isProduction, syncedOrder.snapToken),
        order: syncedOrder,
      }),
      order: syncedOrder,
    }
  }

  if (isPaidOrLaterPaymentStatus(syncedOrder.paymentStatus)) {
    return {
      response: NextResponse.json(
        { error: 'Payment is already completed or under refund review for this access request. Wait for owner/admin review.' },
        { status: 409 }
      ),
      order: syncedOrder,
    }
  }

  console.info('midtrans.pending_attempt_no_longer_active', {
    accessRequestId,
    orderId: syncedOrder.id,
    midtransOrderId: syncedOrder.midtransOrderId,
    paymentStatus: syncedOrder.paymentStatus,
  })

  return {
    response: null,
    order: syncedOrder,
  }
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

  const rateLimitResponse = consumeRateLimit(request, PAYMENT_TOKEN_RATE_LIMIT, [
    { name: 'user', value: currentUser.id },
    { name: 'order', value: orderId },
  ])
  if (rateLimitResponse) return rateLimitResponse

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

  const midtransConfig = getMidtransConfig()
  try {
    assertProductionPaymentStorage(midtransConfig)
  } catch (error) {
    if (error instanceof ProductionPaymentStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    throw error
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

  const activePendingOrder = getActivePendingOrder(existingOrders)
  if (activePendingOrder) {
    let pendingResponse: NextResponse | null
    let pendingOrder = activePendingOrder
    try {
      const result = await getPaymentTokenFromActivePendingOrder(
        coreApi,
        activePendingOrder,
        accessRequest.id,
        midtransConfig.isProduction
      )
      pendingResponse = result.response
      pendingOrder = result.order
    } catch (error) {
      if (error instanceof MidtransPaymentValidationError) {
        console.error('midtrans.token_reuse_validation_failed', {
          orderId: activePendingOrder.id,
          midtransOrderId: activePendingOrder.midtransOrderId,
          validationContext: error.context,
        })
        return NextResponse.json({ error: 'Existing Midtrans payment data failed validation.' }, { status: 400 })
      }

      console.error('midtrans.token_reuse_sync_failed', {
        orderId: activePendingOrder.id,
        midtransOrderId: activePendingOrder.midtransOrderId,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to check existing Midtrans payment status.' }, { status: 502 })
    }

    if (pendingResponse) {
      if (pendingResponse.status !== 200) return pendingResponse

      await ServerDataStore.logAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'payment.midtrans_token_reused',
        'access_request',
        accessRequest.id,
        'success',
        `Midtrans order ${pendingOrder.midtransOrderId}`
      )

      return pendingResponse
    }
  }

  const order = createPaymentOrder(payableAccessRequest, billingSnapshot, now)

  let savedPendingOrder: Order
  try {
    savedPendingOrder = await ServerDataStore.addOrder(order)
  } catch (error) {
    console.warn('midtrans.pending_order_create_conflict', {
      accessRequestId: accessRequest.id,
      midtransOrderId: order.midtransOrderId,
      error: error instanceof Error ? error.message : String(error),
    })

    try {
      const conflictOrders = await ServerDataStore.getOrdersByAccessRequestId(accessRequest.id)
      const conflictPendingOrder = getActivePendingOrder(conflictOrders)

      if (conflictPendingOrder) {
        const conflictResult = await getPaymentTokenFromActivePendingOrder(
          coreApi,
          conflictPendingOrder,
          accessRequest.id,
          midtransConfig.isProduction
        )

        if (conflictResult.response) {
          console.info('midtrans.pending_order_conflict_reused', {
            accessRequestId: accessRequest.id,
            orderId: conflictPendingOrder.id,
            midtransOrderId: conflictPendingOrder.midtransOrderId,
            responseStatus: conflictResult.response.status,
          })
          return conflictResult.response
        }
      }
    } catch (syncError) {
      console.error('midtrans.pending_order_conflict_sync_failed', {
        accessRequestId: accessRequest.id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      })
      return NextResponse.json({ error: 'Failed to check existing pending payment after conflict.' }, { status: 502 })
    }

    return NextResponse.json(
      { error: 'A pending payment is already being prepared for this access request. Please retry in a moment.' },
      { status: 409 }
    )
  }

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
    await ServerDataStore.updateOrder(
      savedPendingOrder.id,
      markPaymentFailed(savedPendingOrder, new Date().toISOString())
    )
    const validationContext = error instanceof MidtransPaymentValidationError ? error.context : undefined
    console.error('midtrans.token_create_failed', {
      accessRequestId: accessRequest.id,
      midtransOrderId: savedPendingOrder.midtransOrderId,
      validationContext,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to create Midtrans payment token.' }, { status: 502 })
  }

  const latestAccessRequest = await ServerDataStore.getAccessRequestById(accessRequest.id)
  const latestPendingOrder = await ServerDataStore.getOrderById(savedPendingOrder.id)
  if (
    !latestAccessRequest ||
    latestAccessRequest.status !== 'pending_payment' ||
    !latestPendingOrder ||
    latestPendingOrder.paymentStatus !== 'PENDING'
  ) {
    console.warn('midtrans.token_created_after_local_state_changed', {
      accessRequestId: accessRequest.id,
      orderId: savedPendingOrder.id,
      midtransOrderId: savedPendingOrder.midtransOrderId,
      accessRequestStatus: latestAccessRequest?.status,
      paymentStatus: latestPendingOrder?.paymentStatus,
    })

    await cancelPreparedMidtransTransaction(coreApi, savedPendingOrder)

    if (latestPendingOrder?.paymentStatus === 'PENDING') {
      await ServerDataStore.updateOrder(
        latestPendingOrder.id,
        markPaymentCancelled(latestPendingOrder, new Date().toISOString())
      )
    }

    return NextResponse.json(
      { error: 'Payment request is no longer active. Please refresh before trying again.' },
      { status: 409 }
    )
  }

  const savedOrder = await ServerDataStore.updateOrder(savedPendingOrder.id, {
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
