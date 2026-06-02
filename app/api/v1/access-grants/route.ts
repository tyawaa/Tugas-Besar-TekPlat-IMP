import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET() {
  const grants = await ServerDataStore.getAllAccessGrants()
  return NextResponse.json(grants)
}
