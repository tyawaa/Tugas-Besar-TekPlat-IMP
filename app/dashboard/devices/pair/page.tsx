'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { registerDevice } from '@/lib/api'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, CheckCircle2, Copy, AlertTriangle, ArrowRight, ArrowLeft, Play } from 'lucide-react'

const METRIC_PRESETS = {
  'weather-station': [
    { key: 'temperature', label: 'Temperature', valueType: 'number' as const, unit: '°C' },
    { key: 'humidity', label: 'Humidity', valueType: 'number' as const, unit: '%' },
    { key: 'pressure', label: 'Pressure', valueType: 'number' as const, unit: 'hPa' },
  ],
  'noise-sensor': [
    { key: 'noise_level', label: 'Noise Level', valueType: 'number' as const, unit: 'dB' },
    { key: 'peak_noise', label: 'Peak Noise', valueType: 'number' as const, unit: 'dB' },
  ],
  'occupancy-counter': [
    { key: 'occupancy', label: 'Occupancy Count', valueType: 'number' as const, unit: 'people' },
    { key: 'occupancy_pct', label: 'Occupancy %', valueType: 'number' as const, unit: '%' },
  ],
  'air-quality': [
    { key: 'pm25', label: 'PM2.5', valueType: 'number' as const, unit: 'µg/m³' },
    { key: 'co2', label: 'CO2', valueType: 'number' as const, unit: 'ppm' },
    { key: 'voc', label: 'VOC', valueType: 'number' as const, unit: 'ppb' },
  ],
}

interface MetricDefinition {
  id: string
  key: string
  label: string
  valueType: 'number' | 'boolean' | 'string'
  unit: string
}

export default function PairDevicePage() {
  const router = useRouter()
  const { userId } = useAuth()
  const [step, setStep] = useState(1)
  const [pairingMethod, setPairingMethod] = useState<'simulator' | 'code' | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'catalog'>('private')
  const [billingType, setBillingType] = useState<'free' | 'one_time'>('free')
  const [accessPrice, setAccessPrice] = useState('0')
  const [currency, setCurrency] = useState('IDR')
  const [heartbeatInterval, setHeartbeatInterval] = useState('60')
  const [metrics, setMetrics] = useState<MetricDefinition[]>([])
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [newDeviceId, setNewDeviceId] = useState<string | null>(null)
  const [newDeviceKey, setNewDeviceKey] = useState<string | null>(null)

  if (!userId) return null

  const addMetric = () => {
    setMetrics([
      ...metrics,
      { id: Date.now().toString(), key: '', label: '', valueType: 'number', unit: '' },
    ])
  }

  const removeMetric = (id: string) => {
    setMetrics(metrics.filter(m => m.id !== id))
  }

  const updateMetric = (id: string, field: keyof MetricDefinition, value: string) => {
    setMetrics(metrics.map(m => m.id === id ? { ...m, [field]: value } : m))
  }

  const applyPreset = (preset: keyof typeof METRIC_PRESETS) => {
    const presetMetrics = METRIC_PRESETS[preset].map((m, i) => ({
      ...m,
      id: `${Date.now()}_${i}`,
    }))
    setMetrics(presetMetrics)
  }

  const handleSubmit = async () => {
    if (!userId || !deviceName || !deviceType || !location) return

    try {
      const newDevice = await registerDevice({
        name: deviceName,
        type: deviceType,
        location,
        description,
        ownerId: userId,
        status: 'online',
        visibility,
        lastSeen: new Date().toISOString(),
        heartbeatInterval: parseInt(heartbeatInterval),
        metrics: metrics.map(m => ({
          key: m.key,
          label: m.label,
          valueType: m.valueType,
          unit: m.unit,
        })),
        billingType,
        accessPrice: billingType === 'one_time' ? Math.max(0, Math.round(Number(accessPrice || 0))) : 0,
        currency: currency.trim().toUpperCase() || 'IDR',
      })

      setNewDeviceId(newDevice.id)
      setNewDeviceKey(newDevice.apiKey || null)
      setIsSubmitted(true)
    } catch (error) {
      console.error('Failed to register device', error)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (isSubmitted && newDeviceId && newDeviceKey) {
    return (
      <DashboardLayout title="Device Paired Successfully">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-green-900">Device Paired Successfully</CardTitle>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credentials</CardTitle>
              <CardDescription>Save these securely. API key shown only once.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Device ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-slate-100 px-3 py-2 font-mono text-sm">{newDeviceId}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newDeviceId)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-slate-100 px-3 py-2 font-mono text-sm break-all">{newDeviceKey}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newDeviceKey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ingestion Endpoints</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">POST /api/v1/ingestion/telemetry</p>
                <pre className="rounded bg-slate-900 p-3 text-xs text-slate-100 overflow-x-auto">
                  {JSON.stringify({
                    headers: {
                      'X-Device-Id': newDeviceId,
                      'X-Device-Key': newDeviceKey,
                    },
                    body: {
                      metrics: {
                        temperature: 26.5,
                        humidity: 65,
                      },
                    },
                  }, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90">
              <a href={`/dashboard/devices/${newDeviceId}`}>
                <Play className="mr-2 h-4 w-4" />
                View & Start Simulator
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/dashboard/devices">Back to Devices</a>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Pair Device" subtitle="Connect a new IoT device to IoTBridge">
      <div className="mx-auto max-w-2xl">
        {/* Step Indicator */}
        <div className="mb-8 flex gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`flex h-10 w-10 items-center justify-center rounded-full font-medium ${
              s === step ? 'bg-primary text-white' : s < step ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {s}
            </div>
          ))}
        </div>

        {/* Step 1: Pairing Method */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Pairing Method</CardTitle>
              <CardDescription>Choose how to pair your device</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {['simulator', 'code'].map(method => (
                <button
                  key={method}
                  onClick={() => setPairingMethod(method as 'simulator' | 'code')}
                  className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition ${
                    pairingMethod === method
                      ? 'border-primary bg-primary/5'
                      : 'border-slate-200 hover:border-primary/30'
                  }`}
                >
                  <div className={`mt-1 h-5 w-5 rounded-full border-2 ${
                    pairingMethod === method ? 'border-primary bg-primary' : 'border-slate-300'
                  }`} />
                  <div>
                    <p className="font-medium capitalize">{method === 'simulator' ? 'Use Device Simulator' : 'Pair with Device Code'}</p>
                    <p className="text-sm text-slate-600">
                      {method === 'simulator' ? 'Generate mock telemetry for testing' : 'Use device pairing code'}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Device Identity */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Device Identity</CardTitle>
              <CardDescription>Name and configure your device</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Device Name</Label>
                <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g., Weather Station Labtek VIII" />
              </div>
              <div>
                <Label>Device Type</Label>
                <Input value={deviceType} onChange={e => setDeviceType(e.target.value)} placeholder="e.g., Weather Station" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g., Labtek VIII Rooftop" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Device description..." />
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={v => setVisibility(v as 'private' | 'catalog')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="catalog">Public Catalog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Access Pricing</Label>
                  <Select value={billingType} onValueChange={v => setBillingType(v as 'free' | 'one_time')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="one_time">Paid Once</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Price</Label>
                  <Input
                    type="number"
                    min={0}
                    value={accessPrice}
                    disabled={billingType !== 'one_time'}
                    onChange={e => setAccessPrice(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={currency} onChange={e => setCurrency(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Expected Heartbeat Interval (seconds)</Label>
                <Input type="number" value={heartbeatInterval} onChange={e => setHeartbeatInterval(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Metrics */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Metrics</CardTitle>
              <CardDescription>Define telemetry metrics or use presets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(METRIC_PRESETS).map(([key, _]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key as keyof typeof METRIC_PRESETS)}
                    className="text-xs"
                  >
                    {key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </Button>
                ))}
              </div>

              <div className="border-t pt-4 space-y-3">
                {metrics.map(m => (
                  <div key={m.id} className="grid grid-cols-2 gap-2 items-end pb-3 border-b">
                    <Input placeholder="Key" value={m.key} onChange={e => updateMetric(m.id, 'key', e.target.value)} />
                    <Input placeholder="Label" value={m.label} onChange={e => updateMetric(m.id, 'label', e.target.value)} />
                    <Select value={m.valueType} onValueChange={v => updateMetric(m.id, 'valueType', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                        <SelectItem value="string">String</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input placeholder="Unit" value={m.unit} onChange={e => updateMetric(m.id, 'unit', e.target.value)} />
                      <Button size="sm" variant="ghost" onClick={() => removeMetric(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={addMetric} variant="outline" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Metric
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 4: Review & Pair</CardTitle>
              <CardDescription>Confirm device configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm"><strong>Device:</strong> {deviceName}</p>
                <p className="text-sm"><strong>Type:</strong> {deviceType}</p>
                <p className="text-sm"><strong>Location:</strong> {location}</p>
                <p className="text-sm"><strong>Visibility:</strong> {visibility}</p>
                <p className="text-sm">
                  <strong>Access:</strong> {billingType === 'one_time' ? `${currency.toUpperCase()} ${Number(accessPrice || 0).toLocaleString('id-ID')}` : 'Free'}
                </p>
                <p className="text-sm"><strong>Metrics:</strong> {metrics.length} configured</p>
              </div>

              {metrics.length === 0 && (
                <div className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                  <p className="text-sm text-yellow-700">No metrics defined. Device will still be created without telemetry fields.</p>
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full bg-primary hover:bg-primary/90">
                Pair Device
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            className="ml-auto bg-primary hover:bg-primary/90"
            onClick={() => {
              if (step === 2 && (!deviceName || !deviceType || !location)) {
                return
              }
              if (step < 4) setStep(step + 1)
            }}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
