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
import { AccessRequest, AccessGrant, Device, Order } from '@/lib/mock-data'
import { useAuth } from '@/lib/auth-context'
import { getAccessRequests, getAccessGrants, getDevices, actionAccessRequest, revokeAccessGrant, getOrders, updateOrderPayoutAction, getUsers } from '@/lib/api'
import { PublicUser } from '@/lib/auth-types'
import { StatusBadge, KPICard } from '@/components/layout/dashboard-layout'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, Clock, Eye, ShieldCheck, Users, Wallet } from 'lucide-react'

export default function AccessRequestsPage() {
  const { userId, userName, userRole } = useAuth()
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'pending_payment' | 'approved' | 'rejected' | 'revoked'>('all')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<PublicUser[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load data from API
  useEffect(() => {
    const loadData = async () => {
      try {
        const allDevices = await getDevices()
        setDevices(allDevices)

        const allRequests = await getAccessRequests()
        const allGrants = await getAccessGrants()
        const allOrders = await getOrders()

        if (userRole === 'device_owner' && userId) {
          const ownerDevices = allDevices.filter(d => d.ownerId === userId)
          const ownerDeviceIds = ownerDevices.map(d => d.id)
          setRequests(allRequests.filter(ar => ownerDeviceIds.includes(ar.deviceId)))
          setGrants(allGrants.filter(g => ownerDeviceIds.includes(g.deviceId)))
          setOrders(allOrders)
          setUsers([])
        } else if (userRole === 'admin') {
          const allUsers = await getUsers()
          setRequests(allRequests)
          setGrants(allGrants)
          setOrders(allOrders)
          setUsers(allUsers)
        }
      } catch (error) {
        console.error('Failed to load access requests', error)
      }
    }
    loadData()
  }, [userId, userRole, refreshKey])

  const pendingCount = requests.filter(ar => ar.status === 'pending').length
  const pendingPaymentCount = requests.filter(ar => ar.status === 'pending_payment').length
  const approvedCount = requests.filter(ar => ar.status === 'approved').length
  const rejectedCount = requests.filter(ar => ar.status === 'rejected').length
  const isAdminView = userRole === 'admin'
  const platformOwnerCount = new Set(devices.map(device => device.ownerId)).size
  const requestingDeveloperCount = new Set(requests.map(request => request.developerId)).size
  const payoutEligibleAmount = orders
    .filter(order => order.payoutStatus === 'ELIGIBLE')
    .reduce((sum, order) => sum + order.ownerAmount, 0)
  const payoutEligibleCount = orders.filter(order => order.payoutStatus === 'ELIGIBLE').length

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(ar => ar.status === filter)

  const paidOrders = orders.filter(order =>
    order.paymentStatus === 'PAID' ||
    order.payoutStatus === 'REFUND_REQUIRED' ||
    order.payoutStatus === 'REFUNDED'
  )

  const handleApprove = async (id: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await actionAccessRequest(id, 'approve', userId, userName, userRole)
      setRefreshKey(prev => prev + 1)
      setSelectedRequest(null)
    } catch (error) {
      console.error('Failed to approve request', error)
    }
  }

  const handleReject = async (id: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await actionAccessRequest(id, 'reject', userId, userName, userRole)
      setRefreshKey(prev => prev + 1)
      setSelectedRequest(null)
    } catch (error) {
      console.error('Failed to reject request', error)
    }
  }

  const handleRevoke = async (grantId: string) => {
    if (!userId || !userName || !userRole) return
    try {
      await revokeAccessGrant(grantId, userId, userName, userRole)
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to revoke grant', error)
    }
  }

  const handleMarkPaidOut = async (orderId: string) => {
    try {
      await updateOrderPayoutAction(orderId, 'markPaidOut')
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to mark payout as paid out', error)
    }
  }

  const handleMarkRefunded = async (orderId: string) => {
    try {
      await updateOrderPayoutAction(orderId, 'markRefunded')
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to mark payout as refunded', error)
    }
  }

  const getDevice = (deviceId: string): Device | undefined => {
    return devices.find(d => d.id === deviceId)
  }

  const getDeviceName = (deviceId: string): string => {
    return getDevice(deviceId)?.name || deviceId
  }

  const getOwnerName = (deviceId: string): string => {
    const device = getDevice(deviceId)
    if (!device) return 'Unknown owner'

    const owner = users.find(user => user.id === device.ownerId)
    return owner?.name || device.ownerId
  }

  const getRequestForOrder = (order: Order): AccessRequest | undefined => {
    return requests.find(request => request.id === order.accessRequestId)
  }

  const formatCurrencyAmount = (currency: string, amount: number): string => {
    return `${currency} ${Number(amount || 0).toLocaleString('id-ID')}`
  }

  const formatOrderCurrency = (order: Order, amount: number): string => {
    return formatCurrencyAmount(order.currency || 'IDR', amount)
  }

  const getPayoutStatusLabel = (status: Order['payoutStatus']): string => {
    if (status === 'ELIGIBLE') return 'Ready for payout'
    if (status === 'PAID_OUT') return 'Paid out'
    if (status === 'REFUND_REQUIRED') return 'Manual refund required'
    if (status === 'REFUNDED') return 'Refund marked complete'
    return 'Awaiting approval'
  }

  const getPayoutStatusClassName = (status: Order['payoutStatus']): string => {
    if (status === 'ELIGIBLE') return 'border-amber-200 bg-amber-50 text-amber-800'
    if (status === 'PAID_OUT') return 'border-green-200 bg-green-50 text-green-700'
    if (status === 'REFUND_REQUIRED') return 'border-red-200 bg-red-50 text-red-700'
    if (status === 'REFUNDED') return 'border-slate-200 bg-slate-50 text-slate-700'
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  const getGrantForRequest = (request: AccessRequest): AccessGrant | undefined => {
    if (request.status !== 'approved') return undefined
    return grants.find(g => g.deviceId === request.deviceId && g.developerId === request.developerId)
  }

  const pageTitle = isAdminView ? 'Access Oversight' : 'Access Requests'
  const pageSubtitle = isAdminView
    ? 'Review platform-wide access requests, payment states, and owner payout readiness.'
    : 'Review developer requests and control who can use your device data.'

  return (
    <DashboardLayout title={pageTitle} subtitle={pageSubtitle}>
      {isAdminView && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">Admin Oversight Mode</h2>
                  <Badge variant="outline" className="border-primary/30 bg-background text-primary">Platform-wide</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  You are viewing requests across all device owners. Approval here acts as a platform action and payout status is tracked separately.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <div className="rounded-md border border-primary/20 bg-background px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">Owners</p>
                <p className="text-lg font-semibold text-foreground">{platformOwnerCount}</p>
              </div>
              <div className="rounded-md border border-primary/20 bg-background px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">Developers</p>
                <p className="text-lg font-semibold text-foreground">{requestingDeveloperCount}</p>
              </div>
              <div className="rounded-md border border-primary/20 bg-background px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">Payout Queue</p>
                <p className="text-lg font-semibold text-foreground">{payoutEligibleCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KPICard title={isAdminView ? 'Platform Pending' : 'Pending Requests'} value={pendingCount} icon={<Clock className="h-5 w-5" />} />
        <KPICard title={isAdminView ? 'Payment Queue' : 'Pending Payments'} value={pendingPaymentCount} icon={<Clock className="h-5 w-5" />} />
        <KPICard title="Approved Grants" value={approvedCount} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KPICard title="Rejected Requests" value={rejectedCount} icon={<XCircle className="h-5 w-5" />} />
        <KPICard title={isAdminView ? 'Payout Liability' : 'Ready Payout'} value={formatCurrencyAmount('IDR', payoutEligibleAmount)} icon={<Wallet className="h-5 w-5" />} />
      </div>

      {/* Tabs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{isAdminView ? 'Platform Access Queue' : 'Requests'}</CardTitle>
          <CardDescription>
            {isAdminView
              ? 'Monitor requests by developer, device owner, and payment state.'
              : 'Manage developer access to your devices'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending" className={pendingCount > 0 ? 'relative' : ''}>
                Pending
                {pendingCount > 0 && (
                  <Badge className="ml-2 bg-amber-100 text-amber-800">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending_payment" className={pendingPaymentCount > 0 ? 'relative' : ''}>
                Payment
                {pendingPaymentCount > 0 && (
                  <Badge className="ml-2 bg-blue-100 text-blue-800">
                    {pendingPaymentCount}
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
                      {isAdminView && <TableHead>Owner</TableHead>}
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
                          <TableRow key={request.id} className={isAdminView ? 'border-l-4 border-l-primary/30 hover:bg-slate-50' : 'hover:bg-slate-50'}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{request.developerName}</div>
                                <div className="text-xs text-muted-foreground">{request.developerEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getDeviceName(request.deviceId)}
                            </TableCell>
                            {isAdminView && (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{getOwnerName(request.deviceId)}</span>
                                </div>
                              </TableCell>
                            )}
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
                              {(request.status === 'rejected' || request.status === 'pending' || request.status === 'pending_payment') && (
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
                        <TableCell colSpan={isAdminView ? 8 : 7} className="text-center py-8 text-muted-foreground">
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{isAdminView ? 'Platform Payout Queue' : 'Payout Tracking'}</CardTitle>
          <CardDescription>
            {isAdminView
              ? 'Settle eligible owner payouts and manually record refunds after rejected paid requests.'
              : 'Paid access orders are held by the platform until owner approval makes them eligible for payout.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Order</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Developer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Owner Amount</TableHead>
                  <TableHead>Payout Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidOrders.length > 0 ? (
                  paidOrders.map((order) => {
                    const requestItem = getRequestForOrder(order)
                    return (
                      <TableRow key={order.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.id}</div>
                            <div className="text-xs text-muted-foreground">{order.midtransOrderId}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getDeviceName(order.deviceId)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{requestItem?.developerName || order.buyerId}</div>
                            <div className="text-xs text-muted-foreground">{requestItem?.developerEmail || 'Unknown email'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{formatOrderCurrency(order, order.totalAmount)}</div>
                            <div className="text-xs text-muted-foreground">Platform fee {formatOrderCurrency(order, order.platformFee)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatOrderCurrency(order, order.ownerAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getPayoutStatusClassName(order.payoutStatus)}>
                            {getPayoutStatusLabel(order.payoutStatus)}
                          </Badge>
                          {order.paidOutAt && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {format(new Date(order.paidOutAt), 'MMM d, yyyy')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {userRole === 'admin' && order.payoutStatus === 'ELIGIBLE' && (
                            <Button size="sm" variant="outline" onClick={() => handleMarkPaidOut(order.id)}>
                              Mark Paid Out
                            </Button>
                          )}
                          {userRole === 'admin' && order.payoutStatus === 'REFUND_REQUIRED' && (
                            <Button size="sm" variant="outline" onClick={() => handleMarkRefunded(order.id)}>
                              Mark Manual Refund Complete
                            </Button>
                          )}
                          {userRole !== 'admin' && order.payoutStatus === 'ELIGIBLE' && (
                            <span className="text-sm text-muted-foreground">Admin payout pending</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No paid orders yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
              {selectedRequest.status === 'pending_payment' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Waiting for Midtrans confirmation. After payment succeeds, this request moves to Pending for owner approval.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
