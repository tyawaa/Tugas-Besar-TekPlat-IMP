'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout, KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
import { HealthBadge } from '@/components/devices/health-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Device, deviceHealth } from '@/lib/mock-data'
import { deleteDevice, DeviceUpdatePayload, getDevices, getUsers, updateDevice, updateDeviceAction } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PublicUser } from '@/lib/auth-types'
import { formatDistanceToNow } from 'date-fns'
import { Search, Plus, Eye, Cpu, Wifi, WifiOff, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
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
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [editForm, setEditForm] = useState<DeviceUpdatePayload | null>(null)
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const openEditDialog = (device: Device) => {
    setEditingDevice(device)
    setEditForm({
      name: device.name,
      type: device.type,
      location: device.location,
      description: device.description,
      visibility: device.visibility,
      heartbeatInterval: device.heartbeatInterval,
      metrics: device.metrics.map((metric) => ({ ...metric })),
    })
  }

  const updateEditField = <K extends keyof DeviceUpdatePayload>(key: K, value: DeviceUpdatePayload[K]) => {
    setEditForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const updateMetricField = (
    index: number,
    field: keyof Device['metrics'][number],
    value: string
  ) => {
    setEditForm((current) => {
      if (!current) return current
      return {
        ...current,
        metrics: current.metrics.map((metric, metricIndex) =>
          metricIndex === index ? { ...metric, [field]: value } : metric
        ),
      }
    })
  }

  const addMetric = () => {
    setEditForm((current) => {
      if (!current) return current
      return {
        ...current,
        metrics: [
          ...current.metrics,
          { key: '', label: '', valueType: 'number', unit: '' },
        ],
      }
    })
  }

  const removeMetric = (index: number) => {
    setEditForm((current) => {
      if (!current) return current
      return {
        ...current,
        metrics: current.metrics.filter((_, metricIndex) => metricIndex !== index),
      }
    })
  }

  const handleSaveEdit = async () => {
    if (!editingDevice || !editForm) return

    const payload: DeviceUpdatePayload = {
      ...editForm,
      name: editForm.name.trim(),
      type: editForm.type.trim(),
      location: editForm.location.trim(),
      description: editForm.description.trim(),
      heartbeatInterval: Number(editForm.heartbeatInterval),
      metrics: editForm.metrics.map((metric) => ({
        key: metric.key.trim(),
        label: metric.label.trim(),
        valueType: metric.valueType,
        unit: metric.unit.trim(),
      })),
    }

    setIsSaving(true)
    try {
      const updatedDevice = await updateDevice(editingDevice.id, payload)
      setDevices((current) => current.map((device) => (device.id === updatedDevice.id ? updatedDevice : device)))
      setEditingDevice(null)
      setEditForm(null)
    } catch (error) {
      console.error('Failed to update device', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return

    setIsDeleting(true)
    try {
      await deleteDevice(deviceToDelete.id)
      setDevices((current) => current.filter((device) => device.id !== deviceToDelete.id))
      setDeviceToDelete(null)
    } catch (error) {
      console.error('Failed to delete device', error)
    } finally {
      setIsDeleting(false)
    }
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
                    {isAdmin && <SelectItem value="archived">Archived</SelectItem>}
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
                    <TableHead className="w-[148px]">Actions</TableHead>
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
                            {!isAdmin && device.status !== 'archived' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => openEditDialog(device)}
                                  aria-label={`Edit ${device.name}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => setDeviceToDelete(device)}
                                  aria-label={`Delete ${device.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
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

      <Dialog
        open={Boolean(editingDevice)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingDevice(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>
              Update the device details shown to owners and developers.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-device-name">Name</Label>
                  <Input
                    id="edit-device-name"
                    value={editForm.name}
                    onChange={(event) => updateEditField('name', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-device-type">Type</Label>
                  <Input
                    id="edit-device-type"
                    value={editForm.type}
                    onChange={(event) => updateEditField('type', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-device-location">Location</Label>
                  <Input
                    id="edit-device-location"
                    value={editForm.location}
                    onChange={(event) => updateEditField('location', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-device-heartbeat">Heartbeat Interval</Label>
                  <Input
                    id="edit-device-heartbeat"
                    type="number"
                    min={1}
                    value={editForm.heartbeatInterval}
                    onChange={(event) => updateEditField('heartbeatInterval', Number(event.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-device-description">Description</Label>
                <Textarea
                  id="edit-device-description"
                  rows={3}
                  value={editForm.description}
                  onChange={(event) => updateEditField('description', event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select
                  value={editForm.visibility}
                  onValueChange={(value) => updateEditField('visibility', value as Device['visibility'])}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="catalog">Public Catalog</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Telemetry Metrics</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addMetric}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Metric
                  </Button>
                </div>
                <div className="space-y-3">
                  {editForm.metrics.map((metric, index) => (
                    <div key={`${metric.key}-${index}`} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_140px_1fr_auto]">
                      <Input
                        placeholder="Key"
                        value={metric.key}
                        onChange={(event) => updateMetricField(index, 'key', event.target.value)}
                      />
                      <Input
                        placeholder="Label"
                        value={metric.label}
                        onChange={(event) => updateMetricField(index, 'label', event.target.value)}
                      />
                      <Select
                        value={metric.valueType}
                        onValueChange={(value) => updateMetricField(index, 'valueType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="string">String</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Unit"
                        value={metric.unit}
                        onChange={(event) => updateMetricField(index, 'unit', event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeMetric(index)}
                        aria-label={`Remove metric ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingDevice(null)
                setEditForm(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deviceToDelete)}
        onOpenChange={(open) => {
          if (!open) setDeviceToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deviceToDelete?.name || 'this device'} from active device lists and the developer catalog. Existing telemetry and audit history are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleDeleteDevice}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
