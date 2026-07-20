// src/lib/mcp-unifi-site-tools.ts
//
// Per-site UniFi tools for the MCP connector, served through Ubiquiti's
// Cloud Connector Proxy (src/lib/ubiquiti-proxy.ts) — each console's LOCAL
// Network Integration API reached from the cloud. No LAN path, no per-console
// credentials, no tunnels. The five aggregate Site Manager tools registered
// in the route (unifi_list_sites/hosts/devices/summary/site_networks) are
// untouched; these tools are the granular, single-site surface.
//
// Tool surface = exactly what the OFFICIAL Integration API documents
// (OpenAPI 10.1.84, verified July 2026). Missing from the official API and
// therefore deliberately absent here: locate/LED, client block/unblock/
// reconnect, port forwards, static routes, site health/ISP metrics,
// events/alarms, port profiles, gateway settings, firmware triggers.
// Full omission list with reasons: docs/unifi-site-tools.md.
//
// Guardrails, structural not advisory:
//   - TCT works one site at a time through the MCP. Every write tool takes
//     exactly ONE consoleId, ONE siteId, ONE target — no arrays, no
//     wildcards. Mass changes are done by a human in unifi.ui.com.
//   - Tier 1 (restart device, power-cycle port, guest auth, vouchers):
//     immediate, attributed to the signed-in tech via structured logs,
//     gated by CONNECTOR_UNIFI_WRITES_ENABLED.
//   - Tier 2 (firewall/network/WLAN/ACL/DNS/adoption config): staged-only
//     through the SAME human-approval gate as Autotask config writes
//     (src/lib/connector/unifi-staged-writes.ts) — the MCP token cannot
//     approve its own change. Same kill switch.
//   - Reads are unrestricted but secret-REDACTED (WLAN passphrases, RADIUS
//     secrets) and throw typed errors — an offline console reads as
//     CONSOLE_OFFLINE, never as "zero clients".

import { z } from 'zod'
import { randomUUID } from 'crypto'
import {
  listLocalSites,
  listUnifiConsoles,
  proxyDelete,
  proxyGet,
  proxyGetAll,
  proxyPost,
  redactSecrets,
  UnifiProxyError,
  type UnifiConsoleInfo,
  type UnifiLocalSite,
} from '@/lib/ubiquiti-proxy'
import { structuredLog } from '@/lib/resilience'
import { listStagedWrites, cancelStagedWrite } from '@/lib/connector/staged-writes'
import {
  assertUnifiWritesEnabled,
  executeUnifiStagedWrite,
  stageUnifiWrite,
} from '@/lib/connector/unifi-staged-writes'
import { UNIFI_WRITE_AREAS } from '@/lib/connector/staged-writes-core'

// `?? null`: a 204/empty proxy response must serialize as "null", not the
// invalid content block JSON.stringify(undefined) would produce.
function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? null, null, 2) }] } }
function fail(err: unknown) {
  // Typed proxy errors carry the failure class so the tech can tell
  // "firmware too old" from "console offline" from "bad key" in-chat.
  const m = err instanceof UnifiProxyError ? `[${err.code}] ${err.message}` : err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true }
}

// ---------------------------------------------------------------------------
// Console cache + fuzzy site resolution
// ---------------------------------------------------------------------------

// Warm-lambda optimization only — durable state lives in Postgres elsewhere.
let consoleCache: { at: number; consoles: UnifiConsoleInfo[] } | null = null
const CONSOLE_CACHE_TTL_MS = 5 * 60_000

async function cachedConsoles(forceRefresh = false): Promise<UnifiConsoleInfo[]> {
  if (!forceRefresh && consoleCache && Date.now() - consoleCache.at < CONSOLE_CACHE_TTL_MS) {
    return consoleCache.consoles
  }
  const consoles = await listUnifiConsoles()
  consoleCache = { at: Date.now(), consoles }
  return consoles
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Score consoles against a query. `best` is set ONLY when exactly one console
 * holds the top score at exact/prefix/substring strength — word-overlap hits
 * are returned as candidates for the user to pick, never auto-chosen.
 * Exported for unit tests.
 */
export function matchUnifiConsoles(
  query: string,
  consoles: UnifiConsoleInfo[],
): { best: UnifiConsoleInfo | null; candidates: UnifiConsoleInfo[] } {
  const q = normalizeName(query)
  if (!q) return { best: null, candidates: [] }
  const qWords = q.split(' ')

  const scored = consoles
    .map((c) => {
      const n = normalizeName(c.name)
      let score = 0
      if (n === q) score = 4
      else if (n.startsWith(q)) score = 3
      else if (n.includes(q)) score = 2
      else {
        const nWords = new Set(n.split(' '))
        const hit = qWords.filter((w) => nWords.has(w)).length
        if (hit === qWords.length) score = 1.5
        else if (hit > 0) score = 1
      }
      return { console: c, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.console.name.localeCompare(b.console.name))

  if (!scored.length) return { best: null, candidates: [] }
  const top = scored[0].score
  const topHits = scored.filter((s) => s.score === top)
  const best = top >= 2 && topHits.length === 1 ? topHits[0].console : null
  return { best, candidates: scored.slice(0, 8).map((s) => s.console) }
}

function siteSummary(s: UnifiLocalSite) {
  return { siteId: s.id, name: s.name ?? s.internalReference ?? s.id, internalReference: s.internalReference ?? null }
}

function versionAtLeast(version: string, min: number[]): boolean {
  const parts = version.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < min.length; i++) {
    if ((parts[i] ?? 0) > min[i]) return true
    if ((parts[i] ?? 0) < min[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Tier-1 attribution
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

function requireActor(extra: unknown): string {
  const email = emailOf(extra)
  if (!email) {
    throw new Error('Cannot attribute this UniFi action: no signed-in user email on the connector session. Sign in so the write is recorded under your name.')
  }
  return email
}

/** Run one tier-1 write with the kill switch, actor attribution, and outcome logging. */
async function attributedAction<T>(
  tool: string,
  extra: unknown,
  target: Record<string, string | number>,
  fn: () => Promise<T>,
): Promise<{ actor: string; result: T }> {
  assertUnifiWritesEnabled()
  const actor = requireActor(extra)
  const ctx = { correlationId: randomUUID(), operation: 'connector_unifi_tier1_write', tool, actor, ...target }
  try {
    const result = await fn()
    structuredLog.info(ctx, `UniFi tier-1 write executed by ${actor}`)
    return { actor, result }
  } catch (err) {
    structuredLog.error(ctx, `UniFi tier-1 write FAILED for ${actor}`, err)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const UNIFI_AREA_KEYS = Object.keys(UNIFI_WRITE_AREAS) as [string, ...string[]]
const UNIFI_AREA_SUMMARY = Object.values(UNIFI_WRITE_AREAS)
  .map((s) => `${s.area} [${s.risk}] (${s.operations.join('/')}: ${s.allowedFields.join(', ')})`)
  .join('; ')
const UNIFI_AREA_HINTS = Object.values(UNIFI_WRITE_AREAS)
  .filter((s) => s.inputHint)
  .map((s) => `${s.area}: ${s.inputHint}`)
  .join(' ')

const MIN_FIRMWARE_NOTE = 'Requires the console\'s Network app >= 10.1.84 (a FIRMWARE_UNSUPPORTED error names the console to update).'
const RESOLVE_FIRST = 'Resolve consoleId + siteId first with unifi_resolve_site.'

const consoleIdParam = z.string().describe('Console ID from unifi_resolve_site (one console only)')
const siteIdParam = z.string().describe('Site ID from unifi_resolve_site (one site only)')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerUnifiSiteTools(server: any) {
  // ── Resolution & capability probes ────────────────────────────────────────
  server.registerTool(
    'unifi_resolve_site',
    {
      title: 'UniFi: resolve a site name to consoleId + siteId',
      description: 'Fuzzy-match a customer/site name against all UniFi consoles (cached /v1/hosts), then list that console\'s local sites through the Cloud Connector Proxy. Returns { resolved: true, consoleId, siteId } only when the match is unambiguous — ambiguous names return candidates to show the user; NEVER pick one yourself. Every other unifi_site_* tool takes the consoleId + siteId this returns.',
      inputSchema: {
        query: z.string().describe('Customer or site name (partial ok), e.g. "EZ Red" or "Montrose"'),
        siteName: z.string().optional().describe('Disambiguates when one console hosts multiple local sites'),
      },
    },
    async ({ query, siteName }: { query: string; siteName?: string }) => {
      try {
        const consoles = await cachedConsoles()
        const { best, candidates } = matchUnifiConsoles(query, consoles)
        if (!best) {
          return ok({
            resolved: false,
            reason: candidates.length
              ? 'Ambiguous console name — ask the user to pick one of the candidates, then re-resolve with the exact name.'
              : `No console matched '${query}' among ${consoles.length} consoles. Ask the user for the exact name (unifi_list_hosts shows all).`,
            candidates: candidates.map((c) => ({ consoleId: c.consoleId, name: c.name })),
          })
        }
        let sites: UnifiLocalSite[]
        try {
          sites = await listLocalSites(best.consoleId)
        } catch (err) {
          if (err instanceof UnifiProxyError) {
            // The console matched but its Integration API is unreachable —
            // return the reason instead of failing the whole resolve.
            return ok({
              resolved: false,
              console: { consoleId: best.consoleId, name: best.name },
              reason: `Matched console '${best.name}' but its local API is unavailable: [${err.code}] ${err.message}`,
            })
          }
          throw err
        }
        if (sites.length === 0) {
          return ok({
            resolved: false,
            console: { consoleId: best.consoleId, name: best.name },
            reason: `Matched console '${best.name}' and its Integration API is reachable, but it reports no local sites — check the console in unifi.ui.com.`,
          })
        }
        if (sites.length === 1) {
          return ok({ resolved: true, consoleId: best.consoleId, consoleName: best.name, ...siteSummary(sites[0]) })
        }
        if (siteName) {
          const want = normalizeName(siteName)
          const hits = sites.filter((s) => normalizeName(String(s.name ?? s.internalReference ?? '')).includes(want))
          if (hits.length === 1) {
            return ok({ resolved: true, consoleId: best.consoleId, consoleName: best.name, ...siteSummary(hits[0]) })
          }
        }
        return ok({
          resolved: false,
          console: { consoleId: best.consoleId, name: best.name },
          reason: 'This console hosts multiple local sites — ask the user which one, then pass siteName.',
          siteCandidates: sites.map(siteSummary),
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_console_capabilities',
    {
      title: 'UniFi: one console\'s Integration API capability',
      description: `Check whether ONE console's local Network Integration API is reachable through the Cloud Connector Proxy and which Network app version it runs (full tool surface needs >= 10.1.84). Use when another unifi_site_* tool failed, to tell "firmware too old" from "offline" from "auth". Read-only.`,
      inputSchema: { consoleId: consoleIdParam },
    },
    async ({ consoleId }: { consoleId: string }) => {
      try {
        const info = await proxyGet<{ applicationVersion?: string }>(consoleId, '/info', { isCapabilityProbe: true })
        const sites = await listLocalSites(consoleId)
        const version = info?.applicationVersion ?? null
        return ok({
          consoleId,
          integrationApiAvailable: true,
          networkApplicationVersion: version,
          // 10.1.84 introduced firewall policies, DNS policies, adopt/forget.
          meetsFullSurfaceMinimum_10_1_84: version ? versionAtLeast(version, [10, 1, 84]) : null,
          localSites: sites.map(siteSummary),
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_probe_consoles',
    {
      title: 'UniFi: probe every console (firmware remediation list)',
      description: 'Read-only fleet sweep: tries the proxied Integration API on EVERY console and buckets failures by typed reason (FIRMWARE_UNSUPPORTED = update the Network app, CONSOLE_OFFLINE, AUTH_FAILED, TIMEOUT…). The non-OK buckets are TCT\'s firmware remediation list — the unifi_site_* tools cannot serve those sites until fixed. Takes ~15-30s across the fleet. Same output as scripts/probe-unifi-consoles.ts.',
      inputSchema: {},
    },
    async () => {
      try {
        const consoles = await cachedConsoles(true)
        const results: Array<{ consoleId: string; name: string; bucket: string; detail: string }> = new Array(consoles.length)
        let next = 0
        const worker = async (): Promise<void> => {
          for (;;) {
            const i = next++
            if (i >= consoles.length) return
            const c = consoles[i]
            try {
              const sites = await listLocalSites(c.consoleId)
              results[i] = { consoleId: c.consoleId, name: c.name, bucket: 'OK', detail: `${sites.length} local site(s)` }
            } catch (err) {
              results[i] = {
                consoleId: c.consoleId,
                name: c.name,
                bucket: err instanceof UnifiProxyError ? err.code : 'OTHER',
                detail: err instanceof Error ? err.message : String(err),
              }
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(6, consoles.length) }, worker))
        const summary = results.reduce<Record<string, number>>((acc, r) => { acc[r.bucket] = (acc[r.bucket] ?? 0) + 1; return acc }, {})
        return ok({
          probed: results.length,
          summary,
          needsAttention: results.filter((r) => r.bucket !== 'OK').sort((a, b) => a.bucket.localeCompare(b.bucket) || a.name.localeCompare(b.name)),
          reachable: results.filter((r) => r.bucket === 'OK').map((r) => ({ consoleId: r.consoleId, name: r.name, detail: r.detail })),
        })
      } catch (e) { return fail(e) }
    }
  )

  // ── Reads (single site; secrets redacted; typed errors) ───────────────────
  const listRead = (
    name: string,
    title: string,
    description: string,
    path: (siteId: string) => string,
  ) => {
    server.registerTool(
      name,
      { title, description: `${description} ${RESOLVE_FIRST}`, inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam } },
      async ({ consoleId, siteId }: { consoleId: string; siteId: string }) => {
        try {
          const res = await proxyGetAll(consoleId, path(siteId))
          return ok({ totalCount: res.totalCount, truncated: res.truncated, items: redactSecrets(res.items) })
        } catch (e) { return fail(e) }
      }
    )
  }

  listRead('unifi_site_devices', 'UniFi: devices at one site',
    'List adopted devices at a single site via the Cloud Connector Proxy: name, model, MAC, IP, state (ONLINE/OFFLINE/UPDATING…), firmware version + updatable flag. Detail incl. ports/radios: unifi_device_details.',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/devices`)

  server.registerTool(
    'unifi_device_details',
    {
      title: 'UniFi: one device in detail (ports, radios)',
      description: `Full detail for ONE device: state, firmware (+updatable), uplink, port table (idx, state, PoE, speed), radios (band, channel, width). ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, deviceId: z.string().describe('Device ID from unifi_site_devices') },
    },
    async ({ consoleId, siteId, deviceId }: { consoleId: string; siteId: string; deviceId: string }) => {
      try { return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}`))) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_device_statistics',
    {
      title: 'UniFi: one device\'s latest statistics',
      description: `Latest stats for ONE device: uptime, CPU/memory %, load averages, uplink tx/rx rate, radio retries. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, deviceId: z.string().describe('Device ID from unifi_site_devices') },
    },
    async ({ consoleId, siteId, deviceId }: { consoleId: string; siteId: string; deviceId: string }) => {
      try { return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/statistics/latest`))) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_pending_devices',
    {
      title: 'UniFi: devices pending adoption on one console',
      description: `Console-level list of devices waiting to be adopted. Adoption itself is a staged write (area unifi_device_adoption via unifi_stage_config_write). ${MIN_FIRMWARE_NOTE}`,
      inputSchema: { consoleId: consoleIdParam },
    },
    async ({ consoleId }: { consoleId: string }) => {
      try {
        const res = await proxyGetAll(consoleId, '/pending-devices')
        return ok({ totalCount: res.totalCount, truncated: res.truncated, items: redactSecrets(res.items) })
      } catch (e) { return fail(e) }
    }
  )

  listRead('unifi_site_clients', 'UniFi: connected clients at one site',
    'Live client list for a single site: name, type (WIRED/WIRELESS/VPN/TELEPORT), IP, MAC, connectedAt, access/authorization. Signal/uplink/usage detail for one client: unifi_client_details.',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/clients`)

  server.registerTool(
    'unifi_client_details',
    {
      title: 'UniFi: one connected client in detail',
      description: `Detail for ONE client at one site (wired/wireless/VPN specifics: uplink device, signal where the API provides it, IP/MAC, guest authorization state). ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, clientId: z.string().describe('Client ID from unifi_site_clients') },
    },
    async ({ consoleId, siteId, clientId }: { consoleId: string; siteId: string; clientId: string }) => {
      try { return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientId)}`))) } catch (e) { return fail(e) }
    }
  )

  listRead('unifi_site_networks_config', 'UniFi: networks/VLANs at one site (local config)',
    'Local network/VLAN configuration of a single site from the console itself (id, name, enabled, vlanId, management type, DHCP guarding) — richer and fresher than the cloud-aggregate unifi_site_networks. Changes go through unifi_stage_config_write (area unifi_network).',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/networks`)

  server.registerTool(
    'unifi_network_references',
    {
      title: 'UniFi: what references one network',
      description: `Objects (WLANs, zones, policies…) that reference ONE network — run before staging a network delete to see what would break. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, networkId: z.string().describe('Network ID from unifi_site_networks_config') },
    },
    async ({ consoleId, siteId, networkId }: { consoleId: string; siteId: string; networkId: string }) => {
      try { return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/networks/${encodeURIComponent(networkId)}/references`))) } catch (e) { return fail(e) }
    }
  )

  listRead('unifi_site_wlans', 'UniFi: WLANs (WiFi broadcasts) at one site',
    'SSIDs at a single site: name, enabled, security type, network binding, client isolation, hide-name. Passphrases/RADIUS secrets are ALWAYS [REDACTED] — actual secrets live in unifi.ui.com only. Edits go through unifi_stage_config_write (area unifi_wlan).',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/wifi/broadcasts`)

  listRead('unifi_site_firewall_zones', 'UniFi: firewall zones at one site',
    'Zone-based firewall zones (id, name, member networkIds). Changes go through unifi_stage_config_write (area unifi_firewall_zone).',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/firewall/zones`)

  listRead('unifi_site_firewall_policies', 'UniFi: firewall policies at one site',
    `Zone-based firewall policies (enabled, action ALLOW/BLOCK/REJECT, source/destination zone + filters, logging, schedule). ${MIN_FIRMWARE_NOTE} Changes go through unifi_stage_config_write (area unifi_firewall_policy).`,
    (siteId) => `/sites/${encodeURIComponent(siteId)}/firewall/policies`)

  server.registerTool(
    'unifi_firewall_policy_details',
    {
      title: 'UniFi: one firewall policy in detail',
      description: `Full detail for ONE firewall policy. ${MIN_FIRMWARE_NOTE} ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, policyId: z.string().describe('Policy ID from unifi_site_firewall_policies') },
    },
    async ({ consoleId, siteId, policyId }: { consoleId: string; siteId: string; policyId: string }) => {
      try { return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/firewall/policies/${encodeURIComponent(policyId)}`))) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_firewall_policy_ordering',
    {
      title: 'UniFi: firewall policy evaluation order (read)',
      description: `READ the user-defined policy order for one zone pair. Reordering is NOT available through the connector (the API takes a full ordered id array — multi-target by construction); reorder in unifi.ui.com. ${MIN_FIRMWARE_NOTE}`,
      inputSchema: {
        consoleId: consoleIdParam,
        siteId: siteIdParam,
        sourceFirewallZoneId: z.string().describe('Source zone ID from unifi_site_firewall_zones'),
        destinationFirewallZoneId: z.string().describe('Destination zone ID from unifi_site_firewall_zones'),
      },
    },
    async ({ consoleId, siteId, sourceFirewallZoneId, destinationFirewallZoneId }: { consoleId: string; siteId: string; sourceFirewallZoneId: string; destinationFirewallZoneId: string }) => {
      try {
        const qs = new URLSearchParams({ sourceFirewallZoneId, destinationFirewallZoneId })
        return ok(redactSecrets(await proxyGet(consoleId, `/sites/${encodeURIComponent(siteId)}/firewall/policies/ordering?${qs}`)))
      } catch (e) { return fail(e) }
    }
  )

  listRead('unifi_site_acl_rules', 'UniFi: ACL rules at one site',
    'Layer-2/switch ACL rules (type IPV4/MAC, action, source/destination filters, enforcing devices). Changes go through unifi_stage_config_write (area unifi_acl_rule).',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/acl-rules`)

  listRead('unifi_site_dns_policies', 'UniFi: DNS policies at one site',
    `Local DNS records/policies (A/AAAA/CNAME/MX/TXT/SRV/FORWARD_DOMAIN). ${MIN_FIRMWARE_NOTE} Changes go through unifi_stage_config_write (area unifi_dns_policy).`,
    (siteId) => `/sites/${encodeURIComponent(siteId)}/dns/policies`)

  listRead('unifi_site_traffic_matching_lists', 'UniFi: traffic matching lists at one site',
    'Port/IPv4/IPv6 matching lists consumed by firewall policies. Changes go through unifi_stage_config_write (area unifi_traffic_matching_list).',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/traffic-matching-lists`)

  listRead('unifi_site_vouchers', 'UniFi: hotspot vouchers at one site',
    'Guest hotspot vouchers (code, created/expires, limits, uses). Create/revoke one with unifi_create_hotspot_voucher / unifi_delete_hotspot_voucher.',
    (siteId) => `/sites/${encodeURIComponent(siteId)}/hotspot/vouchers`)

  server.registerTool(
    'unifi_site_wan_vpn_radius',
    {
      title: 'UniFi: WAN/VPN/RADIUS config at one site (read)',
      description: `Supporting config for one site in one call: WAN identities (id+name only — the official API exposes no ISP metrics), site-to-site VPN tunnels, VPN servers, RADIUS profiles (secrets redacted). Sections that fail report their own typed error instead of hiding it. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam },
    },
    async ({ consoleId, siteId }: { consoleId: string; siteId: string }) => {
      try {
        const sid = encodeURIComponent(siteId)
        const section = async (path: string) => {
          try {
            const res = await proxyGetAll(consoleId, path)
            return { items: redactSecrets(res.items), totalCount: res.totalCount }
          } catch (err) {
            return { error: err instanceof UnifiProxyError ? `[${err.code}] ${err.message}` : String(err) }
          }
        }
        const [wans, siteToSiteTunnels, vpnServers, radiusProfiles] = await Promise.all([
          section(`/sites/${sid}/wans`),
          section(`/sites/${sid}/vpn/site-to-site-tunnels`),
          section(`/sites/${sid}/vpn/servers`),
          section(`/sites/${sid}/radius/profiles`),
        ])
        return ok({ wans, siteToSiteTunnels, vpnServers, radiusProfiles })
      } catch (e) { return fail(e) }
    }
  )

  // ── Tier 1 writes: direct, attributed, single target ─────────────────────
  server.registerTool(
    'unifi_restart_device',
    {
      title: 'UniFi: restart ONE device',
      description: `WRITE (tier 1). Restart a single UniFi device (AP/switch/gateway). Brief outage for everything behind it — CONFIRM the exact device name, site, and customer with the user before calling. Attributed to the signed-in tech. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, deviceId: z.string().describe('Device ID from unifi_site_devices — one device only') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, deviceId }: any, extra: any) => {
      try {
        const { actor } = await attributedAction('unifi_restart_device', extra, { consoleId, siteId, deviceId }, () =>
          proxyPost(consoleId, `/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/actions`, { action: 'RESTART' }))
        return ok({ requested: 'RESTART', deviceId, attributedTo: actor, note: 'Device is restarting — expect it OFFLINE in unifi_site_devices for 1-5 minutes.' })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_power_cycle_port',
    {
      title: 'UniFi: power-cycle ONE PoE port',
      description: `WRITE (tier 1). Power-cycle a single PoE port on a single switch (reboots the powered device: AP, camera, phone…). CONFIRM the exact switch, port number, and what hangs off it with the user before calling (unifi_device_details shows the port table). Attributed. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: {
        consoleId: consoleIdParam,
        siteId: siteIdParam,
        deviceId: z.string().describe('Switch device ID — one device only'),
        portIdx: z.number().int().min(1).describe('Port index from unifi_device_details — one port only'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, deviceId, portIdx }: any, extra: any) => {
      try {
        const { actor } = await attributedAction('unifi_power_cycle_port', extra, { consoleId, siteId, deviceId, portIdx }, () =>
          proxyPost(consoleId, `/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/interfaces/ports/${portIdx}/actions`, { action: 'POWER_CYCLE' }))
        return ok({ requested: 'POWER_CYCLE', deviceId, portIdx, attributedTo: actor })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_authorize_guest',
    {
      title: 'UniFi: authorize ONE guest client',
      description: `WRITE (tier 1). Authorize a single client for guest access, optionally time/data/rate-limited. CONFIRM the exact client (unifi_site_clients) with the user first. Attributed. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: {
        consoleId: consoleIdParam,
        siteId: siteIdParam,
        clientId: z.string().describe('Client ID from unifi_site_clients — one client only'),
        timeLimitMinutes: z.number().int().min(1).optional().describe('Authorization window in minutes (site default when omitted)'),
        dataUsageLimitMBytes: z.number().int().min(1).optional().describe('Data cap in MB'),
        rxRateLimitKbps: z.number().int().min(2).optional().describe('Download limit, kbps'),
        txRateLimitKbps: z.number().int().min(2).optional().describe('Upload limit, kbps'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, clientId, timeLimitMinutes, dataUsageLimitMBytes, rxRateLimitKbps, txRateLimitKbps }: any, extra: any) => {
      try {
        const { actor, result } = await attributedAction('unifi_authorize_guest', extra, { consoleId, siteId, clientId }, () =>
          proxyPost(consoleId, `/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientId)}/actions`, {
            action: 'AUTHORIZE_GUEST_ACCESS',
            ...(timeLimitMinutes != null ? { timeLimitMinutes } : {}),
            ...(dataUsageLimitMBytes != null ? { dataUsageLimitMBytes } : {}),
            ...(rxRateLimitKbps != null ? { rxRateLimitKbps } : {}),
            ...(txRateLimitKbps != null ? { txRateLimitKbps } : {}),
          }))
        return ok({ requested: 'AUTHORIZE_GUEST_ACCESS', clientId, attributedTo: actor, result })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_unauthorize_guest',
    {
      title: 'UniFi: revoke ONE guest client\'s access',
      description: `WRITE (tier 1). Revoke guest authorization for a single client (disconnects them from the guest portal session). CONFIRM the exact client with the user first. Attributed. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, clientId: z.string().describe('Client ID from unifi_site_clients — one client only') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, clientId }: any, extra: any) => {
      try {
        const { actor, result } = await attributedAction('unifi_unauthorize_guest', extra, { consoleId, siteId, clientId }, () =>
          proxyPost(consoleId, `/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientId)}/actions`, { action: 'UNAUTHORIZE_GUEST_ACCESS' }))
        return ok({ requested: 'UNAUTHORIZE_GUEST_ACCESS', clientId, attributedTo: actor, result })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_create_hotspot_voucher',
    {
      title: 'UniFi: create hotspot voucher(s) at one site',
      description: `WRITE (tier 1). Generate guest WiFi voucher codes at a single site (count capped at 10 per call — bulk voucher runs are done in unifi.ui.com). CONFIRM site + limits with the user first. Attributed. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: {
        consoleId: consoleIdParam,
        siteId: siteIdParam,
        name: z.string().describe('Voucher note/label, e.g. "Front desk guest"'),
        timeLimitMinutes: z.number().int().min(1).describe('How long each voucher authorizes, in minutes'),
        count: z.number().int().min(1).max(10).optional().describe('How many codes (default 1, max 10)'),
        authorizedGuestLimit: z.number().int().min(1).optional().describe('Devices per voucher'),
        dataUsageLimitMBytes: z.number().int().min(1).optional().describe('Data cap in MB'),
        rxRateLimitKbps: z.number().int().min(2).optional().describe('Download limit, kbps'),
        txRateLimitKbps: z.number().int().min(2).optional().describe('Upload limit, kbps'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, name, timeLimitMinutes, count, authorizedGuestLimit, dataUsageLimitMBytes, rxRateLimitKbps, txRateLimitKbps }: any, extra: any) => {
      try {
        const { actor, result } = await attributedAction('unifi_create_hotspot_voucher', extra, { consoleId, siteId }, () =>
          proxyPost(consoleId, `/sites/${encodeURIComponent(siteId)}/hotspot/vouchers`, {
            name,
            timeLimitMinutes,
            ...(count != null ? { count } : {}),
            ...(authorizedGuestLimit != null ? { authorizedGuestLimit } : {}),
            ...(dataUsageLimitMBytes != null ? { dataUsageLimitMBytes } : {}),
            ...(rxRateLimitKbps != null ? { rxRateLimitKbps } : {}),
            ...(txRateLimitKbps != null ? { txRateLimitKbps } : {}),
          }))
        return ok({ attributedTo: actor, result })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_delete_hotspot_voucher',
    {
      title: 'UniFi: delete ONE hotspot voucher',
      description: `WRITE (tier 1). Revoke a single voucher by id (from unifi_site_vouchers). Bulk delete-by-filter is deliberately NOT exposed. CONFIRM with the user first. Attributed. Gated by CONNECTOR_UNIFI_WRITES_ENABLED. ${RESOLVE_FIRST}`,
      inputSchema: { consoleId: consoleIdParam, siteId: siteIdParam, voucherId: z.string().describe('Voucher ID — one voucher only') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ consoleId, siteId, voucherId }: any, extra: any) => {
      try {
        const { actor, result } = await attributedAction('unifi_delete_hotspot_voucher', extra, { consoleId, siteId, voucherId }, () =>
          proxyDelete(consoleId, `/sites/${encodeURIComponent(siteId)}/hotspot/vouchers/${encodeURIComponent(voucherId)}`))
        return ok({ deletedVoucherId: voucherId, attributedTo: actor, result: result ?? { deleted: true } })
      } catch (e) { return fail(e) }
    }
  )

  // ── Tier 2 writes: staged-only, human-approved ────────────────────────────
  server.registerTool(
    'unifi_stage_config_write',
    {
      title: 'UniFi: stage a config change (writes NOTHING)',
      description: `STAGE a UniFi configuration change for human approval — this tool NEVER writes to UniFi. It reads the current object through the Cloud Connector Proxy, computes a before→after diff (secrets redacted), stores the pending change, and returns the diff plus an approval URL. A staff member must approve it on /admin/connector/staged-writes (staff login; the connector token cannot approve), then unifi_execute_staged_write applies it with a drift check. Exactly ONE consoleId, ONE siteId, ONE targetId per staged change. Writable areas [risk] (fields verified against the official Integration API; network create/update re-verified against the current published spec, v10.3.58): ${UNIFI_AREA_SUMMARY}. Convenience inputs — ${UNIFI_AREA_HINTS} Not stageable because the official API lacks them: port forwards, static routes, port profiles, gateway settings, firmware updates, WLAN passphrase changes, policy reordering — see docs/unifi-site-tools.md.`,
      inputSchema: {
        area: z.enum(UNIFI_AREA_KEYS).describe('UniFi config area to change'),
        operation: z.enum(['create', 'update', 'delete']).describe('What to do (unifi_device_adoption: create = adopt, delete = forget)'),
        consoleId: consoleIdParam,
        siteId: siteIdParam,
        targetId: z.string().optional().describe('Target object id (required for update/delete) — one object only'),
        changes: z.record(z.string(), z.unknown()).optional().describe('Field→new-value map (allowlisted fields only; omit for delete)'),
        reason: z.string().optional().describe('Why this change is being made (stored in the audit trail)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ area, operation, consoleId, siteId, targetId, changes, reason }: any, extra: any) => {
      try {
        const stagedBy = emailOf(extra)
        if (!stagedBy) throw new Error('Cannot stage: no signed-in user email on the connector session.')
        return ok(await stageUnifiWrite({ area, operation, consoleId, siteId, targetId, changes: changes ?? {}, reason, stagedBy }))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_execute_staged_write',
    {
      title: 'UniFi: execute an APPROVED staged write',
      description: 'Execute ONE staged UniFi change that a human already APPROVED on /admin/connector/staged-writes. Refuses anything not approved (returning the approval URL early is expected, not an error to work around). Single-use. Re-reads the live object through the proxy first and ABORTS as \'drifted\' if it changed since staging; updates are GET→merge→PUT so unapproved fields keep their live values. Returns the API result plus a fresh read-back.',
      inputSchema: { stagedWriteId: z.string().describe('Id returned by unifi_stage_config_write') },
    },
    async ({ stagedWriteId }: { stagedWriteId: string }) => {
      try { return ok(await executeUnifiStagedWrite(stagedWriteId)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_list_staged_writes',
    {
      title: 'UniFi: list staged UniFi writes',
      description: 'List staged UniFi config changes and their audit state (pending_approval / approved / rejected / executed / failed / drifted / cancelled / expired), newest first, with diffs. Read-only.',
      inputSchema: { status: z.string().optional().describe('Filter by status, e.g. pending_approval or approved') },
    },
    async ({ status }: { status?: string }) => {
      try { return ok(await listStagedWrites(status, ['unifi'])) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'unifi_cancel_staged_write',
    {
      title: 'UniFi: cancel a staged write',
      description: 'Cancel a pending or approved staged UniFi change before execution. The row stays in the audit trail as cancelled. Nothing is written to UniFi.',
      inputSchema: { stagedWriteId: z.string().describe('Id returned by unifi_stage_config_write') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ stagedWriteId }: any, extra: any) => {
      try { return ok(await cancelStagedWrite(stagedWriteId, emailOf(extra) ?? 'unknown', ['unifi'])) } catch (e) { return fail(e) }
    }
  )
}
