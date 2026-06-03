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

export async function POST(request: Request) {
  let notification: Record<string, unknown>
  try {
    notification = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const coreApi = new midtransClient.CoreApi(getMidtransConfig())
  const statusResponse = await coreApi.transaction.notification(notification).catch(() => notification)

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
