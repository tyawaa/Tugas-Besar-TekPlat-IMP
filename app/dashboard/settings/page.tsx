'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'

export default function SettingsPage() {
  const { userName, userEmail, userRole, logout } = useAuth()
  const router = useRouter()

  const getRoleDisplayName = (role: string | null) => {
    switch (role) {
      case 'device_owner': return 'Device Owner'
      case 'developer': return 'Developer'
      case 'admin': return 'Admin'
      default: return role || 'Unknown'
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const showDemoNotice = (setting: string) => {
    toast({
      title: `${setting} is not connected yet`,
      description: 'Profile editing is not connected yet, but sign-in uses backend sessions.',
    })
  }

  return (
    <DashboardLayout 
      title="Settings" 
      subtitle="Manage your account preferences and security settings."
    >
      <div className="max-w-2xl space-y-6">
        {/* Account Section */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <p className="text-sm text-muted-foreground mt-1">{userName || 'Not set'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <p className="text-sm text-muted-foreground mt-1">{userEmail || 'Not set'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <p className="text-sm text-muted-foreground mt-1">{getRoleDisplayName(userRole)}</p>
            </div>
            <Separator />
            <Button variant="outline" onClick={() => showDemoNotice('Edit profile')}>
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        {/* Security Section */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your security settings and password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => showDemoNotice('Change password')}>
              Change Password
            </Button>
            <Button variant="outline" onClick={() => showDemoNotice('Two-factor authentication')}>
              Enable Two-Factor Authentication
            </Button>
          </CardContent>
        </Card>

        {/* Session */}
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Manage your active sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
