'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useDemoMode } from '@/components/admin/DemoModeProvider'

const PRESETS = [
  { value: 'last_7_days', label: '7 Days' },
  { value: 'last_30_days', label: '30 Days' },
  { value: 'last_90_days', label: '90 Days' },
  { value: 'month_to_date', label: 'MTD' },
  { value: 'quarter_to_date', label: 'QTD' },
  { value: 'year_to_date', label: 'YTD' },
] as const

interface SelectorOption {
  id: string
  label: string
  value: string // the value sent as query param
}

interface ReportFilterBarProps {
  basePath: string
  showComparison?: boolean
  showTrend?: boolean
  showBreakdown?: boolean
  showCompanySelector?: boolean
  showTechnicianSelector?: boolean
}

export default function ReportFilterBar({
  basePath,
  showComparison = true,
  showTrend = true,
  showBreakdown = true,
  showCompanySelector = false,
  showTechnicianSelector = false,
}: ReportFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const demoCtx = useDemoMode()

  const currentPreset = searchParams.get('preset') || 'last_30_days'
  const compare = searchParams.get('compare') === 'true'
  const trend = searchParams.get('trend') === 'true'
  const breakdown = searchParams.get('breakdown') === 'true'
  const currentCompanyId = searchParams.get('companyId') || ''
  const currentResourceId = searchParams.get('resourceId') || ''

  const [companies, setCompanies] = useState<SelectorOption[]>([])
  const [technicians, setTechnicians] = useState<SelectorOption[]>([])
  const [selectorsLoading, setSelectorsLoading] = useState(false)
  const [selectorsError, setSelectorsError] = useState<string | null>(null)

  // Fetch selectors when company or technician selector is shown
  useEffect(() => {
    if (!showCompanySelector && !showTechnicianSelector) return

    let cancelled = false
    setSelectorsLoading(true)
    setSelectorsError(null)

    fetch('/api/reports/selectors')
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Failed to load selectors (HTTP ${res.status})`)
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return

        // Surface per-source errors from the selectors API
        const errors = data._errors || {}
        if (showCompanySelector && errors.companies) {
          setSelectorsError(errors.companies)
        } else if (showTechnicianSelector && errors.technicians) {
          setSelectorsError(errors.technicians)
        }

        if (showCompanySelector && data.companies) {
          setCompanies(
            data.companies.map((c: { id: string; displayName: string }) => ({
              id: c.id,
              label: demoCtx.company(c.displayName),
              value: c.id,
            }))
          )
        }
        if (showTechnicianSelector && data.technicians) {
          setTechnicians(
            data.technicians.map((t: { autotaskResourceId: number; name: string }) => ({
              id: String(t.autotaskResourceId),
              label: demoCtx.person(t.name),
              value: String(t.autotaskResourceId),
            }))
          )
        }
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[ReportFilters] Failed to load selectors:', msg)
        setSelectorsError(msg)
      })
      .finally(() => {
        if (!cancelled) setSelectorsLoading(false)
      })

    return () => { cancelled = true }
  }, [showCompanySelector, showTechnicianSelector])

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
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
    <div className="space-y-3">
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

        {/* Toggle buttons with info tooltips */}
        <div className="flex items-center gap-2">
          {showTrend && (
            <div className="relative group">
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
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 whitespace-nowrap shadow-lg">
                  Show a timeline chart of how metrics change over the selected period.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
          )}
          {showComparison && (
            <div className="relative group">
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
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 whitespace-nowrap shadow-lg">
                  Compare current period vs the previous equal-length period (e.g. last 30d vs prior 30d).
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
          )}
          {showBreakdown && (
            <div className="relative group">
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
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 whitespace-nowrap shadow-lg">
                  Show priority breakdown, SLA benchmarks, and performance targets.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entity selectors row */}
      {(showCompanySelector || showTechnicianSelector) && (
        <div className="flex flex-wrap items-center gap-3">
          {selectorsError && (
            <div className="text-xs text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-md">
              {showCompanySelector && showTechnicianSelector
                ? 'Unable to load company and technician selectors'
                : showCompanySelector
                  ? 'Unable to load company selector'
                  : 'Unable to load technician selector'}
            </div>
          )}

          {showCompanySelector && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Company:</label>
              <select
                value={currentCompanyId}
                onChange={(e) => updateParams({ companyId: e.target.value || null })}
                className="bg-slate-800/80 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-white min-w-[180px]"
                disabled={selectorsLoading || companies.length === 0}
              >
                <option value="">
                  {selectorsLoading ? 'Loading...' : companies.length === 0 ? 'No companies available' : 'All companies'}
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {showTechnicianSelector && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Technician:</label>
              <select
                value={currentResourceId}
                onChange={(e) => updateParams({ resourceId: e.target.value || null })}
                className="bg-slate-800/80 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-white min-w-[180px]"
                disabled={selectorsLoading || technicians.length === 0}
              >
                <option value="">
                  {selectorsLoading ? 'Loading...' : technicians.length === 0 ? 'No technicians available' : 'All technicians'}
                </option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
