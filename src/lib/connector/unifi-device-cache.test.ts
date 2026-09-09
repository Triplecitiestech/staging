// src/lib/connector/unifi-device-cache.test.ts
//
// Locks the two defects reproduced live on 2026-09-09:
//
//  1. Cached status presented as live state. `unifi_list_devices` reported all
//     three Blissful Buds devices "offline" from the Site Manager cache; a
//     per-site read seconds later showed all three ONLINE with 15, 13 and 42
//     days of uptime. The regression guard is structural: the vendor's `status`
//     key must NOT appear on an emitted row, so no caller can read it as live.
//
//  2. An unusable payload. It returned all 547 devices across every client,
//     exceeded the context limit, and had to be written to disk and grepped to
//     find three devices.

import { describe, expect, it } from 'vitest'
import type { UnifiDeviceEntry } from '@/lib/ubiquiti'
import {
  CACHED_STATUS_WARNING,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  selectCachedDevices,
} from './unifi-device-cache'

function entry(
  name: string,
  hostName: string,
  hostId: string,
  over: Partial<UnifiDeviceEntry['device']> = {},
  hostUpdatedAt: string | null = '2026-09-09T12:00:00.000Z',
): UnifiDeviceEntry {
  return {
    hostName,
    hostId,
    hostUpdatedAt,
    device: {
      id: `${hostId}-${name}`,
      mac: '1c:6a:1b:41:f4:e9',
      name,
      model: 'U7 Lite',
      shortname: 'U7L',
      ip: '10.0.10.22',
      productLine: 'network',
      // The value that started all this: the cache said offline while the
      // devices were up.
      status: 'offline',
      version: '8.7.11',
      firmwareStatus: 'upToDate',
      updateAvailable: null,
      isConsole: false,
      isManaged: true,
      startupTime: null,
      adoptionTime: null,
      note: null,
      ...over,
    },
  }
}

// The three real Blissful Buds devices, plus noise standing in for the other
// 544 that made the response unusable.
const BLISSFUL = '1C6A1B41F4E90000000008C7C14D00000000093FDB520000000067BB7D5D:1749577957'
const fleet: UnifiDeviceEntry[] = [
  entry('Blissful Buds', 'Blissful Buds', BLISSFUL, { model: 'UniFi Dream Machine PRO SE', isConsole: true }),
  entry('AP - 1', 'Blissful Buds', BLISSFUL),
  entry('Switch 2 - Under Desk', 'Blissful Buds', BLISSFUL, { model: 'USW Flex Mini' }),
  ...Array.from({ length: 544 }, (_, i) => entry(`Device ${i}`, `Other Client ${i % 40}`, `host-${i % 40}`)),
]

describe('cache labelling — the dangerous defect', () => {
  it('never emits the vendor status key, so it cannot be read as live state', () => {
    const { devices } = selectCachedDevices(fleet, { hostName: 'Blissful' })
    expect(devices).toHaveLength(3)
    for (const d of devices) {
      // Structural guard. A warning string alongside a field named `status`
      // still leaves `status` there to be quoted.
      expect(d).not.toHaveProperty('status')
      expect(d.cachedStatus).toBe('offline')
      expect(d.dataSource).toBe('site-manager-cache')
    }
  })

  it('carries Site Manager\'s own updatedAt as the cache timestamp', () => {
    const { devices, cacheAgeRange } = selectCachedDevices(fleet, { hostName: 'Blissful' })
    expect(devices.every((d) => d.cachedAt === '2026-09-09T12:00:00.000Z')).toBe(true)
    expect(cacheAgeRange.oldest).toBe('2026-09-09T12:00:00.000Z')
    expect(cacheAgeRange.newest).toBe('2026-09-09T12:00:00.000Z')
  })

  it('reports cachedAt null rather than inventing one when the host gave none', () => {
    const noStamp = [entry('AP', 'NoStamp', 'h1', {}, null)]
    const { devices, cacheAgeRange } = selectCachedDevices(noStamp)
    expect(devices[0].cachedAt).toBeNull()
    expect(cacheAgeRange.oldest).toBeNull()
  })

  it('states in the warning that cached status is not live, citing the real case', () => {
    const { warning } = selectCachedDevices(fleet, { hostName: 'Blissful' })
    expect(warning).toBe(CACHED_STATUS_WARNING)
    expect(warning).toMatch(/CACHED, NOT LIVE/)
    expect(warning).toMatch(/Blissful Buds/)
    expect(warning).toMatch(/never state that a device or a customer network is down/i)
  })

  it('points at a live read when the result narrows to one console', () => {
    const one = selectCachedDevices(fleet, { hostName: 'Blissful' })
    expect(one.liveReadHint).toMatch(/live: true/)
    expect(one.liveReadHint).toMatch(/unifi_site_devices/)
    // Across many consoles there is no cheap live read, so no hint is offered.
    expect(selectCachedDevices(fleet, {}).liveReadHint).toBeUndefined()
  })
})

describe('filtering and paging — the unusable-payload defect', () => {
  it('finds the three Blissful Buds devices out of 547 without returning the fleet', () => {
    const r = selectCachedDevices(fleet, { hostName: 'Blissful' })
    expect(r.totalDevicesInCache).toBe(547)
    expect(r.totalMatched).toBe(3)
    expect(r.returned).toBe(3)
    expect(r.hasMore).toBe(false)
  })

  it('caps an unfiltered call at the default page size instead of dumping 547 rows', () => {
    const r = selectCachedDevices(fleet, {})
    expect(r.returned).toBe(DEFAULT_LIMIT)
    expect(r.totalMatched).toBe(547)
    expect(r.hasMore).toBe(true)
  })

  it('clamps limit to MAX_LIMIT and floors it at 1', () => {
    expect(selectCachedDevices(fleet, { limit: 9999 }).returned).toBe(MAX_LIMIT)
    expect(selectCachedDevices(fleet, { limit: 0 }).returned).toBe(1)
    expect(selectCachedDevices(fleet, { limit: -5 }).returned).toBe(1)
  })

  it('pages without skipping or repeating a row', () => {
    const seen = new Set<string>()
    let offset = 0
    for (;;) {
      const page = selectCachedDevices(fleet, { limit: 100, offset })
      for (const d of page.devices) seen.add(d.id)
      if (!page.hasMore) break
      offset += 100
    }
    // Stable ordering is what makes offset paging sound; an unstable sort would
    // lose rows here.
    expect(seen.size).toBe(547)
  })

  it('filters by consoleId, case-insensitively', () => {
    expect(selectCachedDevices(fleet, { consoleId: BLISSFUL }).totalMatched).toBe(3)
    expect(selectCachedDevices(fleet, { consoleId: BLISSFUL.toLowerCase() }).totalMatched).toBe(3)
  })

  it('searches name, model, MAC, IP and console name', () => {
    expect(selectCachedDevices(fleet, { search: 'Under Desk' }).totalMatched).toBe(1)
    expect(selectCachedDevices(fleet, { search: 'USW Flex' }).totalMatched).toBe(1)
    expect(selectCachedDevices(fleet, { search: 'Dream Machine' }).totalMatched).toBe(1)
    expect(selectCachedDevices(fleet, { search: 'blissful' }).totalMatched).toBe(3)
  })

  it('tells a no-such-console filter apart from a console with no devices', () => {
    const missing = selectCachedDevices(fleet, { consoleId: 'not-a-real-console' })
    expect(missing.filterMatchedNoHost).toBe(true)
    expect(missing.devices).toEqual([])
    // The real host names come back, so an identifier mismatch is diagnosable
    // rather than reading as "this customer has no devices".
    expect(missing.availableHosts?.some((h) => h.hostName === 'Blissful Buds')).toBe(true)

    const realButEmpty = selectCachedDevices([], {})
    expect(realButEmpty.filterMatchedNoHost).toBe(false)
    expect(realButEmpty.availableHosts).toBeUndefined()
  })

  it('a search that matches nothing on a real console is not a host miss', () => {
    const r = selectCachedDevices(fleet, { hostName: 'Blissful', search: 'zzzz-nothing' })
    expect(r.filterMatchedNoHost).toBe(false)
    expect(r.totalMatched).toBe(0)
  })

  it('echoes the filter that was applied', () => {
    const r = selectCachedDevices(fleet, { consoleId: BLISSFUL, search: 'AP' })
    expect(r.filter).toEqual({ consoleId: BLISSFUL, hostName: null, search: 'AP' })
  })
})
