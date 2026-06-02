'use client'

import { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { UserRole } from '@/lib/mock-data'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface DashboardLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
  userRole?: UserRole
  userName?: string
}

export function DashboardLayout({ 
  children, 
  title,
  subtitle,
  userRole: propsUserRole,
  userName: propsUserName,
}: DashboardLayoutProps) {
  const { userRole: authUserRole, userName: authUserName, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Use props if provided, otherwise fall back to auth context
  const userRole = propsUserRole || authUserRole
  const userName = propsUserName || authUserName

  useEffect(() => {
    if (!isLoading && (!userRole || !userName)) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [isLoading, pathname, router, userName, userRole])

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (!userRole || !userName) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userRole={userRole} />
      <div className="pl-60">
        <TopBar title={title} userRole={userRole} userName={userName} />
        <main className="p-6">
          {subtitle && (
            <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

interface KPICardProps {
  title: string
  value: string | number
  icon: ReactNode
  trend?: {
    value: number
    label: string
  }
  className?: string
}

export function KPICard({ title, value, icon, trend, className }: KPICardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
          {trend && (
            <p className={cn(
              'mt-1 text-xs',
              trend.value >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  )
}

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'suspended' | 'archived' | 'pending' | 'approved' | 'rejected' | 'revoked' | 'cancelled'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    online: 'bg-green-50 text-green-700 border-green-200',
    offline: 'bg-slate-100 text-slate-600 border-slate-200',
    suspended: 'bg-amber-50 text-amber-700 border-amber-200',
    archived: 'bg-slate-100 text-slate-600 border-slate-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    revoked: 'bg-slate-100 text-slate-600 border-slate-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
      styles[status]
    )}>
      {status === 'online' && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-600" />}
      {status}
    </span>
  )
}
