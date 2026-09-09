// src/lib/connector/unifi-device-cache.ts
//
// Filtering, paging and CACHE LABELLING for the Site Manager device list.
//
// WHY THIS EXISTS — two defects reproduced live on 2026-09-09, both in
// `unifi_list_devices`:
//
//  1. IT PRESENTED A CACHE AS LIVE STATE. It reported all three Blissful Buds
//     devices as status "offline". A per-site read through the Cloud Connector
//     Proxy seconds later showed all three ONLINE, with 15, 13 and 42 days of
//     uptime. `/ea/devices` is Site Manager's own snapshot of what each console
//     last reported — it is not a reachability test — and nothing in the
//     response said so. That nearly produced a confident customer-facing claim
//     that a client's network was down when it was not.
//
//  2. IT RETURNED THE WHOLE FLEET. 547 devices across every client, in one
//     unfiltered, unpaged response that exceeded the context limit and had to
//     be written to disk and grepped to find three devices.
//
// THE LABELLING IS STRUCTURAL, NOT ADVISORY. A warning string next to a field
// called `status` still leaves `status` there to be read. So the vendor's
// `status` is NOT emitted under that name: it comes back as `cachedStatus`,
// beside `cachedAt` and `dataSource`. A caller that reaches for `.status` gets
// `undefined` rather than a stale value it can quote. The same reasoning is why
// `cachedAt` is Site Manager's OWN per-host `updatedAt` rather than the time we
// made the request: the question a reader has is how old the console's report
// is, not how recently we asked for it.
//
// Pure by construction — no fetch, no env, no clock. The connector tool does
// the I/O and hands the rows here, so every rule below is unit-testable.

import type { UnifiDeviceEntry } from '@/lib/ubiquiti'

/** The one sentence a caller must not be able to miss. */
export const CACHED_STATUS_WARNING =
  'CACHED, NOT LIVE. Every field here comes from Site Manager\'s /ea/devices snapshot of what each console last reported — it is not a reachability test. cachedStatus can say "offline" for a device that is up right now (live 2026-09-09: this list said offline for all three Blissful Buds devices while a per-site read showed all three ONLINE with 15, 13 and 42 days uptime). Never state that a device or a customer network is down on the strength of this tool. Confirm with a live per-site read first: unifi_resolve_site then unifi_site_devices — or call this tool again with live: true once a filter narrows the result to a single console.'

/** Site Manager groups devices by host, so there is no site dimension to filter on. */
export const NO_SITE_DIMENSION =
  'Site Manager\'s /ea/devices cache is grouped by HOST (console), and its device records carry no site id — so this tool cannot filter by site, and a siteId parameter here would be a filter that silently did nothing. Sites live on the console\'s own Integration API: call unifi_resolve_site to get consoleId + siteId, then unifi_site_devices, which is both per-site AND live.'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export interface CachedDeviceRow {
  id: string
  name: string
  model: string
  macAddress: string
  ipAddress: string
  /**
   * The vendor's `status`, renamed so it cannot be read as live state. See the
   * header note: the rename is the guard, the warning is only the explanation.
   */
  cachedStatus: string
  /** Site Manager's own updatedAt for this device's host; null when it gave none. */
  cachedAt: string | null
  cachedFirmwareStatus: string
  firmwareVersion: string
  updateAvailable: string | null
  hostName: string
  hostId: string
  isConsole: boolean | null
  dataSource: 'site-manager-cache'
}

export interface CachedDeviceFilter {
  /**
   * Console/host id. Site Manager reports it as `hostId`; unifi_resolve_site
   * returns the same identifier as `consoleId`. Matched case-insensitively
   * against hostId — and a filter that matches NOTHING is reported as such
   * rather than returned as an empty list, because the two are not the same
   * answer and an identifier mismatch would otherwise read as "no devices".
   */
  consoleId?: string
  hostName?: string
  /** Free text over name, model, MAC, IP and host name. */
  search?: string
  limit?: number
  offset?: number
}

export interface CachedDeviceResult {
  warning: string
  dataSource: 'site-manager-cache'
  filter: { consoleId: string | null; hostName: string | null; search: string | null }
  totalDevicesInCache: number
  totalMatched: number
  returned: number
  offset: number
  limit: number
  /** True when more matched than this page returned — page with offset. */
  hasMore: boolean
  /**
   * True when a filter was supplied and matched no host at all. Distinguished
   * from "matched a host that has no devices", which is a real empty result.
   */
  filterMatchedNoHost: boolean
  /** Populated only when filterMatchedNoHost, so the caller can see the real names. */
  availableHosts?: Array<{ hostId: string; hostName: string; deviceCount: number }>
  /** Oldest and newest cache timestamps across the returned rows. */
  cacheAgeRange: { oldest: string | null; newest: string | null }
  /** Set when the filter narrowed to exactly one console — a live read is then cheap. */
  liveReadHint?: string
  devices: CachedDeviceRow[]
}

function norm(s: string): string {
  return s.toLowerCase().trim()
}

function toRow(e: UnifiDeviceEntry): CachedDeviceRow {
  const d = e.device
  return {
    id: d.id,
    name: d.name || '(unnamed)',
    model: d.model || d.shortname || 'Unknown',
    macAddress: d.mac || '',
    ipAddress: d.ip || '',
    cachedStatus: d.status || 'unknown',
    cachedAt: e.hostUpdatedAt,
    cachedFirmwareStatus: d.firmwareStatus || 'unknown',
    firmwareVersion: d.version || 'Unknown',
    updateAvailable: d.updateAvailable ?? null,
    hostName: e.hostName,
    hostId: e.hostId,
    isConsole: d.isConsole ?? null,
    dataSource: 'site-manager-cache',
  }
}

/**
 * Filter, page and label the flattened Site Manager device cache.
 *
 * Ordering is stable (host name, then device name) so paging with `offset` is
 * meaningful; an unstable sort would silently skip and repeat rows across pages.
 */
export function selectCachedDevices(
  entries: UnifiDeviceEntry[],
  filter: CachedDeviceFilter = {},
): CachedDeviceResult {
  const consoleId = filter.consoleId?.trim() || null
  const hostName = filter.hostName?.trim() || null
  const search = filter.search?.trim() || null

  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? DEFAULT_LIMIT)), MAX_LIMIT)
  const offset = Math.max(0, Math.floor(filter.offset ?? 0))

  // Host-level filters first, so "this console does not exist" can be told
  // apart from "this console has no devices".
  let scoped = entries
  let filterMatchedNoHost = false

  if (consoleId) {
    const want = norm(consoleId)
    scoped = scoped.filter((e) => norm(e.hostId) === want)
    if (scoped.length === 0) filterMatchedNoHost = true
  }
  if (!filterMatchedNoHost && hostName) {
    const want = norm(hostName)
    scoped = scoped.filter((e) => norm(e.hostName).includes(want))
    if (scoped.length === 0) filterMatchedNoHost = true
  }

  if (!filterMatchedNoHost && search) {
    const want = norm(search)
    scoped = scoped.filter((e) => {
      const d = e.device
      return [d.name, d.model, d.shortname, d.mac, d.ip, e.hostName]
        .some((v) => typeof v === 'string' && norm(v).includes(want))
    })
  }

  const rows = scoped
    .map(toRow)
    .sort((a, b) => a.hostName.localeCompare(b.hostName) || a.name.localeCompare(b.name))

  const page = rows.slice(offset, offset + limit)

  const stamps = page.map((r) => r.cachedAt).filter((v): v is string => typeof v === 'string' && v.length > 0).sort()

  const distinctHosts = new Set(page.map((r) => r.hostId))

  const result: CachedDeviceResult = {
    warning: CACHED_STATUS_WARNING,
    dataSource: 'site-manager-cache',
    filter: { consoleId, hostName, search },
    totalDevicesInCache: entries.length,
    totalMatched: rows.length,
    returned: page.length,
    offset,
    limit,
    hasMore: offset + page.length < rows.length,
    filterMatchedNoHost,
    cacheAgeRange: { oldest: stamps[0] ?? null, newest: stamps[stamps.length - 1] ?? null },
    devices: page,
  }

  if (filterMatchedNoHost) {
    const byHost = new Map<string, { hostId: string; hostName: string; deviceCount: number }>()
    for (const e of entries) {
      const cur = byHost.get(e.hostId)
      if (cur) cur.deviceCount += 1
      else byHost.set(e.hostId, { hostId: e.hostId, hostName: e.hostName, deviceCount: 1 })
    }
    result.availableHosts = [...byHost.values()].sort((a, b) => a.hostName.localeCompare(b.hostName))
  }

  if (distinctHosts.size === 1) {
    const only = page[0]
    result.liveReadHint = `These rows are all from console "${only.hostName}" (hostId ${only.hostId}). A live read is cheap for a single console — call this tool again with live: true, or unifi_resolve_site then unifi_site_devices — and do that before saying anything about whether these devices are up.`
  }

  return result
}
