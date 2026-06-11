import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canManageDevice } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'
import { AccessGrant, AccessRequest, Order } from '@/lib/mock-data'
import { ACCESS_REQUEST_ACTION_RATE_LIMIT, consumeRateLimit } from '@/lib/rate-limit'
import { createAccessGrantToken, createSecureId, hashSecret, toAccessGrantResponse } from '@/lib/secret-storage'
import {
  applyMidtransStatusToOrder,
  assertProductionPaymentStorage,
  getMidtransConfig,
  MidtransPaymentValidationError,
  ProductionPaymentStorageError,
} from '@/lib/midtrans-payments'
import {
  canMarkPayoutEligible,
  canMarkRefundRequired,
  canTransitionAccessRequestStatus,
  getActivePendingOrder,
  getPaidOrders,
  isPaidOrLaterPaymentStatus,
  markPaymentCancelled,
  markRefundRequired,
} from '@/lib/payment-state'

const MIDTRANS_CANCEL_RETRY_ATTEMPTS = [1, 2]
const MIDTRANS_STATUS_RETRY_ATTEMPTS = [1, 2]

interface CancelResult {
  request: AccessRequest
  order?: Order
  refundRequired?: boolean
}

interface OrderUpdateOperation {
  orderId: string
  updates: Partial<Order>
}

function getProductionStorageGuardResponse(): NextResponse | null {
  try {
    assertProductionPaymentStorage()
    return null
  } catch (error) {
    if (error instanceof ProductionPaymentStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    throw error
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
      console.warn('midtrans.cancel_status_failed', {
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

async function cancelMidtransTransactionWithRetry(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order
): Promise<void> {
  let lastError: unknown = null

  for (const attempt of MIDTRANS_CANCEL_RETRY_ATTEMPTS) {
    try {
      await coreApi.transaction.cancel(order.midtransOrderId)
      return
    } catch (error) {
      lastError = error
      console.warn('midtrans.cancel_transaction_failed', {
        orderId: order.id,
        midtransOrderId: order.midtransOrderId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Failed to cancel Midtrans transaction for order ${order.id}.`)
}

async function syncOrderForCancellation(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  order: Order
): Promise<Order> {
  const statusResponse = await getMidtransStatusWithRetry(coreApi, order)
  const result = await applyMidtransStatusToOrder(statusResponse)
  return result?.order || order
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { requestId } = await params
  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  const device = await ServerDataStore.getDeviceById(requestItem.deviceId)
  const canView =
    hasUserRole(currentUser, 'admin') ||
    requestItem.developerId === currentUser.id ||
    (device ? canManageDevice(currentUser, device) : false)
  if (!canView) {
    return NextResponse.json({ error: 'You do not have access to this request.' }, { status: 403 })
  }
  return NextResponse.json(requestItem)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const { requestId } = await params
  const body = await request.json()
  const { action } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const rateLimitResponse = consumeRateLimit(request, ACCESS_REQUEST_ACTION_RATE_LIMIT, [
    { name: 'user', value: currentUser.id },
    { name: 'request', value: requestId },
    { name: 'action', value: String(action) },
  ])
  if (rateLimitResponse) return rateLimitResponse

  const requestItem = await ServerDataStore.getAccessRequestById(requestId)
  if (!requestItem) {
    return NextResponse.json({ error: 'Access request not found' }, { status: 404 })
  }

  if (action === 'cancel') {
    if (!hasUserRole(currentUser, 'developer') || requestItem.developerId !== currentUser.id) {
      return NextResponse.json({ error: 'Only the requesting developer can cancel this request.' }, { status: 403 })
    }

    if (requestItem.status !== 'pending' && requestItem.status !== 'pending_payment') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled.' }, { status: 400 })
    }

    if (!canTransitionAccessRequestStatus(requestItem.status, 'cancelled')) {
      return NextResponse.json({ error: 'This access request cannot be cancelled from its current status.' }, { status: 400 })
    }

    const orders = await ServerDataStore.getOrdersByAccessRequestId(requestItem.id)
    if (requestItem.status === 'pending_payment' || orders.length > 0) {
      const guardResponse = getProductionStorageGuardResponse()
      if (guardResponse) return guardResponse
    }

    const pendingOrder = getActivePendingOrder(orders)
    let relatedOrder: Order | undefined
    let refundRequired = false
    const orderUpdates: OrderUpdateOperation[] = []

    if (pendingOrder) {
      if (!pendingOrder.snapToken) {
        console.info('midtrans.cancel_token_preparation_pending', {
          accessRequestId: requestItem.id,
          orderId: pendingOrder.id,
          midtransOrderId: pendingOrder.midtransOrderId,
        })

        relatedOrder = pendingOrder
        orderUpdates.push({
          orderId: pendingOrder.id,
          updates: markPaymentCancelled(pendingOrder, new Date().toISOString()),
        })
      } else {
        const midtransConfig = getMidtransConfig()
        const coreApi = new midtransClient.CoreApi(midtransConfig)
        let syncedOrder: Order

        try {
          syncedOrder = await syncOrderForCancellation(coreApi, pendingOrder)
        } catch (error) {
          if (error instanceof MidtransPaymentValidationError) {
            console.error('midtrans.cancel_validation_failed', {
              accessRequestId: requestItem.id,
              orderId: pendingOrder.id,
              midtransOrderId: pendingOrder.midtransOrderId,
              validationContext: error.context,
            })
            return NextResponse.json({ error: 'Midtrans payment data failed validation.' }, { status: 400 })
          }

          console.error('midtrans.cancel_status_sync_failed', {
            accessRequestId: requestItem.id,
            orderId: pendingOrder.id,
            midtransOrderId: pendingOrder.midtransOrderId,
            error: error instanceof Error ? error.message : String(error),
          })
          return NextResponse.json({ error: 'Failed to check Midtrans status before cancellation.' }, { status: 502 })
        }

        if (syncedOrder.paymentStatus === 'PENDING') {
          try {
            await cancelMidtransTransactionWithRetry(coreApi, syncedOrder)
            relatedOrder = syncedOrder
            orderUpdates.push({
              orderId: syncedOrder.id,
              updates: markPaymentCancelled(syncedOrder, new Date().toISOString()),
            })
          } catch (error) {
            console.error('midtrans.cancel_pending_failed', {
              accessRequestId: requestItem.id,
              orderId: syncedOrder.id,
              midtransOrderId: syncedOrder.midtransOrderId,
              error: error instanceof Error ? error.message : String(error),
            })
            return NextResponse.json({ error: 'Failed to cancel pending Midtrans transaction.' }, { status: 502 })
          }
        } else if (isPaidOrLaterPaymentStatus(syncedOrder.paymentStatus)) {
          relatedOrder = syncedOrder
          if (canMarkRefundRequired(syncedOrder)) {
            refundRequired = true
            orderUpdates.push({
              orderId: syncedOrder.id,
              updates: markRefundRequired(syncedOrder, new Date().toISOString()),
            })
          }
        } else {
          relatedOrder = syncedOrder
        }
      }
    }

    if (!relatedOrder) {
      const paidOrders = getPaidOrders(orders)
      for (const paidOrder of paidOrders) {
        relatedOrder = relatedOrder || paidOrder
        if (canMarkRefundRequired(paidOrder)) {
          refundRequired = true
          orderUpdates.push({
            orderId: paidOrder.id,
            updates: markRefundRequired(paidOrder, new Date().toISOString()),
          })
        }
      }
    }

    let cancelResult: { request: AccessRequest; orders: Order[] }
    try {
      cancelResult = await ServerDataStore.cancelAccessRequestWithPayment({
        requestId,
        orderUpdates,
        auditLog: {
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'access.cancelled',
          targetType: 'access_request',
          targetId: requestId,
          outcome: 'success',
        },
      })
    } catch (error) {
      console.error('access.cancel_transaction_failed', {
        accessRequestId: requestItem.id,
        orderUpdateCount: orderUpdates.length,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to cancel access request' }, { status: 500 })
    }

    if (relatedOrder) {
      relatedOrder = cancelResult.orders.find(order => order.id === relatedOrder?.id) || relatedOrder
    } else {
      relatedOrder = cancelResult.orders[0]
    }
    refundRequired = refundRequired || cancelResult.orders.some(order => order.payoutStatus === 'REFUND_REQUIRED')

    const result: CancelResult = {
      request: cancelResult.request,
      order: relatedOrder,
      refundRequired,
    }
    return NextResponse.json(result)
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected'
  if (!canTransitionAccessRequestStatus(requestItem.status, nextStatus)) {
    return NextResponse.json({ error: 'Access request cannot be actioned from its current status.' }, { status: 400 })
  }

  const device = await ServerDataStore.getDeviceById(requestItem.deviceId)
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  if (!canManageDevice(currentUser, device)) {
    return NextResponse.json({ error: 'Only the device owner or an admin can action this request.' }, { status: 403 })
  }

  const requestOrders = await ServerDataStore.getOrdersByAccessRequestId(requestItem.id)
  if (requestItem.status === 'pending_payment' || requestOrders.length > 0) {
    const guardResponse = getProductionStorageGuardResponse()
    if (guardResponse) return guardResponse
  }

  const paidOrders = getPaidOrders(requestOrders).filter(order => order.paymentStatus === 'PAID')
  if (requestOrders.length > 0 && paidOrders.length === 0) {
    return NextResponse.json(
      { error: 'Paid access requests can only be approved or rejected after payment is confirmed.' },
      { status: 400 }
    )
  }

  let result: { request: typeof requestItem; grant?: AccessGrant; order?: Order } = { request: requestItem }
  let oneTimeGrantToken: string | null = null

  if (action === 'approve') {
    const payoutOrder = paidOrders.find(order => canMarkPayoutEligible(order)) || null
    if (paidOrders.length > 0 && !payoutOrder) {
      return NextResponse.json(
        { error: 'No paid order is eligible for owner payout.' },
        { status: 400 }
      )
    }

    oneTimeGrantToken = createAccessGrantToken()
    const grant: AccessGrant = {
      id: createSecureId('ag'),
      deviceId: requestItem.deviceId,
      developerId: requestItem.developerId,
      developerName: requestItem.developerName,
      scopes: requestItem.scopes,
      // Security-sensitive: store only the bearer token hash.
      tokenHash: hashSecret(oneTimeGrantToken),
      expiresAt: requestItem.requestedUntil,
      createdAt: new Date().toISOString(),
    }

    const duplicateRefundUpdates = paidOrders
      .filter(order => order.id !== payoutOrder?.id)
      .filter(canMarkRefundRequired)
      .map((order): OrderUpdateOperation => ({
        orderId: order.id,
        updates: markRefundRequired(order, new Date().toISOString()),
      }))

    try {
      result = await ServerDataStore.approveAccessRequestWithPayment({
        requestId,
        payoutOrderUpdate: payoutOrder
          ? {
              orderId: payoutOrder.id,
              updates: { payoutStatus: 'ELIGIBLE' },
            }
          : null,
        duplicateRefundUpdates,
        grant,
        auditLog: {
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'access.approved',
          targetType: 'access_request',
          targetId: requestId,
          outcome: 'success',
        },
      })
    } catch (error) {
      console.error('access.approve_transaction_failed', {
        accessRequestId: requestItem.id,
        payoutOrderId: payoutOrder?.id,
        duplicateRefundCount: duplicateRefundUpdates.length,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to approve access request atomically.' }, { status: 500 })
    }
  } else if (action === 'reject') {
    const refundUpdates = paidOrders
      .filter(canMarkRefundRequired)
      .map((order): OrderUpdateOperation => ({
        orderId: order.id,
        updates: markRefundRequired(order, new Date().toISOString()),
      }))

    try {
      result = await ServerDataStore.rejectAccessRequestWithRefund({
        requestId,
        refundUpdates,
        auditLog: {
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'access.rejected',
          targetType: 'access_request',
          targetId: requestId,
          outcome: 'success',
        },
      })
    } catch (error) {
      console.error('access.reject_transaction_failed', {
        accessRequestId: requestItem.id,
        refundUpdateCount: refundUpdates.length,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to reject access request atomically.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ...result,
    grant: result.grant ? toAccessGrantResponse(result.grant, oneTimeGrantToken) : undefined,
  })
}
