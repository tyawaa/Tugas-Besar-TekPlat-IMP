'use client'

import { useEffect, useState } from 'react'
import { Device, AccessRequest, AccessGrant, TelemetryRecord } from './mock-data'
import { IoTBridgeDataStore } from './data-store'

export function useIoTBridgeData() {
  const [devices, setDevices] = useState<Device[]>([])
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load data from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDevices(IoTBridgeDataStore.getAllDevices())
      setAccessRequests(IoTBridgeDataStore.getAllAccessRequests())
      setGrants(IoTBridgeDataStore.getAllAccessGrants())
      setIsLoading(false)
    }
  }, [])

  return {
    devices,
    setDevices,
    accessRequests,
    setAccessRequests,
    grants,
    setGrants,
    telemetry,
    setTelemetry,
    isLoading,
  }
}

// Hook for managing a single device's telemetry simulation
export function useSimulator(deviceId: string) {
  const [isRunning, setIsRunning] = useState(false)
  const [telemetryData, setTelemetryData] = useState<any[]>([])

  const startSimulator = () => {
    setIsRunning(true)
  }

  const stopSimulator = () => {
    setIsRunning(false)
  }

  const injectAnomaly = () => {
    // This will be called to inject an abnormal reading
  }

  return {
    isRunning,
    startSimulator,
    stopSimulator,
    injectAnomaly,
    telemetryData,
  }
}
