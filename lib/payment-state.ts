import { AccessRequest, Order, PaymentStatus, PayoutStatus } from './mock-data'

type AccessRequestStatus = AccessRequest['status']

const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: [
    'PAID',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
    'DENIED',
    'REFUNDED',
    'PARTIAL_REFUND',
    'CHARGEBACK',
    'PARTIAL_CHARGEBACK',
  ],
  PAID: ['REFUNDED', 'PARTIAL_REFUND', 'CHARGEBACK', 'PARTIAL_CHARGEBACK'],
  PARTIAL_REFUND: ['REFUNDED', 'CHARGEBACK', 'PARTIAL_CHARGEBACK'],
  PARTIAL_CHARGEBACK: ['CHARGEBACK'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  DENIED: [],
  REFUNDED: [],
  CHARGEBACK: [],
}

const ACCESS_REQUEST_STATUS_TRANSITIONS: Record<AccessRequestStatus, readonly AccessRequestStatus[]> = {
  pending_payment: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['revoked'],
  rejected: [],
  revoked: [],
  cancelled: [],
}

function getTimestamp(order: Order): number {
  return new Date(order.createdAt).valueOf()
}

function sortOrdersNewestFirst(orders: Order[]): Order[] {
  return [...orders].sort((first, second) => {
    const firstTime = getTimestamp(first)
    const secondTime = getTimestamp(second)
    if (firstTime !== secondTime) return secondTime - firstTime
    return second.id.localeCompare(first.id)
  })
}

export function canTransitionOrderStatus(currentStatus: PaymentStatus, nextStatus: PaymentStatus): boolean {
  if (currentStatus === nextStatus) return true
  return PAYMENT_STATUS_TRANSITIONS[currentStatus].includes(nextStatus)
}

export function canTransitionAccessRequestStatus(
  currentStatus: AccessRequestStatus,
  nextStatus: AccessRequestStatus
): boolean {
  if (currentStatus === nextStatus) return true
  return ACCESS_REQUEST_STATUS_TRANSITIONS[currentStatus].includes(nextStatus)
}

export function isUnpaidTerminalPaymentStatus(status: PaymentStatus): boolean {
  return status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED' || status === 'DENIED'
}

export function isRefundOrDisputePaymentStatus(status: PaymentStatus): boolean {
  return (
    status === 'REFUNDED' ||
    status === 'PARTIAL_REFUND' ||
    status === 'CHARGEBACK' ||
    status === 'PARTIAL_CHARGEBACK'
  )
}

export function isPaidOrLaterPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAID' || isRefundOrDisputePaymentStatus(status)
}

export function getPayoutStatusAfterPaymentSync(
  currentPayoutStatus: PayoutStatus,
  nextPaymentStatus: PaymentStatus
): PayoutStatus {
  if (nextPaymentStatus === 'REFUNDED') {
    if (currentPayoutStatus === 'PAID_OUT') return currentPayoutStatus
    return 'REFUNDED'
  }

  if (
    nextPaymentStatus === 'PARTIAL_REFUND' ||
    nextPaymentStatus === 'CHARGEBACK' ||
    nextPaymentStatus === 'PARTIAL_CHARGEBACK'
  ) {
    if (currentPayoutStatus === 'PAID_OUT' || currentPayoutStatus === 'REFUNDED') return currentPayoutStatus
    return 'REFUND_REQUIRED'
  }

  return currentPayoutStatus
}

export function getLatestOrder(orders: Order[]): Order | null {
  const sortedOrders = sortOrdersNewestFirst(orders)
  return sortedOrders[0] || null
}

export function getReusablePendingOrder(orders: Order[]): Order | null {
  const sortedOrders = sortOrdersNewestFirst(orders)
  return sortedOrders.find(order => order.paymentStatus === 'PENDING' && Boolean(order.snapToken)) || null
}

export function getPaidOrders(orders: Order[]): Order[] {
  return sortOrdersNewestFirst(orders).filter(order => isPaidOrLaterPaymentStatus(order.paymentStatus))
}

export function canMarkPayoutEligible(order: Order): boolean {
  return order.paymentStatus === 'PAID' && order.payoutStatus === 'NOT_ELIGIBLE'
}

export function canMarkPayoutPaidOut(order: Order): boolean {
  return order.paymentStatus === 'PAID' && order.payoutStatus === 'ELIGIBLE'
}

export function canMarkRefundRequired(order: Order): boolean {
  return isPaidOrLaterPaymentStatus(order.paymentStatus) && (
    order.payoutStatus === 'NOT_ELIGIBLE' ||
    order.payoutStatus === 'ELIGIBLE'
  )
}

export function canMarkRefundCompleted(order: Order): boolean {
  return order.payoutStatus === 'REFUND_REQUIRED'
}

export function markPaymentPaid(order: Order, paymentMethod: string, updatedAt: string): Partial<Order> {
  return {
    paymentStatus: 'PAID',
    paymentMethod: paymentMethod || order.paymentMethod,
    updatedAt,
  }
}

export function markPaymentExpired(order: Order, updatedAt: string): Partial<Order> {
  return {
    paymentStatus: 'EXPIRED',
    updatedAt,
  }
}

export function markPaymentCancelled(order: Order, updatedAt: string): Partial<Order> {
  return {
    paymentStatus: 'CANCELLED',
    updatedAt,
  }
}

export function markPaymentFailed(order: Order, updatedAt: string): Partial<Order> {
  return {
    paymentStatus: 'FAILED',
    updatedAt,
  }
}

export function markPaymentDenied(order: Order, updatedAt: string): Partial<Order> {
  return {
    paymentStatus: 'DENIED',
    updatedAt,
  }
}

export function markRefundRequired(order: Order, updatedAt: string): Partial<Order> {
  return {
    payoutStatus: 'REFUND_REQUIRED',
    paidOutAt: undefined,
    updatedAt,
  }
}
