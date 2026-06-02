import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'
import { hasUserRole, toPublicUser } from '@/lib/auth-types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser

  if (!hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const users = await ServerDataStore.getAllUsers()
  return NextResponse.json(users.map(toPublicUser))
}
