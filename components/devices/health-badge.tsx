'use client'

import { cn } from '@/lib/utils'

interface HealthBadgeProps {
  score: number
  compact?: boolean
}

export function HealthBadge({ score, compact = false }: HealthBadgeProps) {
  let label: string
  let bgColor: string
  let textColor: string

  if (score >= 90) {
    label = 'Excellent'
    bgColor = 'bg-green-50'
    textColor = 'text-green-700'
  } else if (score >= 75) {
    label = 'Good'
    bgColor = 'bg-blue-50'
    textColor = 'text-blue-700'
  } else if (score >= 50) {
    label = 'Needs Review'
    bgColor = 'bg-amber-50'
    textColor = 'text-amber-700'
  } else {
    label = 'Unstable'
    bgColor = 'bg-red-50'
    textColor = 'text-red-700'
  }

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium border', bgColor, textColor, 'border-current/20')}>
        <span className="h-2 w-2 rounded-full bg-current" />
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold">{score}</div>
          <div className="text-sm text-muted-foreground">out of 100</div>
        </div>
        <span className={cn('text-sm font-semibold px-3 py-1 rounded-full', bgColor, textColor, 'border border-current/20')}>
          {label}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        <div
          className={cn('h-full transition-all', score >= 90 ? 'bg-green-500' : score >= 75 ? 'bg-blue-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500')}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}
