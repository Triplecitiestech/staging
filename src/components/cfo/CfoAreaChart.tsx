'use client'

/**
 * CfoAreaChart — multi-series smooth area chart in the reporting
 * dashboard's visual language (see components/reporting/TrendChart).
 * Same card shell, header (title + subtitle), gradient fills, monotone
 * curves, muted axes, and dark tooltip — extended to plot several series
 * at once (e.g. income / outflow / net) with a legend.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface AreaSeries {
  dataKey: string
  name: string
  color: string
}

interface Props {
  data: Array<Record<string, number | string>>
  series: AreaSeries[]
  title: string
  subtitle?: string
  height?: number
  xKey?: string
  /** Tooltip value formatter (defaults to raw). */
  formatValue?: (v: number) => string
  /** Y-axis tick formatter (defaults to formatValue). */
  formatAxis?: (v: number) => string
}

export default function CfoAreaChart({
  data,
  series,
  title,
  subtitle,
  height = 288,
  xKey = 'label',
  formatValue,
  formatAxis,
}: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">No data available</p>
      </div>
    )
  }

  const fmt = (v: number) => (formatValue ? formatValue(v) : String(v))
  const fmtAxis = (v: number) => (formatAxis ? formatAxis(v) : fmt(v))

  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/50 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s) => {
                const id = `cfoArea-${s.dataKey}-${s.color.replace('#', '')}`
                return (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey={xKey}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmtAxis(Number(v))}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(value, name) => [fmt(Number(value)), name]}
              labelFormatter={(label) => `${label}`}
            />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            {series.map((s) => {
              const id = `cfoArea-${s.dataKey}-${s.color.replace('#', '')}`
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${id})`}
                  activeDot={{ r: 5, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
