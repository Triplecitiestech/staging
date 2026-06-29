/**
 * GET /api/reports/wan-reliability
 *
 * Historical WAN/ISP reliability & SLA report for a monitored customer site,
 * pulled live from the existing Domotz integration. Read-only.
 *
 * Auth: a logged-in staff session OR the MIGRATION_SECRET
 * (Authorization: Bearer <secret>, or ?secret=) — same pattern as tbr-export,
 * so internal links work without a secret and scripts/PowerShell can use one.
 *
 * Query params:
 *   agentId       (required) Domotz collector/agent id (the "site").
 *   deviceId      (optional) Monitored device id (the WAN gateway). When set,
 *                 the device reachability signal + latency/packet-loss are used.
 *   days          Lookback window in days (default 90, clamped 1–365). Ignored if from/to given.
 *   from, to      Explicit ISO-8601 window bounds (override `days`).
 *   source        'auto' (default) | 'agent' | 'device' — which signal drives the outage timeline.
 *   format        'json' (default) | 'markdown' | 'text' | 'html'.
 *   download      '1' to return as a file attachment.
 *   availability  Availability SLA percent (default 99.99).
 *   repairHours   Repair-time SLA in hours (default 4).
 *   instabilityThreshold  Min outages/day to flag (default 3).
 *   customer, site, address, gateway, isp, publicIp, device  Site-info overrides.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkSecretAuth } from '@/lib/api-auth'
import { DomotzClient } from '@/lib/domotz'
import {
  generateWanReliabilityReport,
  renderReport,
  contentTypeFor,
  type GenerateReportOptions,
  type ReportFormat,
} from '@/lib/reporting/wan-reliability'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_FORMATS: ReportFormat[] = ['json', 'markdown', 'text', 'html']

export async function GET(request: NextRequest) {
  // Staff session first; fall back to the migration secret for scripts.
  const session = await auth()
  if (!session?.user?.email) {
    const denied = checkSecretAuth(request)
    if (denied) return denied
  }

  const sp = request.nextUrl.searchParams

  // --- Required: agentId -----------------------------------------------------
  const agentId = parseIntParam(sp.get('agentId'))
  if (agentId == null) {
    return NextResponse.json({ error: 'agentId is required (the Domotz collector/site id).' }, { status: 400 })
  }
  const deviceId = parseIntParam(sp.get('deviceId'))

  // --- Window ----------------------------------------------------------------
  let from: Date
  let to: Date
  const fromParam = sp.get('from')
  const toParam = sp.get('to')
  if (fromParam || toParam) {
    to = toParam ? new Date(toParam) : new Date()
    from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 90 * 86_400_000)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Invalid from/to date. Use ISO-8601 (e.g. 2026-03-31T00:00:00Z).' }, { status: 400 })
    }
    if (from >= to) {
      return NextResponse.json({ error: '`from` must be before `to`.' }, { status: 400 })
    }
  } else {
    const days = clamp(parseIntParam(sp.get('days')) ?? 90, 1, 365)
    to = new Date()
    from = new Date(to.getTime() - days * 86_400_000)
  }

  // --- Format ----------------------------------------------------------------
  const format = (sp.get('format') ?? 'json') as ReportFormat
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: `Invalid format. Use one of: ${VALID_FORMATS.join(', ')}.` }, { status: 400 })
  }

  // --- Domotz client ---------------------------------------------------------
  const client = new DomotzClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'Domotz is not configured (DOMOTZ_API_KEY / DOMOTZ_API_URL are unset).' },
      { status: 503 },
    )
  }

  // --- Options ---------------------------------------------------------------
  const sourceParam = sp.get('source')
  const opts: GenerateReportOptions = {
    agentId,
    deviceId: deviceId ?? null,
    from,
    to,
    source: sourceParam === 'agent' || sourceParam === 'device' ? sourceParam : 'auto',
    site: pruneUndefined({
      customer: sp.get('customer') ?? undefined,
      site: sp.get('site') ?? undefined,
      address: sp.get('address') ?? undefined,
      gateway: sp.get('gateway') ?? undefined,
      isp: sp.get('isp') ?? undefined,
      publicIp: sp.get('publicIp') ?? undefined,
      deviceMonitored: sp.get('device') ?? undefined,
    }),
    sla: pruneUndefined({
      availabilityPercent: parseFloatParam(sp.get('availability')),
      repairHours: parseFloatParam(sp.get('repairHours')),
    }),
    dailyInstabilityThreshold: parseIntParam(sp.get('instabilityThreshold')) ?? undefined,
  }

  // --- Generate --------------------------------------------------------------
  try {
    const report = await generateWanReliabilityReport(client, opts)

    if (format === 'json') {
      const res = NextResponse.json(report)
      if (sp.get('download') === '1') {
        res.headers.set('Content-Disposition', `attachment; filename="${reportFilename(report.site.customer, 'json')}"`)
      }
      return res
    }

    const body = renderReport(report, format)
    const headers: Record<string, string> = { 'Content-Type': contentTypeFor(format) }
    if (sp.get('download') === '1') {
      const ext = format === 'markdown' ? 'md' : format === 'html' ? 'html' : 'txt'
      headers['Content-Disposition'] = `attachment; filename="${reportFilename(report.site.customer, ext)}"`
    }
    return new NextResponse(body, { headers })
  } catch (err) {
    console.error('[wan-reliability] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseIntParam(value: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function parseFloatParam(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

function reportFilename(customer: string, ext: string): string {
  const slug = customer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
  return `wan-reliability-${slug}.${ext}`
}
