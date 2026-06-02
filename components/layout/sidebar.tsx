'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Cpu,
  BookOpen,
  KeyRound,
  Database,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Radio,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  userRole: 'device_owner' | 'developer' | 'admin'
}

const menuItems = {
  device_owner: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/devices', label: 'My Devices', icon: Cpu },
    { href: '/dashboard/devices/pair', label: 'Pair Device', icon: Plus },
    { href: '/dashboard/access-requests', label: 'Access Requests', icon: KeyRound },
    { href: '/dashboard/api-docs', label: 'Developer API', icon: FileText },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
  developer: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/catalog', label: 'Device Catalog', icon: BookOpen },
    { href: '/dashboard/data-explorer', label: 'Data Explorer', icon: Database },
    { href: '/dashboard/api-docs', label: 'Developer API', icon: FileText },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
  admin: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/devices', label: 'All Devices', icon: Cpu },
    { href: '/dashboard/access-requests', label: 'Access Requests', icon: KeyRound },
    { href: '/dashboard/audit-logs', label: 'Audit Logs', icon: FileText },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const items = menuItems[userRole]

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Radio className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">IoTBridge</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                  {isActive && !collapsed && <span className="absolute right-2 h-2 w-2 rounded-full bg-lime" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse Button */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
