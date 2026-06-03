'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  KeyRound,
  Database,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Device, AccessGrant, AccessRequest } from '@/lib/mock-data'
import { getDevices, getAccessGrants, getAccessRequests } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { formatDistanceToNow } from 'date-fns'

function getLatestByDevice<T extends { deviceId: string; createdAt: string }>(items: T[]): T[] {
  const latestByDevice = new Map<string, T>()

  items.forEach(item => {
    const existing = latestByDevice.get(item.deviceId)
    if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
      latestByDevice.set(item.deviceId, item)
    }
  })

  return Array.from(latestByDevice.values())
}

function isAccessGrantActive(grant: AccessGrant): boolean {
  return new Date(grant.expiresAt).getTime() >= Date.now()
}

export function DeveloperDashboard() {
  const { userId } = useAuth()
  const [catalogDevices, setCatalogDevices] = useState<Device[]>([])
  const [myGrants, setMyGrants] = useState<AccessGrant[]>([])
  const [myPendingRequests, setMyPendingRequests] = useState<AccessRequest[]>([])
  const [allDevices, setAllDevices] = useState<Device[]>([])

  // Load data from API
  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        const [devices, grants, requests] = await Promise.all([
          getDevices(),
          getAccessGrants(),
          getAccessRequests(),
        ])

        setAllDevices(devices)
        setCatalogDevices(devices.filter((d) => d.visibility === 'catalog' && d.status !== 'archived'))
        setMyGrants(getLatestByDevice(grants.filter((grant) => grant.developerId === userId && isAccessGrantActive(grant))))
        const pending = requests.filter(
          (r) => r.developerId === userId && (r.status === 'pending' || r.status === 'pending_payment')
        )
        setMyPendingRequests(getLatestByDevice(pending))
      } catch (error) {
        console.error('Failed to load developer dashboard', error)
      }
    }

    loadData()

    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [userId])

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Available Devices"
          value={catalogDevices.length}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <KPICard
          title="Active Access"
          value={myGrants.length}
          icon={<KeyRound className="h-5 w-5" />}
        />
        <KPICard
          title="Pending Requests"
          value={myPendingRequests.length}
          icon={<Clock className="h-5 w-5" />}
        />
        <KPICard
          title="API Calls Today"
          value="1,234"
          icon={<Database className="h-5 w-5" />}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Access Devices */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">My Active Access</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/data-explorer">
                Open Data Explorer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {myGrants.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No active access grants yet.</p>
                <Button asChild variant="link" className="mt-2">
                  <Link href="/dashboard/catalog">Browse Device Catalog</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {myGrants.map((grant) => {
                  const device = allDevices.find((d) => d.id === grant.deviceId)
                  return (
                    <div
                      key={grant.id}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div>
                        <p className="font-medium text-foreground">{device?.name || grant.deviceId}</p>
                        <p className="text-sm text-muted-foreground">{device?.location || 'Unknown location'}</p>
                        <div className="mt-2 flex gap-1">
                          {grant.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Expires</p>
                        <p className="text-sm font-medium">{grant.expiresAt}</p>
                        <Button asChild size="sm" className="mt-2">
                          <Link href={`/dashboard/data-explorer?device=${grant.deviceId}`}>
                            View Data
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pending Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {myPendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests</p>
              ) : (
                <div className="space-y-4">
                  {myPendingRequests.map((request) => {
                    const device = allDevices.find((d) => d.id === request.deviceId)
                    return (
                      <div
                        key={request.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {device?.name || request.deviceId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                        </p>
                        <div className="mt-2">
                          <StatusBadge status={request.status} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Browse Catalog CTA */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground">Explore More Devices</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse the device catalog to discover IoT data sources available on campus.
              </p>
              <Button asChild className="mt-4 w-full bg-primary text-white hover:bg-primary/90">
                <Link href="/dashboard/catalog">Browse Catalog</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
