import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Radio,
  Cpu,
  Code,
  Shield,
  ArrowRight,
  CheckCircle,
  ChevronRight,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Radio className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">IoTBridge</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Button asChild size="sm">
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Radio className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            IoTBridge
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
            A campus IoT data-sharing platform for device owners and developers.
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-pretty text-muted-foreground">
            Device Owners can register IoT devices and publish telemetry data. Developers can request access and consume the data through secure APIs.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard/catalog">
                View Device Catalog
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="border-t border-border bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Three Roles, One Platform
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              IoTBridge connects different stakeholders in the campus IoT ecosystem.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Cpu className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">Device Owner</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Register and manage IoT devices. Control data visibility and approve access requests from developers.
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Register devices
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Send telemetry data
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Manage access grants
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10">
                  <Code className="h-6 w-6 text-secondary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">Developer</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Browse available devices, request data access, and integrate IoT data into your applications via API.
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Browse device catalog
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Request data access
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Consume data via API
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-border bg-card sm:col-span-2 lg:col-span-1">
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime/10">
                  <Shield className="h-6 w-6 text-lime" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">Administrator</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Monitor platform health, manage users and devices, and review audit logs for compliance.
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Platform monitoring
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    User management
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Audit logging
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Flow Section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              A simple flow from device registration to API consumption.
            </p>
          </div>
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <FlowStep number={1} title="Device Registered" description="Owner adds device" />
            <ChevronRight className="hidden h-5 w-5 text-muted-foreground sm:block" />
            <FlowStep number={2} title="Telemetry Sent" description="Data flows in" />
            <ChevronRight className="hidden h-5 w-5 text-muted-foreground sm:block" />
            <FlowStep number={3} title="Access Requested" description="Developer asks" />
            <ChevronRight className="hidden h-5 w-5 text-muted-foreground sm:block" />
            <FlowStep number={4} title="Owner Approves" description="Grant issued" />
            <ChevronRight className="hidden h-5 w-5 text-muted-foreground sm:block" />
            <FlowStep number={5} title="API Access" description="Data consumed" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-midnight py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Join IoTBridge and start sharing or consuming IoT data on campus.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
              <Link href="/register">Create Account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-slate-600 text-foreground hover:bg-muted">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">IoTBridge</span>
            </div>
            <p className="text-sm text-muted-foreground">
              A campus IoT data-sharing platform project.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FlowStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {number}
      </div>
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
