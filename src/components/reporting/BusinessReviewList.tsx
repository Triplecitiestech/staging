'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ReviewSummary {
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

interface CompanyOption {
  id: string
  displayName: string
}

export default function BusinessReviewList() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [companiesError, setCompaniesError] = useState<string | null>(null)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Generation form state
  const [selectedCompany, setSelectedCompany] = useState('')
  const [reportType, setReportType] = useState<'monthly' | 'quarterly'>('monthly')
  const [variant, setVariant] = useState<'customer' | 'internal'>('customer')
  const [showForm, setShowForm] = useState(false)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    setReviewsError(null)
    try {
      const res = await fetch('/api/reports/business-review')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load reviews (HTTP ${res.status})`)
      }
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[BusinessReviewList] Failed to load reviews:', msg)
      setReviewsError(msg)
    }
    setLoading(false)
  }, [])

  const fetchCompanies = useCallback(async () => {
    setCompaniesError(null)
    try {
      // Use the selectors endpoint which reads from the base Company table,
      // not from materialized reporting tables
      const res = await fetch('/api/reports/selectors')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load companies (HTTP ${res.status})`)
      }
      const data = await res.json()
      const companyList = (data.companies || []).map((c: { id: string; displayName: string }) => ({
        id: c.id,
        displayName: c.displayName,
      }))
      setCompanies(companyList)
      if (companyList.length === 0) {
        setCompaniesError('No companies found. Ensure Autotask company sync has been run.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[BusinessReviewList] Failed to load companies:', msg)
      setCompaniesError(`Unable to load companies from Autotask data source: ${msg}`)
    }
  }, [])

  useEffect(() => {
    fetchReviews()
    fetchCompanies()
  }, [fetchReviews, fetchCompanies])

  const generateReview = async () => {
    if (!selectedCompany) return
    setGenerating(true)
    setGenerateError(null)

    const now = new Date()
    let periodStart: Date
    let periodEnd: Date

    if (reportType === 'monthly') {
      periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    } else {
      const qStart = Math.floor((now.getUTCMonth() - 3) / 3) * 3
      const year = qStart < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
      const month = ((qStart % 12) + 12) % 12
      periodStart = new Date(Date.UTC(year, month, 1))
      periodEnd = new Date(Date.UTC(year, month + 3, 0))
    }

    try {
      const res = await fetch('/api/reports/business-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany,
          reportType,
          variant,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }),
      })

      if (res.ok) {
        setShowForm(false)
        setGenerateError(null)
        await fetchReviews()
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setGenerateError(err.error || `Generation failed (HTTP ${res.status})`)
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate review')
    }

    setGenerating(false)
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">{reviews.length} reports generated</div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 transition-colors"
        >
          Generate New Review
        </button>
      </div>

      {/* Generation form */}
      {showForm && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
          <h3 className="text-sm font-medium text-white mb-4">Generate Business Review</h3>

          {/* Company load error */}
          {companiesError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-rose-400">{companiesError}</p>
              <button
                onClick={fetchCompanies}
                className="text-xs text-cyan-400 mt-1 hover:underline"
              >
                Retry loading companies
              </button>
            </div>
          )}

          {/* Generate error */}
          {generateError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-rose-400">{generateError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Company</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                disabled={companies.length === 0}
              >
                <option value="">
                  {companies.length === 0
                    ? companiesError
                      ? 'Unable to load companies'
                      : 'Loading companies...'
                    : 'Select company...'}
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as 'monthly' | 'quarterly')}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Variant</label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value as 'customer' | 'internal')}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="customer">Customer-Facing</option>
                <option value="internal">Internal</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={generateReview}
                disabled={generating || !selectedCompany}
                className="w-full px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      )}

      {/* Reviews error */}
      {reviewsError && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <p className="text-sm text-rose-400">{reviewsError}</p>
          <button onClick={fetchReviews} className="text-xs text-cyan-400 mt-2 hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Reviews list */}
      {!loading && !reviewsError && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Company</th>
                  <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Type</th>
                  <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Variant</th>
                  <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Period</th>
                  <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Status</th>
                  <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Created</th>
                  <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-4 py-3">
                      <span className="text-sm text-white">{review.company.displayName}</span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className="text-xs text-slate-300 capitalize">{review.reportType}</span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <VariantBadge variant={review.variant} />
                    </td>
                    <td className="text-center px-4 py-3 text-xs text-slate-400">
                      {new Date(review.periodStart).toLocaleDateString()} –{' '}
                      {new Date(review.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="text-center px-4 py-3">
                      <StatusBadge status={review.status} />
                    </td>
                    <td className="text-right px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/reporting/business-review/${review.id}`}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          View
                        </Link>
                        <a
                          href={`/api/reports/business-review/${review.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-violet-400 hover:underline"
                        >
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {reviews.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No business reviews generated yet. Click &quot;Generate New Review&quot; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'text-slate-400 bg-slate-400/10',
    review: 'text-violet-400 bg-violet-400/10',
    ready: 'text-cyan-400 bg-cyan-400/10',
    sent: 'text-emerald-400 bg-emerald-400/10',
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'text-slate-400'}`}>
      {status}
    </span>
  )
}

function VariantBadge({ variant }: { variant: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
      variant === 'internal'
        ? 'text-orange-400 bg-orange-400/10'
        : 'text-cyan-400 bg-cyan-400/10'
    }`}>
      {variant}
    </span>
  )
}
