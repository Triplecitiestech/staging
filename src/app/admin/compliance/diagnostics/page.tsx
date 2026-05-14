/**
 * /admin/compliance/diagnostics — TCT-only compliance diagnostics
 *
 * NOT per-customer. Surfaces operational health of the compliance
 * subsystem across every customer:
 *   - Connectors in 'error' state (with their last error message)
 *   - Pending changes stuck in 'verifying' past their delay window
 *   - Recent compliance_audit_log entries
 *   - Self-healed table presence check
 *
 * Read-only. Useful for engineers debugging "why isn't this customer's
 * assessment running" / "why is this change stuck" without grep'ing logs.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

export default async function DiagnosticsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')

  await ensureComplianceTables()

  const [
    connectorErrors,
    stuckVerifying,
    auditTail,
    tablePresence,
  ] = await Promise.all([
    loadConnectorErrors(),
    loadStuckVerifying(),
    loadAuditTail(),
    loadTablePresence(),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
            <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
            <span aria-hidden>›</span>
            <span className="text-slate-500">Diagnostics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Compliance Diagnostics</h1>
          <p className="text-sm text-slate-400 mt-1">
            TCT-only operational health snapshot across every customer.
            Read-only.
          </p>
        </div>

        {/* Tables present */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Schema presence ({tablePresence.filter((t) => t.exists).length} / {tablePresence.length})
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {tablePresence.map((t) => (
              <li
                key={t.name}
                className={`text-xs rounded px-2 py-1 border ${
                  t.exists
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}
              >
                <span className="font-mono">{t.name}</span>
                <span className="ml-2">{t.exists ? '✓' : '✗ MISSING'}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Connector errors */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Connector errors ({connectorErrors.length})
          </h2>
          {connectorErrors.length === 0 ? (
            <p className="text-sm text-slate-400 py-2 text-center">
              No connectors in error state.
            </p>
          ) : (
            <ul className="space-y-2">
              {connectorErrors.map((c, i) => (
                <li
                  key={`${c.companyId}-${c.connectorType}-${i}`}
                  className="bg-slate-800/40 border border-white/5 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white">
                      <Link
                        href={`/admin/compliance/${c.companyId}/connections`}
                        className="hover:text-cyan-300"
                      >
                        {c.companyDisplayName ?? c.companyId}
                      </Link>{' '}
                      — {c.connectorType}
                    </p>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {c.lastCollectedAt
                        ? new Date(c.lastCollectedAt).toLocaleString()
                        : 'never'}
                    </span>
                  </div>
                  <p className="text-xs text-rose-300 font-mono whitespace-pre-wrap break-all">
                    {c.errorMessage || '(no message)'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Stuck verifying */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Pending changes stuck in 'verifying' ({stuckVerifying.length})
          </h2>
          {stuckVerifying.length === 0 ? (
            <p className="text-sm text-slate-400 py-2 text-center">
              No stuck verifications.
            </p>
          ) : (
            <ul className="space-y-2">
              {stuckVerifying.map((v) => (
                <li key={v.id} className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white">
                      <Link
                        href={`/admin/compliance/${v.companyId}/changes`}
                        className="hover:text-cyan-300"
                      >
                        {v.companyDisplayName ?? v.companyId}
                      </Link>{' '}
                      — {v.actionId}
                    </p>
                    <span className="text-[11px] text-rose-300 shrink-0">
                      verifying for {v.minutesStuck}min
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Deployed {v.deployedAt ? new Date(v.deployedAt).toLocaleString() : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Audit tail */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Recent audit log (last 50)
          </h2>
          {auditTail.length === 0 ? (
            <p className="text-sm text-slate-400 py-2 text-center">No audit entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-2">When</th>
                    <th className="text-left p-2">Company</th>
                    <th className="text-left p-2">Action</th>
                    <th className="text-left p-2">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditTail.map((e) => (
                    <tr key={e.id} className="border-t border-white/5">
                      <td className="p-2 text-slate-400 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="p-2 text-slate-300 whitespace-nowrap">
                        {e.companyDisplayName ?? e.companyId.slice(0, 8)}
                      </td>
                      <td className="p-2 font-mono text-cyan-300">{e.action}</td>
                      <td className="p-2 text-slate-400 whitespace-nowrap">{e.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const EXPECTED_TABLES = [
  'compliance_connectors',
  'compliance_assessments',
  'compliance_evidence',
  'compliance_findings',
  'compliance_audit_log',
  'compliance_policies',
  'compliance_policy_analyses',
  'compliance_attestations',
  'compliance_platform_mappings',
  'compliance_webhook_events',
  'compliance_company_tools',
  'compliance_customer_context',
  'compliance_finding_dispositions',
  'compliance_pending_changes',
  'compliance_change_bundles',
  'compliance_change_bundle_items',
  'form_responses',
  'policy_org_profiles',
  'policy_intake_answers',
  'policy_generation_records',
  'policy_versions',
  'integration_credentials',
  'integration_credential_access_log',
]

async function loadTablePresence(): Promise<Array<{ name: string; exists: boolean }>> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [EXPECTED_TABLES]
    )
    const present = new Set(res.rows.map((r) => r.tablename))
    return EXPECTED_TABLES.map((name) => ({ name, exists: present.has(name) }))
  } catch {
    return EXPECTED_TABLES.map((name) => ({ name, exists: false }))
  } finally {
    client.release()
  }
}

interface ConnectorError {
  companyId: string
  companyDisplayName: string | null
  connectorType: string
  errorMessage: string | null
  lastCollectedAt: string | null
}

async function loadConnectorErrors(): Promise<ConnectorError[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ConnectorError>(
      `SELECT c."companyId", co."displayName" AS "companyDisplayName",
              c."connectorType", c."errorMessage",
              c."lastCollectedAt"::text AS "lastCollectedAt"
       FROM compliance_connectors c
       LEFT JOIN companies co ON co.id = c."companyId"
       WHERE c.status = 'error'
       ORDER BY c."lastCollectedAt" DESC NULLS LAST
       LIMIT 50`
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

interface StuckVerifying {
  id: string
  companyId: string
  companyDisplayName: string | null
  actionId: string
  deployedAt: string | null
  minutesStuck: number
}

async function loadStuckVerifying(): Promise<StuckVerifying[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      companyId: string
      companyDisplayName: string | null
      actionId: string
      deployedAt: string | null
      minutesStuck: string
    }>(
      `SELECT pc.id, pc."companyId", co."displayName" AS "companyDisplayName",
              pc."actionId",
              pc."deployedAt"::text AS "deployedAt",
              FLOOR(EXTRACT(EPOCH FROM (NOW() - pc."deployedAt")) / 60)::text AS "minutesStuck"
       FROM compliance_pending_changes pc
       LEFT JOIN companies co ON co.id = pc."companyId"
       WHERE pc.status = 'verifying'
         AND pc."deployedAt" IS NOT NULL
         AND pc."deployedAt" < NOW() - INTERVAL '15 minutes'
       ORDER BY pc."deployedAt" ASC
       LIMIT 25`
    )
    return res.rows.map((r) => ({ ...r, minutesStuck: parseInt(r.minutesStuck, 10) }))
  } catch {
    return []
  } finally {
    client.release()
  }
}

interface AuditEntry {
  id: string
  createdAt: string
  companyId: string
  companyDisplayName: string | null
  action: string
  actor: string
}

async function loadAuditTail(): Promise<AuditEntry[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<AuditEntry>(
      `SELECT a.id, a."createdAt"::text AS "createdAt",
              a."companyId", co."displayName" AS "companyDisplayName",
              a.action, a.actor
       FROM compliance_audit_log a
       LEFT JOIN companies co ON co.id = a."companyId"
       ORDER BY a."createdAt" DESC
       LIMIT 50`
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}
