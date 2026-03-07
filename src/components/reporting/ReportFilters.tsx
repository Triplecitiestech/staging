'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const PRESETS = [
  { value: 'last_7_days', label: '7 Days' },
  { value: 'last_30_days', label: '30 Days' },
  { value: 'last_90_days', label: '90 Days' },
  { value: 'month_to_date', label: 'MTD' },
  { value: 'quarter_to_date', label: 'QTD' },
  { value: 'year_to_date', label: 'YTD' },
] as const

interface ReportFilterBarProps {
  basePath: string
  showComparison?: boolean
  showTrend?: boolean
  showBreakdown?: boolean
}

export default function ReportFilterBar({
  basePath,
  showComparison = true,
  showTrend = true,
  showBreakdown = true,
}: ReportFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPreset = searchParams.get('preset') || 'last_30_days'
  const compare = searchParams.get('compare') === 'true'
  const trend = searchParams.get('trend') === 'true'
  const breakdown = searchParams.get('breakdown') === 'true'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.push(`${basePath}?${params.toString()}`)
    },
    [router, searchParams, basePath]
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Date preset buttons */}
      <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => updateParams({ preset: preset.value })}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              currentPreset === preset.value
                ? 'bg-cyan-500 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Toggle buttons */}
      <div className="flex items-center gap-2">
        {showTrend && (
          <button
            onClick={() => updateParams({ trend: trend ? null : 'true' })}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              trend
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                : 'border-slate-600 text-slate-400 hover:border-slate-500'
            }`}
          >
            Trend
          </button>
        )}
        {showComparison && (
          <button
            onClick={() => updateParams({ compare: compare ? null : 'true' })}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              compare
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                : 'border-slate-600 text-slate-400 hover:border-slate-500'
            }`}
          >
            Compare
          </button>
        )}
        {showBreakdown && (
          <button
            onClick={() => updateParams({ breakdown: breakdown ? null : 'true' })}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              breakdown
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                : 'border-slate-600 text-slate-400 hover:border-slate-500'
            }`}
          >
            Details
          </button>
        )}
      </div>
    </div>
  )
}
