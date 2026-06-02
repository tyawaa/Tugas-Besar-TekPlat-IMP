'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio, Cpu, Code, ArrowLeft, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<'device_owner' | 'developer'>('device_owner')

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault()
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    login(userId, name.trim(), email.trim(), selectedRole)
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
            <CardTitle className="text-xl">Create an account</CardTitle>
            <CardDescription>
              Join IoTBridge as a device owner or developer
            </CardDescription>
            <p className="mt-3 text-xs text-muted-foreground">
              This MVP creates a local demo session. Backend authentication will be connected later.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Role Selection */}
              <div className="space-y-3">
                <Label>I want to join as</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('device_owner')}
                    className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
                      selectedRole === 'device_owner'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {selectedRole === 'device_owner' && (
                      <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-primary" />
                    )}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      selectedRole === 'device_owner' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Device Owner</p>
                      <p className="text-xs text-muted-foreground">Register and manage IoT devices</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('developer')}
                    className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
                      selectedRole === 'developer'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {selectedRole === 'developer' && (
                      <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-primary" />
                    )}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      selectedRole === 'developer' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <Code className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Developer</p>
                      <p className="text-xs text-muted-foreground">Access and use IoT data via API</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background"
                  required
                />
              </div>

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
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background"
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                Create Account
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
