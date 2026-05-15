/**
 * /admin/compliance/[companyId]/policies — policy library + generation status
 *
 * Shows what policies the customer has, where they came from (uploaded vs
 * generated), and the AI-analyzed control coverage stats. Deep-links to
 * the existing PolicyManager + PolicyGenerationDashboard which still own
 * the upload + generation UI surfaces.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
}

export default async function PoliciesPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [policies, generationRecords] = await Promise.all([
    loadPolicies(companyId),
    loadGenerationRecords(companyId),
  ])

  const uploadedCount = policies.filter((p) => p.source !== 'generated').length
  const generatedCount = policies.filter((p) => p.source === 'generated').length
  const pendingGenerations = generationRecords.filter(
    (g) => g.status === 'ready_to_generate' || g.status === 'generating'
  )

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
              <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">{company.displayName}</Link>
              <span aria-hidden>›</span>
              <span className="text-slate-500">Policies</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Policy Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              {policies.length} policy document{policies.length === 1 ? '' : 's'} ·{' '}
              {uploadedCount} uploaded · {generatedCount} AI-generated
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/compliance"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
            >
              Upload / Generate →
            </Link>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Counter label="Total policies" value={policies.length} tone="cyan" />
          <Counter label="Uploaded" value={uploadedCount} tone="slate" />
          <Counter label="AI-generated" value={generatedCount} tone="violet" />
          <Counter label="Pending generation" value={pendingGenerations.length} tone="cyan" />
        </div>

        {/* In-flight generations */}
        {pendingGenerations.length > 0 && (
          <section className="bg-slate-900/50 border border-cyan-500/20 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Generation in flight
            </h2>
            <ul className="space-y-2">
              {pendingGenerations.map((g) => (
                <li key={`${g.policySlug}-${g.version}`} className="text-sm text-slate-300 bg-slate-800/40 border border-white/5 rounded-lg p-2 flex items-center justify-between gap-2">
                  <span>{g.policySlug}</span>
                  <span className="text-xs text-cyan-300">{g.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Policy list */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Policies
          </h2>
          {policies.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              No policies yet.{' '}
              <Link href="/admin/compliance" className="text-cyan-400 hover:text-cyan-300 underline">
                Upload or generate one
              </Link>
              {' '}from the legacy dashboard.
            </p>
          ) : (
            <ul className="space-y-2">
              {policies.map((p) => (
                <li key={p.id} className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        Category: {p.category || '—'} · Source: {p.source} ·{' '}
                        Updated {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <PolicySourceBadge source={p.source} />
                  </div>
                  {(p.analyzedControlsCovered + p.analyzedControlsPartial + p.analyzedControlsMissing) > 0 && (
                    <div className="flex gap-2 mt-2 text-[11px]">
                      <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded px-2 py-0.5">
                        {p.analyzedControlsCovered} covered
                      </span>
                      <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded px-2 py-0.5">
                        {p.analyzedControlsPartial} partial
                      </span>
                      <span className="bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded px-2 py-0.5">
                        {p.analyzedControlsMissing} missing
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'cyan' | 'violet' }) {
  const cls =
    tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'violet' ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
    'bg-slate-800/40 text-slate-300 border-white/10'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function PolicySourceBadge({ source }: { source: string }) {
  const tone = source === 'generated' ? 'violet' : 'slate'
  const cls =
    tone === 'violet'
      ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
      : 'bg-slate-700/40 text-slate-300 border-white/10'
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider rounded px-2 py-0.5 border ${cls}`}>
      {source}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface PolicyRow {
  id: string
  title: string
  source: string
  category: string
  updatedAt: string
  analyzedControlsCovered: number
  analyzedControlsPartial: number
  analyzedControlsMissing: number
}

interface GenerationRow {
  policySlug: string
  status: string
  version: number
}

async function loadPolicies(companyId: string): Promise<PolicyRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<PolicyRow & {
      analyzedControlsCovered: string | number
      analyzedControlsPartial: string | number
      analyzedControlsMissing: string | number
    }>(
      `SELECT p.id,
              p.title,
              p.source,
              p.category,
              p."updatedAt"::text AS "updatedAt",
              COALESCE(jsonb_array_length(a."satisfiedControls"), 0) AS "analyzedControlsCovered",
              COALESCE(jsonb_array_length(a."partialControls"),   0) AS "analyzedControlsPartial",
              COALESCE(jsonb_array_length(a."missingControls"),   0) AS "analyzedControlsMissing"
         FROM compliance_policies p
         LEFT JOIN LATERAL (
           SELECT "satisfiedControls", "partialControls", "missingControls"
             FROM compliance_policy_analyses
            WHERE "policyId" = p.id
            ORDER BY "analyzedAt" DESC NULLS LAST, "createdAt" DESC
            LIMIT 1
         ) a ON TRUE
        WHERE p."companyId" = $1
        ORDER BY p."updatedAt" DESC`,
      [companyId]
    )
    return res.rows.map((r) => ({
      ...r,
      analyzedControlsCovered: Number(r.analyzedControlsCovered),
      analyzedControlsPartial: Number(r.analyzedControlsPartial),
      analyzedControlsMissing: Number(r.analyzedControlsMissing),
    }))
  } catch (err) {
    console.error('[compliance/policies] loadPolicies query failed', err)
    return []
  } finally {
    client.release()
  }
}

async function loadGenerationRecords(companyId: string): Promise<GenerationRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<GenerationRow>(
      `SELECT "policySlug", status, version
       FROM policy_generation_records
       WHERE "companyId" = $1
       ORDER BY "updatedAt" DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/policies] loadGenerationRecords query failed', err)
    return []
  } finally {
    client.release()
  }
}
