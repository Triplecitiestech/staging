/**
 * Domotz webhook event ingestion + queries (Phase 2 of the Site Connectivity report).
 *
 * Domotz delivers `agent_wan_change` (ISP / public-IP change = the failover
 * fingerprint), `agent_status` (collector up/down), and related events ONLY as
 * webhook callbacks — they are NOT retrievable from any REST history endpoint
 * (verified against the OpenAPI spec). So to detect primary-circuit failovers
 * historically we must ingest and store these pushes.
 *
 * Storage reuses the existing multi-source webhook sink `compliance_webhook_events`
 * (source = 'domotz'), so there's no new event table and no migration. The only
 * net-new state is `domotz_site_settings`, which holds the per-site WAN-mode
 * override used by the failover-capability logic.
 *
 * This module is the single place that knows the Domotz event payload shapes and
 * how they map into the sink. The reporting layer consumes the query helpers.
 */

import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import type { FailoverActivity, FailoverEventRecord } from '@/lib/reporting/wan-reliability/types'
import type { WanModeOverride } from '@/lib/reporting/wan-reliability/failover'
import { formatEasternDay, easternDateKey, formatEasternTime } from '@/lib/reporting/wan-reliability/analyzer'

const SOURCE = 'domotz'

/**
 * Default (empty) episode fields for a FailoverActivity. Episodes are computed
 * later in assembleReport (which knows the site's primary uplink), so the
 * fetch-time objects just carry these placeholders.
 */
export const EMPTY_FAILOVER_EPISODES: Pick<
  FailoverActivity,
  'episodes' | 'estimatedPrimaryDownSeconds' | 'estimatedPrimaryDownLabel' | 'longestEpisodeSeconds' | 'longestEpisodeLabel' | 'episodePairingApproximate'
> = {
  episodes: [],
  estimatedPrimaryDownSeconds: 0,
  estimatedPrimaryDownLabel: '0s',
  longestEpisodeSeconds: null,
  longestEpisodeLabel: null,
  episodePairingApproximate: false,
}

/** Canonical sample `agent_wan_change` payload — safe to POST for smoke tests. */
export const SAMPLE_DOMOTZ_WEBHOOK = {
  name: 'agent_wan_change',
  timestamp: '2026-06-20T13:05:00Z',
  data: {
    agent_id: 90210,
    ip: { old: { address: '50.107.49.134', name: 'frontier' }, new: { address: '100.64.12.7', name: 'starlink' } },
    provider: {
      old: { country: 'US', descr: 'Frontier Communications', netname: 'FRONTIER-FTTP', inetnum: '50.107.0.0/16' },
      new: { country: 'US', descr: 'SpaceX Starlink', netname: 'SPACEX-STARLINK', inetnum: '100.64.0.0/10' },
    },
  },
}

/** A Domotz webhook event normalized into the fields we persist. */
export interface NormalizedDomotzEvent {
  /** Event name, e.g. 'agent_wan_change', 'agent_status'. */
  name: string
  /** ISO timestamp of the event (from the payload). */
  occurredAt: string
  agentId: number | null
  deviceId: number | null
  /** failover | connectivity | device | lan | other — drives query filtering. */
  signalType: 'failover' | 'connectivity' | 'device' | 'lan' | 'other'
  severity: 'info' | 'warning'
  oldIp: string | null
  newIp: string | null
  oldProvider: string | null
  newProvider: string | null
  /** Collector status value when applicable (UP/DOWN). */
  statusValue: string | null
  /** Idempotency key: `${agentId}:${name}:${occurredAt}`. */
  externalId: string
  raw: unknown
}

interface RawDomotzEvent {
  name?: string
  type?: string
  timestamp?: string
  data?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Normalize a Domotz webhook body into events. Accepts a single event object,
 * a bare array, or `{ events: [...] }` — Domotz contact-channel webhooks post a
 * single `{name,timestamp,data}` object, but we're defensive about batching.
 */
export function normalizeDomotzWebhook(body: unknown): NormalizedDomotzEvent[] {
  const candidates: RawDomotzEvent[] = []
  if (Array.isArray(body)) {
    candidates.push(...(body as RawDomotzEvent[]))
  } else if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    if (Array.isArray(obj.events)) candidates.push(...(obj.events as RawDomotzEvent[]))
    else candidates.push(obj as RawDomotzEvent)
  }

  const out: NormalizedDomotzEvent[] = []
  for (const ev of candidates) {
    const normalized = normalizeOne(ev)
    if (normalized) out.push(normalized)
  }
  return out
}

function normalizeOne(ev: RawDomotzEvent): NormalizedDomotzEvent | null {
  if (!ev || typeof ev !== 'object') return null
  const name = String(ev.name ?? ev.type ?? '').trim()
  if (!name) return null
  const occurredAt = typeof ev.timestamp === 'string' ? ev.timestamp : new Date().toISOString()
  const data = (ev.data ?? {}) as Record<string, unknown>

  const agentId = toInt(data.agent_id) ?? toInt((data.agent as Record<string, unknown> | undefined)?.id) ?? null
  const deviceId = toInt(data.device_id) ?? toInt((data.device as Record<string, unknown> | undefined)?.id) ?? null

  let signalType: NormalizedDomotzEvent['signalType'] = 'other'
  let severity: NormalizedDomotzEvent['severity'] = 'info'
  let oldIp: string | null = null
  let newIp: string | null = null
  let oldProvider: string | null = null
  let newProvider: string | null = null
  let statusValue: string | null = null

  if (name.includes('wan_change')) {
    signalType = 'failover'
    severity = 'warning'
    const ip = (data.ip ?? {}) as Record<string, Record<string, unknown> | undefined>
    oldIp = strOrNull(ip.old?.address)
    newIp = strOrNull(ip.new?.address)
    const provider = (data.provider ?? {}) as Record<string, Record<string, unknown> | undefined>
    oldProvider = providerName(provider.old)
    newProvider = providerName(provider.new)
  } else if (name.includes('agent_status') || name === 'agent_status_up' || name === 'agent_status_down') {
    signalType = 'connectivity'
    statusValue = strOrNull(data.value) ?? (name.endsWith('down') ? 'DOWN' : name.endsWith('up') ? 'UP' : null)
    severity = statusValue === 'DOWN' ? 'warning' : 'info'
  } else if (name.includes('lan_change')) {
    signalType = 'lan'
  } else if (name.includes('device')) {
    signalType = 'device'
  }

  return {
    name,
    occurredAt,
    agentId,
    deviceId,
    signalType,
    severity,
    oldIp,
    newIp,
    oldProvider,
    newProvider,
    statusValue,
    externalId: `${agentId ?? 'na'}:${name}:${occurredAt}`,
    raw: ev,
  }
}

function providerName(p: Record<string, unknown> | undefined): string | null {
  if (!p) return null
  return strOrNull(p.netname) ?? strOrNull(p.descr) ?? strOrNull(p.country)
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

// ---------------------------------------------------------------------------
// Storage (reuses compliance_webhook_events, source='domotz')
// ---------------------------------------------------------------------------

export async function storeDomotzEvents(
  events: NormalizedDomotzEvent[],
  meta: { sourceIp: string | null; headers: Record<string, string> },
): Promise<{ inserted: number; duplicates: number; storageErrors: number }> {
  let inserted = 0
  let duplicates = 0
  let storageErrors = 0
  if (events.length === 0) return { inserted, duplicates, storageErrors }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    for (const evt of events) {
      try {
        const res = await client.query(
          `INSERT INTO compliance_webhook_events
             (source, "eventType", severity, "rawData", "receivedAt", "expiresAt",
              "externalId", "partnerId", "customerId", "sourceIp", headers, normalized, "signalType")
           VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW() + INTERVAL '400 days',
                   $5, NULL, $6, $7, $8::jsonb, $9::jsonb, $10)
           ON CONFLICT (source, "externalId") WHERE "externalId" IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            SOURCE,
            evt.name,
            evt.severity,
            JSON.stringify(evt.raw),
            evt.externalId,
            evt.agentId != null ? String(evt.agentId) : null,
            meta.sourceIp,
            JSON.stringify(meta.headers),
            JSON.stringify({
              agentId: evt.agentId,
              deviceId: evt.deviceId,
              occurredAt: evt.occurredAt,
              oldIp: evt.oldIp,
              newIp: evt.newIp,
              oldProvider: evt.oldProvider,
              newProvider: evt.newProvider,
              statusValue: evt.statusValue,
            }),
            evt.signalType,
          ],
        )
        if (res.rowCount && res.rowCount > 0) inserted++
        else duplicates++
      } catch (rowErr) {
        storageErrors++
        console.error('[webhook][domotz] row insert failed', {
          externalId: evt.externalId,
          err: rowErr instanceof Error ? rowErr.message : String(rowErr),
        })
      }
    }
  } finally {
    client.release()
  }
  return { inserted, duplicates, storageErrors }
}

// ---------------------------------------------------------------------------
// Queries used by the report
// ---------------------------------------------------------------------------

/** Earliest Domotz event we've received for a site = the failover-detection coverage floor. */
export async function getDomotzIngestionSince(agentId: number): Promise<Date | null> {
  await ensureComplianceTables()
  const pool = getPool()
  const { rows } = await pool.query<{ since: string | null }>(
    `SELECT MIN("receivedAt") AS since FROM compliance_webhook_events
     WHERE source = $1 AND "customerId" = $2`,
    [SOURCE, String(agentId)],
  )
  const since = rows[0]?.since
  return since ? new Date(since) : null
}

/** Failover events (`agent_wan_change`) for a site within the window, oldest first. */
export async function getDomotzFailoverEvents(agentId: number, from: Date, to: Date): Promise<FailoverEventRecord[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const { rows } = await pool.query<{
    occurredAt: string
    oldIp: string | null
    newIp: string | null
    oldProvider: string | null
    newProvider: string | null
  }>(
    `SELECT
       COALESCE(normalized->>'occurredAt', "receivedAt"::text) AS "occurredAt",
       normalized->>'oldIp'       AS "oldIp",
       normalized->>'newIp'       AS "newIp",
       normalized->>'oldProvider' AS "oldProvider",
       normalized->>'newProvider' AS "newProvider"
     FROM compliance_webhook_events
     WHERE source = $1 AND "customerId" = $2 AND "signalType" = 'failover'
       AND COALESCE((normalized->>'occurredAt')::timestamptz, "receivedAt") BETWEEN $3 AND $4
     ORDER BY COALESCE((normalized->>'occurredAt')::timestamptz, "receivedAt") ASC`,
    [SOURCE, String(agentId), from.toISOString(), to.toISOString()],
  )
  return rows.map((r) => {
    const d = new Date(r.occurredAt)
    return {
      timestampUtc: d.toISOString(),
      dateEastern: easternDateKey(d),
      timeEastern: formatEasternTime(d),
      oldIp: r.oldIp,
      newIp: r.newIp,
      oldProvider: r.oldProvider,
      newProvider: r.newProvider,
    }
  })
}

/**
 * Build the report's Failover Activity section for a site/window. Handles the
 * three states: no ingestion ever, ingestion started mid-window, full coverage.
 */
export async function buildFailoverActivity(agentId: number, from: Date, to: Date): Promise<FailoverActivity> {
  let ingestionSince: Date | null = null
  let events: FailoverEventRecord[] = []
  try {
    ingestionSince = await getDomotzIngestionSince(agentId)
    if (ingestionSince) events = await getDomotzFailoverEvents(agentId, from, to)
  } catch (err) {
    return {
      available: false,
      ingestionSinceUtc: null,
      eventCount: 0,
      events: [],
      ...EMPTY_FAILOVER_EPISODES,
      note: `Failover event store unavailable: ${err instanceof Error ? err.message : String(err)}.`,
    }
  }

  if (!ingestionSince) {
    return {
      available: false,
      ingestionSinceUtc: null,
      eventCount: 0,
      events: [],
      ...EMPTY_FAILOVER_EPISODES,
      note: 'No Domotz failover webhooks have been received for this site. Until the Domotz webhook is enabled (Settings → see report setup notes), primary-circuit failovers cannot be detected and a failed-over outage will be invisible to this report.',
    }
  }

  const startedMidWindow = ingestionSince.getTime() > from.getTime()
  const note = startedMidWindow
    ? `Failover detection has only been active since ${formatEasternDay(ingestionSince)}; failovers before that date are not covered. ${events.length} failover event(s) detected in the covered span.`
    : `Failover detection active across the full window. ${events.length} failover event(s) detected.`

  return {
    available: true,
    ingestionSinceUtc: ingestionSince.toISOString(),
    eventCount: events.length,
    events,
    ...EMPTY_FAILOVER_EPISODES,
    note,
  }
}

// ---------------------------------------------------------------------------
// Per-site WAN-mode override (domotz_site_settings)
// ---------------------------------------------------------------------------

let ensured = false
async function ensureDomotzSiteSettings(): Promise<void> {
  if (ensured) return
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS domotz_site_settings (
      agent_id   BIGINT PRIMARY KEY,
      wan_mode   TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  ensured = true
}

export async function getSiteWanMode(agentId: number): Promise<WanModeOverride> {
  try {
    await ensureDomotzSiteSettings()
    const pool = getPool()
    const { rows } = await pool.query<{ wan_mode: string | null }>(
      `SELECT wan_mode FROM domotz_site_settings WHERE agent_id = $1`,
      [agentId],
    )
    const mode = rows[0]?.wan_mode
    return mode === 'single_wan' || mode === 'failover_capable' ? mode : null
  } catch (err) {
    console.error('[domotz] getSiteWanMode failed', err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function setSiteWanMode(agentId: number, wanMode: WanModeOverride | 'auto', updatedBy: string): Promise<void> {
  await ensureDomotzSiteSettings()
  const pool = getPool()
  // 'auto' clears the override (back to detection).
  const value = wanMode === 'single_wan' || wanMode === 'failover_capable' ? wanMode : null
  await pool.query(
    `INSERT INTO domotz_site_settings (agent_id, wan_mode, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (agent_id) DO UPDATE SET wan_mode = $2, updated_by = $3, updated_at = NOW()`,
    [agentId, value, updatedBy],
  )
}
