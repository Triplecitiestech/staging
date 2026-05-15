/**
 * Step 7 — Changes (in-flight remediation log).
 *
 * The Remediate button on the Findings page (slice 5b) is the primary
 * entry point for routine MSP-applied config fixes. This page exists
 * to surface what those buttons have produced — pending changes the
 * operator can monitor through deploy → verify → complete, and roll
 * back if the verification worker flags a regression.
 *
 * NOT a propose-and-bundle hub. Earlier draft (now reverted) tried to
 * be a launchpad for new changes; operator feedback was that the
 * proper home for "start a change" is the failing finding itself —
 * which is now what Findings does. This page is read + monitor only,
 * plus the still-supported customer-approval bundle workflow for
 * change types that DO need a customer sign-off round (rare).
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

interface PendingChangeRow {
  id: string
  actionId: string
  customerImpactSummary: string
  status: string
  bundleId: string | null
  createdAt: string
  createdBy: string
  deployedAt: string | null
  deployedBy: string | null
  verifiedAt: string | null
  rolledBackAt: string | null
  rolledBackReason: string | null
  verificationResultJson: string | null
}

interface BundleRow {
  id: string
  title: string
  status: string
  sentAt: string | null
  sentVia: string | null
  createdAt: string
  itemCount: number
}

export default async function ChangesStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [changes, bundles, steps] = await Promise.all([
    loadPendingChanges(companyId),
    loadBundles(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'changes')

  // Buckets for the timeline. Status meanings:
  //   drafted     — staged but never deployed (rare with Remediate
  //                 button; mostly from old bundle path)
  //   deploying   — executor running right now
  //   verifying   — executor finished, verification worker hasn't
  //                 confirmed pass/fail yet
  //   complete    — verified pass
  //   rolled_back — verified fail, executor rolled back via rollback action
  //   abandoned   — operator gave up before deploy
  //   bundled / awaiting_customer / customer_declined / deferred / scheduled
  //                — bundle/customer-approval workflow states
  const inFlight = changes.filter((c) => c.status === 'deploying' || c.status === 'verifying')
  const complete = changes.filter((c) => c.status === 'complete')
  const rolledBack = changes.filter((c) => c.status === 'rolled_back')
  const drafted = changes.filter((c) => c.status === 'drafted')
  const inBundle = changes.filter(
    (c) => c.status === 'bundled' || c.status === 'awaiting_customer' || c.status === 'scheduled'
  )

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 7</p>
        <h2 className="text-2xl font-bold text-white">Changes</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          The remediation log. Every time the{' '}
          <span className="text-cyan-300">Remediate</span> button gets
          clicked on a failing finding, the resulting pending change
          shows up here so you can watch it move through deploy →
          verify → complete (or roll back). Bundles below are the
          customer-approval workflow for change types that need sign-off
          before applying.
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Counter label="In flight"   value={inFlight.length}   tone="cyan" />
        <Counter label="Complete"    value={complete.length}   tone="emerald" />
        <Counter label="Rolled back" value={rolledBack.length} tone="rose" />
        <Counter label="In bundle"   value={inBundle.length}   tone="violet" />
        <Counter label="Drafts"      value={drafted.length}    tone="slate" />
      </section>

      {/* In-flight — what's running right now */}
      <ChangeSection title="In flight" rows={inFlight} emptyHint="No remediations are currently deploying or verifying." />

      {/* Recently completed */}
      <ChangeSection title="Recently completed" rows={complete.slice(0, 20)} emptyHint="No remediations have completed yet." />

      {/* Rolled back / failed */}
      {rolledBack.length > 0 && (
        <ChangeSection title="Rolled back" rows={rolledBack} emptyHint="" tone="rose" />
      )}

      {/* In-bundle items (customer-approval workflow) */}
      {inBundle.length > 0 && (
        <ChangeSection
          title="Awaiting customer (in bundle)"
          rows={inBundle}
          emptyHint=""
          tone="violet"
        />
      )}

      {/* Bundles list — opt-in workflow for customer sign-off rounds */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Customer-approval bundles
          </h3>
          {bundles.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Optional — for change types that need customer sign-off
            </p>
          )}
        </header>
        {bundles.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No bundles. Routine config fixes go directly through the
            Remediate button on Findings — bundles are only for change
            types that need customer sign-off (license change, major
            policy update, anything that should land in a CAB note).
          </p>
        ) : (
          <ul className="space-y-2">
            {bundles.map((b) => (
              <li
                key={b.id}
                className="bg-slate-800/40 border border-white/5 rounded-lg overflow-hidden"
              >
                <div className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{b.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {b.itemCount} item{b.itemCount === 1 ? '' : 's'}
                      {b.sentAt && (
                        <>
                          {' '}· sent {new Date(b.sentAt).toLocaleDateString()}
                          {b.sentVia ? ` (${b.sentVia})` : ''}
                        </>
                      )}
                      {' '}· created {new Date(b.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <BundleStatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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

function ChangeSection({
  title,
  rows,
  emptyHint,
  tone = 'slate',
}: {
  title: string
  rows: PendingChangeRow[]
  emptyHint: string
  tone?: 'slate' | 'rose' | 'violet'
}) {
  if (rows.length === 0 && !emptyHint) return null
  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
        {title} {rows.length > 0 && <span className="text-slate-500 font-normal">({rows.length})</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-3 text-center">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <ChangeRow key={c.id} change={c} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ChangeRow({ change, tone }: { change: PendingChangeRow; tone: 'slate' | 'rose' | 'violet' }) {
  const action = getRemediationAction(change.actionId)
  const exec = parseVerification(change.verificationResultJson)
  const stampWho = change.deployedBy ?? change.createdBy
  const stampWhen = change.deployedAt
    ? new Date(change.deployedAt).toLocaleString()
    : new Date(change.createdAt).toLocaleString()
  return (
    <li className="bg-slate-800/40 border border-white/5 rounded-lg p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{action?.name ?? change.actionId}</p>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{change.customerImpactSummary}</p>
        </div>
        <ChangeStatusBadge status={change.status} tone={tone} />
      </div>
      <p className="text-[11px] text-slate-500">
        {change.status === 'rolled_back' && change.rolledBackAt
          ? <>Rolled back {new Date(change.rolledBackAt).toLocaleString()} {change.rolledBackReason ? `· ${change.rolledBackReason}` : ''}</>
          : change.verifiedAt
          ? <>Verified {new Date(change.verifiedAt).toLocaleString()}</>
          : <>{stampWho} · {stampWhen}</>
        }
      </p>
      {exec?.executorSummary && (
        <p className="text-[11px] text-slate-400 italic">
          Executor: {exec.executorSummary}
          {exec.executorSuccess === false && <span className="text-rose-300"> (returned failure)</span>}
        </p>
      )}
    </li>
  )
}

function ChangeStatusBadge({ status, tone }: { status: string; tone: 'slate' | 'rose' | 'violet' }) {
  const map: Record<string, string> = {
    drafted:           'bg-slate-700/40 border-white/10 text-slate-300',
    bundled:           'bg-violet-500/15 border-violet-500/40 text-violet-200',
    awaiting_customer: 'bg-violet-500/15 border-violet-500/40 text-violet-200',
    customer_declined: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
    deferred:          'bg-slate-700/40 border-white/10 text-slate-300',
    scheduled:         'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    deploying:         'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    verifying:         'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    complete:          'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    rolled_back:       'bg-rose-500/15 border-rose-500/40 text-rose-200',
    abandoned:         'bg-slate-700/40 border-white/10 text-slate-300',
  }
  // Tone is the section default; let the per-status override win if defined.
  const fallback = tone === 'rose' ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
    : tone === 'violet' ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
    : 'bg-slate-700/40 border-white/10 text-slate-300'
  const cls = map[status] ?? fallback
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function BundleStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    drafted:            'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    awaiting_customer:  'bg-violet-500/15 border-violet-500/40 text-violet-200',
    partially_approved: 'bg-violet-500/15 border-violet-500/40 text-violet-200',
    fully_approved:     'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    scheduled:          'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    deploying:          'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    complete:           'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    cancelled:          'bg-slate-700/40 border-white/10 text-slate-300',
  }
  const cls = map[status] ?? 'bg-slate-700/40 border-white/10 text-slate-300'
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'cyan' | 'emerald' | 'rose' | 'violet' | 'slate' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'rose'    ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
    tone === 'violet'  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
    tone === 'slate'   ? 'bg-slate-800/40 text-slate-300 border-white/10' :
                         'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

interface VerificationParsed {
  executorSummary?: string
  executorSuccess?: boolean
}
function parseVerification(raw: string | null): VerificationParsed | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      executorSummary: typeof parsed?.executorSummary === 'string' ? parsed.executorSummary : undefined,
      executorSuccess: typeof parsed?.executorSuccess === 'boolean' ? parsed.executorSuccess : undefined,
    }
  } catch {
    return null
  }
}

async function loadPendingChanges(companyId: string): Promise<PendingChangeRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<PendingChangeRow>(
      `SELECT id,
              "actionId",
              "customerImpactSummary",
              status,
              "bundleId",
              "createdAt"::text AS "createdAt",
              "createdBy",
              "deployedAt"::text AS "deployedAt",
              "deployedBy",
              "verifiedAt"::text AS "verifiedAt",
              "rolledBackAt"::text AS "rolledBackAt",
              "rolledBackReason",
              "verificationResult"::text AS "verificationResultJson"
         FROM compliance_pending_changes
        WHERE "companyId" = $1
        ORDER BY COALESCE("deployedAt", "createdAt") DESC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/changes] loadPendingChanges failed', err)
    return []
  } finally {
    client.release()
  }
}

async function loadBundles(companyId: string): Promise<BundleRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<BundleRow>(
      `SELECT b.id,
              b.title,
              b.status,
              b."sentAt"::text AS "sentAt",
              b."sentVia",
              b."createdAt"::text AS "createdAt",
              COALESCE(c.cnt, 0)::int AS "itemCount"
         FROM compliance_change_bundles b
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
             FROM compliance_change_bundle_items
            WHERE "bundleId" = b.id
         ) c ON TRUE
        WHERE b."companyId" = $1
        ORDER BY b."createdAt" DESC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/changes] loadBundles failed', err)
    return []
  } finally {
    client.release()
  }
}
