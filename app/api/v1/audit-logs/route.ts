import { NextResponse } from 'next/server'
import { ServerDataStore } from '@/lib/server-data-store'

export async function GET() {
  const logs = ServerDataStore.getAllAuditLogs()
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return NextResponse.json(logs)
}
