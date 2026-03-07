'use client'

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

export default function PriorityBreakdownChart({ data }: PriorityBreakdownChartProps) {
  if (data.length === 0) return null

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Priority Breakdown</h3>

      {/* Stacked bar */}
      <div className="flex rounded-lg overflow-hidden h-6 mb-4">
        {data.map((item) => (
          <div
            key={item.priority}
            style={{
              width: `${item.percentage}%`,
              backgroundColor: PRIORITY_COLORS[item.priority] || '#64748b',
            }}
            title={`${item.priority}: ${item.count} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.map((item) => (
          <div key={item.priority} className="flex items-center gap-2">
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
          </div>
        ))}
      </div>
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
