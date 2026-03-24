'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnnualReportData } from '@/lib/reporting/annual-report/types'

interface Props {
  reportId: string
}

interface ReportRecord {
  id: string
  companyId: string
  reportType: string
  variant: string
  periodStart: string
  periodEnd: string
  status: string
  createdBy: string
  createdAt: string
  reportData: AnnualReportData
  company: { displayName: string }
}

export default function AnnualReportDetail({ reportId }: Props) {
  const [report, setReport] = useState<ReportRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reports/annual-report/${reportId}`)
        if (!res.ok) throw new Error('Failed to load report')
        const data = await res.json()
        setReport(data.review)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report')
      }
      setLoading(false)
    }
    load()
  }, [reportId])

  if (loading) {
    return (
      <div className="text-slate-400 text-center py-12">Loading report...</div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400">
        {error || 'Report not found'}
      </div>
    )
  }

  const data = report.reportData as AnnualReportData
  const isCustomer = report.variant === 'customer'

  // For customer variant: determine which sections have real data
  const hasTickets = data.ticketing.totalTickets > 0
  const hasRmm = data.dattoRmm.available && data.dattoRmm.totalAlerts > 0
  const hasEdr = data.dattoEdr?.available && data.dattoEdr.totalEvents > 0
  const hasDns = data.dnsFilter?.available && data.dnsFilter.totalQueries > 0
  const hasBcdr = data.dattoBcdr?.available && data.dattoBcdr.totalDevices > 0
  const hasSaas = data.dattoSaas?.available && data.dattoSaas.totalSeats > 0
  const hasSoc = data.security.socIncidents.available && data.security.socIncidents.totalIncidents > 0
  const hasHealth = !!data.healthSnapshot && data.healthSnapshot.overallScore >= 60

  // Customer variant: only show data sources that are available
  const visibleDataSources = isCustomer
    ? data.dataSources.filter(ds => ds.available)
    : data.dataSources

  // Customer variant: filter key trends to remove error-related text
  const visibleTrends = isCustomer
    ? data.executiveSummary.keyTrends.filter(t =>
        !t.toLowerCase().includes('not available') &&
        !t.toLowerCase().includes('error') &&
        !t.toLowerCase().includes('failed') &&
        !t.toLowerCase().includes('not yet')
      )
    : data.executiveSummary.keyTrends

  // Customer variant: only show security sources that are active
  const visibleSecSources = isCustomer
    ? data.security.sources.filter(s => s.available)
    : data.security.sources

  // Build summary stat cards — only show ones with real data
  const summaryCards: Array<{ label: string; value: string | number }> = []
  if (hasTickets) summaryCards.push({ label: 'Support Tickets Resolved', value: data.ticketing.totalTickets })
  if (hasEdr) summaryCards.push({ label: 'Security Events Monitored', value: data.dattoEdr.totalEvents })
  if (hasRmm) summaryCards.push({ label: 'RMM Alerts Processed', value: data.dattoRmm.totalAlerts })
  if (hasDns) summaryCards.push({ label: 'DNS Threats Blocked', value: data.dnsFilter!.blockedQueries.toLocaleString() })
  if (hasBcdr) summaryCards.push({ label: 'Systems Protected', value: data.dattoBcdr!.totalAgents })
  if (hasSaas) summaryCards.push({ label: 'Cloud Seats Backed Up', value: data.dattoSaas!.activeSeats })
  if (hasSoc) summaryCards.push({ label: 'Security Incidents Handled', value: data.security.socIncidents.totalIncidents })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{data.company.name}</h2>
          <p className="text-slate-400 text-sm">
            {data.period.start} to {data.period.end} &middot; {report.variant} variant
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/reporting/annual-report"
            className="text-sm text-slate-400 hover:text-slate-300 px-3 py-2"
          >
            Back to List
          </Link>
          <a
            href={`/api/reports/annual-report/${report.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            View PDF
          </a>
        </div>
      </div>

      {/* Data Coverage — customer variant: only show available sources */}
      {visibleDataSources.length > 0 && (
        <Section title={isCustomer ? 'Services Covered' : 'Data Source Coverage'}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 py-2 px-3">Service</th>
                  <th className="text-center text-slate-400 py-2 px-3">Status</th>
                  <th className="text-left text-slate-400 py-2 px-3">Coverage Period</th>
                  {!isCustomer && <th className="text-left text-slate-400 py-2 px-3">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {visibleDataSources.map((ds, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="py-2 px-3 text-slate-300">{ds.source}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        ds.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {ds.available ? 'Active' : 'Not Available'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-xs">
                      {ds.coverageStart && ds.coverageEnd ? `${ds.coverageStart} to ${ds.coverageEnd}` : '—'}
                    </td>
                    {!isCustomer && <td className="py-2 px-3 text-slate-500 text-xs">{ds.note || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Executive Summary */}
      {summaryCards.length > 0 && (
        <Section title="Executive Summary">
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(summaryCards.length, 3)} gap-4 mb-4`}>
            {summaryCards.map((c, i) => (
              <StatCard key={i} label={c.label} value={c.value} />
            ))}
          </div>
          {data.executiveSummary.topIssueCategories.length > 0 && hasTickets && (
            <p className="text-sm text-slate-400 mb-2">
              <span className="text-slate-300 font-medium">Top Categories:</span>{' '}
              {data.executiveSummary.topIssueCategories.join(', ')}
            </p>
          )}
          {visibleTrends.map((t, i) => (
            <p key={i} className="text-sm text-slate-400 mb-1">{t}</p>
          ))}
          {/* Data coverage notes: internal only */}
          {!isCustomer && data.executiveSummary.dataCoverageNotes.length > 0 && (
            <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-400 font-medium mb-1">Data Coverage Notes:</p>
              {data.executiveSummary.dataCoverageNotes.map((n, i) => (
                <p key={i} className="text-xs text-blue-300/80">&bull; {n}</p>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Ticketing Analysis — only show if there are tickets */}
      {(!isCustomer || hasTickets) && (
        <Section title="Ticketing Analysis">
          {!hasTickets ? (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
              No tickets found for this company in the specified period.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <StatCard label="Tickets Created" value={data.ticketing.totalTickets} />
                <StatCard label="Avg Response" value={fmtMin(data.ticketing.responseMetrics.avgFirstResponseMinutes)} />
                <StatCard label="Avg Resolution" value={fmtMin(data.ticketing.responseMetrics.avgResolutionMinutes)} />
                <StatCard label="First Touch Rate" value={data.ticketing.responseMetrics.firstTouchResolutionRate !== null ? `${data.ticketing.responseMetrics.firstTouchResolutionRate}%` : '—'} />
                {data.ticketing.responseMetrics.slaResponseCompliance !== null && (
                  <StatCard label="SLA Compliance" value={`${data.ticketing.responseMetrics.slaResponseCompliance}%`} />
                )}
                <StatCard label="Median Resolution" value={fmtMin(data.ticketing.responseMetrics.medianResolutionMinutes)} />
              </div>

              {data.ticketing.ticketsByPriority.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">By Priority</h4>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Priority</th>
                          <th className="text-right text-slate-400 py-2 px-3">Count</th>
                          <th className="text-right text-slate-400 py-2 px-3">Share</th>
                          <th className="text-right text-slate-400 py-2 px-3">Avg Resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ticketing.ticketsByPriority.map((p, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{p.priority}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{p.count}</td>
                            <td className="py-2 px-3 text-right text-slate-400">{p.percentage}%</td>
                            <td className="py-2 px-3 text-right text-slate-400">{fmtMin(p.avgResolutionMinutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {data.ticketing.monthlyTrends.length > 0 && hasTickets && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Monthly Trends</h4>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Month</th>
                          <th className="text-right text-slate-400 py-2 px-3">Created</th>
                          <th className="text-right text-slate-400 py-2 px-3">Closed</th>
                          <th className="text-right text-slate-400 py-2 px-3">Hours</th>
                          <th className="text-right text-slate-400 py-2 px-3">Avg Resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ticketing.monthlyTrends.map((m, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{m.label}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{m.ticketsCreated}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{m.ticketsClosed}</td>
                            <td className="py-2 px-3 text-right text-slate-400">{m.supportHours}h</td>
                            <td className="py-2 px-3 text-right text-slate-400">{fmtMin(m.avgResolutionMinutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {data.ticketing.ticketsByCategory.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">By Category</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Category</th>
                          <th className="text-right text-slate-400 py-2 px-3">Tickets</th>
                          <th className="text-right text-slate-400 py-2 px-3">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ticketing.ticketsByCategory.slice(0, 10).map((c, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{c.category}</td>
                            <td className="py-2 px-3 text-right text-slate-300">{c.count}</td>
                            <td className="py-2 px-3 text-right text-slate-400">{c.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Section>
      )}

      {/* Datto RMM — hide entirely for customer if no data */}
      {(!isCustomer || hasRmm) && (
        <Section title="Endpoint Operations (Datto RMM)">
          {!data.dattoRmm.available || data.dattoRmm.totalAlerts === 0 ? (
            !isCustomer ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {data.dattoRmm.note || 'Datto RMM data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Alerts" value={data.dattoRmm.totalAlerts} />
                <StatCard label="Resolved" value={data.dattoRmm.alertsResolved} />
                <StatCard label="Devices Managed" value={data.dattoRmm.devicesManaged} />
                <StatCard
                  label="Resolution Rate"
                  value={data.dattoRmm.totalAlerts > 0
                    ? `${Math.round((data.dattoRmm.alertsResolved / data.dattoRmm.totalAlerts) * 100)}%`
                    : '—'}
                />
              </div>
            </>
          )}
        </Section>
      )}

      {/* Datto EDR — hide entirely for customer if no data */}
      {(!isCustomer || hasEdr) && (
        <Section title="Endpoint Detection & Response (Datto EDR)">
          {!hasEdr ? (
            !isCustomer ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {data.dattoEdr?.note || 'Datto EDR data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <StatCard label="Security Events Monitored" value={data.dattoEdr.totalEvents} />
                <StatCard label="Threat Categories" value={data.dattoEdr.eventsByType.length} />
                <StatCard label="Severity Levels" value={data.dattoEdr.eventsBySeverity.length} />
              </div>
              {data.dattoEdr.topThreats.length > 0 && !isCustomer && (
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Top Threats Detected</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.dattoEdr.topThreats.slice(0, 5).map((t, i) => (
                      <span key={i} className="bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-xs text-red-400">
                        {t.threat}: {t.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* DNSFilter — hide entirely for customer if no data */}
      {(!isCustomer || hasDns) && (
        <Section title="DNS Security (DNSFilter)">
          {!hasDns ? (
            !isCustomer ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {data.dnsFilter?.note || 'DNSFilter data not available.'}
              </div>
            ) : null
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <StatCard label="Total Queries" value={data.dnsFilter!.totalQueries.toLocaleString()} />
              <StatCard label="Threats Blocked" value={data.dnsFilter!.blockedQueries.toLocaleString()} />
              <StatCard label="Block Rate" value={data.dnsFilter!.totalQueries > 0 ? `${(data.dnsFilter!.blockedQueries / data.dnsFilter!.totalQueries * 100).toFixed(2)}%` : '—'} />
            </div>
          )}
        </Section>
      )}

      {/* Datto BCDR — hide entirely for customer if no devices */}
      {(!isCustomer || hasBcdr) && (
        <Section title="Backup & Disaster Recovery (Datto BCDR)">
          {!hasBcdr ? (
            !isCustomer ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {data.dattoBcdr?.note || 'Datto BCDR data not available.'}
              </div>
            ) : null
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <StatCard label="Total Devices" value={data.dattoBcdr!.totalDevices} />
              <StatCard label="Protected Systems" value={data.dattoBcdr!.totalAgents} />
              {(data.dattoBcdr!.applianceCount ?? 0) > 0 && (
                <StatCard label="Server Appliances" value={data.dattoBcdr!.applianceCount} />
              )}
              {(data.dattoBcdr!.endpointBackupCount ?? 0) > 0 && (
                <StatCard label="PC/Laptop Backups" value={data.dattoBcdr!.endpointBackupCount} />
              )}
              {(data.dattoBcdr!.cloudDeviceCount ?? 0) > 0 && (
                <StatCard label="Cloud Devices" value={data.dattoBcdr!.cloudDeviceCount} />
              )}
              {data.dattoBcdr!.totalAlerts === 0 && (
                <StatCard label="Alert Status" value="All Clear" />
              )}
            </div>
          )}
        </Section>
      )}

      {/* Datto SaaS Protection — hide entirely for customer if no data */}
      {(!isCustomer || hasSaas) && (
        <Section title="Cloud Backup (Datto SaaS Protection)">
          {!hasSaas ? (
            !isCustomer ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {data.dattoSaas?.note || 'Datto SaaS Protection data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <StatCard label="Protected Seats" value={data.dattoSaas!.activeSeats} />
                <StatCard label="Domains" value={data.dattoSaas!.totalDomains} />
                <StatCard label="Total Seats" value={data.dattoSaas!.totalSeats} />
              </div>
              {data.dattoSaas!.seatsByType.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Protected Services</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.dattoSaas!.seatsByType.map((s, i) => (
                      <span key={i} className="bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded text-xs text-cyan-400">
                        {s.type}: {s.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* Security Operations — customer: only show if there are active sources with real data */}
      {(!isCustomer || visibleSecSources.length > 0 || hasSoc) && (
        <Section title="Security Operations">
          {visibleSecSources.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-slate-300 mb-2">{isCustomer ? 'Active Security Services' : 'Source Status'}</h4>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2 px-3">Source</th>
                      <th className="text-center text-slate-400 py-2 px-3">Status</th>
                      {!isCustomer && <th className="text-left text-slate-400 py-2 px-3">Notes</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSecSources.map((s, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="py-2 px-3 text-slate-300">{s.name}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            s.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {s.available ? 'Active' : 'Not Connected'}
                          </span>
                        </td>
                        {!isCustomer && <td className="py-2 px-3 text-slate-500 text-xs">{s.note || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {hasSoc && (
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-2">SOC Incidents: {data.security.socIncidents.totalIncidents}</h4>
              {data.security.socIncidents.bySeverity.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {data.security.socIncidents.bySeverity.map((s, i) => (
                    <span key={i} className="bg-slate-700/50 px-2 py-1 rounded text-xs text-slate-300">
                      {s.severity}: {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Internal-only notes */}
          {!isCustomer && data.security.note && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
              {data.security.note}
            </div>
          )}
        </Section>
      )}

      {/* Email Security — internal only (never show for customer since it says "not implemented") */}
      {!isCustomer && (
        <Section title="Email Security (Inky)">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
            {data.emailSecurity.note}
          </div>
        </Section>
      )}

      {/* Health — customer: only show if healthy or watch */}
      {data.healthSnapshot && (!isCustomer || hasHealth) && (
        <Section title="Customer Health Snapshot">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${
              data.healthSnapshot.tier === 'Healthy' ? 'bg-emerald-500' :
              data.healthSnapshot.tier === 'Watch' ? 'bg-cyan-600' :
              data.healthSnapshot.tier === 'At Risk' ? 'bg-rose-500' :
              'bg-red-600'
            }`}>
              {Math.round(data.healthSnapshot.overallScore)}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{data.healthSnapshot.tier}</p>
              {data.healthSnapshot.trend && (
                <p className="text-sm text-slate-400">Trend: {data.healthSnapshot.trend}</p>
              )}
              {data.healthSnapshot.previousScore !== null && !isCustomer && (
                <p className="text-sm text-slate-400">Previous: {Math.round(data.healthSnapshot.previousScore)}</p>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

// ============================================
// COMPONENTS
// ============================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h3 className="text-lg font-bold text-cyan-400 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-3 text-center">
      <div className="text-xs text-slate-500 uppercase font-medium">{label}</div>
      <div className="text-xl font-bold text-white mt-1">{value}</div>
    </div>
  )
}

function fmtMin(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
