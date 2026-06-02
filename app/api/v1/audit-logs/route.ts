import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'
import { requireCurrentUser } from '@/lib/auth-server'
import { hasUserRole } from '@/lib/auth-types'

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser(request)
  if (currentUser instanceof NextResponse) return currentUser
  if (!hasUserRole(currentUser, 'admin')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const logs = await ServerDataStore.getAllAuditLogs()
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return NextResponse.json(logs)
}
