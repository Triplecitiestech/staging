/**
 * /admin/compliance/[companyId] — Compliance Cockpit (landing)
 *
 * Read-only summary of one customer's compliance state. Surfaces:
 *   - Bootstrap progress (4 stages: Profile → Connections → Inventory → Baseline)
 *   - Recommended frameworks (from the Customer Profile)
 *   - Latest assessment per framework with a posture score
 *   - Open findings by status
 *   - Pending changes + active bundle counts
 *   - Stale-attention items
 *
 * Server component. No mutations from this page; navigation links lead to
 * the existing surfaces. Single DB round-trip via parallel queries.
 *
 * See docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md §2.2 for the cockpit
 * design rationale.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  getCustomerProfileAnswers,
  computeProfileCompletion,
  isProfileEmpty,
} from '@/lib/compliance/customer-profile-schema'
import { recommendFrameworksForCompany } from '@/lib/compliance/framework-recommender'
import { findStaleDispositions } from '@/lib/compliance/stale-dispositions'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
}

export default async function ComplianceCockpitPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')

  const { companyId } = await params

  // Confirm the company exists; 404 if not.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true, slug: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  // Run all the summary queries in parallel.
  const [
    profileAnswers,
    recommendations,
    staleItems,
    assessmentRows,
    findingCounts,
    pendingChangeCounts,
    activeBundleCount,
    toolCount,
    mappingCount,
  ] = await Promise.all([
    getCustomerProfileAnswers(companyId),
    recommendFrameworksForCompany(companyId),
    findStaleDispositions(companyId, 25),
    fetchLatestAssessments(companyId),
    fetchFindingCounts(companyId),
    fetchPendingChangeCounts(companyId),
    fetchActiveBundleCount(companyId),
    fetchToolCount(companyId),
    fetchMappingCount(companyId),
  ])

  const profileCompletion = computeProfileCompletion(profileAnswers)
  const profileStarted = !isProfileEmpty(profileAnswers)

  // Bootstrap stages (mirrors workflow-status route logic; reproduced here
  // so we don't take an HTTP round-trip on a server-rendered page).
  const stages = [
    {
      key: 'profile',
      label: 'Customer Profile',
      complete: profileStarted && profileCompletion >= 30,
      detail: profileStarted ? `${profileCompletion}% of required fields answered` : 'Not started',
      href: '#', // future: /admin/compliance/[companyId]/profile
    },
    {
      key: 'connections',
      label: 'Connections & Inventory',
      complete: toolCount > 0,
      detail: toolCount > 0 ? `${toolCount} tool(s) tracked` : 'No tools tracked yet',
      href: '/admin/compliance',
    },
    {
      key: 'mappings',
      label: 'Platform Mappings',
      complete: mappingCount > 0,
      detail: mappingCount > 0 ? `${mappingCount} mapping(s)` : 'Not mapped',
      href: '/admin/compliance',
    },
    {
      key: 'baseline',
      label: 'Baseline Assessment',
      complete: assessmentRows.length > 0,
      detail: assessmentRows.length > 0
        ? `${assessmentRows.length} framework(s) assessed`
        : 'No assessment yet',
      href: '/admin/compliance/workflow',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
              <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
              <span aria-hidden>›</span>
              <span className="text-slate-500">Cockpit</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">{company.displayName}</h1>
            <p className="text-sm text-slate-400 mt-1">Compliance posture and operational queue</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/compliance/workflow"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
            >
              Open Guided Workflow
            </Link>
            <Link
              href="/admin/compliance"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700/50 border border-white/10 text-slate-200 hover:bg-slate-700/70"
            >
              All Tabs
            </Link>
          </div>
        </div>

        {/* Bootstrap progress */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Bootstrap Progress
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stages.map((s, i) => (
              <li
                key={s.key}
                className={`rounded-lg border p-3 ${
                  s.complete
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-slate-800/40 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                      s.complete
                        ? 'bg-emerald-500/30 text-emerald-200'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                    aria-hidden
                  >
                    {s.complete ? '✓' : i + 1}
                  </span>
                  <p className="text-sm font-medium text-white">{s.label}</p>
                </div>
                <p className="text-xs text-slate-400 mt-1">{s.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Posture (latest assessments) */}
          <section className="lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Posture
              </h2>
              <Link
                href="/admin/compliance"
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                View all assessments →
              </Link>
            </header>
            {assessmentRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No assessments yet. Start one from the{' '}
                <Link href="/admin/compliance/workflow" className="text-cyan-400 hover:text-cyan-300 underline">
                  Guided Workflow
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {assessmentRows.map((a) => {
                  const pct = a.totalControls > 0
                    ? Math.round((a.passedControls / a.totalControls) * 100)
                    : 0
                  const tone = pct >= 80 ? 'emerald' : pct >= 50 ? 'cyan' : 'rose'
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 bg-slate-800/40 border border-white/5 rounded-lg p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.frameworkLabel}</p>
                        <p className="text-xs text-slate-500">
                          {a.passedControls} pass · {a.failedControls} fail ·{' '}
                          {a.manualReviewControls} review · last run{' '}
                          {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : 'in progress'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-bold px-3 py-1 rounded-md ${
                          tone === 'emerald'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : tone === 'cyan'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {pct}%
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Findings + change queue */}
          <div className="space-y-6">
            <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                Findings
              </h2>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Pass" value={findingCounts.pass} tone="emerald" />
                <Stat label="Fail" value={findingCounts.fail} tone="rose" />
                <Stat label="Review" value={findingCounts.review} tone="cyan" />
              </dl>
            </section>
            <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                Change Queue
              </h2>
              <dl className="space-y-2 text-sm">
                <Row label="Drafted" value={pendingChangeCounts.drafted} />
                <Row label="Bundled" value={pendingChangeCounts.bundled} />
                <Row label="Awaiting customer" value={pendingChangeCounts.awaitingCustomer} />
                <Row label="Scheduled" value={pendingChangeCounts.scheduled} />
                <Row label="In flight (deploying / verifying)" value={pendingChangeCounts.inFlight} />
                <Row label="Active bundles" value={activeBundleCount} />
              </dl>
            </section>
          </div>
        </div>

        {/* Stale + Recommended frameworks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Needs Attention
            </h2>
            {staleItems.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing stale. Everything is current.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {staleItems.slice(0, 8).map((s, i) => (
                  <li
                    key={s.id ?? `${s.controlId}-${i}`}
                    className="flex items-center justify-between gap-3 bg-slate-800/40 border border-white/5 rounded-lg p-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate">
                        {s.frameworkId} {s.controlId} — {s.reason.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-0.5">
                      {s.daysStale}d
                    </span>
                  </li>
                ))}
                {staleItems.length > 8 && (
                  <li className="text-xs text-slate-500 text-center">
                    + {staleItems.length - 8} more
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Recommended Frameworks
            </h2>
            {recommendations.length === 0 ? (
              <p className="text-sm text-slate-400">
                No recommendations yet. Fill the Customer Profile to enable framework auto-detection.
              </p>
            ) : (
              <ul className="space-y-2">
                {recommendations.map((r) => (
                  <li
                    key={r.frameworkId}
                    className="bg-slate-800/40 border border-white/5 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{r.frameworkId}</p>
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 ${
                            r.source === 'explicit'
                              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                              : 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
                          }`}
                        >
                          {r.source}
                        </span>
                        {!r.hasEvaluators && (
                          <span className="text-[10px] uppercase tracking-wider rounded px-2 py-0.5 bg-slate-700/50 text-slate-300 border border-white/10">
                            stub
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{r.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'rose' | 'cyan' }) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : tone === 'rose'
        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
        : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
  return (
    <div className={`rounded-lg border p-2 ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`font-semibold ${value > 0 ? 'text-cyan-300' : 'text-slate-500'}`}>{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

interface LatestAssessment {
  id: string
  frameworkId: string
  frameworkLabel: string
  completedAt: string | null
  totalControls: number
  passedControls: number
  failedControls: number
  manualReviewControls: number
}

async function fetchLatestAssessments(companyId: string): Promise<LatestAssessment[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      frameworkId: string
      completedAt: string | null
      totalControls: number
      passedControls: number
      failedControls: number
      manualReviewControls: number
    }>(
      `SELECT DISTINCT ON ("frameworkId")
         id, "frameworkId", "completedAt",
         "totalControls", "passedControls", "failedControls", "manualReviewControls"
       FROM compliance_assessments
       WHERE "companyId" = $1 AND status = 'complete'
       ORDER BY "frameworkId", "completedAt" DESC NULLS LAST`,
      [companyId]
    )
    return res.rows.map((r) => ({
      id: r.id,
      frameworkId: r.frameworkId,
      frameworkLabel: frameworkLabel(r.frameworkId),
      completedAt: r.completedAt,
      totalControls: Number(r.totalControls),
      passedControls: Number(r.passedControls),
      failedControls: Number(r.failedControls),
      manualReviewControls: Number(r.manualReviewControls),
    }))
  } catch {
    return []
  } finally {
    client.release()
  }
}

async function fetchFindingCounts(companyId: string): Promise<{ pass: number; fail: number; review: number }> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Sum across the latest complete assessment per framework only.
    const res = await client.query<{ pass: string; fail: string; review: string }>(
      `WITH latest AS (
         SELECT DISTINCT ON ("frameworkId") id
         FROM compliance_assessments
         WHERE "companyId" = $1 AND status = 'complete'
         ORDER BY "frameworkId", "completedAt" DESC NULLS LAST
       )
       SELECT
         COUNT(*) FILTER (WHERE status = 'pass')::text AS pass,
         COUNT(*) FILTER (WHERE status = 'fail')::text AS fail,
         COUNT(*) FILTER (WHERE status IN ('needs_review','partial'))::text AS review
       FROM compliance_findings f
       WHERE f."assessmentId" IN (SELECT id FROM latest)`,
      [companyId]
    )
    return {
      pass: parseInt(res.rows[0]?.pass ?? '0', 10),
      fail: parseInt(res.rows[0]?.fail ?? '0', 10),
      review: parseInt(res.rows[0]?.review ?? '0', 10),
    }
  } catch {
    return { pass: 0, fail: 0, review: 0 }
  } finally {
    client.release()
  }
}

async function fetchPendingChangeCounts(companyId: string) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ status: string; c: string }>(
      `SELECT status, COUNT(*)::text AS c
       FROM compliance_pending_changes
       WHERE "companyId" = $1
       GROUP BY status`,
      [companyId]
    )
    const byStatus: Record<string, number> = {}
    for (const r of res.rows) byStatus[r.status] = parseInt(r.c, 10)
    return {
      drafted: byStatus.drafted ?? 0,
      bundled: byStatus.bundled ?? 0,
      awaitingCustomer: byStatus.awaiting_customer ?? 0,
      scheduled: byStatus.scheduled ?? 0,
      inFlight: (byStatus.deploying ?? 0) + (byStatus.verifying ?? 0),
    }
  } catch {
    return { drafted: 0, bundled: 0, awaitingCustomer: 0, scheduled: 0, inFlight: 0 }
  } finally {
    client.release()
  }
}

async function fetchActiveBundleCount(companyId: string): Promise<number> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM compliance_change_bundles
       WHERE "companyId" = $1 AND status NOT IN ('complete', 'cancelled')`,
      [companyId]
    )
    return parseInt(res.rows[0]?.c ?? '0', 10)
  } catch {
    return 0
  } finally {
    client.release()
  }
}

async function fetchToolCount(companyId: string): Promise<number> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM compliance_company_tools
       WHERE "companyId" = $1 AND deployed = true`,
      [companyId]
    )
    return parseInt(res.rows[0]?.c ?? '0', 10)
  } catch {
    return 0
  } finally {
    client.release()
  }
}

async function fetchMappingCount(companyId: string): Promise<number> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM compliance_platform_mappings
       WHERE "companyId" = $1`,
      [companyId]
    )
    return parseInt(res.rows[0]?.c ?? '0', 10)
  } catch {
    return 0
  } finally {
    client.release()
  }
}

function frameworkLabel(id: string): string {
  switch (id) {
    case 'cis-v8':
    case 'cis-v8-ig1':
    case 'cis-v8-ig2':
    case 'cis-v8-ig3':
      return id === 'cis-v8' ? 'CIS Controls v8' : `CIS Controls v8 — ${id.replace('cis-v8-', 'IG').toUpperCase()}`
    case 'cmmc-l1':
      return 'CMMC Level 1'
    case 'cmmc-l2':
      return 'CMMC Level 2'
    case 'nist-800-171':
      return 'NIST SP 800-171'
    case 'hipaa':
      return 'HIPAA Security Rule'
    case 'pci':
      return 'PCI DSS v4.0.1'
    default:
      return id
  }
}
