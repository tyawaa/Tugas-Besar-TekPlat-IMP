'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect to the pair device page
export default function RegisterDevicePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/devices/pair')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting to Pair Device...</p>
    </div>
  )
}
