import { NextResponse } from 'next/server'
import { clearSessionCookie, destroySessionFromRequest, getCurrentUser } from '@/lib/auth-server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function POST(request: Request) {
  const user = await getCurrentUser(request)
  await destroySessionFromRequest(request)

  if (user) {
    await ServerDataStore.logAction(user.id, user.name, user.role, 'auth.logged_out', 'user', user.id)
  }

  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)
  return response
}
