'use client'

interface HealthDistributionProps {
  distribution: {
    healthy: number
    needsAttention: number
    atRisk: number
    critical: number
  }
}

const TIERS = [
  { key: 'healthy' as const, label: 'Healthy', color: '#10b981', range: '80-100' },
  { key: 'needsAttention' as const, label: 'Needs Attention', color: '#06b6d4', range: '60-79' },
  { key: 'atRisk' as const, label: 'At Risk', color: '#f97316', range: '40-59' },
  { key: 'critical' as const, label: 'Critical', color: '#ef4444', range: '0-39' },
]

export default function HealthDistribution({ distribution }: HealthDistributionProps) {
  const total =
    distribution.healthy +
    distribution.needsAttention +
    distribution.atRisk +
    distribution.critical

  if (total === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Health Distribution</h3>
        <p className="text-slate-500 text-sm">No health scores computed yet</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Health Distribution</h3>

      <div className="space-y-3">
        {TIERS.map((tier) => {
          const count = distribution[tier.key]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0

          return (
            <div key={tier.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-300">{tier.label}</span>
                <span className="text-sm text-slate-400">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: tier.color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
