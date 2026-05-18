// Mock data for IoTBridge platform

export type UserRole = 'device_owner' | 'developer' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
  status: 'active' | 'suspended'
}

export interface Device {
  id: string
  name: string
  type: string
  location: string
  description: string
  ownerId: string
  status: 'online' | 'offline' | 'suspended' | 'archived'
  visibility: 'private' | 'catalog'
  lastSeen: string
  heartbeatInterval: number
  metrics: Metric[]
  apiKey: string
  createdAt: string
}

export interface Metric {
  key: string
  label: string
  valueType: 'number' | 'boolean' | 'string'
  unit: string
}

export interface TelemetryRecord {
  id: string
  deviceId: string
  timestamp: string
  data: Record<string, number | boolean | string>
}

export interface AccessRequest {
  id: string
  deviceId: string
  developerId: string
  developerName: string
  developerEmail: string
  purpose: string
  scopes: string[]
  requestedUntil: string
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  createdAt: string
}

export interface AccessGrant {
  id: string
  deviceId: string
  developerId: string
  developerName: string
  scopes: string[]
  expiresAt: string
  token: string
  createdAt: string
}

export interface AuditLog {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: UserRole
  action: string
  targetType: 'device' | 'user' | 'access_request' | 'access_grant'
  targetId: string
  outcome: 'success' | 'failure'
  details?: string
}

export interface DeviceHealth {
  deviceId: string
  score: number // 0-100
  uptime: number // percentage
  lastSeen: string
  ingestionErrors: number
  dataQuality: 'excellent' | 'good' | 'needs_review' | 'unstable'
  activeGrants: number
}

export interface ApiEndpoint {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  authentication: 'bearer' | 'device_key'
  parameters: Array<{ name: string; type: string; required: boolean }>
  sampleRequest?: string
  sampleResponse?: object
}

// Mock Users
export const users: User[] = [
  { id: 'u1', name: 'Ahmad Fauzi', email: 'ahmad.fauzi@campus.edu', role: 'device_owner', createdAt: '2024-01-15', status: 'active' },
  { id: 'u2', name: 'Siti Rahayu', email: 'siti.rahayu@campus.edu', role: 'developer', createdAt: '2024-02-20', status: 'active' },
  { id: 'u3', name: 'Budi Santoso', email: 'budi.santoso@campus.edu', role: 'developer', createdAt: '2024-03-10', status: 'active' },
  { id: 'u4', name: 'Dewi Lestari', email: 'dewi.lestari@campus.edu', role: 'device_owner', createdAt: '2024-02-01', status: 'active' },
  { id: 'u5', name: 'Admin Campus', email: 'admin@campus.edu', role: 'admin', createdAt: '2024-01-01', status: 'active' },
  { id: 'u6', name: 'Rina Wijaya', email: 'rina.wijaya@campus.edu', role: 'developer', createdAt: '2024-04-05', status: 'suspended' },
]

// Mock Devices
export const devices: Device[] = [
  {
    id: 'dev-001',
    name: 'Weather Station Labtek VIII',
    type: 'Weather Station',
    location: 'Labtek VIII Rooftop',
    description: 'Multi-sensor weather monitoring station with temperature, humidity, and pressure sensors.',
    ownerId: 'u1',
    status: 'online',
    visibility: 'catalog',
    lastSeen: '2024-03-15T14:32:00Z',
    heartbeatInterval: 60,
    metrics: [
      { key: 'temperature', label: 'Temperature', valueType: 'number', unit: '°C' },
      { key: 'humidity', label: 'Humidity', valueType: 'number', unit: '%' },
      { key: 'pressure', label: 'Pressure', valueType: 'number', unit: 'hPa' },
    ],
    apiKey: 'iot_key_abc123xyz789',
    createdAt: '2024-01-20',
  },
  {
    id: 'dev-002',
    name: 'Noise Sensor Library',
    type: 'Noise Sensor',
    location: 'Main Library Floor 2',
    description: 'Ambient noise level monitoring for quiet study zones.',
    ownerId: 'u1',
    status: 'online',
    visibility: 'catalog',
    lastSeen: '2024-03-15T14:30:00Z',
    heartbeatInterval: 30,
    metrics: [
      { key: 'noise_level', label: 'Noise Level', valueType: 'number', unit: 'dB' },
      { key: 'peak_noise', label: 'Peak Noise', valueType: 'number', unit: 'dB' },
    ],
    apiKey: 'iot_key_def456uvw012',
    createdAt: '2024-02-05',
  },
  {
    id: 'dev-003',
    name: 'Occupancy Counter Classroom 7602',
    type: 'Occupancy Sensor',
    location: 'Building 7 Room 602',
    description: 'Real-time occupancy counting using IR beam sensors.',
    ownerId: 'u4',
    status: 'online',
    visibility: 'catalog',
    lastSeen: '2024-03-15T14:31:00Z',
    heartbeatInterval: 15,
    metrics: [
      { key: 'occupancy', label: 'Current Occupancy', valueType: 'number', unit: 'people' },
      { key: 'capacity', label: 'Room Capacity', valueType: 'number', unit: 'people' },
    ],
    apiKey: 'iot_key_ghi789rst345',
    createdAt: '2024-02-10',
  },
  {
    id: 'dev-004',
    name: 'Air Quality Sensor Lab',
    type: 'Air Quality',
    location: 'Chemistry Lab Building A',
    description: 'Monitors CO2, VOC, and particulate matter levels.',
    ownerId: 'u4',
    status: 'offline',
    visibility: 'catalog',
    lastSeen: '2024-03-14T09:15:00Z',
    heartbeatInterval: 120,
    metrics: [
      { key: 'co2', label: 'CO2 Level', valueType: 'number', unit: 'ppm' },
      { key: 'voc', label: 'VOC Index', valueType: 'number', unit: 'index' },
      { key: 'pm25', label: 'PM2.5', valueType: 'number', unit: 'µg/m³' },
    ],
    apiKey: 'iot_key_jkl012mno678',
    createdAt: '2024-02-15',
  },
  {
    id: 'dev-005',
    name: 'Parking Lot Sensor A',
    type: 'Parking Sensor',
    location: 'Parking Area A',
    description: 'Tracks available parking spots using ultrasonic sensors.',
    ownerId: 'u1',
    status: 'suspended',
    visibility: 'private',
    lastSeen: '2024-03-10T16:00:00Z',
    heartbeatInterval: 60,
    metrics: [
      { key: 'available_spots', label: 'Available Spots', valueType: 'number', unit: 'spots' },
      { key: 'total_spots', label: 'Total Spots', valueType: 'number', unit: 'spots' },
    ],
    apiKey: 'iot_key_pqr345stu901',
    createdAt: '2024-01-25',
  },
  {
    id: 'dev-006',
    name: 'Energy Meter Building 5',
    type: 'Energy Meter',
    location: 'Building 5 Electrical Room',
    description: 'Real-time energy consumption monitoring.',
    ownerId: 'u4',
    status: 'online',
    visibility: 'private',
    lastSeen: '2024-03-15T14:32:30Z',
    heartbeatInterval: 300,
    metrics: [
      { key: 'power', label: 'Current Power', valueType: 'number', unit: 'kW' },
      { key: 'energy_today', label: 'Energy Today', valueType: 'number', unit: 'kWh' },
    ],
    apiKey: 'iot_key_vwx678yza234',
    createdAt: '2024-03-01',
  },
]

// Mock Telemetry Records
export const telemetryRecords: TelemetryRecord[] = [
  { id: 't1', deviceId: 'dev-001', timestamp: '2024-03-15T14:32:00Z', data: { temperature: 28.5, humidity: 65, pressure: 1013.25 } },
  { id: 't2', deviceId: 'dev-001', timestamp: '2024-03-15T14:31:00Z', data: { temperature: 28.4, humidity: 64, pressure: 1013.20 } },
  { id: 't3', deviceId: 'dev-001', timestamp: '2024-03-15T14:30:00Z', data: { temperature: 28.3, humidity: 65, pressure: 1013.22 } },
  { id: 't4', deviceId: 'dev-002', timestamp: '2024-03-15T14:30:00Z', data: { noise_level: 42, peak_noise: 58 } },
  { id: 't5', deviceId: 'dev-003', timestamp: '2024-03-15T14:31:00Z', data: { occupancy: 23, capacity: 40 } },
  { id: 't6', deviceId: 'dev-004', timestamp: '2024-03-14T09:15:00Z', data: { co2: 450, voc: 120, pm25: 12 } },
]

// Generate telemetry history for charts
export function generateTelemetryHistory(deviceId: string, metric: string, hours: number = 24): { time: string; value: number }[] {
  const data: { time: string; value: number }[] = []
  const now = new Date()
  
  for (let i = hours; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000)
    let value: number
    
    switch (metric) {
      case 'temperature':
        value = 25 + Math.sin(i / 4) * 5 + Math.random() * 2
        break
      case 'humidity':
        value = 60 + Math.cos(i / 6) * 15 + Math.random() * 5
        break
      case 'noise_level':
        value = 35 + Math.random() * 20
        break
      case 'occupancy':
        value = Math.floor(Math.random() * 40)
        break
      default:
        value = Math.random() * 100
    }
    
    data.push({
      time: time.toISOString(),
      value: Math.round(value * 10) / 10,
    })
  }
  
  return data
}

// Mock Access Requests
export const accessRequests: AccessRequest[] = [
  {
    id: 'ar-001',
    deviceId: 'dev-001',
    developerId: 'u2',
    developerName: 'Siti Rahayu',
    developerEmail: 'siti.rahayu@campus.edu',
    purpose: 'Research project on campus microclimate analysis for sustainability study.',
    scopes: ['telemetry:read'],
    requestedUntil: '2024-06-30',
    status: 'pending',
    createdAt: '2024-03-10',
  },
  {
    id: 'ar-002',
    deviceId: 'dev-002',
    developerId: 'u3',
    developerName: 'Budi Santoso',
    developerEmail: 'budi.santoso@campus.edu',
    purpose: 'Building smart study room recommendation app for students.',
    scopes: ['telemetry:read', 'telemetry:history'],
    requestedUntil: '2024-05-15',
    status: 'approved',
    createdAt: '2024-03-05',
  },
  {
    id: 'ar-003',
    deviceId: 'dev-003',
    developerId: 'u2',
    developerName: 'Siti Rahayu',
    developerEmail: 'siti.rahayu@campus.edu',
    purpose: 'Campus space utilization analysis dashboard.',
    scopes: ['telemetry:read'],
    requestedUntil: '2024-07-31',
    status: 'pending',
    createdAt: '2024-03-12',
  },
  {
    id: 'ar-004',
    deviceId: 'dev-004',
    developerId: 'u3',
    developerName: 'Budi Santoso',
    developerEmail: 'budi.santoso@campus.edu',
    purpose: 'Air quality monitoring mobile app for campus health initiative.',
    scopes: ['telemetry:read', 'telemetry:history'],
    requestedUntil: '2024-08-31',
    status: 'rejected',
    createdAt: '2024-03-01',
  },
]

// Mock Access Grants
export const accessGrants: AccessGrant[] = [
  {
    id: 'ag-001',
    deviceId: 'dev-002',
    developerId: 'u3',
    developerName: 'Budi Santoso',
    scopes: ['telemetry:read', 'telemetry:history'],
    expiresAt: '2024-05-15',
    token: 'grant_tok_abc123def456ghi789',
    createdAt: '2024-03-06',
  },
  {
    id: 'ag-002',
    deviceId: 'dev-001',
    developerId: 'u3',
    developerName: 'Budi Santoso',
    scopes: ['telemetry:read'],
    expiresAt: '2024-04-30',
    token: 'grant_tok_jkl012mno345pqr678',
    createdAt: '2024-02-15',
  },
]

// Mock Audit Logs
export const auditLogs: AuditLog[] = [
  { id: 'al-001', timestamp: '2024-03-15T14:30:00Z', actorId: 'u1', actorName: 'Ahmad Fauzi', actorRole: 'device_owner', action: 'device.telemetry.received', targetType: 'device', targetId: 'dev-001', outcome: 'success' },
  { id: 'al-002', timestamp: '2024-03-15T14:25:00Z', actorId: 'u2', actorName: 'Siti Rahayu', actorRole: 'developer', action: 'access.request.created', targetType: 'access_request', targetId: 'ar-003', outcome: 'success' },
  { id: 'al-003', timestamp: '2024-03-15T12:00:00Z', actorId: 'u5', actorName: 'Admin Campus', actorRole: 'admin', action: 'device.suspended', targetType: 'device', targetId: 'dev-005', outcome: 'success', details: 'Maintenance required' },
  { id: 'al-004', timestamp: '2024-03-14T16:45:00Z', actorId: 'u4', actorName: 'Dewi Lestari', actorRole: 'device_owner', action: 'access.request.rejected', targetType: 'access_request', targetId: 'ar-004', outcome: 'success' },
  { id: 'al-005', timestamp: '2024-03-14T10:30:00Z', actorId: 'u1', actorName: 'Ahmad Fauzi', actorRole: 'device_owner', action: 'access.request.approved', targetType: 'access_request', targetId: 'ar-002', outcome: 'success' },
  { id: 'al-006', timestamp: '2024-03-13T09:00:00Z', actorId: 'u5', actorName: 'Admin Campus', actorRole: 'admin', action: 'user.suspended', targetType: 'user', targetId: 'u6', outcome: 'success', details: 'Policy violation' },
  { id: 'al-007', timestamp: '2024-03-12T14:20:00Z', actorId: 'u4', actorName: 'Dewi Lestari', actorRole: 'device_owner', action: 'device.registered', targetType: 'device', targetId: 'dev-006', outcome: 'success' },
  { id: 'al-008', timestamp: '2024-03-11T11:15:00Z', actorId: 'u3', actorName: 'Budi Santoso', actorRole: 'developer', action: 'api.data.accessed', targetType: 'device', targetId: 'dev-002', outcome: 'success' },
]

// Helper functions
export function getDevicesByOwner(ownerId: string): Device[] {
  return devices.filter(d => d.ownerId === ownerId)
}

export function getCatalogDevices(): Device[] {
  return devices.filter(d => d.visibility === 'catalog' && d.status !== 'archived')
}

export function getAccessRequestsByDevice(deviceId: string): AccessRequest[] {
  return accessRequests.filter(ar => ar.deviceId === deviceId)
}

export function getAccessGrantsByDevice(deviceId: string): AccessGrant[] {
  return accessGrants.filter(ag => ag.deviceId === deviceId)
}

export function getAccessGrantsByDeveloper(developerId: string): AccessGrant[] {
  return accessGrants.filter(ag => ag.developerId === developerId)
}

export function getLatestTelemetry(deviceId: string): TelemetryRecord | undefined {
  return telemetryRecords.find(t => t.deviceId === deviceId)
}

// Statistics
export function getOwnerStats(ownerId: string) {
  const ownerDevices = getDevicesByOwner(ownerId)
  return {
    totalDevices: ownerDevices.length,
    onlineDevices: ownerDevices.filter(d => d.status === 'online').length,
    pendingRequests: accessRequests.filter(ar => 
      ownerDevices.some(d => d.id === ar.deviceId) && ar.status === 'pending'
    ).length,
    totalTelemetryRecords: telemetryRecords.filter(t => 
      ownerDevices.some(d => d.id === t.deviceId)
    ).length * 1000, // Simulated larger number
  }
}

export function getAdminStats() {
  return {
    totalUsers: users.length,
    totalDevices: devices.length,
    offlineDevices: devices.filter(d => d.status === 'offline').length,
    suspendedDevices: devices.filter(d => d.status === 'suspended').length,
    activeGrants: accessGrants.length,
    pendingRequests: accessRequests.filter(ar => ar.status === 'pending').length,
  }
}

// Mock Device Health
export const deviceHealth: DeviceHealth[] = [
  {
    deviceId: 'dev-001',
    score: 96,
    uptime: 99.8,
    lastSeen: '2024-03-15T14:32:00Z',
    ingestionErrors: 2,
    dataQuality: 'excellent',
    activeGrants: 2,
  },
  {
    deviceId: 'dev-002',
    score: 88,
    uptime: 98.5,
    lastSeen: '2024-03-15T14:30:00Z',
    ingestionErrors: 5,
    dataQuality: 'good',
    activeGrants: 1,
  },
  {
    deviceId: 'dev-003',
    score: 79,
    uptime: 97.2,
    lastSeen: '2024-03-15T14:31:00Z',
    ingestionErrors: 12,
    dataQuality: 'good',
    activeGrants: 0,
  },
  {
    deviceId: 'dev-004',
    score: 42,
    uptime: 68.5,
    lastSeen: '2024-03-14T09:15:00Z',
    ingestionErrors: 45,
    dataQuality: 'unstable',
    activeGrants: 0,
  },
  {
    deviceId: 'dev-005',
    score: 35,
    uptime: 0,
    lastSeen: '2024-03-10T16:00:00Z',
    ingestionErrors: 120,
    dataQuality: 'unstable',
    activeGrants: 0,
  },
  {
    deviceId: 'dev-006',
    score: 92,
    uptime: 99.5,
    lastSeen: '2024-03-15T14:32:30Z',
    ingestionErrors: 1,
    dataQuality: 'excellent',
    activeGrants: 0,
  },
]

// Mock API Endpoints
export const apiEndpoints: ApiEndpoint[] = [
  {
    id: 'ep-001',
    method: 'GET',
    path: '/api/v1/data/devices/{deviceId}/latest',
    description: 'Get the latest telemetry data for a device',
    authentication: 'bearer',
    parameters: [
      { name: 'deviceId', type: 'string', required: true },
    ],
    sampleResponse: {
      deviceId: 'dev_weather_labtek_8',
      observedAt: '2026-06-01T08:00:00Z',
      metrics: {
        temperature: { value: 26.4, unit: 'C' },
        humidity: { value: 68, unit: '%' },
      },
    },
  },
  {
    id: 'ep-002',
    method: 'GET',
    path: '/api/v1/data/devices/{deviceId}/history',
    description: 'Get historical telemetry data with date range filtering',
    authentication: 'bearer',
    parameters: [
      { name: 'deviceId', type: 'string', required: true },
      { name: 'from', type: 'ISO8601 timestamp', required: false },
      { name: 'to', type: 'ISO8601 timestamp', required: false },
      { name: 'limit', type: 'integer', required: false },
    ],
    sampleResponse: {
      deviceId: 'dev_weather_labtek_8',
      records: [
        { observedAt: '2026-06-01T08:00:00Z', metrics: { temperature: 26.4 } },
        { observedAt: '2026-06-01T07:00:00Z', metrics: { temperature: 26.1 } },
      ],
    },
  },
  {
    id: 'ep-003',
    method: 'POST',
    path: '/api/v1/access-requests',
    description: 'Create a new access request to use device telemetry',
    authentication: 'bearer',
    parameters: [
      { name: 'deviceId', type: 'string', required: true },
      { name: 'purpose', type: 'string', required: true },
      { name: 'scopes', type: 'array[string]', required: true },
      { name: 'requestedUntil', type: 'ISO8601 date', required: true },
    ],
  },
  {
    id: 'ep-004',
    method: 'POST',
    path: '/api/v1/ingestion/telemetry',
    description: 'Send telemetry data from your device to IoTBridge',
    authentication: 'device_key',
    parameters: [
      { name: 'X-Device-Id', type: 'header', required: true },
      { name: 'X-Device-Key', type: 'header', required: true },
      { name: 'metrics', type: 'object', required: true },
    ],
    sampleRequest: JSON.stringify({
      metrics: {
        temperature: 26.4,
        humidity: 68,
        pressure: 1013.25,
      },
    }),
  },
]

// Helper to get device health
export function getDeviceHealth(deviceId: string): DeviceHealth | undefined {
  return deviceHealth.find(h => h.deviceId === deviceId)
}

export function getHealthLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Needs Review'
  return 'Unstable'
}
