'use client'

import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DeviceOwnerDashboard } from '@/components/dashboards/device-owner-dashboard'
import { DeveloperDashboard } from '@/components/dashboards/developer-dashboard'
import { AdminDashboard } from '@/components/dashboards/admin-dashboard'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardPage() {
  const { userRole, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !userRole) {
      router.replace('/login?redirect=%2Fdashboard')
    }
  }, [isLoading, userRole, router])

  if (isLoading || !userRole) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  const titles = {
    device_owner: 'Device Owner Dashboard',
    developer: 'Developer Dashboard',
    admin: 'Admin Dashboard',
  }

  return (
    <DashboardLayout title={titles[userRole]}>
      {userRole === 'device_owner' && <DeviceOwnerDashboard />}
      {userRole === 'developer' && <DeveloperDashboard />}
      {userRole === 'admin' && <AdminDashboard />}
    </DashboardLayout>
  )
}
