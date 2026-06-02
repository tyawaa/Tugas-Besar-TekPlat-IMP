import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getCurrentUser(request)
  const response = NextResponse.json({ user })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
