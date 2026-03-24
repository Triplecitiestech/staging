'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface CompanyOption {
  id: string
  displayName: string
  ticketCount: number
}

interface ReportSummary {
  id: string
  companyId: string
  reportType: string
  variant: string
  periodStart: string
  periodEnd: string
  status: string
  createdBy: string
  createdAt: string
  company: { displayName: string }
}

export default function AnnualReportGenerator() {
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [selectedCompany, setSelectedCompany] = useState('')
  const [variant, setVariant] = useState<'customer' | 'internal'>('customer')
  const [periodMonths, setPeriodMonths] = useState(12)

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/selectors')
      if (!res.ok) throw new Error('Failed to load companies')
      const data = await res.json()
      const list = (data.companies || [])
        .map((c: { id: string; displayName: string; ticketCount?: number }) => ({
          id: c.id,
          displayName: c.displayName,
          ticketCount: c.ticketCount || 0,
        }))
        .sort((a: CompanyOption, b: CompanyOption) =>
          b.ticketCount - a.ticketCount || a.displayName.localeCompare(b.displayName)
        )
      setCompanies(list)
    } catch (err) {
      console.error('Failed to load companies:', err)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/annual-report')
      if (!res.ok) throw new Error('Failed to load reports')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (err) {
      console.error('Failed to load reports:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCompanies()
    fetchReports()
  }, [fetchCompanies, fetchReports])

  const handleGenerate = async () => {
    if (!selectedCompany) {
      setError('Please select a company')
      return
    }

    setGenerating(true)
    setError(null)
    setSuccess(null)

    const now = new Date()
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const periodStart = new Date(now)
    periodStart.setMonth(periodStart.getMonth() - periodMonths)
    periodStart.setDate(1)
    periodStart.setHours(0, 0, 0, 0)

    try {
      const res = await fetch('/api/reports/annual-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany,
          variant,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Generation failed (HTTP ${res.status})`)
      }

      const data = await res.json()
      setSuccess(`Report generated successfully (ID: ${data.id})`)
      fetchReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    }

    setGenerating(false)
  }

  const handleDelete = async (id: string, companyName: string) => {
    if (!confirm(`Delete the annual report for ${companyName}? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/reports/annual-report/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setSuccess('Report deleted.')
      fetchReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const selectedCompanyName = companies.find(c => c.id === selectedCompany)?.displayName || ''

  return (
    <div className="space-y-8">
      {/* Generation Form */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Generate Annual Service Report</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Company selector */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Company</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value)}
            >
              <option value="">Select a company...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.displayName} {c.ticketCount > 0 ? `(${c.ticketCount} tickets)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Variant */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Variant</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={variant}
              onChange={e => setVariant(e.target.value as 'customer' | 'internal')}
            >
              <option value="customer">Customer-Facing</option>
              <option value="internal">Internal</option>
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Period (months)</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={periodMonths}
              onChange={e => setPeriodMonths(Number(e.target.value))}
            >
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
              <option value={18}>Last 18 months</option>
              <option value={24}>Last 24 months</option>
            </select>
          </div>

          {/* Generate button */}
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedCompany}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {selectedCompanyName && (
          <p className="text-sm text-slate-400">
            Will generate a {periodMonths}-month annual service report for <span className="text-white font-medium">{selectedCompanyName}</span> ({variant} variant).
          </p>
        )}

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-400 text-sm">
            {success}
          </div>
        )}
      </div>

      {/* Existing Reports */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Generated Reports</h2>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="text-slate-500 text-sm">No annual reports generated yet. Use the form above to create one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 font-medium py-3 px-3">Company</th>
                  <th className="text-left text-slate-400 font-medium py-3 px-3">Period</th>
                  <th className="text-left text-slate-400 font-medium py-3 px-3">Variant</th>
                  <th className="text-left text-slate-400 font-medium py-3 px-3">Status</th>
                  <th className="text-left text-slate-400 font-medium py-3 px-3">Created</th>
                  <th className="text-right text-slate-400 font-medium py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-3 text-white font-medium">{r.company.displayName}</td>
                    <td className="py-3 px-3 text-slate-300">
                      {new Date(r.periodStart).toLocaleDateString()} — {new Date(r.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.variant === 'customer' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-violet-500/20 text-violet-400'
                      }`}>
                        {r.variant}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'draft' ? 'bg-slate-500/20 text-slate-400' :
                        r.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                        r.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <Link
                        href={`/admin/reporting/annual-report/${r.id}`}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                      >
                        View
                      </Link>
                      <a
                        href={`/api/reports/annual-report/${r.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                      >
                        PDF
                      </a>
                      <button
                        onClick={() => handleDelete(r.id, r.company.displayName)}
                        className="text-red-400 hover:text-red-300 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
