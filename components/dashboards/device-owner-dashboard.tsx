'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Cpu, 
  Wifi, 
  Clock, 
  Database, 
  Plus,
  Eye,
  MoreHorizontal 
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Device, AccessRequest, TelemetryRecord, deviceHealth } from '@/lib/mock-data'
import { deleteDevice, getDevices, getAccessRequests, getTelemetryHistory } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { HealthBadge } from '@/components/devices/health-badge'

export function DeviceOwnerDashboard() {
  const { userId, userName, userRole } = useAuth()
  const [ownerDevices, setOwnerDevices] = useState<Device[]>([])
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([])
  const [recentTelemetry, setRecentTelemetry] = useState<TelemetryRecord[]>([])
  const [allDevices, setAllDevices] = useState<Device[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load data from API
  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        const [devices, requests] = await Promise.all([getDevices(), getAccessRequests()])
        const ownerDevices = devices.filter((device) => device.ownerId === userId)
        setOwnerDevices(ownerDevices)
        setAllDevices(devices)

        const deviceIds = ownerDevices.map((d) => d.id)
        const pending = requests.filter(
          (ar) => deviceIds.includes(ar.deviceId) && ar.status === 'pending'
        )
        setPendingRequests(pending)

        const telemetryRecords: TelemetryRecord[] = []
        await Promise.all(
          ownerDevices.map(async (device) => {
            const history = await getTelemetryHistory(device.id)
            telemetryRecords.push(...history)
          })
        )
        telemetryRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setRecentTelemetry(telemetryRecords.slice(0, 5))
      } catch (error) {
        console.error('Failed to load device owner dashboard', error)
      }
    }

    loadData()

    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [userId, refreshKey])

  const stats = {
    totalDevices: ownerDevices.length,
    onlineDevices: ownerDevices.filter(d => d.status === 'online').length,
    pendingRequests: pendingRequests.length,
    totalTelemetryRecords: recentTelemetry.length * 1000, // Simulated larger number
  }

  const getDeviceHealth = (deviceId: string) => {
    return deviceHealth.find(h => h.deviceId === deviceId)
  }

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      await deleteDevice(deviceId)
      setRefreshKey((prev) => prev + 1)
      toast({
        title: 'Device deleted',
        description: 'The device was removed from active lists and the developer catalog.',
      })
    } catch (error) {
      console.error('Failed to delete device', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Active Devices"
          value={stats.totalDevices}
          icon={<Cpu className="h-5 w-5" />}
        />
        <KPICard
          title="Online Devices"
          value={stats.onlineDevices}
          icon={<Wifi className="h-5 w-5" />}
        />
        <KPICard
          title="Pending Requests"
          value={stats.pendingRequests}
          icon={<Clock className="h-5 w-5" />}
        />
        <KPICard
          title="Total Records"
          value={stats.totalTelemetryRecords.toLocaleString()}
          icon={<Database className="h-5 w-5" />}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Devices Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">My Devices</CardTitle>
            <Button asChild size="sm" className="bg-primary text-white hover:bg-primary/90">
              <Link href="/dashboard/devices/pair">
                <Plus className="mr-2 h-4 w-4" />
                Pair Device
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No devices yet. Click &quot;Pair Device&quot; to add your first device.
                    </TableCell>
                  </TableRow>
                ) : (
                  ownerDevices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">
                        <Link 
                          href={`/dashboard/devices/${device.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {device.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{device.type}</TableCell>
                      <TableCell className="text-muted-foreground">{device.location}</TableCell>
                      <TableCell>
                        <StatusBadge status={device.status} />
                      </TableCell>
                      <TableCell>
                        {getDeviceHealth(device.id) && (
                          <HealthBadge score={getDeviceHealth(device.id)!.score} compact />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                          device.visibility === 'catalog' 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {device.visibility === 'catalog' ? 'Public' : 'Private'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/devices/${device.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/devices">Edit in My Devices</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteDevice(device.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pending Access Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests</p>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => {
                    const device = allDevices.find(d => d.id === request.deviceId)
                    return (
                      <div key={request.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{request.developerName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {device?.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {request.purpose}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link href="/dashboard/access-requests">Review</Link>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Telemetry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTelemetry.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity. Start a device simulator to generate telemetry.</p>
              ) : (
                <div className="space-y-3">
                  {recentTelemetry.map((record) => {
                    const device = allDevices.find(d => d.id === record.deviceId)
                    return (
                      <div key={record.id} className="flex items-center gap-3 text-sm">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {device?.name || record.deviceId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(record.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
