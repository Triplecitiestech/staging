'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface TrendPoint {
  date: string
  label: string
  value: number
}

interface TrendChartProps {
  data: TrendPoint[]
  title: string
  color?: string
  height?: number
  /** 'sum' shows total, 'avg' shows average */
  aggregate?: 'sum' | 'avg'
  /** Format individual values */
  formatValue?: (v: number) => string
}

export default function TrendChart({ data, title, color = '#06b6d4', height = 256, aggregate = 'sum', formatValue }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-500 mt-2">No trend data available</p>
      </div>
    )
  }

  const nonZeroData = data.filter(d => d.value > 0)
  const headerValue = aggregate === 'avg' && nonZeroData.length > 0
    ? Math.round(nonZeroData.reduce((s, d) => s + d.value, 0) / nonZeroData.length)
    : data.reduce((s, d) => s + d.value, 0)
  const headerDisplay = formatValue ? formatValue(headerValue) : headerValue
  const maxValue = Math.max(...data.map(d => d.value), 1)

  // Generate a unique gradient ID based on color to avoid conflicts
  const gradientId = `trendGradient-${color.replace('#', '')}`

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-1">
            {data.length} data points · {aggregate === 'avg' ? 'Avg' : 'Total'}: {headerDisplay}
          </p>
        </div>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
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
              domain={[0, Math.ceil(maxValue * 1.15)]}
              tickFormatter={(v) => formatValue ? formatValue(v) : String(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(value) => [formatValue ? formatValue(Number(value)) : Number(value), title]}
              labelFormatter={(label) => `${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
