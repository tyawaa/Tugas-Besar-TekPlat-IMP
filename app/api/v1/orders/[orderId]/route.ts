import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import { ServerDataStore } from '@/lib/server-data-store'
import { canMarkPayoutPaidOut, canMarkRefundCompleted } from '@/lib/payment-state'
import { assertProductionPaymentStorage, ProductionPaymentStorageError } from '@/lib/midtrans-payments'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Only admins can update payout status.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (action === 'markPaidOut' || action === 'markRefunded') {
    try {
      assertProductionPaymentStorage()
    } catch (error) {
      if (error instanceof ProductionPaymentStorageError) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      throw error
    }
  }

  const { orderId } = await params
  const order = await ServerDataStore.getOrderById(orderId)

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (action === 'markPaidOut') {
    if (!canMarkPayoutPaidOut(order)) {
      return NextResponse.json(
        {
          error: 'Only paid orders that are eligible for payout can be marked as paid out.',
          context: {
            orderId: order.id,
            paymentStatus: order.paymentStatus,
            payoutStatus: order.payoutStatus,
          },
        },
        { status: 400 }
      )
    }

    let updatedOrder
    try {
      updatedOrder = await ServerDataStore.markOrderPaidOutWithAudit({
        orderId: order.id,
        updates: {
          payoutStatus: 'PAID_OUT',
          paidOutAt: new Date().toISOString(),
        },
        auditLog: {
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'payout.marked_paid_out',
          targetType: 'access_request',
          targetId: order.accessRequestId,
          outcome: 'success',
          details: `Order ${order.id} owner payout ${order.currency} ${order.ownerAmount}`,
        },
      })
    } catch (error) {
      console.error('payout.mark_paid_out_transaction_failed', {
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to update payout status.' }, { status: 500 })
    }

    return NextResponse.json({ order: updatedOrder })
  }

  if (action === 'markRefunded') {
    if (!canMarkRefundCompleted(order)) {
      return NextResponse.json(
        {
          error: 'Only orders under manual refund tracking can be marked as refunded.',
          context: {
            orderId: order.id,
            paymentStatus: order.paymentStatus,
            payoutStatus: order.payoutStatus,
          },
        },
        { status: 400 }
      )
    }

    let updatedOrder
    try {
      updatedOrder = await ServerDataStore.markOrderRefundedWithAudit({
        orderId: order.id,
        updates: {
          payoutStatus: 'REFUNDED',
        },
        auditLog: {
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          action: 'payout.marked_refunded',
          targetType: 'access_request',
          targetId: order.accessRequestId,
          outcome: 'success',
          details: `Order ${order.id} marked refunded`,
        },
      })
    } catch (error) {
      console.error('payout.mark_refunded_transaction_failed', {
        orderId: order.id,
        accessRequestId: order.accessRequestId,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Failed to update refund status.' }, { status: 500 })
    }

    return NextResponse.json({ order: updatedOrder })
  }

  return NextResponse.json({ error: 'Unsupported order action.' }, { status: 400 })
}
