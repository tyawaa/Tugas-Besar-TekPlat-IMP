'use client'

import { Suspense } from 'react'
import { AuditLogsContent } from '@/components/audit-logs-content'

export default function AuditLogsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuditLogsContent />
    </Suspense>
  )
}
