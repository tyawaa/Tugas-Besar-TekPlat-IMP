import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  const orders = await ServerDataStore.getAllOrders()

  if (hasUserRole(currentUser, 'admin')) {
    return NextResponse.json(orders)
  }

  if (hasUserRole(currentUser, 'device_owner')) {
    return NextResponse.json(orders.filter(order => order.sellerId === currentUser.id))
  }

  if (hasUserRole(currentUser, 'developer')) {
    return NextResponse.json(orders.filter(order => order.buyerId === currentUser.id))
  }

  return NextResponse.json([])
}
