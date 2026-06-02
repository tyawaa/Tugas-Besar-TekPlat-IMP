'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { apiEndpoints } from '@/lib/mock-data'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { useState } from 'react'

interface CopyState {
  [key: string]: boolean
}

export default function ApiDocsPage() {
  const [copied, setCopied] = useState<CopyState>({})

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied({ ...copied, [id]: true })
    setTimeout(() => setCopied({ ...copied, [id]: false }), 2000)
  }

  return (
    <DashboardLayout 
      title="Developer API" 
      subtitle="Use approved device telemetry in your own applications." 
    >
      {/* Info Alert */}
      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-700 ml-2">
          API access requires an approved access grant and a valid developer token.
        </AlertDescription>
      </Alert>

      {/* Authentication Section */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>How to authenticate your API requests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">Developer API Token</h3>
            <p className="text-sm text-slate-600 mb-3">
              Use your developer token in the <code className="bg-slate-100 px-2 py-1 rounded text-sm">Authorization</code> header:
            </p>
            <div className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto">
              <code className="text-sm font-mono">
                Authorization: Bearer {'<'}<span className="text-lime">your_token_here</span>{'>'}
              </code>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-2">Device Ingestion</h3>
            <p className="text-sm text-slate-600 mb-3">
              For device telemetry ingestion, use device credentials:
            </p>
            <div className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto">
              <code className="text-sm font-mono">
                <div>X-Device-Id: {'<'}device_id{'>'}</div>
                <div>X-Device-Key: {'<'}device_api_key{'>'}</div>
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Endpoints</h2>
        {apiEndpoints.map((endpoint) => (
          <Card key={endpoint.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={
                      endpoint.method === 'GET' ? 'outline' :
                      endpoint.method === 'POST' ? 'secondary' :
                      'outline'
                    }>
                      {endpoint.method}
                    </Badge>
                    <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                      {endpoint.path}
                    </code>
                  </div>
                  <p className="text-sm text-slate-600">{endpoint.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Authentication</div>
                <Badge variant="outline" className="text-xs">
                  {endpoint.authentication === 'bearer' ? 'Bearer Token' : 'Device Key'}
                </Badge>
              </div>

              {endpoint.parameters.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Parameters</div>
                  <div className="space-y-2">
                    {endpoint.parameters.map((param, idx) => (
                      <div key={idx} className="text-sm bg-slate-50 p-2 rounded border border-border">
                        <span className="font-mono">{param.name}</span>
                        {' '}
                        <span className="text-slate-600">({param.type})</span>
                        {param.required && <span className="text-red-600 ml-1">*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {endpoint.sampleRequest && (
                <div>
                  <div className="text-sm font-medium mb-2">Sample Request</div>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                      {endpoint.sampleRequest}
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 text-slate-400 hover:text-slate-50"
                      onClick={() => handleCopy(`req-${endpoint.id}`, endpoint.sampleRequest!)}
                    >
                      {copied[`req-${endpoint.id}`] ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {endpoint.sampleResponse && (
                <div>
                  <div className="text-sm font-medium mb-2">Sample Response</div>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                      {JSON.stringify(endpoint.sampleResponse, null, 2)}
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 text-slate-400 hover:text-slate-50"
                      onClick={() => handleCopy(`res-${endpoint.id}`, JSON.stringify(endpoint.sampleResponse, null, 2))}
                    >
                      {copied[`res-${endpoint.id}`] ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Common Errors */}
      <Card>
        <CardHeader>
          <CardTitle>Common Errors</CardTitle>
          <CardDescription>HTTP status codes and their meanings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="border-l-4 border-red-300 bg-red-50 p-3">
              <div className="font-semibold text-red-900">401 Unauthorized</div>
              <div className="text-sm text-red-800">Missing or invalid authentication token</div>
            </div>
            <div className="border-l-4 border-amber-300 bg-amber-50 p-3">
              <div className="font-semibold text-amber-900">403 Forbidden</div>
              <div className="text-sm text-amber-800">No active access grant for this device</div>
            </div>
            <div className="border-l-4 border-blue-300 bg-blue-50 p-3">
              <div className="font-semibold text-blue-900">404 Not Found</div>
              <div className="text-sm text-blue-800">Device not found or does not exist</div>
            </div>
            <div className="border-l-4 border-purple-300 bg-purple-50 p-3">
              <div className="font-semibold text-purple-900">429 Too Many Requests</div>
              <div className="text-sm text-purple-800">Rate limit exceeded. Try again later.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  )
}
