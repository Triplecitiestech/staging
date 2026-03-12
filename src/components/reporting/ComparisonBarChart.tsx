'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export interface ComparisonMetric {
  label: string
  current: number
  previous: number
  unit?: string
  /** When true, lower is better (e.g. resolution time) */
  invertColor?: boolean
}

interface ComparisonBarChartProps {
  data: ComparisonMetric[]
  title: string
  height?: number
  currentLabel?: string
  previousLabel?: string
}

export default function ComparisonBarChart({
  data,
  title,
  height = 280,
  currentLabel = 'Current Period',
  previousLabel = 'Previous Period',
}: ComparisonBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-500 mt-2">No comparison data available</p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    name: d.label,
    current: d.current,
    previous: d.previous,
    unit: d.unit || '',
  }))

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-6">
        Side-by-side comparison of current vs prior equal-length period
      </p>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(value, name, entry) => {
                const unit = (entry.payload as { unit?: string })?.unit || ''
                const label = String(name) === 'current' ? currentLabel : previousLabel
                return [`${value}${unit}`, label]
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
              formatter={(value) => value === 'current' ? currentLabel : previousLabel}
            />
            <Bar dataKey="previous" fill="#475569" radius={[4, 4, 0, 0]} />
            <Bar dataKey="current" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table below chart */}
      <div className="mt-4 grid grid-cols-1 gap-2">
        {data.map(d => {
          const pctChange = d.previous > 0
            ? Math.round(((d.current - d.previous) / d.previous) * 1000) / 10
            : d.current > 0 ? 100 : 0
          const isUp = pctChange > 0
          const isDown = pctChange < 0
          const changeColor = d.invertColor
            ? (isDown ? 'text-emerald-400' : isUp ? 'text-rose-400' : 'text-slate-400')
            : (isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400')
          const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192'

          return (
            <div key={d.label} className="flex items-center justify-between px-3 py-2 bg-slate-900/30 rounded-lg">
              <span className="text-xs text-slate-400">{d.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{d.previous}{d.unit || ''} {'\u2192'} {d.current}{d.unit || ''}</span>
                <span className={`text-xs font-medium ${changeColor}`}>
                  {arrow} {Math.abs(pctChange)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
