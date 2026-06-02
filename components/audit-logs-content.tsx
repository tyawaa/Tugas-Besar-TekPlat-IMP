'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout, KPICard, StatusBadge } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AuditLog } from '@/lib/mock-data'
import { getAuditLogs } from '@/lib/api'
import { format } from 'date-fns'
import { ChevronRight, FileText, CheckCircle, AlertCircle, Shield } from 'lucide-react'

export function AuditLogsContent() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [actorFilter, setActorFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all')
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load audit logs from API
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const logs = await getAuditLogs()
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setAuditLogs(logs)
      } catch (error) {
        console.error('Failed to load audit logs', error)
      }
    }
    loadLogs()
  }, [refreshKey])

  // Periodically refresh to catch new logs
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const filteredLogs = auditLogs.filter((log) => {
    const matchesActor = actorFilter === 'all' || log.actorId === actorFilter
    const matchesAction = actionFilter === 'all' || log.action === actionFilter
    const matchesOutcome = outcomeFilter === 'all' || log.outcome === outcomeFilter
    const matchesTargetType = targetTypeFilter === 'all' || log.targetType === targetTypeFilter
    
    return matchesActor && matchesAction && matchesOutcome && matchesTargetType
  })

  const successCount = auditLogs.filter(l => l.outcome === 'success').length
  const failureCount = auditLogs.filter(l => l.outcome === 'failure').length
  const securityEvents = auditLogs.filter(l => 
    l.action.includes('suspend') || l.action.includes('revoke') || l.action.includes('disable')
  ).length

  const uniqueActors = [...new Set(auditLogs.map(l => l.actorId))]
  const uniqueActions = [...new Set(auditLogs.map(l => l.action))]
  const uniqueTargetTypes = [...new Set(auditLogs.map(l => l.targetType))]

  return (
    <DashboardLayout title="Audit Logs">
      <div className="space-y-6">
        {/* Subtitle */}
        <div>
          <p className="text-muted-foreground">
            Track important platform actions and governance events for compliance and monitoring.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <KPICard title="Total Logs" value={auditLogs.length} icon={<FileText className="h-5 w-5" />} />
          <KPICard title="Successful Events" value={successCount} icon={<CheckCircle className="h-5 w-5" />} />
          <KPICard title="Failed Events" value={failureCount} icon={<AlertCircle className="h-5 w-5" />} />
          <KPICard title="Security Events" value={securityEvents} icon={<Shield className="h-5 w-5" />} />
        </div>

        {/* Filters */}
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {/* Actor Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Actor
                </label>
                <Select value={actorFilter} onValueChange={setActorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueActors.map((actorId) => {
                      const log = auditLogs.find(l => l.actorId === actorId)
                      return (
                        <SelectItem key={actorId} value={actorId}>
                          {log?.actorName}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Action Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Action
                </label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueActions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Outcome Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Outcome
                </label>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Target Type Filter */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Target Type
                </label>
                <Select value={targetTypeFilter} onValueChange={setTargetTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueTargetTypes.map((targetType) => (
                      <SelectItem key={targetType} value={targetType}>
                        {targetType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reset Button */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setActorFilter('all')
                    setActionFilter('all')
                    setOutcomeFilter('all')
                    setTargetTypeFilter('all')
                  }}
                  className="w-full"
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Audit Log Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target Type</TableHead>
                    <TableHead>Target ID</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {log.actorName}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm capitalize">
                          {log.actorRole}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {log.action}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm capitalize">
                          {log.targetType}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.targetId}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={log.outcome === 'success' ? 'approved' : 'rejected'} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedLog(log)
                            }}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              Full information about this audit event
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Timestamp</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(selectedLog.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Outcome</p>
                  <p className="text-sm">
                    <StatusBadge status={selectedLog.outcome === 'success' ? 'approved' : 'rejected'} />
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Actor</p>
                  <p className="text-sm font-medium text-foreground">{selectedLog.actorName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Role</p>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedLog.actorRole}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Action</p>
                  <p className="text-sm font-medium text-foreground">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Target Type</p>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedLog.targetType}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Target ID</p>
                <p className="text-sm font-mono text-foreground break-all">{selectedLog.targetId}</p>
              </div>
              {selectedLog.details && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Details</p>
                  <p className="text-sm text-muted-foreground">{selectedLog.details}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
