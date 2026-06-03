import { AccessRequest, Order, PaymentStatus, UserRole } from './mock-data'
import {
  canMarkRefundRequired,
  canMovePayoutStatusToRefundRequired,
  canTransitionAccessRequestStatus,
  getPayoutStatusAfterPaymentSync,
  getOrderStatusTransitionKind,
  markLatePaidAfterLocalCancel,
  markPaymentCancelled,
  markPaymentDenied,
  markPaymentExpired,
  markPaymentFailed,
  markPaymentPaid,
  markRefundRequired,
} from './payment-state'
import { isPostgresConfigured } from './postgres-data-store'
import { AuditLogInput, PaymentSyncPlan, PaymentSyncState, ServerDataStore } from './server-data-store'

interface MidtransConfig {
  isProduction: boolean
  serverKey: string
  clientKey: string
}

export interface PaymentAccessSyncResult {
  request: AccessRequest | null
}

export interface PaymentOrderSyncResult {
  order: Order
  access: PaymentAccessSyncResult | null
  orderStatusChanged: boolean
  accessStatusChanged: boolean
  refundRequired: boolean
  duplicate: boolean
  latePaidAfterCancellation: boolean
}

export interface PaymentSyncAuditContext {
  actorId: string
  actorName: string
  actorRole: UserRole
  source: 'webhook' | 'status' | 'reconcile'
}

interface PaidReconcilePlan {
  orderUpdates?: Partial<Order>
  accessRequestUpdates?: Partial<AccessRequest>
  accessStatusChanged: boolean
  refundRequired: boolean
}

export class MidtransPaymentValidationError extends Error {
  context: Record<string, unknown>

  constructor(message: string, context: Record<string, unknown>) {
    super(message)
    this.name = 'MidtransPaymentValidationError'
    this.context = context
  }
}

export class ProductionPaymentStorageError extends Error {
  constructor() {
    super(
      'Production payments require PostgreSQL storage. Configure DATABASE_URL/POSTGRES_URL or explicitly set IOTBRIDGE_ALLOW_UNSAFE_PAYMENT_STORAGE=true for demo-only payment storage.'
    )
    this.name = 'ProductionPaymentStorageError'
  }
}

function getMidtransIsProduction(): boolean {
  const rawValue = process.env.MIDTRANS_IS_PRODUCTION
  if (!rawValue) return false
  if (rawValue === 'true') return true
  if (rawValue === 'false') return false

  throw new Error('MIDTRANS_IS_PRODUCTION must be either "true" or "false".')
}

export function getMidtransConfig(): MidtransConfig {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY

  if (!serverKey || !clientKey) {
    throw new Error('Midtrans keys are not configured.')
  }

  return {
    isProduction: getMidtransIsProduction(),
    serverKey,
    clientKey,
  }
}

export function assertProductionPaymentStorage(config: MidtransConfig): void {
  const productionRuntime = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  const allowUnsafeStorage = process.env.IOTBRIDGE_ALLOW_UNSAFE_PAYMENT_STORAGE === 'true'
  const requiresPostgres = config.isProduction || productionRuntime

  if (requiresPostgres && !isPostgresConfigured() && !allowUnsafeStorage) {
    console.error('payment.production_storage_missing', {
      isProduction: config.isProduction,
      productionRuntime,
      postgresConfigured: false,
      allowUnsafeStorage,
    })
    throw new ProductionPaymentStorageError()
  }

  if (requiresPostgres && !isPostgresConfigured() && allowUnsafeStorage) {
    console.warn('payment.production_storage_unsafe_override', {
      isProduction: config.isProduction,
      productionRuntime,
      postgresConfigured: false,
      allowUnsafeStorage,
    })
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getMidtransOrderId(statusResponse: Record<string, unknown>): string {
  return asString(statusResponse.order_id)
}

export function mapPaymentStatus(transactionStatus: string, fraudStatus: string): PaymentStatus | null {
  if (transactionStatus === 'settlement') return 'PAID'
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'accept') return 'PAID'
    if (fraudStatus === 'deny') return 'DENIED'
    return 'PENDING'
  }
  if (transactionStatus === 'pending') return 'PENDING'
  if (transactionStatus === 'expire') return 'EXPIRED'
  if (transactionStatus === 'cancel') return 'CANCELLED'
  if (transactionStatus === 'deny') return 'DENIED'
  if (transactionStatus === 'failure') return 'FAILED'
  if (transactionStatus === 'refund') return 'REFUNDED'
  if (transactionStatus === 'partial_refund') return 'PARTIAL_REFUND'
  if (transactionStatus === 'chargeback') return 'CHARGEBACK'
  if (transactionStatus === 'partial_chargeback') return 'PARTIAL_CHARGEBACK'
  return null
}

export function getPaymentStatusFromMidtransResponse(statusResponse: Record<string, unknown>): PaymentStatus | null {
  return mapPaymentStatus(
    asString(statusResponse.transaction_status),
    asString(statusResponse.fraud_status)
  )
}

function getMidtransGrossAmount(value: unknown): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount)
}

function getPaymentUpdate(
  order: Order,
  paymentStatus: PaymentStatus,
  paymentMethod: string,
  updatedAt: string
): Partial<Order> {
  const payoutStatus = getPayoutStatusAfterPaymentSync(order.payoutStatus, paymentStatus)

  if (paymentStatus === 'PAID') {
    return {
      ...markPaymentPaid(order, paymentMethod, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'EXPIRED') {
    return {
      ...markPaymentExpired(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'CANCELLED') {
    return {
      ...markPaymentCancelled(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'DENIED') {
    return {
      ...markPaymentDenied(order, updatedAt),
      payoutStatus,
    }
  }

  if (paymentStatus === 'FAILED') {
    return {
      ...markPaymentFailed(order, updatedAt),
      payoutStatus,
    }
  }

  return {
    paymentStatus,
    paymentMethod: paymentMethod || order.paymentMethod,
    payoutStatus,
    updatedAt,
  }
}

export function validateMidtransPaymentResponse(statusResponse: Record<string, unknown>, order: Order): void {
  const midtransOrderId = getMidtransOrderId(statusResponse)
  const grossAmount = getMidtransGrossAmount(statusResponse.gross_amount)
  const currency = asString(statusResponse.currency).toUpperCase()

  if (midtransOrderId !== order.midtransOrderId) {
    console.error('midtrans.order_id_mismatch', {
      orderId: order.id,
      localMidtransOrderId: order.midtransOrderId,
      responseMidtransOrderId: midtransOrderId,
    })
    throw new MidtransPaymentValidationError('Midtrans order_id does not match the local order.', {
      orderId: order.id,
      localMidtransOrderId: order.midtransOrderId,
      responseMidtransOrderId: midtransOrderId,
    })
  }

  if (grossAmount === null || grossAmount !== order.totalAmount) {
    console.error('midtrans.amount_mismatch', {
      orderId: order.id,
      midtransOrderId,
      expectedAmount: order.totalAmount,
      grossAmount: statusResponse.gross_amount,
    })
    throw new MidtransPaymentValidationError('Midtrans gross_amount does not match the local order amount.', {
      orderId: order.id,
      midtransOrderId,
      expectedAmount: order.totalAmount,
      grossAmount: statusResponse.gross_amount,
    })
  }

  if (currency && currency !== order.currency.toUpperCase()) {
    console.error('midtrans.currency_mismatch', {
      orderId: order.id,
      midtransOrderId,
      expectedCurrency: order.currency,
      currency,
    })
    throw new MidtransPaymentValidationError('Midtrans currency does not match the local order currency.', {
      orderId: order.id,
      midtransOrderId,
      expectedCurrency: order.currency,
      currency,
    })
  }
}

function getPaidOrderReconcilePlan(order: Order, accessRequest: AccessRequest | null): PaidReconcilePlan {
  if (!accessRequest) {
    return {
      orderUpdates: undefined,
      accessRequestUpdates: undefined,
      accessStatusChanged: false,
      refundRequired: false,
    }
  }

  if (
    accessRequest.status === 'pending_payment' &&
    order.payoutStatus === 'NOT_ELIGIBLE' &&
    canTransitionAccessRequestStatus(accessRequest.status, 'pending')
  ) {
    return {
      orderUpdates: undefined,
      accessRequestUpdates: { status: 'pending' },
      accessStatusChanged: true,
      refundRequired: false,
    }
  }

  if (
    accessRequest.status === 'cancelled' ||
    accessRequest.status === 'rejected' ||
    ((accessRequest.status === 'approved' || accessRequest.status === 'revoked') && order.payoutStatus === 'NOT_ELIGIBLE')
  ) {
    if (!canMarkRefundRequired(order)) {
      return {
        orderUpdates: undefined,
        accessRequestUpdates: undefined,
        accessStatusChanged: false,
        refundRequired: false,
      }
    }

    return {
      orderUpdates: markRefundRequired(order, new Date().toISOString()),
      accessRequestUpdates: undefined,
      accessStatusChanged: false,
      refundRequired: order.payoutStatus !== 'REFUND_REQUIRED',
    }
  }

  return {
    orderUpdates: undefined,
    accessRequestUpdates: undefined,
    accessStatusChanged: false,
    refundRequired: false,
  }
}

function getPaymentSyncAuditLog(
  result: PaymentOrderSyncResult,
  paymentStatus: PaymentStatus,
  auditContext: PaymentSyncAuditContext | undefined
): AuditLogInput | undefined {
  if (!auditContext) return undefined
  if (
    result.duplicate &&
    !result.accessStatusChanged &&
    !result.refundRequired &&
    !result.latePaidAfterCancellation
  ) {
    return undefined
  }

  let action = `payment.${paymentStatus.toLowerCase()}`
  let details = `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`

  if (result.latePaidAfterCancellation) {
    action = 'payment.late_paid_refund_required'
    details = `Order ${result.order.midtransOrderId} was paid after local cancellation; manual refund review required`
  } else if (paymentStatus === 'PAID' && result.refundRequired) {
    action = 'payment.refund_required'
    details = `Order ${result.order.midtransOrderId} paid status requires manual refund review`
  } else if (auditContext.source === 'reconcile') {
    action = 'payment.reconciled'
    details = `Order ${result.order.midtransOrderId} reconciled to ${result.order.paymentStatus}`
  } else if (result.duplicate && paymentStatus === 'PAID' && result.accessStatusChanged) {
    action = 'payment.paid_reconciled'
    details = `Order ${result.order.midtransOrderId} duplicate paid status reconciled access request`
  } else if (paymentStatus === 'PAID') {
    action = 'payment.paid'
    details = `Order ${result.order.midtransOrderId} paid; waiting for owner approval`
  } else if (paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIAL_REFUND') {
    action = 'payment.refund_status'
    details = `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`
  } else if (paymentStatus === 'CHARGEBACK' || paymentStatus === 'PARTIAL_CHARGEBACK') {
    action = 'payment.chargeback_status'
    details = `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`
  }

  return {
    actorId: auditContext.actorId,
    actorName: auditContext.actorName,
    actorRole: auditContext.actorRole,
    action,
    targetType: 'access_request',
    targetId: result.order.accessRequestId,
    outcome: 'success',
    details,
  }
}

function withAudit<T extends PaymentOrderSyncResult>(
  result: T,
  paymentStatus: PaymentStatus,
  auditContext: PaymentSyncAuditContext | undefined
): { result: T; auditLog?: AuditLogInput } {
  return {
    result,
    auditLog: getPaymentSyncAuditLog(result, paymentStatus, auditContext),
  }
}

export async function applyMidtransStatusToOrder(
  statusResponse: Record<string, unknown>,
  auditContext?: PaymentSyncAuditContext
): Promise<PaymentOrderSyncResult | null> {
  const midtransOrderId = getMidtransOrderId(statusResponse)
  const paymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)
  const transactionStatus = asString(statusResponse.transaction_status)
  const fraudStatus = asString(statusResponse.fraud_status)

  console.info('midtrans.status_received', {
    midtransOrderId,
    transactionStatus,
    fraudStatus,
  })

  if (!midtransOrderId) return null

  if (!paymentStatus) {
    console.warn('midtrans.status_ignored_unknown', {
      midtransOrderId,
      transactionStatus,
      fraudStatus,
    })
    return null
  }

  const result = await ServerDataStore.runPaymentSyncOperation(
    midtransOrderId,
    async ({ order, accessRequest }: PaymentSyncState): Promise<PaymentSyncPlan<PaymentOrderSyncResult>> => {
      console.info('midtrans.local_order_lookup', {
        midtransOrderId,
        found: true,
        orderId: order.id,
      })

      validateMidtransPaymentResponse(statusResponse, order)

      const transitionKind = getOrderStatusTransitionKind(order.paymentStatus, paymentStatus)
      const paymentType = asString(statusResponse.payment_type)

      if (transitionKind === 'DUPLICATE') {
        console.info('midtrans.status_duplicate', {
          orderId: order.id,
          midtransOrderId,
          paymentStatus,
        })

        if (paymentStatus === 'PAID') {
          const reconcilePlan = getPaidOrderReconcilePlan(order, accessRequest)
          const plannedOrder = reconcilePlan.orderUpdates ? { ...order, ...reconcilePlan.orderUpdates } : order
          const plannedAccessRequest =
            accessRequest && reconcilePlan.accessRequestUpdates
              ? { ...accessRequest, ...reconcilePlan.accessRequestUpdates }
              : accessRequest
          const { result: syncResult, auditLog } = withAudit(
            {
              order: plannedOrder,
              access: { request: plannedAccessRequest },
              orderStatusChanged: false,
              accessStatusChanged: reconcilePlan.accessStatusChanged,
              refundRequired: reconcilePlan.refundRequired,
              duplicate: true,
              latePaidAfterCancellation: false,
            },
            paymentStatus,
            auditContext
          )

          return {
            orderUpdates: reconcilePlan.orderUpdates,
            accessRequestUpdates: reconcilePlan.accessRequestUpdates,
            auditLog,
            getResult: state => ({
              ...syncResult,
              order: state.order,
              access: { request: state.accessRequest },
            }),
          }
        }

        const { result: syncResult, auditLog } = withAudit(
          {
            order,
            access: null,
            orderStatusChanged: false,
            accessStatusChanged: false,
            refundRequired: false,
            duplicate: true,
            latePaidAfterCancellation: false,
          },
          paymentStatus,
          auditContext
        )

        return {
          auditLog,
          getResult: () => syncResult,
        }
      }

      if (transitionKind === 'LATE_PAID_AFTER_LOCAL_CANCEL') {
        console.warn('midtrans.late_paid_after_local_cancel', {
          orderId: order.id,
          midtransOrderId,
          currentPaymentStatus: order.paymentStatus,
          nextPaymentStatus: paymentStatus,
          payoutStatus: order.payoutStatus,
        })

        const orderUpdates = markLatePaidAfterLocalCancel(order, paymentType, new Date().toISOString())
        const plannedOrder = { ...order, ...orderUpdates }
        const canCancelAccessRequest = accessRequest
          ? canTransitionAccessRequestStatus(accessRequest.status, 'cancelled')
          : false
        const accessRequestUpdates: Partial<AccessRequest> | undefined = canCancelAccessRequest
          ? { status: 'cancelled' }
          : undefined
        const plannedAccessRequest =
          accessRequest && accessRequestUpdates ? { ...accessRequest, ...accessRequestUpdates } : accessRequest
        const { result: syncResult, auditLog } = withAudit(
          {
            order: plannedOrder,
            access: { request: plannedAccessRequest },
            orderStatusChanged: true,
            accessStatusChanged: Boolean(accessRequestUpdates),
            refundRequired: plannedOrder.payoutStatus === 'REFUND_REQUIRED' && canMovePayoutStatusToRefundRequired(order.payoutStatus),
            duplicate: false,
            latePaidAfterCancellation: true,
          },
          paymentStatus,
          auditContext
        )

        return {
          orderUpdates,
          accessRequestUpdates,
          auditLog,
          getResult: state => ({
            ...syncResult,
            order: state.order,
            access: { request: state.accessRequest },
          }),
        }
      }

      if (transitionKind === 'INVALID') {
        console.warn('midtrans.status_transition_ignored', {
          orderId: order.id,
          midtransOrderId,
          currentPaymentStatus: order.paymentStatus,
          nextPaymentStatus: paymentStatus,
        })
        return {
          getResult: () => ({
            order,
            access: null,
            orderStatusChanged: false,
            accessStatusChanged: false,
            refundRequired: false,
            duplicate: false,
            latePaidAfterCancellation: false,
          }),
        }
      }

      const baseOrderUpdates = getPaymentUpdate(order, paymentStatus, paymentType, new Date().toISOString())
      const plannedBaseOrder = { ...order, ...baseOrderUpdates }

      if (paymentStatus === 'PAID') {
        const reconcilePlan = getPaidOrderReconcilePlan(plannedBaseOrder, accessRequest)
        const orderUpdates = {
          ...baseOrderUpdates,
          ...reconcilePlan.orderUpdates,
        }
        const plannedOrder = { ...order, ...orderUpdates }
        const plannedAccessRequest =
          accessRequest && reconcilePlan.accessRequestUpdates
            ? { ...accessRequest, ...reconcilePlan.accessRequestUpdates }
            : accessRequest
        const { result: syncResult, auditLog } = withAudit(
          {
            order: plannedOrder,
            access: { request: plannedAccessRequest },
            orderStatusChanged: true,
            accessStatusChanged: reconcilePlan.accessStatusChanged,
            refundRequired: reconcilePlan.refundRequired,
            duplicate: false,
            latePaidAfterCancellation: false,
          },
          paymentStatus,
          auditContext
        )

        return {
          orderUpdates,
          accessRequestUpdates: reconcilePlan.accessRequestUpdates,
          auditLog,
          getResult: state => ({
            ...syncResult,
            order: state.order,
            access: { request: state.accessRequest },
          }),
        }
      }

      const { result: syncResult, auditLog } = withAudit(
        {
          order: plannedBaseOrder,
          access: null,
          orderStatusChanged: true,
          accessStatusChanged: false,
          refundRequired: false,
          duplicate: false,
          latePaidAfterCancellation: false,
        },
        paymentStatus,
        auditContext
      )

      return {
        orderUpdates: baseOrderUpdates,
        auditLog,
        getResult: state => ({
          ...syncResult,
          order: state.order,
        }),
      }
    }
  )

  if (!result) {
    console.info('midtrans.local_order_lookup', {
      midtransOrderId,
      found: false,
    })
  }

  if (result?.orderStatusChanged) {
    console.info('midtrans.status_transition_applied', {
      orderId: result.order.id,
      midtransOrderId,
      paymentStatus: result.order.paymentStatus,
      payoutStatus: result.order.payoutStatus,
    })
  }

  return result
}
