'use client'

import { useState, useEffect } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  Cpu, 
  WifiOff, 
  Ban,
  MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Device, AuditLog, users } from '@/lib/mock-data'
import { IoTBridgeDataStore } from '@/lib/data-store'
import { IoTBridgeActions } from '@/lib/actions'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

export function AdminDashboard() {
  const { userId, userName, userRole } = useAuth()
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load data from data store
  useEffect(() => {
    const loadData = () => {
      setDevices(IoTBridgeDataStore.getAllDevices())
      const logs = IoTBridgeDataStore.getAllAuditLogs()
      // Sort by timestamp descending and take last 10
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setAuditLogs(logs.slice(0, 10))
    }
    loadData()
  }, [refreshKey])

  const stats = {
    totalUsers: users.length,
    totalDevices: devices.length,
    offlineDevices: devices.filter(d => d.status === 'offline').length,
    suspendedDevices: devices.filter(d => d.status === 'suspended').length,
  }

  const handleSuspendDevice = (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    IoTBridgeActions.suspendDevice(deviceId, userId, userName, userRole)
    setRefreshKey(prev => prev + 1)
  }

  const handleReinstateDevice = (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    IoTBridgeActions.reinstateDevice(deviceId, userId, userName, userRole)
    setRefreshKey(prev => prev + 1)
  }

  const showUserManagementNotice = () => {
    toast({
      title: 'User management is read-only',
      description: 'This MVP displays mock users, but only device and access actions are persisted.',
    })
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Users"
          value={stats.totalUsers}
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          title="Total Devices"
          value={stats.totalDevices}
          icon={<Cpu className="h-5 w-5" />}
        />
        <KPICard
          title="Offline Devices"
          value={stats.offlineDevices}
          icon={<WifiOff className="h-5 w-5" />}
        />
        <KPICard
          title="Suspended Devices"
          value={stats.suspendedDevices}
          icon={<Ban className="h-5 w-5" />}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Device Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Device Health</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => {
                  const owner = users.find((u) => u.id === device.ownerId)
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{device.name}</p>
                          <p className="text-xs text-muted-foreground">{device.location}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={device.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {owner?.name}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/devices/${device.id}`)}>
                              View Details
                            </DropdownMenuItem>
                            {device.status === 'suspended' ? (
                              <DropdownMenuItem 
                                className="text-green-600"
                                onClick={() => handleReinstateDevice(device.id)}
                              >
                                Reinstate Device
                              </DropdownMenuItem>
                            ) : device.status !== 'offline' && (
                              <DropdownMenuItem 
                                className="text-amber-600"
                                onClick={() => handleSuspendDevice(device.id)}
                              >
                                Suspend Device
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Users Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {user.role.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status === 'active' ? 'online' : 'suspended'} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={showUserManagementNotice}>View Profile</DropdownMenuItem>
                          {user.status === 'active' ? (
                            <DropdownMenuItem className="text-destructive" onClick={showUserManagementNotice}>
                              Disable User
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-green-600" onClick={showUserManagementNotice}>
                              Enable User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target Type</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{log.actorName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{log.actorRole.replace('_', ' ')}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{log.action}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {log.targetType.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.outcome === 'success' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {log.outcome}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
