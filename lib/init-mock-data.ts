import { Device, AccessRequest, AccessGrant, TelemetryRecord, AuditLog, UserRole, devices as mockDevices, accessRequests as mockAccessRequests, accessGrants as mockAccessGrants, telemetryRecords as mockTelemetry, auditLogs as mockAuditLogs } from './mock-data'

// Initialize mock data to localStorage if empty
export function initializeMockData() {
  if (typeof window === 'undefined') return

  // Seed devices
  if (!localStorage.getItem('iotbridge_devices')) {
    localStorage.setItem('iotbridge_devices', JSON.stringify(mockDevices))
  }

  // Seed access requests
  if (!localStorage.getItem('iotbridge_access_requests')) {
    localStorage.setItem('iotbridge_access_requests', JSON.stringify(mockAccessRequests))
  }

  // Seed access grants
  if (!localStorage.getItem('iotbridge_access_grants')) {
    localStorage.setItem('iotbridge_access_grants', JSON.stringify(mockAccessGrants))
  }

  // Seed telemetry
  if (!localStorage.getItem('iotbridge_telemetry')) {
    localStorage.setItem('iotbridge_telemetry', JSON.stringify(mockTelemetry))
  }

  // Seed audit logs
  if (!localStorage.getItem('iotbridge_audit_logs')) {
    localStorage.setItem('iotbridge_audit_logs', JSON.stringify(mockAuditLogs))
  }
}
