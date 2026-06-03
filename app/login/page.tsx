'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { requestPasswordReset, confirmPasswordReset } from '@/lib/api'
import { Radio, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false)
  const [twoFactorDevCode, setTwoFactorDevCode] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetDevCode, setResetDevCode] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [error, setError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)

  const getApiError = (err: unknown) => {
    if (!(err instanceof Error)) return 'Failed to process request.'
    const match = err.message.match(/"error"\s*:\s*"([^"]+)"/)
    return match?.[1] || err.message
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await login(email, password, requiresTwoFactor ? twoFactorCode : undefined)
      if (result.requiresTwoFactor) {
        setRequiresTwoFactor(true)
        setTwoFactorDevCode(result.devCode || '')
        setError(result.message || 'Enter the verification code sent to your email.')
        return
      }
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      router.push(redirect?.startsWith('/') ? redirect : '/dashboard')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetRequest = async () => {
    setError('')
    setResetMessage('')
    setIsResetSubmitting(true)
    try {
      const result = await requestPasswordReset(email)
      setResetSent(true)
      setResetDevCode(result.devCode || '')
      setResetMessage(result.message)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setIsResetSubmitting(false)
    }
  }

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResetMessage('')
    setIsResetSubmitting(true)
    try {
      await confirmPasswordReset({ email, code: resetCode, password: resetPassword })
      setShowReset(false)
      setResetSent(false)
      setResetCode('')
      setResetPassword('')
      setPassword('')
      setResetDevCode('')
      setResetMessage('')
      setError('Password reset successful. Sign in with your new password.')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setIsResetSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <Link 
          href="/" 
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Radio className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">IoTBridge</span>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
            <p className="mt-3 text-xs text-muted-foreground">
              Sign in with the account you created.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@campus.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background"
                  disabled={requiresTwoFactor}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background"
                  disabled={requiresTwoFactor}
                  required
                />
              </div>
              {requiresTwoFactor && (
                <div className="space-y-2">
                  <Label htmlFor="twoFactorCode">Verification Code</Label>
                  <Input
                    id="twoFactorCode"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="bg-background"
                    required
                  />
                  {twoFactorDevCode && (
                    <p className="text-xs text-muted-foreground">
                      Development code: <span className="font-mono text-foreground">{twoFactorDevCode}</span>
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : requiresTwoFactor ? 'Verify and sign in' : 'Sign in'}
              </Button>
              {requiresTwoFactor && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setRequiresTwoFactor(false)
                    setTwoFactorCode('')
                    setTwoFactorDevCode('')
                    setError('')
                  }}
                >
                  Use another account
                </Button>
              )}
            </form>

            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setShowReset((value) => !value)
                  setError('')
                  setResetMessage('')
                }}
              >
                Forgot password?
              </button>
            </div>

            {showReset && (
              <div className="mt-6 space-y-4">
                <Separator />
                <div className="space-y-2">
                  <h2 className="text-sm font-medium">Reset password</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter your email above, request a code, then set a new password.
                  </p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={handleResetRequest} disabled={!email || isResetSubmitting}>
                  {isResetSubmitting ? 'Sending...' : resetSent ? 'Send Code Again' : 'Send Reset Code'}
                </Button>
                {resetMessage && (
                  <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {resetMessage}
                    {resetDevCode && (
                      <span className="mt-1 block">
                        Development code: <span className="font-mono text-foreground">{resetDevCode}</span>
                      </span>
                    )}
                  </p>
                )}
                {resetSent && (
                  <form onSubmit={handleResetConfirm} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="resetCode">Reset Code</Label>
                      <Input id="resetCode" inputMode="numeric" value={resetCode} onChange={(e) => setResetCode(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resetPassword">New Password</Label>
                      <Input id="resetPassword" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={isResetSubmitting}>
                      {isResetSubmitting ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </form>
                )}
              </div>
            )}

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">{"Don't have an account? "}</span>
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
