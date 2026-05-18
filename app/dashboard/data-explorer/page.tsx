'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Copy, Eye, EyeOff, Calendar, Code } from 'lucide-react'
import { AccessGrant, Device, TelemetryRecord } from '@/lib/mock-data'
import { IoTBridgeDataStore } from '@/lib/data-store'
import { useAuth } from '@/lib/auth-context'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

export default function DataExplorerPage() {
  const { userId } = useAuth()
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [telemetryData, setTelemetryData] = useState<TelemetryRecord[]>([])

  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState('temperature')
  const [dateRange, setDateRange] = useState('24h')

  // Load grants for current developer
  useEffect(() => {
    if (!userId) return
    
    const loadData = () => {
      // Get grants for the current developer
      const developerGrants = IoTBridgeDataStore.getAccessGrantsByDeveloper(userId)
      setGrants(developerGrants)
      
      // Get all devices
      const allDevices = IoTBridgeDataStore.getAllDevices()
      setDevices(allDevices)
      
      // Set default selected device
      if (developerGrants.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(developerGrants[0].deviceId)
      }
    }
    loadData()
  }, [userId, selectedDeviceId])

  // Load telemetry when device changes
  useEffect(() => {
    if (selectedDeviceId) {
      const deviceTelemetry = IoTBridgeDataStore.getTelemetryByDevice(selectedDeviceId)
      setTelemetryData(deviceTelemetry)
    }
  }, [selectedDeviceId])

  const selectedGrant = grants.find((g) => g.deviceId === selectedDeviceId)
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId)
  const latestTelemetry = telemetryData.length > 0 
    ? telemetryData[telemetryData.length - 1] 
    : null

  // Generate chart data from actual telemetry in localStorage
  const generateChartData = () => {
    if (telemetryData.length === 0) return []
    
    // Filter by date range
    const now = new Date()
    const hoursMap: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 }
    const hoursAgo = hoursMap[dateRange] || 24
    const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
    
    const filteredData = telemetryData
      .filter(t => new Date(t.timestamp) >= cutoffTime)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    
    return filteredData.map(t => ({
      time: t.timestamp,
      value: typeof t.data[selectedMetric] === 'number' ? t.data[selectedMetric] as number : 0
    }))
  }

  const telemetryHistory = generateChartData()

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (grants.length === 0) {
    return (
      <DashboardLayout title="Data Explorer">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">No Access Grants</h2>
            <p className="mt-2 text-muted-foreground">
              You need to request access to devices before using the Data Explorer.
            </p>
            <Button asChild className="mt-4">
              <a href="/dashboard/catalog">Browse Device Catalog</a>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Data Explorer">
      <div className="space-y-6">
        {/* Device Selector */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {grants.map((grant) => {
                      const device = devices.find((d) => d.id === grant.deviceId)
                      return (
                        <SelectItem key={grant.id} value={grant.deviceId}>
                          {device?.name || grant.deviceId}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              {selectedDevice && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{selectedDevice.type}</span>
                  <span>|</span>
                  <span>{selectedDevice.location}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedDevice && selectedGrant && (
          <>
            {/* API Token */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">API Token</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={selectedGrant.token}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(selectedGrant.token)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Expires: {selectedGrant.expiresAt}</span>
                  <span className="mx-2">|</span>
                  <span>Scopes:</span>
                  {selectedGrant.scopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Data View */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Latest Data */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Latest Data</CardTitle>
                </CardHeader>
                <CardContent>
                  {latestTelemetry ? (
                    <div className="space-y-3">
                      {Object.entries(latestTelemetry.data).map(([key, value]) => {
                        const metric = selectedDevice.metrics.find((m) => m.key === key)
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              {metric?.label || key}
                            </span>
                            <span className="font-medium">
                              {String(value)}
                              {metric?.unit}
                            </span>
                          </div>
                        )
                      })}
                      <div className="pt-2 text-xs text-muted-foreground">
                        Last updated: {format(new Date(latestTelemetry.timestamp), 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data available</p>
                  )}
                </CardContent>
              </Card>

              {/* History Chart */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">History</CardTitle>
                    <div className="flex gap-2">
                      <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedDevice.metrics.map((metric) => (
                            <SelectItem key={metric.key} value={metric.key}>
                              {metric.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger className="w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24 Hours</SelectItem>
                          <SelectItem value="7d">7 Days</SelectItem>
                          <SelectItem value="30d">30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {telemetryHistory.length > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={telemetryHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="time"
                            tickFormatter={(val) => format(new Date(val), dateRange === '24h' ? 'HH:mm' : 'MMM d')}
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
                  ) : (
                    <div className="flex h-[250px] items-center justify-center text-center">
                      <div>
                        <p className="text-muted-foreground">No telemetry data available yet.</p>
                        <p className="mt-1 text-sm text-muted-foreground">Start the simulator on the device detail page to generate data.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* API Reference */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Code className="h-4 w-4" />
                  API Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Get Latest Data</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 rounded bg-slate-900 px-3 py-2 font-mono text-sm text-white">
                        GET /api/v1/data/devices/{selectedDeviceId}/latest
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(`GET /api/v1/data/devices/${selectedDeviceId}/latest`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Get Historical Data</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 rounded bg-slate-900 px-3 py-2 font-mono text-sm text-white">
                        GET /api/v1/data/devices/{selectedDeviceId}/history?from=...&to=...
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(`GET /api/v1/data/devices/${selectedDeviceId}/history?from=...&to=...`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground mb-2">Sample Response</p>
                  <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-300">
{`{
  "deviceId": "${selectedDeviceId}",
  "timestamp": "${new Date().toISOString()}",
  "data": ${JSON.stringify(latestTelemetry?.data || {}, null, 2)}
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
