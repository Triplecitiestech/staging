/**
 * Step 4 — Policies.
 *
 * Lists every policy associated with the customer, with framework
 * coverage chips and AI-analysis stats (covered / partial / missing
 * controls). Each row is clickable to expand the actual policy
 * content inline — fixing the cockpit-era complaint that "you can't
 * even click on the fucking policies that it generated to see what it
 * was."
 *
 * Generate / upload remains on the legacy dashboard for now (deep-link
 * out, don't duplicate). A later slice can move it inline.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { frameworkLabel } from '@/lib/compliance/labels'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import PolicyList from '@/components/compliance/PolicyList'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

interface PolicyRow {
  id: string
  title: string
  source: string
  category: string
  content: string
  frameworkIds: string[]
  controlIds: string[]
  createdBy: string
  updatedAt: string
  analyzedAt: string | null
  satisfiedControls: string[]
  partialControls: string[]
  missingControls: string[]
  analysisText: string
}

export default async function PoliciesStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [policies, steps] = await Promise.all([
    loadPolicies(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'policies')

  const total = policies.length
  const generated = policies.filter((p) => p.source === 'generated').length
  const uploaded = total - generated
  const totalCovered = policies.reduce((s, p) => s + p.satisfiedControls.length, 0)
  const totalPartial = policies.reduce((s, p) => s + p.partialControls.length, 0)
  const totalMissing = policies.reduce((s, p) => s + p.missingControls.length, 0)

  const frameworksUsed = new Set<string>()
  for (const p of policies) {
    for (const fid of p.frameworkIds) frameworksUsed.add(fid)
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 4</p>
        <h2 className="text-2xl font-bold text-white">Policies</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          The customer&apos;s policy library. Each policy is AI-analyzed against
          the framework controls it claims to cover, so you can see at a
          glance which controls have a documented policy and which are
          gap-filled by remediation alone. Click any policy to read it.
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Counter label="Total policies" value={total} tone="cyan" />
        <Counter label="Uploaded" value={uploaded} tone="slate" />
        <Counter label="AI-generated" value={generated} tone="violet" />
        <Counter label="Frameworks" value={frameworksUsed.size} tone="emerald" />
      </section>

      {total > 0 && (
        <section className="grid grid-cols-3 gap-3">
          <CoverageChip label="Controls covered"  count={totalCovered}  tone="emerald" />
          <CoverageChip label="Partial coverage"  count={totalPartial}  tone="cyan" />
          <CoverageChip label="Missing controls"  count={totalMissing}  tone="rose" />
        </section>
      )}

      {/* Generate / upload deep-links to the legacy dashboard for now. */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Add a policy
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Upload a Word/PDF document, paste text, or AI-generate a draft
            tied to a control gap. The full editor lives on the legacy
            dashboard until a later slice moves it inline.
          </p>
        </div>
        <Link
          href={`/admin/compliance#${companyId}-policies`}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25"
        >
          Open policy editor →
        </Link>
      </section>

      {/* Policy list — clickable to expand content */}
      <PolicyList policies={policies.map((p) => ({
        id: p.id,
        title: p.title,
        source: p.source,
        category: p.category,
        content: p.content,
        frameworkChips: p.frameworkIds.map((id) => ({ id, label: frameworkLabel(id) })),
        analyzedAt: p.analyzedAt,
        covered: p.satisfiedControls.length,
        partial: p.partialControls.length,
        missing: p.missingControls.length,
        coveredControls: p.satisfiedControls,
        partialControls: p.partialControls,
        missingControls: p.missingControls,
        analysisText: p.analysisText,
        updatedAt: p.updatedAt,
      }))} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        {prev ? (
          <Link href={prev.href} className="text-xs text-slate-400 hover:text-cyan-300">
            ← Back to {prev.title}
          </Link>
        ) : <span />}
        {next && (
          <Link
            href={next.href}
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Next: {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'cyan' | 'slate' | 'violet' | 'emerald' }) {
  const cls =
    tone === 'cyan'    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'violet'  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                         'bg-slate-800/40 text-slate-300 border-white/10'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function CoverageChip({ label, count, tone }: { label: string; count: number; tone: 'emerald' | 'cyan' | 'rose' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
    tone === 'cyan'    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                         'bg-rose-500/10 text-rose-300 border-rose-500/30'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-xl font-bold mt-1">{count}</p>
    </div>
  )
}

async function loadPolicies(companyId: string): Promise<PolicyRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<PolicyRow & { frameworkIds: unknown; controlIds: unknown; satisfiedControls: unknown; partialControls: unknown; missingControls: unknown }>(
      `SELECT p.id,
              p.title,
              p.source,
              p.category,
              p.content,
              p."frameworkIds",
              p."controlIds",
              p."createdBy",
              p."updatedAt"::text AS "updatedAt",
              a."analyzedAt"::text AS "analyzedAt",
              COALESCE(a."satisfiedControls", '[]'::jsonb) AS "satisfiedControls",
              COALESCE(a."partialControls",   '[]'::jsonb) AS "partialControls",
              COALESCE(a."missingControls",   '[]'::jsonb) AS "missingControls",
              COALESCE(a."analysisText", '') AS "analysisText"
         FROM compliance_policies p
         LEFT JOIN LATERAL (
           SELECT "satisfiedControls", "partialControls", "missingControls",
                  "analyzedAt", "analysisText"
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
      frameworkIds: toStringArray(r.frameworkIds),
      controlIds: toStringArray(r.controlIds),
      satisfiedControls: toStringArray(r.satisfiedControls),
      partialControls: toStringArray(r.partialControls),
      missingControls: toStringArray(r.missingControls),
    }))
  } catch (err) {
    console.error('[compliance/policies] loadPolicies failed', err)
    return []
  } finally {
    client.release()
  }
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}
