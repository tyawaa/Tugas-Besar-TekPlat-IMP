'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, Search, Settings, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/hooks/use-toast'
import { UserRole } from '@/lib/mock-data'

interface TopBarProps {
  title: string
  userRole: 'device_owner' | 'developer' | 'admin'
  userName: string
}

const roleLabels: Record<UserRole, string> = {
  device_owner: 'Device Owner',
  developer: 'Developer',
  admin: 'Administrator',
}

export function TopBar({ title, userRole, userName }: TopBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { logout, userRoles, setActiveRole } = useAuth()

  const handleSignOut = async () => {
    await logout()
    router.push('/login')
  }

  const handleRoleChange = (role: UserRole) => {
    if (role === userRole) return
    setActiveRole(role)
    toast({
      title: `Switched to ${roleLabels[role]}`,
      description: 'Your dashboard navigation has been updated for this mode.',
    })
    if (pathname !== '/dashboard') {
      router.push('/dashboard')
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {userRoles.length > 1 && (
          <Select value={userRole} onValueChange={(value) => handleRoleChange(value as UserRole)}>
            <SelectTrigger className="hidden w-[170px] md:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {userRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-64 bg-card pl-9"
          />
        </div>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => toast({
            title: 'No new notifications',
            description: 'Your demo inbox is clear right now.',
          })}
          aria-label="Show notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-lime" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium">{userName}</p>
                <Badge variant="secondary" className="mt-0.5 text-xs font-normal">
                  {roleLabels[userRole]}
                </Badge>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            {userRoles.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Switch Mode</DropdownMenuLabel>
                {userRoles.map((role) => (
                  <DropdownMenuItem key={role} onClick={() => handleRoleChange(role)}>
                    {roleLabels[role]}
                    {role === userRole && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
