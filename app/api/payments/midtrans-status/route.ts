import { NextResponse } from 'next/server'
import midtransClient from 'midtrans-client'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import {
  applyMidtransStatusToOrder,
  getMidtransConfig,
  MidtransPaymentValidationError,
} from '@/lib/midtrans-payments'
import { ServerDataStore } from '@/lib/server-data-store'

export const dynamic = 'force-dynamic'

const MIDTRANS_STATUS_RETRY_ATTEMPTS = [1, 2]

async function getMidtransStatusWithRetry(
  coreApi: InstanceType<typeof midtransClient.CoreApi>,
  midtransOrderId: string,
  accessRequestId: string
): Promise<Record<string, unknown>> {
  let lastError: unknown = null

  for (const attempt of MIDTRANS_STATUS_RETRY_ATTEMPTS) {
    try {
      return await coreApi.transaction.status(midtransOrderId)
    } catch (error) {
      lastError = error
      console.warn('midtrans.status_sync_failed', {
        accessRequestId,
        midtransOrderId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Failed to sync Midtrans status for order ${midtransOrderId}.`)
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const accessRequestId = typeof body.accessRequestId === 'string' ? body.accessRequestId.trim() : ''
  if (!accessRequestId) {
    return NextResponse.json({ error: 'accessRequestId is required.' }, { status: 400 })
  }

  const accessRequest = await ServerDataStore.getAccessRequestById(accessRequestId)
  if (!accessRequest) {
    return NextResponse.json({ error: 'Access request not found.' }, { status: 404 })
  }

  if (!hasUserRole(currentUser, 'admin') && accessRequest.developerId !== currentUser.id) {
    return NextResponse.json({ error: 'You can only sync your own payment status.' }, { status: 403 })
  }

  const order = await ServerDataStore.getOrderByAccessRequestId(accessRequest.id)
  if (!order) {
    return NextResponse.json({ error: 'Midtrans order not found for this access request.' }, { status: 404 })
  }

  const coreApi = new midtransClient.CoreApi(getMidtransConfig())
  let statusResponse: Record<string, unknown>
  try {
    statusResponse = await getMidtransStatusWithRetry(coreApi, order.midtransOrderId, accessRequest.id)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to sync Midtrans payment status.',
        context: {
          accessRequestId: accessRequest.id,
          midtransOrderId: order.midtransOrderId,
        },
      },
      { status: 502 }
    )
  }

  let result: Awaited<ReturnType<typeof applyMidtransStatusToOrder>>
  try {
    result = await applyMidtransStatusToOrder(statusResponse)
  } catch (error) {
    if (error instanceof MidtransPaymentValidationError) {
      console.error('midtrans.status_validation_failed', {
        accessRequestId: accessRequest.id,
        midtransOrderId: order.midtransOrderId,
        validationContext: error.context,
      })
      return NextResponse.json({ error: 'Midtrans payment data failed validation.' }, { status: 400 })
    }

    console.error('midtrans.status_apply_failed', {
      accessRequestId: accessRequest.id,
      midtransOrderId: order.midtransOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Failed to apply Midtrans payment status.' }, { status: 500 })
  }

  if (!result) {
    console.warn('midtrans.status_apply_ignored', {
      accessRequestId: accessRequest.id,
      midtransOrderId: order.midtransOrderId,
      responseOrderId: typeof statusResponse.order_id === 'string' ? statusResponse.order_id : '',
      transactionStatus: typeof statusResponse.transaction_status === 'string' ? statusResponse.transaction_status : '',
    })
    return NextResponse.json({ error: 'Midtrans status response could not be applied.' }, { status: 422 })
  }

  return NextResponse.json(result)
}
