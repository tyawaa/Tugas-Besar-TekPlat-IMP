'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccessRequest, AccessGrant, Device } from '@/lib/mock-data'
import { IoTBridgeDataStore } from '@/lib/data-store'
import { IoTBridgeActions } from '@/lib/actions'
import { useAuth } from '@/lib/auth-context'
import { StatusBadge, KPICard } from '@/components/layout/dashboard-layout'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, Clock, Eye, Ban } from 'lucide-react'

export default function AccessRequestsPage() {
  const { userId, userName, userRole } = useAuth()
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revoked'>('all')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load data from data store
  useEffect(() => {
    const loadData = () => {
      const allDevices = IoTBridgeDataStore.getAllDevices()
      setDevices(allDevices)
      
      // For device owner, show requests for devices they own
      if (userRole === 'device_owner' && userId) {
        const ownerDevices = allDevices.filter(d => d.ownerId === userId)
        const ownerDeviceIds = ownerDevices.map(d => d.id)
        const allRequests = IoTBridgeDataStore.getAllAccessRequests()
        const filteredRequests = allRequests.filter(ar => ownerDeviceIds.includes(ar.deviceId))
        setRequests(filteredRequests)
        
        const allGrants = IoTBridgeDataStore.getAllAccessGrants()
        const filteredGrants = allGrants.filter(g => ownerDeviceIds.includes(g.deviceId))
        setGrants(filteredGrants)
      } else if (userRole === 'admin') {
        // Admin sees all
        setRequests(IoTBridgeDataStore.getAllAccessRequests())
        setGrants(IoTBridgeDataStore.getAllAccessGrants())
      }
    }
    loadData()
  }, [userId, userRole, refreshKey])

  const pendingCount = requests.filter(ar => ar.status === 'pending').length
  const approvedCount = requests.filter(ar => ar.status === 'approved').length
  const rejectedCount = requests.filter(ar => ar.status === 'rejected').length
  const revokedCount = requests.filter(ar => ar.status === 'revoked').length

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(ar => ar.status === filter)

  const handleApprove = (id: string) => {
    if (!userId || !userName || !userRole) return
    IoTBridgeActions.approveAccessRequest(id, userId, userName, userRole)
    setRefreshKey(prev => prev + 1)
    setSelectedRequest(null)
  }

  const handleReject = (id: string) => {
    if (!userId || !userName || !userRole) return
    IoTBridgeActions.rejectAccessRequest(id, userId, userName, userRole)
    setRefreshKey(prev => prev + 1)
    setSelectedRequest(null)
  }

  const handleRevoke = (grantId: string) => {
    if (!userId || !userName || !userRole) return
    IoTBridgeActions.revokeAccessGrant(grantId, userId, userName, userRole)
    setRefreshKey(prev => prev + 1)
  }

  const getDeviceName = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId)
    return device?.name || deviceId
  }

  const getGrantForRequest = (request: AccessRequest): AccessGrant | undefined => {
    if (request.status !== 'approved') return undefined
    return grants.find(g => g.deviceId === request.deviceId && g.developerId === request.developerId)
  }

  return (
    <DashboardLayout title="Access Requests" subtitle="Review developer requests and control who can use your device data.">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Pending Requests" value={pendingCount} icon={<Clock className="h-5 w-5" />} />
        <KPICard title="Approved Grants" value={approvedCount} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KPICard title="Rejected Requests" value={rejectedCount} icon={<XCircle className="h-5 w-5" />} />
        <KPICard title="Revoked" value={revokedCount} icon={<Ban className="h-5 w-5" />} />
      </div>

      {/* Tabs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>Manage developer access to your devices</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending" className={pendingCount > 0 ? 'relative' : ''}>
                Pending
                {pendingCount > 0 && (
                  <Badge className="ml-2 bg-amber-100 text-amber-800">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="revoked">Revoked</TabsTrigger>
            </TabsList>

            <TabsContent value={filter} className="mt-6">
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Developer</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Requested Scope</TableHead>
                      <TableHead>Until</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.length > 0 ? (
                      filteredRequests.map((request) => {
                        const grant = getGrantForRequest(request)
                        return (
                          <TableRow key={request.id} className="hover:bg-slate-50">
                            <TableCell>
                              <div>
                                <div className="font-medium">{request.developerName}</div>
                                <div className="text-xs text-muted-foreground">{request.developerEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getDeviceName(request.deviceId)}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm">
                              {request.purpose}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {request.scopes[0]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(request.requestedUntil), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={request.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              {request.status === 'pending' && (
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReject(request.id)}
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-primary hover:bg-primary/90"
                                    onClick={() => handleApprove(request.id)}
                                  >
                                    Approve
                                  </Button>
                                </div>
                              )}
                              {request.status === 'approved' && grant && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRevoke(grant.id)}
                                >
                                  Revoke
                                </Button>
                              )}
                              {(request.status === 'rejected' || request.status === 'pending') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedRequest(request)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No requests found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Request Details</DialogTitle>
            <DialogDescription>
              Request from {selectedRequest?.developerName}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-slate-600">Developer</div>
                <div className="font-semibold">{selectedRequest.developerName}</div>
                <div className="text-sm text-muted-foreground">{selectedRequest.developerEmail}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-600">Device</div>
                <div className="font-semibold">{getDeviceName(selectedRequest.deviceId)}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-600">Purpose</div>
                <div>{selectedRequest.purpose}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-600">Scope</div>
                  <Badge variant="outline">{selectedRequest.scopes[0]}</Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-600">Requested Until</div>
                  <div>{format(new Date(selectedRequest.requestedUntil), 'MMM d, yyyy')}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-600 mb-2">Status Timeline</div>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-slate-600">Request submitted:</span>
                    <span className="font-medium">{format(new Date(selectedRequest.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-slate-600">Status:</span>
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                </div>
              </div>

              {selectedRequest.status === 'pending' && (
                <div className="flex gap-2 pt-4 border-t border-border">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedRequest(null)}>
                    Cancel
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => handleReject(selectedRequest.id)}>
                    Reject
                  </Button>
                  <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => handleApprove(selectedRequest.id)}>
                    Approve
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
