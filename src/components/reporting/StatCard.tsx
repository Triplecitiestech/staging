'use client'

import Link from 'next/link'

interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  trend?: {
    direction: 'up' | 'down' | 'flat'
    percent: number | null
  }
  icon?: React.ReactNode
  href?: string
}

export default function StatCard({ label, value, subValue, trend, icon, href }: StatCardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-emerald-400'
      : trend?.direction === 'down'
        ? 'text-rose-400'
        : 'text-slate-400'

  const trendArrow =
    trend?.direction === 'up' ? '\u2191' : trend?.direction === 'down' ? '\u2193' : '\u2192'

  const content = (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        {trend && trend.percent !== null && (
          <p className={`text-sm mt-1 ${trendColor}`}>
            {trendArrow} {Math.abs(trend.percent)}% vs prior period
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
