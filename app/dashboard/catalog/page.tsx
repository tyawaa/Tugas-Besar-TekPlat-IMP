'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout, StatusBadge } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Search,
  MapPin,
  Clock,
  Filter,
  CheckCircle,
} from 'lucide-react'
import { Device, deviceHealth } from '@/lib/mock-data'
import { useAuth } from '@/lib/auth-context'
import { formatDistanceToNow } from 'date-fns'
import { HealthBadge } from '@/components/devices/health-badge'
import { createAccessRequest, getDevices } from '@/lib/api'

export default function CatalogPage() {
  const { userId, userName, userEmail } = useAuth()
  const [catalogDevices, setCatalogDevices] = useState<Device[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [requestedUntil, setRequestedUntil] = useState('')

  // Load catalog devices from API
  useEffect(() => {
    const loadCatalogDevices = async () => {
      try {
        const allDevices = await getDevices()
        const filtered = allDevices.filter(
          d => d.visibility === 'catalog' && d.status !== 'archived'
        )
        setCatalogDevices(filtered)
      } catch (error) {
        console.error('Failed to load catalog devices', error)
      }
    }
    loadCatalogDevices()
  }, [])

  const filteredDevices = catalogDevices.filter((device) => {
    const matchesSearch =
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === 'all' || device.type.toLowerCase().includes(typeFilter.toLowerCase())
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  const handleRequestAccess = (device: Device) => {
    setSelectedDevice(device)
    setShowRequestModal(true)
    setRequestSubmitted(false)
    setPurpose('')
    setRequestedUntil('')
  }

  const handleSubmitRequest = async () => {
    if (!selectedDevice || !userId || !userName || !userEmail) return

    try {
      await createAccessRequest({
        deviceId: selectedDevice.id,
        developerId: userId,
        developerName: userName,
        developerEmail: userEmail,
        purpose: purpose || 'Access to device telemetry data',
        scopes: ['telemetry:read'],
        requestedUntil:
          requestedUntil || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
      setRequestSubmitted(true)
    } catch (error) {
      console.error('Failed to submit access request', error)
    }
  }

  const getDeviceHealth = (deviceId: string) => {
  return (
    deviceHealth.find((h) => h.deviceId === deviceId) || {
      deviceId,
      score: 90,
      uptime: 100,
      ingestionErrors: 0,
      dataQuality: 'good',
      activeGrants: 0,
    }
  )
}

  const deviceTypes = [...new Set(catalogDevices.map((d) => d.type))]

  return (
    <DashboardLayout title="Device Catalog">
      <div className="space-y-6">
        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search devices by name or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Device Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {deviceTypes.map((type) => (
                      <SelectItem key={type} value={type.toLowerCase()}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Device Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map((device) => (
            <Card key={device.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{device.name}</h3>
                      <p className="text-sm text-muted-foreground">{device.type}</p>
                    </div>
                    <StatusBadge status={device.status} />
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {device.location}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Last seen {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Available Metrics</p>
                    <div className="flex flex-wrap gap-1">
                      {device.metrics.map((metric) => (
                        <Badge key={metric.key} variant="secondary" className="text-xs">
                          {metric.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Health</p>
                    <HealthBadge score={getDeviceHealth(device.id).score} compact />
                  </div>
                </div>
                <div className="border-t border-border p-4">
                  <Button
                    onClick={() => handleRequestAccess(device)}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    Request Access
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredDevices.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No devices found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Request Access Modal */}
      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="sm:max-w-[500px]">
          {requestSubmitted ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <DialogTitle>Request Submitted</DialogTitle>
                    <DialogDescription>
                      Your access request has been sent to the device owner.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">{selectedDevice?.name}</p>
                <p className="text-sm text-muted-foreground">Status: Pending Owner Approval</p>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowRequestModal(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Request Access</DialogTitle>
                <DialogDescription>
                  Request access to {selectedDevice?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose of Access</Label>
                  <Textarea
                    id="purpose"
                    placeholder="Describe why you need access to this device data..."
                    rows={3}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requested Scopes</Label>
                  <div className="flex gap-2">
                    <Badge variant="secondary">telemetry:read</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default scope allows reading telemetry data
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="until">Access Until</Label>
                  <Input 
                    id="until" 
                    type="date" 
                    value={requestedUntil}
                    onChange={(e) => setRequestedUntil(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitRequest} className="bg-primary hover:bg-primary/90">
                  Submit Request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
