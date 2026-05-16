/**
 * Step 3 — Connect Tools.
 *
 * Shows the customer's integration connectors (Microsoft Graph, Datto
 * RMM, etc.) and the tool inventory (what's deployed where). Every
 * row uses human-readable display labels from the tool registry —
 * NO raw slugs like `datto_edr` or `bullphish_id` in the UI.
 *
 * Slice 1 is read-only: status badges + display labels + deploy state.
 * Re-verify, deploy/undeploy, and connector-credential editing live in
 * a later slice (or stay on the legacy dashboard until then).
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { toolLabel, toolVendor } from '@/lib/compliance/labels'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import CompanyToolToggle from '@/components/compliance/CompanyToolToggle'
import PlatformMappingPanel from '@/components/compliance/PlatformMappingPanel'
import { DEFAULT_TOOLS } from '@/lib/compliance/registry/tool-definitions'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

interface ConnectorRow {
  connectorType: string
  status: string
  errorMessage: string | null
  lastCollectedAt: string | null
}
interface ToolRow {
  toolId: string
  deployed: boolean
  notes: string | null
}
interface MappingRow {
  platform: string
  externalId: string
  externalName: string
  externalType: string
}

export default async function ConnectStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [connectors, tools, mappings, steps] = await Promise.all([
    loadConnectors(companyId),
    loadTools(companyId),
    loadMappings(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'connect')

  // Merge the saved tool rows with the full catalog so every tool the
  // operator could toggle is visible — not just ones already in the DB.
  // Saved rows win for `deployed` + `notes`; catalog supplies anything
  // the operator hasn't touched yet (defaults to `deployed=false`).
  const toolById = new Map(tools.map((t) => [t.toolId, t]))
  const toolInventoryRows: ToolRow[] = DEFAULT_TOOLS
    .map((d): ToolRow => toolById.get(d.toolId) ?? { toolId: d.toolId, deployed: false, notes: null })
    .sort((a, b) => toolLabel(a.toolId).localeCompare(toolLabel(b.toolId)))

  const verifiedCount = connectors.filter((c) => c.status === 'verified').length
  const deployedToolCount = toolInventoryRows.filter((t) => t.deployed).length

  // Only show data feeds for tools the operator has marked deployed at
  // this customer. Showing every TCT-side connector (including ones for
  // tools the customer doesn't use) was confusing — "Verified" meant
  // TCT's API token works, not that the customer uses the product.
  const deployedToolIds = new Set(toolInventoryRows.filter((t) => t.deployed).map((t) => t.toolId))
  const relevantConnectors = connectors.filter((c) => deployedToolIds.has(c.connectorType))
  const hiddenConnectorCount = connectors.length - relevantConnectors.length

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 3</p>
        <h2 className="text-2xl font-bold text-white">Connect Tools</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Tell the assessment engine what this customer actually uses.
          Toggle each tool below to <span className="text-emerald-300">Deployed</span>{' '}
          when the customer has it, or leave it off. Tools marked off resolve
          to <span className="text-slate-300">not applicable</span> on
          related controls instead of failing with a collection error.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Counter label="Tools deployed" value={deployedToolCount} tone="cyan" />
        <Counter label="Live data feeds" value={relevantConnectors.filter((c) => c.status === 'verified').length} tone="emerald" />
        <Counter label="Platform mappings" value={mappings.length} tone="violet" />
      </section>

      {/* Tool inventory FIRST — primary operator action. */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Tool inventory
        </h3>
        <p className="text-xs text-slate-400 mb-3 max-w-2xl">
          What MSP-managed tools does this customer have? Toggling drives
          control applicability in the assessment.
        </p>
        <ul className="space-y-2">
          {toolInventoryRows.map((t) => (
            <li
              key={t.toolId}
              className="flex items-center justify-between gap-2 bg-slate-800/40 border border-white/5 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{toolLabel(t.toolId)}</p>
                <p className="text-[11px] text-slate-500">
                  {toolVendor(t.toolId) || 'Unknown vendor'}
                  {t.notes && <> · {t.notes}</>}
                </p>
              </div>
              <CompanyToolToggle
                companyId={companyId}
                toolId={t.toolId}
                deployed={t.deployed}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Data feeds SECOND — read-only, filtered to relevant tools only. */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Live data feeds
        </h3>
        <p className="text-xs text-slate-400 mt-1 mb-3 max-w-2xl">
          Read-only status of the APIs the assessment engine pulls evidence
          from for the tools you marked deployed above. Errors here mean
          collection failed — fix the connection or toggle the tool off
          to mark related controls{' '}
          <span className="text-slate-300">not applicable</span>.
        </p>
        {relevantConnectors.length === 0 ? (
          <p className="text-sm text-slate-400 py-3">
            No live data feeds for any deployed tool yet. Mark a tool as
            Deployed above and the engine will start pulling its data on
            the next assessment.
          </p>
        ) : (
          <ul className="space-y-2">
            {relevantConnectors.map((c) => (
              <li
                key={c.connectorType}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-800/40 border border-white/5 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{toolLabel(c.connectorType)}</p>
                  <p className="text-[11px] text-slate-500">
                    {toolVendor(c.connectorType) || 'Unknown vendor'}
                    {c.lastCollectedAt && (
                      <> · Last sync: {new Date(c.lastCollectedAt).toLocaleString()}</>
                    )}
                  </p>
                  {c.errorMessage && (
                    <p className="text-[11px] text-rose-300 mt-1">{c.errorMessage}</p>
                  )}
                </div>
                <ConnectorStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {hiddenConnectorCount > 0 && (
          <p className="text-[11px] text-slate-500 mt-3">
            {hiddenConnectorCount} other data feed{hiddenConnectorCount === 1 ? '' : 's'} hidden — TCT has API access but no matching deployed tool at this customer.
          </p>
        )}
      </section>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-1">
          Platform mappings
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          How this customer maps to each external platform&apos;s identifiers
          (Datto RMM sites, BCDR clients, DnsFilter organizations, etc.).
          Add or remove mappings inline below.
        </p>
        <PlatformMappingPanel companyId={companyId} companyName={company.displayName} />
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
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30 aria-disabled:opacity-50 aria-disabled:pointer-events-none"
            aria-disabled={next.status === 'locked'}
          >
            Next: {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'cyan' | 'violet' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'violet'  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
                         'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function ConnectorStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    configured: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    error: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
    not_configured: 'bg-slate-700/40 border-white/10 text-slate-300',
  }
  const cls = map[status] ?? 'bg-slate-700/40 border-white/10 text-slate-300'
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

async function loadConnectors(companyId: string): Promise<ConnectorRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ConnectorRow>(
      `SELECT "connectorType", status, "errorMessage", "lastCollectedAt"::text AS "lastCollectedAt"
         FROM compliance_connectors
        WHERE "companyId" = $1
        ORDER BY "connectorType" ASC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/connect] loadConnectors failed', err)
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
        ORDER BY "toolId" ASC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/connect] loadTools failed', err)
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
      `SELECT platform, "externalId", "externalName", "externalType"
         FROM compliance_platform_mappings
        WHERE "companyId" = $1
        ORDER BY platform, "externalName"`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/connect] loadMappings failed', err)
    return []
  } finally {
    client.release()
  }
}
