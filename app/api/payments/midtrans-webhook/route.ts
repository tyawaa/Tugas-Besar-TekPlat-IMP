import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import {
  applyMidtransStatusToOrder,
  getMidtransConfig,
  getMidtransOrderId,
  getPaymentStatusFromMidtransResponse,
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
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }

  const midtransOrderId = getMidtransOrderId(statusResponse)
  const paymentStatus = getPaymentStatusFromMidtransResponse(statusResponse)

  if (!midtransOrderId || !paymentStatus) {
    return NextResponse.json({ error: 'Unsupported Midtrans notification.' }, { status: 400 })
  }

  const result = await applyMidtransStatusToOrder(statusResponse)
  if (!result) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (paymentStatus === 'PAID') {
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
  } else if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
    await ServerDataStore.logAction(
      'midtrans',
      'Midtrans Webhook',
      'admin',
      paymentStatus === 'EXPIRED' ? 'payment.expired' : 'payment.failed',
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
