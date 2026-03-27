'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useDemoMode } from '@/components/admin/DemoModeProvider'

interface PriorityBreakdown {
  priority: string
  count: number
  percentage: number
  avgResolutionMinutes: number | null
}

interface PriorityBreakdownChartProps {
  data: PriorityBreakdown[]
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#06b6d4',
  Low: '#8b5cf6',
}

const PRIORITY_TO_NUMBER: Record<string, number> = {
  Critical: 1,
  High: 2,
  Medium: 3,
  Low: 4,
}

interface DrilldownData {
  priorityLabel: string
  totalTickets: number
  companySummaries: Array<{
    companyId: string
    companyName: string
    totalTickets: number
    resolvedCount: number
    openCount: number
    tickets: Array<{
      ticketId: string
      ticketNumber: string
      title: string
      isResolved: boolean
      assignedTo: string
      createDate: string
      completedDate: string | null
    }>
  }>
}

export default function PriorityBreakdownChart({ data }: PriorityBreakdownChartProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const demo = useDemoMode()
  const [expandedPriority, setExpandedPriority] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  useEffect(() => {
    if (!expandedPriority) {
      setDrilldownData(null)
      return
    }
    const priorityNum = PRIORITY_TO_NUMBER[expandedPriority]
    if (!priorityNum) return

    setDrilldownLoading(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set('priority', String(priorityNum))
    fetch(`/api/reports/priority-drilldown?${params.toString()}`)
      .then(r => r.json())
      .then(d => setDrilldownData(d))
      .catch(() => setDrilldownData(null))
      .finally(() => setDrilldownLoading(false))
  }, [expandedPriority, searchParams])

  if (data.length === 0) return null

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Priority Breakdown <span className="text-xs text-slate-500">(click a priority to drill down)</span></h3>

      {/* Stacked bar */}
      <div className="flex rounded-lg overflow-hidden h-6 mb-4">
        {data.map((item) => (
          <button
            key={item.priority}
            onClick={() => setExpandedPriority(expandedPriority === item.priority ? null : item.priority)}
            style={{
              width: `${item.percentage}%`,
              backgroundColor: PRIORITY_COLORS[item.priority] || '#64748b',
            }}
            className={`transition-opacity ${expandedPriority && expandedPriority !== item.priority ? 'opacity-40' : ''}`}
            title={`${item.priority}: ${item.count} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend - clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.map((item) => (
          <button
            key={item.priority}
            onClick={() => setExpandedPriority(expandedPriority === item.priority ? null : item.priority)}
            className={`flex items-center gap-2 text-left rounded-lg p-2 transition-colors ${
              expandedPriority === item.priority ? 'bg-slate-700/50 ring-1 ring-cyan-500/30' : 'hover:bg-slate-700/30'
            }`}
          >
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[item.priority] || '#64748b' }}
            />
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{item.priority}</p>
              <p className="text-xs text-slate-400">
                {item.count} ({item.percentage}%)
              </p>
              {item.avgResolutionMinutes !== null && (
                <p className="text-xs text-slate-500">
                  Avg {formatMinutes(item.avgResolutionMinutes)}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Drilldown panel */}
      {expandedPriority && (
        <div className="mt-4 border-t border-slate-700/50 pt-4">
          <h4 className="text-sm font-medium text-white mb-3">
            {expandedPriority} Priority Tickets by Company
          </h4>
          {drilldownLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
            </div>
          ) : drilldownData && drilldownData.companySummaries.length > 0 ? (
            <div className="space-y-3">
              {drilldownData.companySummaries.map((company) => (
                <div key={company.companyId} className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => {
                        const params = new URLSearchParams(searchParams.toString())
                        router.push(`/admin/reporting/companies/${company.companyId}?${params.toString()}`)
                      }}
                      className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      {demo.company(company.companyName)}
                    </button>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-white">{company.totalTickets} tickets</span>
                      <span className="text-emerald-400">{company.resolvedCount} resolved</span>
                      <span className="text-cyan-400">{company.openCount} open</span>
                    </div>
                  </div>
                  {/* Show first 5 tickets */}
                  <div className="space-y-1">
                    {company.tickets.slice(0, 5).map((t) => (
                      <div key={t.ticketId} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-800/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-cyan-400 font-mono shrink-0">{t.ticketNumber}</span>
                          <span className="text-slate-300 truncate">{demo.title(t.title)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className={t.isResolved ? 'text-emerald-400' : 'text-slate-400'}>{t.isResolved ? 'Resolved' : 'Open'}</span>
                          <span className="text-slate-500">{demo.person(t.assignedTo)}</span>
                        </div>
                      </div>
                    ))}
                    {company.tickets.length > 5 && (
                      <button
                        onClick={() => {
                          const params = new URLSearchParams(searchParams.toString())
                          params.set('priority', String(PRIORITY_TO_NUMBER[expandedPriority]))
                          router.push(`/admin/reporting/companies/${company.companyId}?${params.toString()}`)
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                      >
                        View all {company.tickets.length} tickets {'\u2192'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No tickets found for this priority in the selected period.</p>
          )}
        </div>
      )}
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
