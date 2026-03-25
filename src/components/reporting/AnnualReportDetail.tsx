'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ProcessedReport } from '@/lib/reporting/annual-report/types'
import { processReport, parseStoredReport } from '@/lib/reporting/annual-report/report-processor'

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
  reportData: unknown
  company: { displayName: string }
}

export default function AnnualReportDetail({ reportId }: Props) {
  const [report, setReport] = useState<ReportRecord | null>(null)
  const [processed, setProcessed] = useState<ProcessedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reports/annual-report/${reportId}`)
        if (!res.ok) throw new Error('Failed to load report')
        const data = await res.json()
        const rec = data.review as ReportRecord
        setReport(rec)

        // Parse stored data (handles legacy and new format) then process
        const { raw, config } = parseStoredReport(rec.reportData, rec.variant)
        setProcessed(processReport(raw, config))
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

  if (error || !report || !processed) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400">
        {error || 'Report not found'}
      </div>
    )
  }

  const r = processed
  const sec = (key: string) => r.sections.find(s => s.key === key)
  const isVisible = (key: string) => sec(key)?.visible ?? false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{r.metadata.companyName}</h2>
          <p className="text-slate-400 text-sm">
            {r.metadata.periodStart} to {r.metadata.periodEnd} &middot; {r.metadata.variant} variant
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

      {/* Data Coverage */}
      {r.dataSources.length > 0 && (
        <Section title={sec('dataSources')?.title || 'Services Covered'}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 py-2 px-3">Service</th>
                  <th className="text-center text-slate-400 py-2 px-3 w-28">Status</th>
                  <th className="text-left text-slate-400 py-2 px-3">Coverage Period</th>
                  {r.showInternalColumns && <th className="text-left text-slate-400 py-2 px-3">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {r.dataSources.map((ds, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="py-2 px-3 text-slate-300">{r.showInternalColumns && ds.internalSource ? ds.internalSource : ds.source}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        ds.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {ds.available ? 'Active' : 'Not Available'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-xs">
                      {ds.coverageStart && ds.coverageEnd ? `${ds.coverageStart} to ${ds.coverageEnd}` : '\u2014'}
                    </td>
                    {r.showInternalColumns && <td className="py-2 px-3 text-slate-500 text-xs">{ds.note || '\u2014'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Executive Summary */}
      {r.summaryCards.length > 0 && (
        <Section title="Executive Summary">
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            {r.summaryCards.map((c, i) => (
              <StatCard key={i} label={c.label} value={c.value} />
            ))}
          </div>
          {r.topIssueCategories.length > 0 && r.ticketing.totalTickets > 0 && (
            <p className="text-sm text-slate-400 mb-2">
              <span className="text-slate-300 font-medium">Top Categories:</span>{' '}
              {r.topIssueCategories.join(', ')}
            </p>
          )}
          {r.keyTrends.map((t, i) => (
            <p key={i} className="text-sm text-slate-400 mb-1">{t}</p>
          ))}
          {r.dataCoverageNotes.length > 0 && (
            <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-400 font-medium mb-1">Data Coverage Notes:</p>
              {r.dataCoverageNotes.map((n, i) => (
                <p key={i} className="text-xs text-blue-300/80">&bull; {n}</p>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Ticketing Analysis */}
      {isVisible('ticketing') && (
        <Section title={sec('ticketing')!.title}>
          {!sec('ticketing')!.hasData ? (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
              No tickets found for this company in the specified period.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-3 mb-4">
                <StatCard label="Tickets Created" value={r.ticketing.totalTickets} />
                <StatCard label="First Touch Rate" value={r.ticketing.responseMetrics.firstTouchResolutionRate !== null ? `${r.ticketing.responseMetrics.firstTouchResolutionRate}%` : '\u2014'} />
                {r.showInternalColumns && (
                  <>
                    <StatCard label="Avg Response" value={fmtMin(r.ticketing.responseMetrics.avgFirstResponseMinutes)} />
                    <StatCard label="Avg Resolution" value={fmtMin(r.ticketing.responseMetrics.avgResolutionMinutes)} />
                    <StatCard label="Median Resolution" value={fmtMin(r.ticketing.responseMetrics.medianResolutionMinutes)} />
                  </>
                )}
                {r.ticketing.responseMetrics.slaResponseCompliance !== null && r.showInternalColumns && (
                  <StatCard label="SLA Compliance" value={`${r.ticketing.responseMetrics.slaResponseCompliance}%`} />
                )}
              </div>

              {isVisible('ticketingPriority') && r.ticketing.ticketsByPriority.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">By Priority</h4>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Priority</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Count</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Share</th>
                          {r.showInternalColumns && <th className="text-right text-slate-400 py-2 px-3 w-32">Avg Resolution</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {r.ticketing.ticketsByPriority.map((p, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{p.priority}</td>
                            <td className="py-2 px-3 text-right text-slate-300 tabular-nums">{p.count}</td>
                            <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{p.percentage}%</td>
                            {r.showInternalColumns && <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{fmtMin(p.avgResolutionMinutes)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {isVisible('ticketingTrends') && r.ticketing.monthlyTrends.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Monthly Trends</h4>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Month</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Created</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Closed</th>
                          {r.showInternalColumns && <th className="text-right text-slate-400 py-2 px-3 w-24">Hours</th>}
                          {r.showInternalColumns && <th className="text-right text-slate-400 py-2 px-3 w-32">Avg Resolution</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {r.ticketing.monthlyTrends.map((m, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{m.label}</td>
                            <td className="py-2 px-3 text-right text-slate-300 tabular-nums">{m.ticketsCreated}</td>
                            <td className="py-2 px-3 text-right text-slate-300 tabular-nums">{m.ticketsClosed}</td>
                            {r.showInternalColumns && <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{m.supportHours}h</td>}
                            {r.showInternalColumns && <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{fmtMin(m.avgResolutionMinutes)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {isVisible('ticketingCategories') && r.ticketing.ticketsByCategory.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">By Category</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left text-slate-400 py-2 px-3">Category</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Tickets</th>
                          <th className="text-right text-slate-400 py-2 px-3 w-24">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.ticketing.ticketsByCategory.slice(0, 10).map((c, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2 px-3 text-slate-300">{c.category}</td>
                            <td className="py-2 px-3 text-right text-slate-300 tabular-nums">{c.count}</td>
                            <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{c.percentage}%</td>
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

      {/* RMM / Endpoint Management */}
      {isVisible('rmm') && (
        <Section title={sec('rmm')!.title}>
          {!sec('rmm')!.hasData ? (
            r.showInternalColumns ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {r.dattoRmm.note || 'RMM data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-3 mb-4">
                <StatCard label="Endpoints Managed" value={r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged} />
                {(r.dattoRmm.serverCount ?? 0) > 0 && <StatCard label="Servers" value={r.dattoRmm.serverCount} />}
                {(r.dattoRmm.serverCount ?? 0) > 0 && (r.dattoRmm.workstationCount ?? 0) > 0 && <StatCard label="Workstations" value={r.dattoRmm.workstationCount} />}
                {(r.dattoRmm.patchAlertsCount ?? 0) > 0 && (
                  <StatCard label="Patch & Update Alerts" value={r.dattoRmm.patchAlertsCount} />
                )}
                {r.dattoRmm.totalAlerts > 0 && <StatCard label="Monitoring Alerts" value={r.dattoRmm.totalAlerts.toLocaleString()} />}
                {r.dattoRmm.totalAlerts > 0 && (
                  <StatCard
                    label="Alert Resolution Rate"
                    value={`${Math.round((r.dattoRmm.alertsResolved / r.dattoRmm.totalAlerts) * 100)}%`}
                  />
                )}
              </div>

              {r.dattoRmm.devicesByOS && r.dattoRmm.devicesByOS.filter(d => d.os === 'Windows' || d.os === 'Windows Server').length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Operating Systems</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {r.dattoRmm.devicesByOS.filter(d => d.os === 'Windows' || d.os === 'Windows Server').map((d, i) => (
                      <span key={i} className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded text-xs text-cyan-400">
                        {d.os}: {d.count}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {r.dattoRmm.devicesByType && r.dattoRmm.devicesByType.length > 0 && r.showInternalColumns && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Device Types</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {r.dattoRmm.devicesByType.map((d, i) => (
                      <span key={i} className="bg-slate-700/50 px-3 py-1 rounded text-xs text-slate-300">
                        {d.type}: {d.count}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </Section>
      )}

      {/* EDR */}
      {isVisible('edr') && (
        <Section title={sec('edr')!.title}>
          {!sec('edr')!.hasData ? (
            r.showInternalColumns ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {r.dattoEdr?.note || 'EDR data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-3 mb-4">
                <StatCard label="Security Events Analyzed" value={r.dattoEdr.totalEvents.toLocaleString()} />
                {r.dattoEdr.eventsBySeverity.filter(s => s.severity === 'critical' || s.severity === 'high').length > 0 && (
                  <StatCard
                    label="Critical/High Severity"
                    value={r.dattoEdr.eventsBySeverity
                      .filter(s => s.severity === 'critical' || s.severity === 'high')
                      .reduce((sum, s) => sum + s.count, 0)
                      .toLocaleString()}
                  />
                )}
                {r.dattoEdr.topThreats.length > 0 && (
                  <StatCard label="Unique Threats Detected" value={r.dattoEdr.topThreats.length} />
                )}
              </div>
              {r.dattoEdr.eventsBySeverity.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Events by Severity</h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {r.dattoEdr.eventsBySeverity.map((s, i) => (
                      <span key={i} className={`px-3 py-1 rounded text-xs font-medium ${
                        s.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        s.severity === 'high' ? 'bg-rose-500/20 text-rose-400' :
                        s.severity === 'medium' ? 'bg-cyan-500/20 text-cyan-400' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>
                        {s.severity}: {s.count.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {r.dattoEdr.topThreats.length > 0 && r.showInternalColumns && (
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Top Threats Detected</h4>
                  <div className="flex flex-wrap gap-2">
                    {r.dattoEdr.topThreats.slice(0, 5).map((t, i) => (
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

      {/* DNS */}
      {isVisible('dns') && (
        <Section title={sec('dns')!.title}>
          {!sec('dns')!.hasData ? (
            r.showInternalColumns ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {r.dnsFilter?.note || 'DNS data not available.'}
              </div>
            ) : null
          ) : (
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              <StatCard label="Total Queries" value={r.dnsFilter!.totalQueries.toLocaleString()} />
              <StatCard label="Threats Blocked" value={r.dnsFilter!.blockedQueries.toLocaleString()} />
              <StatCard label="Block Rate" value={r.dnsFilter!.totalQueries > 0 ? `${(r.dnsFilter!.blockedQueries / r.dnsFilter!.totalQueries * 100).toFixed(2)}%` : '\u2014'} />
            </div>
          )}
        </Section>
      )}

      {/* BCDR */}
      {isVisible('bcdr') && (
        <Section title={sec('bcdr')!.title}>
          {!sec('bcdr')!.hasData ? (
            r.showInternalColumns ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {r.dattoBcdr?.note || 'BCDR data not available.'}
              </div>
            ) : null
          ) : (
            <div className="flex flex-wrap justify-center gap-3 mb-4">
              <StatCard label="Total Devices" value={r.dattoBcdr!.totalDevices} />
              <StatCard label="Protected Systems" value={r.dattoBcdr!.totalAgents} />
              {(r.dattoBcdr!.applianceCount ?? 0) > 0 && (
                <StatCard label="Server Appliances" value={r.dattoBcdr!.applianceCount} />
              )}
              {r.dattoBcdr!.totalAlerts === 0 && (
                <StatCard label="Alert Status" value="All Clear" />
              )}
            </div>
          )}
        </Section>
      )}

      {/* SaaS Backups */}
      {isVisible('saas') && (
        <Section title={sec('saas')!.title}>
          {!sec('saas')!.hasData ? (
            r.showInternalColumns ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
                {r.dattoSaas?.note || 'SaaS backup data not available.'}
              </div>
            ) : null
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-3 mb-4">
                <StatCard label="Protected Seats" value={r.dattoSaas!.activeSeats} />
                <StatCard label="Domains" value={r.dattoSaas!.totalDomains} />
              </div>
              {r.dattoSaas!.seatsByType.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Protected Services</h4>
                  <div className="flex flex-wrap gap-2">
                    {r.dattoSaas!.seatsByType.map((s, i) => (
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

      {/* Security Operations */}
      {isVisible('security') && (
        <Section title={sec('security')!.title}>
          {r.metadata.isInternal ? (
            <>
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Source Status</h4>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 py-2 px-3">Source</th>
                      <th className="text-center text-slate-400 py-2 px-3 w-28">Status</th>
                      <th className="text-left text-slate-400 py-2 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.security.sources.map((s, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="py-2 px-3 text-slate-300">{s.internalName || s.name}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            s.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {s.available ? 'Active' : 'Not Connected'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{s.note || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-3">
                Our Security Operations Center continuously monitors your environment for threats and anomalies across the following areas:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {r.security.sources.map((s, i) => (
                  <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-sm font-medium text-slate-200">{s.name}</span>
                    </div>
                    {s.note && <p className="text-xs text-slate-400 ml-4">{s.note}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {r.security.socIncidents.available && r.security.socIncidents.totalIncidents > 0 && r.showInternalColumns && (
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-2">SOC Incidents: {r.security.socIncidents.totalIncidents}</h4>
              {r.security.socIncidents.bySeverity.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {r.security.socIncidents.bySeverity.map((s, i) => (
                    <span key={i} className="bg-slate-700/50 px-2 py-1 rounded text-xs text-slate-300">
                      {s.severity}: {s.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {r.showInternalColumns && r.security.note && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
              {r.security.note}
            </div>
          )}
        </Section>
      )}

      {/* Email Security — internal only */}
      {isVisible('emailSecurity') && (
        <Section title={sec('emailSecurity')!.title}>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-blue-400">
            {r.emailSecurity.note}
          </div>
        </Section>
      )}

      {/* User Protection Services */}
      {isVisible('userProtection') && (
        <Section title={sec('userProtection')!.title}>
          <p className="text-sm text-slate-400 mb-4">
            We actively protect your users and their identities across the following areas:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {r.userProtection.services.filter(s => s.active).map((s, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
                  <span className="text-sm font-medium text-slate-200">{s.name}</span>
                </div>
                <p className="text-xs text-slate-400 ml-4">{s.description}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Health */}
      {isVisible('health') && r.healthSnapshot && (
        <Section title={sec('health')!.title}>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${
              r.healthSnapshot.tier === 'Healthy' ? 'bg-emerald-500' :
              r.healthSnapshot.tier === 'Watch' ? 'bg-cyan-600' :
              r.healthSnapshot.tier === 'At Risk' ? 'bg-rose-500' :
              'bg-red-600'
            }`}>
              {Math.round(r.healthSnapshot.overallScore)}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{r.healthSnapshot.tier}</p>
              {r.healthSnapshot.trend && (
                <p className="text-sm text-slate-400">Trend: {r.healthSnapshot.trend}</p>
              )}
              {r.healthSnapshot.previousScore !== null && r.showInternalColumns && (
                <p className="text-sm text-slate-400">Previous: {Math.round(r.healthSnapshot.previousScore)}</p>
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
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-center min-w-[140px]">
      <div className="text-xs text-slate-500 uppercase font-medium">{label}</div>
      <div className="text-xl font-bold text-white mt-1 tabular-nums">{value}</div>
    </div>
  )
}

function fmtMin(minutes: number | null): string {
  if (minutes === null) return '\u2014'
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
