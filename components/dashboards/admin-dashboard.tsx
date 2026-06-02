'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AuditLog, Device, UserRole } from '@/lib/mock-data'
import { getDevices, getAuditLogs, getUsers, updateDeviceAction, updateUserAction } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PublicUser } from '@/lib/auth-types'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

const roleOptions: UserRole[] = ['device_owner', 'developer', 'admin']

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

export function AdminDashboard() {
  const { userId, userName, userRole } = useAuth()
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
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
        const [devices, logs, users] = await Promise.all([getDevices(), getAuditLogs(), getUsers()])
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setDevices(devices)
        setUsers(users)
        setAuditLogs(logs)
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
    const searchable = [user.name, user.email, user.id, roleLabel(user.role), user.status].join(' ').toLowerCase()

    return (
      (!search || searchable.includes(search)) &&
      (userRoleFilter === 'all' || user.role === userRoleFilter) &&
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

  const getOwnerName = (ownerId: string) => {
    const owner = users.find((user) => user.id === ownerId)
    return owner?.name || ownerId
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
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {roleLabel(user.role)}
                          </Badge>
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
                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {roleLabel(selectedUser.role)}
                  </Badge>
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
