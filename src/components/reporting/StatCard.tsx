'use client'

import { useState } from 'react'
import Link from 'next/link'

interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  trend?: {
    direction: 'up' | 'down' | 'flat'
    percent: number | null
    previous?: string | number
  }
  /** When true, "down" is good (green) and "up" is bad (red). Use for metrics like resolution time. */
  invertTrend?: boolean
  icon?: React.ReactNode
  href?: string
  /** Tooltip text explaining this metric's data source and calculation */
  tooltip?: string
}

export default function StatCard({ label, value, subValue, trend, invertTrend, icon, href, tooltip }: StatCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const isPositive = invertTrend
    ? trend?.direction === 'down'
    : trend?.direction === 'up'
  const isNegative = invertTrend
    ? trend?.direction === 'up'
    : trend?.direction === 'down'
  const trendColor = isPositive
    ? 'text-emerald-400'
    : isNegative
      ? 'text-rose-400'
      : 'text-slate-400'

  const trendArrow =
    trend?.direction === 'up' ? '\u2191' : trend?.direction === 'down' ? '\u2193' : '\u2192'

  // Flag extreme percentages (>500%) as potentially misleading
  const isExtremePercent = trend?.percent !== null && trend?.percent !== undefined && Math.abs(trend.percent) > 500

  const trendLabel = (() => {
    if (!trend) return null
    if (trend.percent !== null) {
      const displayPercent = Math.abs(trend.percent)
      const prevStr = trend.previous !== undefined ? ` (was ${trend.previous})` : ''
      return `${trendArrow} ${displayPercent}% vs prior period${prevStr}`
    }
    // percent is null (e.g. previous was 0) — show raw previous value
    if (trend.previous !== undefined) {
      return `${trendArrow} prev: ${trend.previous}`
    }
    return `${trendArrow} no prior data`
  })()

  const content = (
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-slate-400">{label}</p>
          {tooltip && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTooltip(!showTooltip) }}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={`Info about ${label}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                </svg>
              </button>
              {showTooltip && (
                <div className="absolute bottom-full right-0 mb-2 z-50 pointer-events-none">
                  <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-300 shadow-lg w-56">
                    {tooltip}
                    <div className="absolute top-full right-3 w-2 h-2 bg-slate-900 border-r border-b border-slate-600 rotate-45 -mt-1" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        {trend && trendLabel && (
          <p className={`text-sm mt-1 ${trendColor}`}>
            {trendLabel}
          </p>
        )}
        {isExtremePercent && (
          <p className="text-[10px] text-slate-600 mt-0.5">
            Large % change — prior period had limited data
          </p>
        )}
      </div>
      {icon && <div className="text-cyan-400 opacity-60">{icon}</div>}
    </div>
  )

  const baseClass = 'bg-slate-800/50 rounded-xl p-5 border border-slate-700/50'

  if (href) {
    return (
      <Link href={href} className={`${baseClass} block hover:border-cyan-500/30 transition-colors group`}>
        {content}
      </Link>
    )
  }

  return <div className={baseClass}>{content}</div>
}
