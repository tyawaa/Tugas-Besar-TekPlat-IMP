'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout, KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
import { HealthBadge } from '@/components/devices/health-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Device, deviceHealth } from '@/lib/mock-data'
import { getDevices, getUsers, updateDeviceAction } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PublicUser } from '@/lib/auth-types'
import { formatDistanceToNow } from 'date-fns'
import { Search, Plus, Eye, Cpu, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export function DevicesContent() {
  const { userId, userRole, userName } = useAuth()
  const isAdmin = userRole === 'admin'
  
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all')
  const [devices, setDevices] = useState<Device[]>([])
  const [users, setUsers] = useState<PublicUser[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load devices from API
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const allDevices = await getDevices()
        if (isAdmin) {
          const allUsers = await getUsers()
          setUsers(allUsers)
          setDevices(allDevices)
        } else if (userId) {
          setDevices(allDevices.filter((device) => device.ownerId === userId))
        }
      } catch (error) {
        console.error('Failed to load devices', error)
      }
    }
    loadDevices()
  }, [userId, userRole, isAdmin, refreshKey])

  const filteredDevices = devices.filter((device) => {
    const matchesSearch = 
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter
    const matchesVisibility = visibilityFilter === 'all' || device.visibility === visibilityFilter
    
    return matchesSearch && matchesStatus && matchesVisibility
  })

  const onlineCount = devices.filter(d => d.status === 'online').length
  const offlineCount = devices.filter(d => d.status === 'offline').length
  const suspendedCount = devices.filter(d => d.status === 'suspended').length

  const handleSuspend = async (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await updateDeviceAction(deviceId, 'suspend', userId, userName, userRole)
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to suspend device', error)
    }
  }

  const handleReinstate = async (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await updateDeviceAction(deviceId, 'reinstate', userId, userName, userRole)
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to reinstate device', error)
    }
  }

  const getDeviceHealth = (deviceId: string) => {
    return deviceHealth.find(h => h.deviceId === deviceId)
  }

  const getOwnerName = (ownerId: string) => {
    const owner = users.find(u => u.id === ownerId)
    return owner?.name || ownerId
  }

  return (
    <DashboardLayout title="Devices">
      <div className="space-y-6">
        {/* Subtitle */}
        <div>
          <p className="text-muted-foreground">
            {isAdmin ? 'Monitor all registered devices and their platform status.' : 'Manage your registered devices and monitor their telemetry.'}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KPICard title="Total Devices" value={devices.length} icon={<Cpu className="h-5 w-5" />} />
          <KPICard title="Online Devices" value={onlineCount} icon={<Wifi className="h-5 w-5" />} />
          <KPICard title="Offline Devices" value={offlineCount} icon={<WifiOff className="h-5 w-5" />} />
          <KPICard title="Suspended Devices" value={suspendedCount} icon={<AlertTriangle className="h-5 w-5" />} />
        </div>

        {/* Filters */}
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              {/* Search */}
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Search by name or location
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Visibility
                </label>
                <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="catalog">Catalog</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Register Button */}
              {!isAdmin && (
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <Link href="/dashboard/devices/pair">
                    <Plus className="mr-2 h-4 w-4" />
                    Pair Device
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Devices Table */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {isAdmin ? 'All Devices' : 'My Devices'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Last Seen</TableHead>
                    {isAdmin && <TableHead>Owner</TableHead>}
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDevices.length > 0 ? (
                    filteredDevices.map((device) => (
                      <TableRow key={device.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">
                          {device.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {device.type}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {device.location}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={device.status} />
                        </TableCell>
                        <TableCell>
                          {getDeviceHealth(device.id) && (
                            <HealthBadge score={getDeviceHealth(device.id)!.score} compact />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {device.visibility === 'catalog' ? 'Catalog' : 'Private'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-muted-foreground text-sm">
                            {getOwnerName(device.ownerId)}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Link href={`/dashboard/devices/${device.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {isAdmin && device.status === 'online' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                onClick={() => handleSuspend(device.id)}
                              >
                                Suspend
                              </Button>
                            )}
                            {isAdmin && device.status === 'suspended' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                                onClick={() => handleReinstate(device.id)}
                              >
                                Reinstate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                        No devices found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
