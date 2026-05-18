'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio, Cpu, Code, ArrowLeft } from 'lucide-react'

const MOCK_USERS = {
  device_owner: { id: 'u1', name: 'Ahmad Fauzi', email: 'ahmad@campus.edu' },
  developer: { id: 'u2', name: 'Siti Rahayu', email: 'siti@campus.edu' },
  admin: { id: 'u5', name: 'Admin Campus', email: 'admin@campus.edu' },
}

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<'device_owner' | 'developer' | 'admin' | null>(null)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const role = selectedRole || 'device_owner'
    const user = MOCK_USERS[role]
    login(user.id, user.name, user.email, role)
    const redirect = new URLSearchParams(window.location.search).get('redirect')
    router.push(redirect?.startsWith('/') ? redirect : '/dashboard')
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
              Demo mode: select a role to preview the role-based dashboard
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
                  required
                />
              </div>

              {/* Role Selection for Demo */}
              <div className="space-y-2">
                <Label>Demo: Select Role</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('device_owner')}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      selectedRole === 'device_owner'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Cpu className="h-5 w-5" />
                    <span className="text-xs font-medium">Owner</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('developer')}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      selectedRole === 'developer'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Code className="h-5 w-5" />
                    <span className="text-xs font-medium">Developer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('admin')}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      selectedRole === 'admin'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Radio className="h-5 w-5" />
                    <span className="text-xs font-medium">Admin</span>
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>

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
