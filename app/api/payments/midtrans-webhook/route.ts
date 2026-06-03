import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import {
  applyMidtransStatusToOrder,
  getMidtransConfig,
  getMidtransOrderId,
  getPaymentStatusFromMidtransResponse,
  MidtransPaymentValidationError,
} from '@/lib/midtrans-payments'
import { ServerDataStore } from '@/lib/server-data-store'

export const dynamic = 'force-dynamic'

const MIDTRANS_NOTIFICATION_RETRY_ATTEMPTS = [1, 2]

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function getVerifiedMidtransNotification(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  notification: Record<string, unknown>,
  transactionId: string
): Promise<Record<string, unknown>> {
  let lastError: unknown = null

  for (const attempt of MIDTRANS_NOTIFICATION_RETRY_ATTEMPTS) {
    try {
      return await coreApi.transaction.notification(notification)
    } catch (error) {
      lastError = error
      console.warn('midtrans.webhook_verification_failed', {
        transactionId,
        orderId: asString(notification.order_id),
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Failed to verify Midtrans webhook notification for transaction ${transactionId}.`)
}

export async function POST(request: Request) {
  let notification: Record<string, unknown>
  try {
    notification = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const notificationTransactionId = asString(notification.transaction_id)
  if (!notificationTransactionId) {
    return NextResponse.json({ error: 'Midtrans notification transaction_id is required.' }, { status: 400 })
  }

  const coreApi = new midtransClient.CoreApi(getMidtransConfig())
  let statusResponse: Record<string, unknown>
  try {
    statusResponse = await getVerifiedMidtransNotification(coreApi, notification, notificationTransactionId)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to verify Midtrans notification.',
        context: {
          transactionId: notificationTransactionId,
          orderId: asString(notification.order_id),
        },
      },
      { status: 502 }
    )
  }

  const midtransOrderId = getMidtransOrderId(statusResponse)
  const paymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)

  if (!midtransOrderId || !paymentStatus) {
    console.warn('midtrans.webhook_ignored_unknown_status', {
      notificationTransactionId,
      midtransOrderId,
      transactionStatus: asString(statusResponse.transaction_status),
      fraudStatus: asString(statusResponse.fraud_status),
    })
    return NextResponse.json({ success: true, ignored: true })
  }

  let result: Awaited<ReturnType<typeof applyMidtransStatusToOrder>>
  try {
    result = await applyMidtransStatusToOrder(statusResponse)
  } catch (error) {
    if (error instanceof MidtransPaymentValidationError) {
      console.error('midtrans.webhook_validation_failed', {
        notificationTransactionId,
        midtransOrderId,
        validationContext: error.context,
      })
      return NextResponse.json({ error: 'Midtrans payment data failed validation.' }, { status: 400 })
    }

    console.error('midtrans.webhook_apply_failed', {
      notificationTransactionId,
      midtransOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to apply Midtrans notification.' }, { status: 500 })
  }

  if (!result) {
    console.warn('midtrans.webhook_order_not_found', {
      notificationTransactionId,
      midtransOrderId,
    })
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (
    result.duplicate &&
    !result.accessStatusChanged &&
    !result.refundRequired &&
    !result.latePaidAfterCancellation
  ) {
    console.info('midtrans.webhook_duplicate_noop', {
      notificationTransactionId,
      midtransOrderId,
      paymentStatus,
    })
    return NextResponse.json({
      success: true,
      duplicate: true,
      order: result.order,
      access: result.access,
    })
  }

  if (result.latePaidAfterCancellation) {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.late_paid_refund_required',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} was paid after local cancellation; manual refund review required`
    )
  } else if (paymentStatus === 'PAID' && result.refundRequired) {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.refund_required',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} paid status requires manual refund review`
    )
  } else if (result.duplicate && paymentStatus === 'PAID' && result.accessStatusChanged) {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.paid_reconciled',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} duplicate paid status reconciled access request`
    )
  } else if (paymentStatus === 'PAID') {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.paid',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} paid; waiting for owner approval`
    )
  } else if (
    paymentStatus === 'EXPIRED' ||
    paymentStatus === 'FAILED' ||
    paymentStatus === 'CANCELLED' ||
    paymentStatus === 'DENIED'
  ) {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      `payment.${paymentStatus.toLowerCase()}`,
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`
    )
  } else if (paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIAL_REFUND') {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.refund_status',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`
    )
  } else if (paymentStatus === 'CHARGEBACK' || paymentStatus === 'PARTIAL_CHARGEBACK') {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      'payment.chargeback_status',
      'access_request',
      result.order.accessRequestId,
      'success',
      `Order ${result.order.midtransOrderId} ${paymentStatus.toLowerCase()}`
    )
  }

  return NextResponse.json({
    success: true,
    order: result.order,
    access: result.access,
  })
}
