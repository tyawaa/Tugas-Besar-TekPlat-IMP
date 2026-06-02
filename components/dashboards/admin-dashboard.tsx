'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Search,
  RotateCcw,
  Activity,
  Archive,
  Database,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserX,
  Wifi,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AccessGrant, AccessRequest, AuditLog, Device, TelemetryRecord, UserRole } from '@/lib/mock-data'
import {
  getAccessGrants,
  getAccessRequests,
  getAuditLogs,
  getDevices,
  getTelemetry,
  getUsers,
  updateDeviceAction,
  updateUserAction,
  updateUserRoles,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PublicUser, hasUserRole, normalizeUserRoles } from '@/lib/auth-types'
import { toast } from '@/hooks/use-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

const roleOptions: UserRole[] = ['device_owner', 'developer', 'admin']
const STALE_HEARTBEAT_MULTIPLIER = 3
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

function roleLabel(role: UserRole) {
  return role.replace('_', ' ')
}

function UserStatusBadge({ status }: { status: PublicUser['status'] }) {
  const style =
    status === 'active'
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status === 'active' && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-600" />}
      {status}
    </span>
  )
}

function SignalRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string | number
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      <p className="shrink-0 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function isValidDate(value: string) {
  return !Number.isNaN(new Date(value).valueOf())
}

function isDeviceStale(device: Device, now = Date.now()) {
  if (device.status !== 'online') return false
  if (!isValidDate(device.lastSeen)) return false
  const heartbeatMs = Math.max(device.heartbeatInterval, 1) * 1000
  return now - new Date(device.lastSeen).getTime() > heartbeatMs * STALE_HEARTBEAT_MULTIPLIER
}

function isGrantActive(grant: AccessGrant, now = Date.now()) {
  if (!isValidDate(grant.expiresAt)) return false
  return new Date(grant.expiresAt).getTime() > now
}

export function AdminDashboard() {
  const { userId, userName, userRole } = useAuth()
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [telemetryRecords, setTelemetryRecords] = useState<TelemetryRecord[]>([])
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([])
  const [users, setUsers] = useState<PublicUser[]>([])
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null)

  const [deviceSearchQuery, setDeviceSearchQuery] = useState('')
  const [deviceStatusFilter, setDeviceStatusFilter] = useState('all')
  const [deviceVisibilityFilter, setDeviceVisibilityFilter] = useState('all')
  const [deviceOwnerFilter, setDeviceOwnerFilter] = useState('all')

  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')

  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState('all')
  const [auditTargetFilter, setAuditTargetFilter] = useState('all')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [devices, logs, users, telemetry, requests, grants] = await Promise.all([
          getDevices(),
          getAuditLogs(),
          getUsers(),
          getTelemetry(),
          getAccessRequests(),
          getAccessGrants(),
        ])
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setDevices(devices)
        setUsers(users)
        setAuditLogs(logs)
        setTelemetryRecords(telemetry)
        setAccessRequests(requests)
        setAccessGrants(grants)
      } catch (error) {
        console.error('Failed to load admin dashboard data', error)
      }
    }
    loadData()
  }, [refreshKey])

  const stats = {
    totalUsers: users.length,
    totalDevices: devices.length,
    offlineDevices: devices.filter((device) => device.status === 'offline').length,
    suspendedDevices: devices.filter((device) => device.status === 'suspended').length,
  }

  const now = Date.now()
  const onlineDevices = devices.filter((device) => device.status === 'online')
  const offlineDevices = devices.filter((device) => device.status === 'offline')
  const suspendedDevices = devices.filter((device) => device.status === 'suspended')
  const archivedDevices = devices.filter((device) => device.status === 'archived')
  const catalogDevices = devices.filter((device) => device.visibility === 'catalog' && device.status !== 'archived')
  const staleDevices = onlineDevices
    .filter((device) => isDeviceStale(device, now))
    .sort((a, b) => new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime())

  const telemetryLast24h = telemetryRecords.filter((record) => (
    isValidDate(record.timestamp) && now - new Date(record.timestamp).getTime() <= ONE_DAY_MS
  ))
  const latestTelemetryRecord = telemetryRecords
    .filter((record) => isValidDate(record.timestamp))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
  const telemetryDeviceIds = new Set(telemetryRecords.map((record) => record.deviceId))
  const devicesWithTelemetry = devices.filter((device) => telemetryDeviceIds.has(device.id)).length

  const pendingRequests = accessRequests.filter((request) => request.status === 'pending')
  const activeGrants = accessGrants.filter((grant) => isGrantActive(grant, now))
  const expiringGrants = activeGrants.filter((grant) => new Date(grant.expiresAt).getTime() - now <= ONE_WEEK_MS)

  const deviceOwnerCount = users.filter((user) => hasUserRole(user, 'device_owner')).length
  const developerCount = users.filter((user) => hasUserRole(user, 'developer')).length
  const adminCount = users.filter((user) => hasUserRole(user, 'admin')).length
  const suspendedUserCount = users.filter((user) => user.status === 'suspended').length

  const deviceOwnerOptions = useMemo(() => {
    const ownerIds = new Set(devices.map((device) => device.ownerId))
    return users
      .filter((user) => ownerIds.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [devices, users])

  const filteredDevices = devices.filter((device) => {
    const owner = users.find((user) => user.id === device.ownerId)
    const search = deviceSearchQuery.trim().toLowerCase()
    const searchable = [
      device.name,
      device.type,
      device.location,
      device.ownerId,
      owner?.name || '',
      owner?.email || '',
    ].join(' ').toLowerCase()

    return (
      (!search || searchable.includes(search)) &&
      (deviceStatusFilter === 'all' || device.status === deviceStatusFilter) &&
      (deviceVisibilityFilter === 'all' || device.visibility === deviceVisibilityFilter) &&
      (deviceOwnerFilter === 'all' || device.ownerId === deviceOwnerFilter)
    )
  })

  const filteredUsers = users.filter((user) => {
    const search = userSearchQuery.trim().toLowerCase()
    const userRoles = normalizeUserRoles(user.role, user.roles)
    const searchable = [
      user.name,
      user.email,
      user.id,
      userRoles.map(roleLabel).join(' '),
      user.status,
    ].join(' ').toLowerCase()

    return (
      (!search || searchable.includes(search)) &&
      (userRoleFilter === 'all' || hasUserRole(user, userRoleFilter as UserRole)) &&
      (userStatusFilter === 'all' || user.status === userStatusFilter)
    )
  })

  const auditActionOptions = useMemo(
    () => Array.from(new Set(auditLogs.map((log) => log.action))).sort(),
    [auditLogs]
  )
  const auditTargetOptions = useMemo(
    () => Array.from(new Set(auditLogs.map((log) => log.targetType))).sort(),
    [auditLogs]
  )

  const filteredAuditLogs = auditLogs
    .filter((log) => (
      (auditActionFilter === 'all' || log.action === auditActionFilter) &&
      (auditOutcomeFilter === 'all' || log.outcome === auditOutcomeFilter) &&
      (auditTargetFilter === 'all' || log.targetType === auditTargetFilter)
    ))
    .slice(0, 10)

  const resetDeviceFilters = () => {
    setDeviceSearchQuery('')
    setDeviceStatusFilter('all')
    setDeviceVisibilityFilter('all')
    setDeviceOwnerFilter('all')
  }

  const resetUserFilters = () => {
    setUserSearchQuery('')
    setUserRoleFilter('all')
    setUserStatusFilter('all')
  }

  const resetAuditFilters = () => {
    setAuditActionFilter('all')
    setAuditOutcomeFilter('all')
    setAuditTargetFilter('all')
  }

  const handleSuspendDevice = async (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await updateDeviceAction(deviceId, 'suspend', userId, userName, userRole)
      setRefreshKey((prev) => prev + 1)
      toast({ title: 'Device suspended' })
    } catch (error) {
      console.error('Failed to suspend device', error)
      toast({ title: 'Failed to suspend device', variant: 'destructive' })
    }
  }

  const handleReinstateDevice = async (deviceId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await updateDeviceAction(deviceId, 'reinstate', userId, userName, userRole)
      setRefreshKey((prev) => prev + 1)
      toast({ title: 'Device reinstated' })
    } catch (error) {
      console.error('Failed to reinstate device', error)
      toast({ title: 'Failed to reinstate device', variant: 'destructive' })
    }
  }

  const handleUserAction = async (targetUser: PublicUser, action: 'suspend' | 'reinstate') => {
    setUserActionLoading(`${action}:${targetUser.id}`)
    try {
      const updatedUser = await updateUserAction(targetUser.id, action)
      setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)))
      if (selectedUser?.id === updatedUser.id) setSelectedUser(updatedUser)
      setRefreshKey((prev) => prev + 1)
      toast({
        title: action === 'suspend' ? 'User suspended' : 'User reinstated',
        description: `${targetUser.name} is now ${updatedUser.status}.`,
      })
    } catch (error) {
      console.error('Failed to update user', error)
      toast({
        title: 'Failed to update user',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUserActionLoading(null)
    }
  }

  const handleUserRolesChange = async (targetUser: PublicUser, nextRoles: UserRole[]) => {
    if (nextRoles.length === 0) {
      toast({
        title: 'At least one role is required',
        description: 'Users need one active platform role.',
        variant: 'destructive',
      })
      return
    }

    setUserActionLoading(`roles:${targetUser.id}`)
    try {
      const updatedUser = await updateUserRoles(targetUser.id, nextRoles)
      setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)))
      if (selectedUser?.id === updatedUser.id) setSelectedUser(updatedUser)
      setRefreshKey((prev) => prev + 1)
      toast({
        title: 'User roles updated',
        description: `${targetUser.name} now has ${updatedUser.roles.map(roleLabel).join(', ')} access.`,
      })
    } catch (error) {
      console.error('Failed to update user roles', error)
      toast({
        title: 'Failed to update roles',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUserActionLoading(null)
    }
  }

  const getOwnerName = (ownerId: string) => {
    const owner = users.find((user) => user.id === ownerId)
    return owner?.name || ownerId
  }

  const getDeviceName = (deviceId: string) => {
    const device = devices.find((device) => device.id === deviceId)
    return device?.name || deviceId
  }

  const getOwnedDeviceCount = (ownerId: string) => devices.filter((device) => device.ownerId === ownerId).length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Users" value={stats.totalUsers} icon={<Users className="h-5 w-5" />} />
        <KPICard title="Total Devices" value={stats.totalDevices} icon={<Cpu className="h-5 w-5" />} />
        <KPICard title="Offline Devices" value={stats.offlineDevices} icon={<WifiOff className="h-5 w-5" />} />
        <KPICard title="Suspended Devices" value={stats.suspendedDevices} icon={<Ban className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Platform Monitoring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Device Network
                </p>
                <SignalRow
                  icon={<Wifi className="h-4 w-4" />}
                  label="Online Devices"
                  value={onlineDevices.length}
                  detail={`${staleDevices.length} stale by heartbeat`}
                />
                <SignalRow
                  icon={<WifiOff className="h-4 w-4" />}
                  label="Offline Devices"
                  value={offlineDevices.length}
                  detail="Not currently reachable"
                />
                <SignalRow
                  icon={<Ban className="h-4 w-4" />}
                  label="Suspended Devices"
                  value={suspendedDevices.length}
                  detail="Blocked from ingestion"
                />
                <SignalRow
                  icon={<Archive className="h-4 w-4" />}
                  label="Archived Devices"
                  value={archivedDevices.length}
                  detail={`${catalogDevices.length} visible in catalog`}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Data & Access
                </p>
                <SignalRow
                  icon={<Activity className="h-4 w-4" />}
                  label="Telemetry Last 24h"
                  value={telemetryLast24h.length}
                  detail={
                    latestTelemetryRecord
                      ? `Latest ${formatDistanceToNow(new Date(latestTelemetryRecord.timestamp), { addSuffix: true })}`
                      : 'No telemetry received yet'
                  }
                />
                <SignalRow
                  icon={<Database className="h-4 w-4" />}
                  label="Telemetry Records"
                  value={telemetryRecords.length}
                  detail={`${devicesWithTelemetry} devices have data`}
                />
                <SignalRow
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Active Grants"
                  value={activeGrants.length}
                  detail={`${expiringGrants.length} expiring in 7 days`}
                />
                <SignalRow
                  icon={<UserCheck className="h-4 w-4" />}
                  label="User Mix"
                  value={users.length}
                  detail={`${deviceOwnerCount} owners, ${developerCount} developers, ${adminCount} admins`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base font-semibold">Admin Action Queue</CardTitle>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/access-requests')}>
              Review
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Pending Access Requests</p>
                  <p className="text-xs text-muted-foreground">Developer requests waiting for approval.</p>
                </div>
                <Badge className="bg-amber-100 text-amber-800">{pendingRequests.length}</Badge>
              </div>

              <div className="border-b border-border/70 pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Stale Online Devices</p>
                    <p className="text-xs text-muted-foreground">Online devices beyond {STALE_HEARTBEAT_MULTIPLIER} heartbeat windows.</p>
                  </div>
                  <Badge variant={staleDevices.length > 0 ? 'default' : 'secondary'}>{staleDevices.length}</Badge>
                </div>
                <div className="space-y-2">
                  {staleDevices.length > 0 ? (
                    staleDevices.slice(0, 3).map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                        onClick={() => router.push(`/dashboard/devices/${device.id}`)}
                      >
                        <span className="truncate text-sm text-foreground">{device.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No stale online devices.</p>
                  )}
                </div>
              </div>

              <div className="border-b border-border/70 pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Expiring Grants</p>
                    <p className="text-xs text-muted-foreground">Active grants ending within 7 days.</p>
                  </div>
                  <Badge variant={expiringGrants.length > 0 ? 'default' : 'secondary'}>{expiringGrants.length}</Badge>
                </div>
                <div className="space-y-2">
                  {expiringGrants.length > 0 ? (
                    expiringGrants.slice(0, 3).map((grant) => (
                      <div key={grant.id} className="flex items-center justify-between gap-3 px-2 py-1.5">
                        <span className="truncate text-sm text-foreground">{grant.developerName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {format(new Date(grant.expiresAt), 'MMM d')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No grants expiring soon.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Active Users
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{users.length - suspendedUserCount}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <UserX className="h-4 w-4 text-amber-600" />
                    Suspended
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{suspendedUserCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold">Device Health</CardTitle>
              <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/devices')}>
                All Devices
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_140px_150px_160px_auto]">
              <div className="relative md:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search devices, owner, location..."
                  value={deviceSearchQuery}
                  onChange={(event) => setDeviceSearchQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={deviceStatusFilter} onValueChange={setDeviceStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deviceVisibilityFilter} onValueChange={setDeviceVisibilityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visibility</SelectItem>
                  <SelectItem value="catalog">Catalog</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deviceOwnerFilter} onValueChange={setDeviceOwnerFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {deviceOwnerOptions.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={resetDeviceFilters} aria-label="Reset device filters">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
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
                {filteredDevices.length > 0 ? (
                  filteredDevices.map((device) => (
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
                      <TableCell className="text-sm text-muted-foreground">{getOwnerName(device.ownerId)}</TableCell>
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
                              <DropdownMenuItem className="text-green-600" onClick={() => handleReinstateDevice(device.id)}>
                                Reinstate Device
                              </DropdownMenuItem>
                            ) : device.status !== 'offline' && device.status !== 'archived' ? (
                              <DropdownMenuItem className="text-amber-600" onClick={() => handleSuspendDevice(device.id)}>
                                Suspend Device
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No devices match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <CardTitle className="text-base font-semibold">Users</CardTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_150px_150px_auto]">
              <div className="relative md:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, role..."
                  value={userSearchQuery}
                  onChange={(event) => setUserSearchQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={resetUserFilters} aria-label="Reset user filters">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
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
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isBusy = userActionLoading?.endsWith(`:${user.id}`)
                    const userRoles = normalizeUserRoles(user.role, user.roles)
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {userRoles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-xs capitalize">
                                {roleLabel(role)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <UserStatusBadge status={user.status} />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedUser(user)}>View Profile</DropdownMenuItem>
                              {user.status === 'active' ? (
                                <DropdownMenuItem
                                  className="text-amber-600"
                                  disabled={user.id === userId}
                                  onClick={() => handleUserAction(user, 'suspend')}
                                >
                                  Suspend User
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-green-600"
                                  onClick={() => handleUserAction(user, 'reinstate')}
                                >
                                  Reinstate User
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No users match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold">Recent Audit Logs</CardTitle>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/audit-logs')}>
              View All Logs
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_150px_170px_auto]">
            <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {auditActionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={auditOutcomeFilter} onValueChange={setAuditOutcomeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>
            <Select value={auditTargetFilter} onValueChange={setAuditTargetFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                {auditTargetOptions.map((target) => (
                  <SelectItem key={target} value={target}>
                    {target.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={resetAuditFilters} aria-label="Reset audit filters">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
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
              {filteredAuditLogs.length > 0 ? (
                filteredAuditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{log.actorName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{roleLabel(log.actorRole)}</p>
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No audit logs match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Profile</DialogTitle>
            <DialogDescription>Account status and platform role details.</DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p className="font-semibold text-foreground">{selectedUser.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{selectedUser.email}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Roles</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {normalizeUserRoles(selectedUser.role, selectedUser.roles).map((role) => (
                      <Badge key={role} variant="secondary" className="capitalize">
                        {roleLabel(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="mt-1">
                    <UserStatusBadge status={selectedUser.status} />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Registered</p>
                  <p className="text-sm text-foreground">{format(new Date(selectedUser.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Owned Devices</p>
                  <p className="text-sm text-foreground">{getOwnedDeviceCount(selectedUser.id)}</p>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-muted-foreground">Role Management</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {roleOptions.map((role) => {
                    const currentRoles = normalizeUserRoles(selectedUser.role, selectedUser.roles)
                    const isEnabled = currentRoles.includes(role)
                    const nextRoles = isEnabled
                      ? currentRoles.filter((currentRole) => currentRole !== role)
                      : [...currentRoles, role]
                    const isBusy = userActionLoading?.endsWith(`:${selectedUser.id}`)
                    const cannotRemove =
                      isEnabled &&
                      (currentRoles.length === 1 || (selectedUser.id === userId && role === 'admin'))

                    return (
                      <Button
                        key={role}
                        type="button"
                        variant={isEnabled ? 'default' : 'outline'}
                        disabled={Boolean(isBusy) || cannotRemove}
                        onClick={() => handleUserRolesChange(selectedUser, nextRoles)}
                        className="justify-start capitalize"
                      >
                        {isEnabled ? 'Remove' : 'Add'} {roleLabel(role)}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                {selectedUser.status === 'active' ? (
                  <Button
                    variant="outline"
                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    disabled={selectedUser.id === userId || userActionLoading?.endsWith(`:${selectedUser.id}`)}
                    onClick={() => handleUserAction(selectedUser, 'suspend')}
                  >
                    Suspend User
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="text-green-600 hover:bg-green-50 hover:text-green-700"
                    disabled={userActionLoading?.endsWith(`:${selectedUser.id}`)}
                    onClick={() => handleUserAction(selectedUser, 'reinstate')}
                  >
                    Reinstate User
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
