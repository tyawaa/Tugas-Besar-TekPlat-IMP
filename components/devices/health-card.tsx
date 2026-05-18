'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DeviceHealth, getHealthLabel } from '@/lib/mock-data'
import { HealthBadge } from './health-badge'
import { Activity, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface HealthCardProps {
  health: DeviceHealth
}

export function HealthCard({ health }: HealthCardProps) {
  const lastSeenTime = formatDistanceToNow(new Date(health.lastSeen), { addSuffix: true })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Health</CardTitle>
        <CardDescription>Reliability and data quality indicators</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <HealthBadge score={health.score} />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-600">Uptime</div>
            <div className="text-2xl font-semibold">{health.uptime.toFixed(1)}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-600">Errors</div>
            <div className="text-2xl font-semibold">{health.ingestionErrors}</div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">Last seen</span>
            <span className="font-medium">{lastSeenTime}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">Active grants</span>
            <span className="font-medium">{health.activeGrants}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">Health score is calculated from uptime, recent telemetry, and ingestion reliability.</p>
        </div>
      </CardContent>
    </Card>
  )
}
