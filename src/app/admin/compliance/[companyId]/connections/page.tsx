/**
 * /admin/compliance/[companyId]/connections — connectors + tools + mappings
 *
 * Merged read-mostly view of the three "what's connected to this customer"
 * stores. The detailed setup actions (verify connector, toggle tool deployment,
 * pick a platform mapping target) live on the legacy /admin/compliance dashboard
 * for now; this page links there and surfaces current state.
 *
 * Three sections:
 *   1. Integration Connections — per-customer connector status table
 *   2. Tool Inventory          — deployed-tool toggles (counts only here)
 *   3. Platform Mappings       — customer→external-entity rows grouped by platform
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

export default async function ConnectionsPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [connectors, tools, mappings] = await Promise.all([
    loadConnectors(companyId),
    loadTools(companyId),
    loadMappings(companyId),
  ])

  const deployedToolCount = tools.filter((t) => t.deployed).length
  const mappingsByPlatform = groupMappings(mappings)

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
              <span className="text-slate-500">Connections</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Connections & Inventory</h1>
            <p className="text-sm text-slate-400 mt-1">
              What this customer is connected to, what tools they have deployed, and how they map onto each platform.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/compliance"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700/50 border border-white/10 text-slate-200 hover:bg-slate-700/70"
            >
              Edit on legacy dashboard →
            </Link>
          </div>
        </div>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-3">
          <Counter label="Verified connectors" value={connectors.filter((c) => c.status === 'verified').length} tone="emerald" />
          <Counter label="Tools deployed" value={deployedToolCount} tone="cyan" />
          <Counter label="Platform mappings" value={mappings.length} tone="violet" />
        </div>

        {/* Connectors */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Integration Connections
          </h2>
          {connectors.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No connectors configured. Configure them on the{' '}
              <Link href="/admin/compliance" className="text-cyan-400 hover:text-cyan-300 underline">
                legacy dashboard
              </Link>
              .
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {connectors.map((c) => (
                <li key={c.connectorType} className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white">{connectorLabel(c.connectorType)}</p>
                    <ConnectorStatusBadge status={c.status} />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {c.lastCollectedAt
                      ? `Last collected ${new Date(c.lastCollectedAt).toLocaleString()}`
                      : 'Never collected'}
                  </p>
                  {c.errorMessage && (
                    <p className="text-[11px] text-rose-300 mt-1 truncate" title={c.errorMessage}>
                      {c.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tool inventory */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <header className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Tool Inventory
            </h2>
            <p className="text-xs text-slate-500">
              {deployedToolCount} of {tools.length} marked deployed
            </p>
          </header>
          {tools.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No tool deployment status tracked yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tools.map((t) => (
                <li
                  key={t.toolId}
                  className={`bg-slate-800/40 border rounded-lg p-3 ${
                    t.deployed ? 'border-emerald-500/20' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white truncate">{t.toolId}</p>
                    <span className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 border ${
                      t.deployed
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-slate-700/40 text-slate-400 border-white/10'
                    }`}>
                      {t.deployed ? 'deployed' : 'not deployed'}
                    </span>
                  </div>
                  {t.notes && <p className="text-[11px] text-slate-500 line-clamp-2">{t.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Platform mappings */}
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Platform Mappings
          </h2>
          {mappings.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No platform mappings.{' '}
              <Link href="/admin/compliance" className="text-cyan-400 hover:text-cyan-300 underline">
                Add them on the legacy dashboard
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(mappingsByPlatform).map(([platform, rows]) => (
                <div key={platform}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {platform} ({rows.length})
                  </h3>
                  <ul className="space-y-1">
                    {rows.map((m) => (
                      <li key={m.id} className="text-xs text-slate-300 bg-slate-800/40 border border-white/5 rounded px-3 py-2 flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className="text-white font-medium">{m.externalName || m.externalId}</span>
                          {m.externalName && m.externalName !== m.externalId && (
                            <span className="text-slate-500 ml-2">({m.externalId})</span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">
                          {m.externalType}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function Counter({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'cyan' | 'violet' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    'bg-violet-500/10 text-violet-300 border-violet-500/20'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function ConnectorStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'verified' ? 'emerald' :
    status === 'configured' ? 'cyan' :
    status === 'error' ? 'rose' :
    'slate'
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'rose' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
    'bg-slate-700/40 text-slate-400 border-white/10'
  return (
    <span className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function connectorLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ConnectorRow {
  connectorType: string
  status: string
  lastCollectedAt: string | null
  errorMessage: string | null
}

interface ToolRow {
  toolId: string
  deployed: boolean
  notes: string | null
}

interface MappingRow {
  id: string
  platform: string
  externalId: string
  externalName: string
  externalType: string
}

async function loadConnectors(companyId: string): Promise<ConnectorRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ConnectorRow>(
      `SELECT "connectorType", status,
              "lastCollectedAt"::text AS "lastCollectedAt",
              "errorMessage"
       FROM compliance_connectors
       WHERE "companyId" = $1
       ORDER BY "connectorType"`,
      [companyId]
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

async function loadTools(companyId: string): Promise<ToolRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ToolRow>(
      `SELECT "toolId", deployed, notes
       FROM compliance_company_tools
       WHERE "companyId" = $1
       ORDER BY deployed DESC, "toolId"`,
      [companyId]
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

async function loadMappings(companyId: string): Promise<MappingRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<MappingRow>(
      `SELECT id, platform, "externalId", "externalName", "externalType"
       FROM compliance_platform_mappings
       WHERE "companyId" = $1
       ORDER BY platform, "externalName"`,
      [companyId]
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

function groupMappings(rows: MappingRow[]): Record<string, MappingRow[]> {
  const out: Record<string, MappingRow[]> = {}
  for (const r of rows) {
    if (!out[r.platform]) out[r.platform] = []
    out[r.platform].push(r)
  }
  return out
}
