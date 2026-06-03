'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LogOut, Mail, Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { changePassword, requestTwoFactorCode, updateProfile, updateTwoFactor } from '@/lib/api'

function getApiError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong.'
  const match = error.message.match(/"error"\s*:\s*"([^"]+)"/)
  return match?.[1] || error.message
}

export default function SettingsPage() {
  const {
    userName,
    userEmail,
    userRole,
    userRoles,
    twoFactorEnabled,
    refreshUser,
    logout,
  } = useAuth()
  const router = useRouter()
  const [profileName, setProfileName] = useState(userName || '')
  const [profileEmail, setProfileEmail] = useState(userEmail || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [twoFactorTarget, setTwoFactorTarget] = useState(twoFactorEnabled)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorDevCode, setTwoFactorDevCode] = useState('')
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isSavingTwoFactor, setIsSavingTwoFactor] = useState(false)

  useEffect(() => {
    setProfileName(userName || '')
    setProfileEmail(userEmail || '')
  }, [userName, userEmail])

  useEffect(() => {
    setTwoFactorTarget(twoFactorEnabled)
  }, [twoFactorEnabled])

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

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSavingProfile(true)
    try {
      const { user } = await updateProfile({ name: profileName, email: profileEmail })
      refreshUser(user)
      toast({ title: 'Profile updated', description: 'Your account information has been saved.' })
    } catch (error) {
      toast({ title: 'Profile update failed', description: getApiError(error), variant: 'destructive' })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      toast({ title: 'Password mismatch', description: 'Confirm password must match the new password.', variant: 'destructive' })
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password changed', description: 'Use your new password the next time you sign in.' })
    } catch (error) {
      toast({ title: 'Password change failed', description: getApiError(error), variant: 'destructive' })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleRequestTwoFactorCode = async (enabled: boolean) => {
    setTwoFactorTarget(enabled)
    setTwoFactorCode('')
    setTwoFactorDevCode('')
    setIsSavingTwoFactor(true)
    try {
      const result = await requestTwoFactorCode()
      setTwoFactorPending(true)
      setTwoFactorDevCode(result.devCode || '')
      toast({ title: 'Verification code ready', description: result.message })
    } catch (error) {
      setTwoFactorTarget(twoFactorEnabled)
      toast({ title: 'Could not send code', description: getApiError(error), variant: 'destructive' })
    } finally {
      setIsSavingTwoFactor(false)
    }
  }

  const handleConfirmTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSavingTwoFactor(true)
    try {
      const { user } = await updateTwoFactor({ enabled: twoFactorTarget, code: twoFactorCode })
      refreshUser(user)
      setTwoFactorPending(false)
      setTwoFactorCode('')
      setTwoFactorDevCode('')
      toast({
        title: twoFactorTarget ? 'Two-factor enabled' : 'Two-factor disabled',
        description: 'Your security settings have been updated.',
      })
    } catch (error) {
      toast({ title: 'Two-factor update failed', description: getApiError(error), variant: 'destructive' })
    } finally {
      setIsSavingTwoFactor(false)
    }
  }

  return (
    <DashboardLayout title="Settings" subtitle="Manage your account preferences and security settings.">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profileName">Name</Label>
                  <Input id="profileName" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profileEmail">Email</Label>
                  <Input id="profileEmail" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium">Active Mode</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{getRoleDisplayName(userRole)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Roles</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {userRoles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {getRoleDisplayName(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={isSavingProfile}>
                <Save className="mr-2 h-4 w-4" />
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your password and two-factor authentication</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
                </div>
              </div>
              <Button type="submit" variant="outline" disabled={isChangingPassword}>
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </form>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Email two-factor authentication
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {twoFactorEnabled ? 'Enabled. A code is required after your password.' : 'Disabled. Add an email code after password sign-in.'}
                  </p>
                </div>
                <Switch checked={twoFactorTarget} disabled={isSavingTwoFactor} onCheckedChange={handleRequestTwoFactorCode} />
              </div>

              {twoFactorPending && (
                <form onSubmit={handleConfirmTwoFactor} className="space-y-3 rounded-md border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="twoFactorCode">Verification Code</Label>
                    <Input id="twoFactorCode" inputMode="numeric" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder="6-digit code" required />
                    {twoFactorDevCode && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        Development code: <span className="font-mono text-foreground">{twoFactorDevCode}</span>
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={isSavingTwoFactor}>
                    {isSavingTwoFactor ? 'Confirming...' : twoFactorTarget ? 'Enable 2FA' : 'Disable 2FA'}
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Manage your active session</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
