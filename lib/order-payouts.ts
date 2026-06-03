import { Order, PayoutStatus } from './mock-data'

export const PLATFORM_FEE_BASIS_POINTS = 1000

interface PayoutBreakdown {
  platformFee: number
  ownerAmount: number
}

function normalizeMoneyAmount(value: unknown): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount)
}

export function calculatePayoutBreakdown(totalAmount: number): PayoutBreakdown {
  const normalizedTotal = normalizeMoneyAmount(totalAmount)
  const platformFee = Math.round((normalizedTotal * PLATFORM_FEE_BASIS_POINTS) / 10000)
  return {
    platformFee,
    ownerAmount: Math.max(0, normalizedTotal - platformFee),
  }
}

function isPayoutStatus(value: unknown): value is PayoutStatus {
  return (
    value === 'NOT_ELIGIBLE' ||
    value === 'ELIGIBLE' ||
    value === 'PAID_OUT' ||
    value === 'REFUND_REQUIRED' ||
    value === 'REFUNDED'
  )
}

export function normalizeOrderPayout(order: Order): Order {
  const payout = calculatePayoutBreakdown(order.totalAmount)
  const platformFee = normalizeMoneyAmount(order.platformFee)
  const ownerAmount = normalizeMoneyAmount(order.ownerAmount)

  return {
    ...order,
    payoutStatus: isPayoutStatus(order.payoutStatus) ? order.payoutStatus : 'NOT_ELIGIBLE',
    platformFee: platformFee > 0 || ownerAmount > 0 ? platformFee : payout.platformFee,
    ownerAmount: platformFee > 0 || ownerAmount > 0 ? ownerAmount : payout.ownerAmount,
    paidOutAt: typeof order.paidOutAt === 'string' && order.paidOutAt.trim() ? order.paidOutAt : undefined,
  }
}

export function createOrderPayoutFields(totalAmount: number): Pick<Order, 'payoutStatus' | 'platformFee' | 'ownerAmount'> {
  const payout = calculatePayoutBreakdown(totalAmount)
  return {
    payoutStatus: 'NOT_ELIGIBLE',
    platformFee: payout.platformFee,
    ownerAmount: payout.ownerAmount,
  }
}
