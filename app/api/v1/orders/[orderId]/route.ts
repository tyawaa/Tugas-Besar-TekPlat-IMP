import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import { ServerDataStore } from '@/lib/server-data-store'

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
  const { orderId } = await params
  const order = await ServerDataStore.getOrderById(orderId)

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (action === 'markPaidOut') {
    if (order.paymentStatus !== 'PAID' || order.payoutStatus !== 'ELIGIBLE') {
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

    const updatedOrder = await ServerDataStore.updateOrder(order.id, {
      payoutStatus: 'PAID_OUT',
      paidOutAt: new Date().toISOString(),
    })

    if (!updatedOrder) {
      return NextResponse.json({ error: 'Failed to update payout status.' }, { status: 500 })
    }

    await ServerDataStore.logAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'payout.marked_paid_out',
      'access_request',
      order.accessRequestId,
      'success',
      `Order ${order.id} owner payout ${order.currency} ${order.ownerAmount}`
    )

    return NextResponse.json({ order: updatedOrder })
  }

  if (action === 'markRefunded') {
    if (order.payoutStatus !== 'REFUND_REQUIRED') {
      return NextResponse.json(
        {
          error: 'Only orders that require refund can be marked as refunded.',
          context: {
            orderId: order.id,
            payoutStatus: order.payoutStatus,
          },
        },
        { status: 400 }
      )
    }

    const updatedOrder = await ServerDataStore.updateOrder(order.id, {
      payoutStatus: 'REFUNDED',
    })

    if (!updatedOrder) {
      return NextResponse.json({ error: 'Failed to update refund status.' }, { status: 500 })
    }

    await ServerDataStore.logAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'payout.marked_refunded',
      'access_request',
      order.accessRequestId,
      'success',
      `Order ${order.id} marked refunded`
    )

    return NextResponse.json({ order: updatedOrder })
  }

  return NextResponse.json({ error: 'Unsupported order action.' }, { status: 400 })
}
