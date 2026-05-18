'use client'

// Comprehensive action creators for IoTBridge MVP demo
import { Device, AccessRequest, AccessGrant, TelemetryRecord, UserRole } from './mock-data'
import { IoTBridgeDataStore } from './data-store'

export const IoTBridgeActions = {
  // Device actions
  registerDevice: (deviceData: Omit<Device, 'id' | 'apiKey' | 'createdAt'>) => {
    const newDevice: Device = {
      ...deviceData,
      id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      apiKey: `iot_key_${Math.random().toString(36).substr(2, 20).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    }
    IoTBridgeDataStore.addDevice(newDevice)
    return newDevice
  },

  suspendDevice: (deviceId: string, actorId: string, actorName: string, actorRole: UserRole) => {
    IoTBridgeDataStore.updateDevice(deviceId, { status: 'suspended' })
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'device.suspended', 'device', deviceId)
  },

  reinstateDevice: (deviceId: string, actorId: string, actorName: string, actorRole: UserRole) => {
    IoTBridgeDataStore.updateDevice(deviceId, { status: 'online' })
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'device.reinstated', 'device', deviceId)
  },

  archiveDevice: (deviceId: string, actorId: string, actorName: string, actorRole: UserRole) => {
    IoTBridgeDataStore.updateDevice(deviceId, { status: 'archived' })
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'device.archived', 'device', deviceId)
  },

  rotateDeviceApiKey: (deviceId: string, actorId: string, actorName: string, actorRole: UserRole) => {
    const apiKey = `iot_key_${Math.random().toString(36).substr(2, 20).toUpperCase()}`
    IoTBridgeDataStore.updateDevice(deviceId, { apiKey })
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'device.api_key_rotated', 'device', deviceId)
    return apiKey
  },

  // Access request actions
  createAccessRequest: (
    deviceId: string,
    developerId: string,
    developerName: string,
    developerEmail: string,
    purpose: string,
    scopes: string[],
    requestedUntil: string
  ) => {
    const request: AccessRequest = {
      id: `ar_${Date.now()}`,
      deviceId,
      developerId,
      developerName,
      developerEmail,
      purpose,
      scopes,
      requestedUntil,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    IoTBridgeDataStore.addAccessRequest(request)
    IoTBridgeDataStore.logAction(developerId, developerName, 'developer', 'access.requested', 'access_request', request.id)
    return request
  },

  approveAccessRequest: (
    requestId: string,
    actorId: string,
    actorName: string,
    actorRole: UserRole
  ) => {
    const request = IoTBridgeDataStore.getAllAccessRequests().find(r => r.id === requestId)
    if (!request) return

    // Update request status
    IoTBridgeDataStore.updateAccessRequest(requestId, {
      status: 'approved',
    })

    // Create access grant
    const grant: AccessGrant = {
      id: `ag_${Date.now()}`,
      deviceId: request.deviceId,
      developerId: request.developerId,
      developerName: request.developerName,
      scopes: request.scopes,
      token: `token_${Math.random().toString(36).substr(2, 32).toUpperCase()}`,
      expiresAt: request.requestedUntil,
      createdAt: new Date().toISOString(),
    }
    IoTBridgeDataStore.addAccessGrant(grant)

    // Log action
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'access.approved', 'access_request', requestId)

    return grant
  },

  rejectAccessRequest: (
    requestId: string,
    actorId: string,
    actorName: string,
    actorRole: UserRole
  ) => {
    IoTBridgeDataStore.updateAccessRequest(requestId, {
      status: 'rejected',
    })
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'access.rejected', 'access_request', requestId)
  },

  revokeAccessGrant: (
    grantId: string,
    actorId: string,
    actorName: string,
    actorRole: UserRole
  ) => {
    // Find the grant to get deviceId and developerId
    const grant = IoTBridgeDataStore.getAllAccessGrants().find(g => g.id === grantId)
    if (grant) {
      // Find the corresponding approved request and update it to revoked
      const requests = IoTBridgeDataStore.getAllAccessRequests()
      const request = requests.find(
        r => r.deviceId === grant.deviceId && 
             r.developerId === grant.developerId && 
             r.status === 'approved'
      )
      if (request) {
        IoTBridgeDataStore.updateAccessRequest(request.id, { status: 'revoked' })
      }
    }
    // Remove the grant
    IoTBridgeDataStore.revokeAccessGrant(grantId)
    IoTBridgeDataStore.logAction(actorId, actorName, actorRole, 'access.revoked', 'access_grant', grantId)
  },

  // Telemetry actions
  addTelemetry: (deviceId: string, data: Record<string, number | boolean | string>) => {
    const record: TelemetryRecord = {
      id: `tel_${Date.now()}`,
      deviceId,
      timestamp: new Date().toISOString(),
      data,
    }
    IoTBridgeDataStore.addTelemetry(record)
    // Also update device last seen
    IoTBridgeDataStore.updateDevice(deviceId, { lastSeen: new Date().toISOString() })
    return record
  },
}
