'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'
import { DashboardLayout, StatusBadge } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  MapPin,
  Eye,
  Copy,
  RefreshCw,
  Play,
  Square,
  AlertTriangle,
  Check,
  X,
  Thermometer,
  Droplets,
  Volume2,
  Users,
  ArrowLeft,
} from 'lucide-react'
import { Device, AccessRequest, AccessGrant, TelemetryRecord, deviceHealth } from '@/lib/mock-data'
import { getDevice, getAccessRequests, getAccessGrants, getTelemetryHistory, ingestTelemetry, updateDeviceAction, actionAccessRequest, revokeAccessGrant } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/hooks/use-toast'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { HealthCard } from '@/components/devices/health-card'

export default function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params)
  const { userId, userName, userRole } = useAuth()
  
  const [device, setDevice] = useState<Device | null>(null)
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([])
  const [telemetryData, setTelemetryData] = useState<TelemetryRecord[]>([])
  const [showApiKey, setShowApiKey] = useState(false)
  const [simulatorRunning, setSimulatorRunning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const simulatorRef = useRef<NodeJS.Timeout | null>(null)

  // Load device data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [deviceData, allRequests, allGrants, telemetryHistory] = await Promise.all([
          getDevice(deviceId),
          getAccessRequests(),
          getAccessGrants(),
          getTelemetryHistory(deviceId),
        ])

        setDevice(deviceData)
        setAccessRequests(allRequests.filter((request) => request.deviceId === deviceId))
        setAccessGrants(allGrants.filter((grant) => grant.deviceId === deviceId))
        setTelemetryData(telemetryHistory)
      } catch (error) {
        console.error('Failed to load device details', error)
      }
    }
    loadData()
  }, [deviceId, refreshKey])

  // Cleanup simulator on unmount
  useEffect(() => {
    return () => {
      if (simulatorRef.current) {
        clearInterval(simulatorRef.current)
      }
    }
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getMetricIcon = (key: string) => {
    switch (key) {
      case 'temperature':
        return <Thermometer className="h-4 w-4" />
      case 'humidity':
        return <Droplets className="h-4 w-4" />
      case 'noise_level':
      case 'peak_noise':
        return <Volume2 className="h-4 w-4" />
      case 'occupancy':
        return <Users className="h-4 w-4" />
      default:
        return null
    }
  }

  const generateRandomTelemetry = (metrics: Device['metrics'], isAnomaly = false) => {
    const data: Record<string, number | boolean | string> = {}
    metrics.forEach(metric => {
      if (metric.valueType === 'number') {
        let value: number
        switch (metric.key) {
          case 'temperature':
            value = isAnomaly ? 85 + Math.random() * 10 : 20 + Math.random() * 15
            break
          case 'humidity':
            value = isAnomaly ? 5 + Math.random() * 5 : 40 + Math.random() * 40
            break
          case 'noise_level':
            value = isAnomaly ? 90 + Math.random() * 20 : 30 + Math.random() * 30
            break
          case 'peak_noise':
            value = isAnomaly ? 100 + Math.random() * 20 : 40 + Math.random() * 30
            break
          case 'occupancy':
            value = isAnomaly ? 200 + Math.random() * 50 : Math.floor(Math.random() * 40)
            break
          case 'co2':
            value = isAnomaly ? 2000 + Math.random() * 500 : 400 + Math.random() * 200
            break
          case 'pm25':
            value = isAnomaly ? 150 + Math.random() * 50 : 5 + Math.random() * 20
            break
          default:
            value = Math.random() * 100
        }
        data[metric.key] = Math.round(value * 10) / 10
      } else if (metric.valueType === 'boolean') {
        data[metric.key] = Math.random() > 0.5
      } else {
        data[metric.key] = 'normal'
      }
    })
    return data
  }

  const handleStartSimulator = () => {
    if (!device || !userId || !userName || !userRole) return

    setSimulatorRunning(true)

    simulatorRef.current = setInterval(async () => {
      const telemetryPayload = generateRandomTelemetry(device.metrics)
      try {
        await ingestTelemetry(deviceId, telemetryPayload, device.apiKey)
        setRefreshKey((prev) => prev + 1)
      } catch (error) {
        console.error('Failed to ingest telemetry', error)
      }
    }, 3000)
  }

  const handleStopSimulator = () => {
    if (!userId || !userName || !userRole) return

    if (simulatorRef.current) {
      clearInterval(simulatorRef.current)
      simulatorRef.current = null
    }
    setSimulatorRunning(false)
  }

  const handleInjectAnomaly = async () => {
    if (!device || !userId || !userName || !userRole) return

    const anomalyData = generateRandomTelemetry(device.metrics, true)
    try {
      await ingestTelemetry(deviceId, anomalyData, device.apiKey)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to ingest anomaly telemetry', error)
    }
  }

  const handleApproveRequest = async (requestId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await actionAccessRequest(requestId, 'approve', userId, userName, userRole)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to approve request', error)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await actionAccessRequest(requestId, 'reject', userId, userName, userRole)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to reject request', error)
    }
  }

  const handleRevokeGrant = async (grantId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await revokeAccessGrant(grantId, userId, userName, userRole)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to revoke grant', error)
    }
  }

  const handleRotateApiKey = async () => {
    if (!userId || !userName || !userRole) return
    try {
      await updateDeviceAction(deviceId, 'rotateKey', userId, userName, userRole)
      setShowApiKey(true)
      setRefreshKey((prev) => prev + 1)
      toast({
        title: 'API key rotated',
        description: 'The new device key is now shown in the credentials panel.',
      })
    } catch (error) {
      console.error('Failed to rotate API key', error)
    }
  }

  const showEditDeviceNotice = () => {
    toast({
      title: 'Edit device is not connected yet',
      description: 'Device identity edits are outside this MVP demo flow.',
    })
  }

  const getDeviceHealth = (devId: string) => {
    return deviceHealth.find(h => h.deviceId === devId)
  }

  // Device not found state
  if (!device) {
    return (
      <DashboardLayout title="Device Not Found">
        <div className="mx-auto max-w-2xl">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-red-900">Device not found</CardTitle>
                  <p className="mt-1 text-sm text-red-700">The device you&apos;re looking for doesn&apos;t exist or has been removed.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/dashboard/devices">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Devices
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const pendingRequests = accessRequests.filter(ar => ar.status === 'pending')
  const latestTelemetry = telemetryData.length > 0 ? telemetryData[telemetryData.length - 1] : null

  // Generate chart data from telemetry or use mock
  const telemetryHistory = telemetryData.length > 0
    ? telemetryData.slice(-24).map(t => ({
        time: t.timestamp,
        value: typeof t.data.temperature === 'number' ? t.data.temperature : 
               typeof t.data.noise_level === 'number' ? t.data.noise_level :
               typeof t.data.occupancy === 'number' ? t.data.occupancy :
               Object.values(t.data).find(v => typeof v === 'number') || 0
      }))
    : Array.from({ length: 24 }, (_, i) => ({
        time: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 25 + Math.sin(i / 4) * 5 + Math.random() * 2
      }))

  return (
    <DashboardLayout title={device.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <StatusBadge status={device.status} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {device.location}
            </div>
            <Badge variant="secondary" className="text-xs">
              <Eye className="mr-1 h-3 w-3" />
              {device.visibility === 'catalog' ? 'Public' : 'Private'}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={showEditDeviceNotice}>
              Edit Device
            </Button>
          </div>
        </div>

        {/* Latest Telemetry Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {device.metrics.map((metric) => {
            const value = latestTelemetry?.data[metric.key]
            return (
              <Card key={metric.key}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {getMetricIcon(metric.key)}
                      <span className="text-sm">{metric.label}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {value !== undefined ? `${value}${metric.unit}` : '--'}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Chart and Controls */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Telemetry Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Telemetry History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(val) => format(new Date(val), 'MMM d, HH:mm')}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Simulator Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Simulator Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use the simulator to test your device integration by generating mock telemetry data.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={simulatorRunning ? handleStopSimulator : handleStartSimulator}
                  variant={simulatorRunning ? 'destructive' : 'default'}
                  className={simulatorRunning ? '' : 'bg-primary hover:bg-primary/90'}
                >
                  {simulatorRunning ? (
                    <>
                      <Square className="mr-2 h-4 w-4" />
                      Stop Simulator
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Simulator
                    </>
                  )}
                </Button>
                <Button variant="outline" disabled={!simulatorRunning} onClick={handleInjectAnomaly}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Inject Anomaly
                </Button>
              </div>
              {simulatorRunning && (
                <p className="text-xs text-green-600">Simulator is running... Generating data every 3 seconds</p>
              )}
            </CardContent>
          </Card>

          {/* Device Health */}
          {getDeviceHealth(device.id) ? (
            <HealthCard health={getDeviceHealth(device.id)!} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Device Health</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No health data available yet. Start the simulator to generate telemetry.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* API Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">API Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Device ID</label>
                <div className="flex items-center gap-2">
                  <Input value={device.id} readOnly className="font-mono" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(device.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">API Key</label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={device.apiKey}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(device.apiKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Rotate API Key</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to rotate the API key? The current key will be invalidated immediately.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button variant="destructive" onClick={handleRotateApiKey}>
                            Rotate Key
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Access Requests
              {pendingRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingRequests.length} pending
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accessRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No access requests yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Developer</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Requested Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.developerName}</p>
                          <p className="text-xs text-muted-foreground">{request.developerEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm text-muted-foreground">
                          {request.purpose}
                        </p>
                      </TableCell>
                      <TableCell>{request.requestedUntil}</TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {request.status === 'pending' && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => handleApproveRequest(request.id)}>
                              <Check className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => handleRejectRequest(request.id)}>
                              <X className="mr-1 h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Active Grants */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Active Access Grants</CardTitle>
          </CardHeader>
          <CardContent>
            {accessGrants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active grants.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Developer</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Expires At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessGrants.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell className="font-medium">{grant.developerName}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {grant.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{grant.expiresAt}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => handleRevokeGrant(grant.id)}>
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
