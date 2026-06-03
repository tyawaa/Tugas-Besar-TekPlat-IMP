import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { canManageDevice } from '@/lib/access-control'
import { hasUserRole } from '@/lib/auth-types'
import { AccessGrant, AccessRequest, Order } from '@/lib/mock-data'
import {
  applyMidtransStatusToOrder,
  getMidtransConfig,
  MidtransPaymentValidationError,
} from '@/lib/midtrans-payments'
import {
  canMarkPayoutEligible,
  canMarkRefundRequired,
  canTransitionAccessRequestStatus,
  getPaidOrders,
  getReusablePendingOrder,
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

async function markOrderCancelled(order: Order): Promise<Order> {
  const updatedOrder = await ServerDataStore.updateOrder(order.id, markPaymentCancelled(order, new Date().toISOString()))
  if (!updatedOrder) {
    throw new Error(`Failed to mark order ${order.id} as cancelled.`)
  }
  return updatedOrder
}

async function markOrderRefundRequired(order: Order): Promise<Order> {
  if (!canMarkRefundRequired(order)) return order

  const updatedOrder = await ServerDataStore.updateOrder(order.id, markRefundRequired(order, new Date().toISOString()))
  if (!updatedOrder) {
    throw new Error(`Failed to mark refund required for order ${order.id}.`)
  }
  return updatedOrder
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
    const pendingOrder = getReusablePendingOrder(orders)
    let relatedOrder: Order | undefined
    let refundRequired = false

    // TODO: wrap Midtrans/local order cancellation or refund marking with request cancellation in one Postgres transaction.
    // The local order/refund state is updated before the request is cancelled to avoid losing paid-payment review state.
    if (pendingOrder) {
      const coreApi = new midtransClient.CoreApi(getMidtransConfig())
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
          relatedOrder = await markOrderCancelled(syncedOrder)
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
        try {
          relatedOrder = await markOrderRefundRequired(syncedOrder)
          refundRequired = relatedOrder.payoutStatus === 'REFUND_REQUIRED'
        } catch (error) {
          console.error('midtrans.cancel_refund_required_failed', {
            accessRequestId: requestItem.id,
            orderId: syncedOrder.id,
            midtransOrderId: syncedOrder.midtransOrderId,
            error: error instanceof Error ? error.message : String(error),
          })
          return NextResponse.json({ error: 'Failed to move paid request into refund review.' }, { status: 500 })
        }
      } else {
        relatedOrder = syncedOrder
      }
    }

    if (!relatedOrder) {
      const paidOrders = getPaidOrders(orders)
      try {
        for (const paidOrder of paidOrders) {
          const refundOrder = await markOrderRefundRequired(paidOrder)
          relatedOrder = relatedOrder || refundOrder
          refundRequired = refundRequired || refundOrder.payoutStatus === 'REFUND_REQUIRED'
        }
      } catch (error) {
        console.error('midtrans.cancel_existing_paid_refund_required_failed', {
          accessRequestId: requestItem.id,
          error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json({ error: 'Failed to move paid request into refund review.' }, { status: 500 })
      }
    }

    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'cancelled' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to cancel access request' }, { status: 500 })
    }

    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.cancelled', 'access_request', requestId)
    const result: CancelResult = {
      request: updatedRequest,
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
  const paidOrders = getPaidOrders(requestOrders).filter(order => order.paymentStatus === 'PAID')
  if (requestOrders.length > 0 && paidOrders.length === 0) {
    return NextResponse.json(
      { error: 'Paid access requests can only be approved or rejected after payment is confirmed.' },
      { status: 400 }
    )
  }

  let result: { request: typeof requestItem; grant?: AccessGrant; order?: Order } = { request: requestItem }

  if (action === 'approve') {
    const payoutOrder = paidOrders.find(order => canMarkPayoutEligible(order)) || null
    if (paidOrders.length > 0 && !payoutOrder) {
      return NextResponse.json(
        { error: 'No paid order is eligible for owner payout.' },
        { status: 400 }
      )
    }

    // TODO: wrap payout eligibility, request approval, and grant creation in a single Postgres transaction.
    // Until ServerDataStore exposes transactions, update payout first so access is not granted before payout is safe.
    let updatedPayoutOrder: Order | undefined
    if (payoutOrder) {
      const payoutUpdate = await ServerDataStore.updateOrder(payoutOrder.id, { payoutStatus: 'ELIGIBLE' })
      if (!payoutUpdate) {
        return NextResponse.json({ error: 'Failed to mark owner payout as eligible.' }, { status: 500 })
      }
      updatedPayoutOrder = payoutUpdate
    }

    try {
      for (const duplicatePaidOrder of paidOrders.filter(order => order.id !== payoutOrder?.id)) {
        if (canMarkRefundRequired(duplicatePaidOrder)) {
          await markOrderRefundRequired(duplicatePaidOrder)
        }
      }
    } catch (error) {
      console.error('access.approve_duplicate_refund_failed', {
        accessRequestId: requestItem.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to mark duplicate paid order for refund review.' }, { status: 500 })
    }

    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'approved' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to update access request' }, { status: 500 })
    }

    const grant: AccessGrant = {
      id: `ag_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      deviceId: updatedRequest.deviceId,
      developerId: updatedRequest.developerId,
      developerName: updatedRequest.developerName,
      scopes: updatedRequest.scopes,
      token: `token_${Math.random().toString(36).substring(2, 32).toUpperCase()}`,
      expiresAt: updatedRequest.requestedUntil,
      createdAt: new Date().toISOString(),
    }

    await ServerDataStore.addAccessGrant(grant)
    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.approved', 'access_request', requestId)

    result = { request: updatedRequest, grant, order: updatedPayoutOrder }
  } else if (action === 'reject') {
    // TODO: wrap refund-required marking and request rejection in one Postgres transaction.
    // Manual refund state is marked first so a paid request is not rejected without refund tracking.
    let refundOrder: Order | undefined
    try {
      for (const paidOrder of paidOrders) {
        const updatedOrder = await markOrderRefundRequired(paidOrder)
        refundOrder = refundOrder || updatedOrder
      }
    } catch (error) {
      console.error('access.reject_refund_required_failed', {
        accessRequestId: requestItem.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to mark paid order for refund review.' }, { status: 500 })
    }

    const updatedRequest = await ServerDataStore.updateAccessRequest(requestId, { status: 'rejected' })
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Failed to update access request' }, { status: 500 })
    }

    await ServerDataStore.logAction(currentUser.id, currentUser.name, currentUser.role, 'access.rejected', 'access_request', requestId)
    result = { request: updatedRequest, order: refundOrder }
  }

  return NextResponse.json(result)
}
