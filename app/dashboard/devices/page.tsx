'use client'

import { Suspense } from 'react'
import { DevicesContent } from '@/components/devices-content'

export default function DevicesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DevicesContent />
    </Suspense>
  )
}
