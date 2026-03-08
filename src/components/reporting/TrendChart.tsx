'use client'

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
}

/**
 * Simple SVG bar chart for trend data. No external chart library needed.
 */
export default function TrendChart({ data, title, color = '#06b6d4', height = 160 }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
        <p className="text-slate-500 text-sm">No trend data available</p>
      </div>
    )
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const barWidth = Math.max(4, Math.min(24, Math.floor(600 / data.length) - 2))
  const chartWidth = data.length * (barWidth + 2)
  const padding = { top: 10, bottom: 30, left: 10, right: 10 }
  const svgWidth = chartWidth + padding.left + padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Show every Nth label to avoid overlap
  const labelInterval = Math.max(1, Math.floor(data.length / 10))

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
      <div className="overflow-hidden">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Bars */}
          {data.map((point, i) => {
            const barHeight = (point.value / maxValue) * chartHeight
            const x = padding.left + i * (barWidth + 2)
            const y = padding.top + chartHeight - barHeight

            return (
              <g key={point.date}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  opacity={0.8}
                  rx={2}
                />
                {/* Label */}
                {i % labelInterval === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 5}
                    textAnchor="middle"
                    className="fill-slate-500"
                    fontSize={10}
                  >
                    {point.label}
                  </text>
                )}
              </g>
            )
          })}
          {/* Baseline */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={svgWidth - padding.right}
            y2={padding.top + chartHeight}
            stroke="#334155"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  )
}
