import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fake Datto RMM client: the ONLY working surface is getV2 (recorded) +
// isConfigured. Any other method access is recorded as forbidden and throws —
// this is the mechanical proof that the tool set is GET-only by construction
// (the real getV2 can only issue GETs and only against /api/v2/ paths).
// ---------------------------------------------------------------------------

const calledPaths: string[] = []
const forbiddenCalls: string[] = []

const site1 = {
  id: 101,
  uid: 'site-uid-1',
  name: 'Acme Industries',
  description: 'HQ',
  devicesStatus: { numberOfDevices: 2, numberOfOnlineDevices: 1, numberOfOfflineDevices: 1 },
  autotaskCompanyId: '0770',
  autotaskCompanyName: 'Acme Industries Inc',
  proxySettings: { host: 'proxy.acme.local', port: 8080, username: 'svc', password: 'hunter2' },
  portalUrl: 'https://vidal.centrastage.net/site/101',
}

const dev1 = {
  id: 9001,
  uid: 'dev-uid-1',
  hostname: 'ACME-DC01',
  siteId: 101,
  siteUid: 'site-uid-1',
  siteName: 'Acme Industries',
  deviceType: { category: 'Server', type: 'Domain Controller' },
  deviceClass: 'device',
  operatingSystem: 'Microsoft Windows Server 2022',
  intIpAddress: '10.0.0.5',
  extIpAddress: '203.0.113.9',
  online: true,
  lastSeen: '2026-07-17T12:00:00Z',
  udf: { udf1: 'PatchRing=Early', udf2: '', udf3: null },
  patchManagement: { patchStatus: 'FullyPatched', patchesInstalled: 412, patchesApprovedPending: 0, patchesNotApproved: 3 },
  antivirus: { antivirusProduct: 'Datto EDR', antivirusStatus: 'RunningAndUpToDate' },
  portalUrl: 'https://vidal.centrastage.net/device/9001',
  webRemoteUrl: 'https://vidal.centrastage.net/webremote/9001',
}

const alert1 = {
  alertUid: 'alert-1',
  priority: 'High',
  resolved: false,
  muted: false,
  ticketNumber: 'T20260717.0042',
  timestamp: '2026-07-17T11:59:00Z',
  alertMonitorInfo: { sendsEmails: true, createsTicket: true },
  alertContext: { '@class': 'perf_disk_usage_ctx', percentage: 91 },
  alertSourceInfo: { deviceUid: 'dev-uid-1', deviceName: 'ACME-DC01', siteUid: 'site-uid-1', siteName: 'Acme Industries' },
  responseActions: [],
  diagnostics: 'C: 91% used',
}

function respond(path: string): unknown {
  const page = (extra: Record<string, unknown>) => ({ pageDetails: { count: 1, totalCount: 1, prevPageUrl: null, nextPageUrl: null }, ...extra })
  if (path.startsWith('/api/v2/account/sites')) return page({ sites: [site1] })
  if (path.startsWith('/api/v2/account/dnet-site-mappings')) return page({ dnetSiteMappings: [{ uid: 'site-uid-1', dattoNetworkingNetworkIds: [42] }] })
  if (path.startsWith('/api/v2/account/devices')) return page({ devices: [dev1] })
  if (path.startsWith('/api/v2/account/users')) return page({ users: [{ username: 'kflorance', email: 'k@tct.com', disabled: false }] })
  if (path.startsWith('/api/v2/account/components')) return page({ components: [{ uid: 'comp-1', name: 'Disk Cleanup', categoryCode: 'SCRIPT' }] })
  if (path.startsWith('/api/v2/account/variables')) return page({ variables: [{ id: 1, name: 'ApiToken', value: 'topsecret', masked: true }, { id: 2, name: 'Region', value: 'NY', masked: false }] })
  if (path.startsWith('/api/v2/account/alerts/')) return page({ alerts: [alert1] })
  if (path.startsWith('/api/v2/account')) return { id: 1, uid: 'acct-1', name: 'Triple Cities Tech', devicesStatus: { numberOfDevices: 500 } }
  if (path.startsWith('/api/v2/system/')) return { status: 'OK' }
  if (path.includes('/devices/network-interface')) return page({ devices: [{ uid: 'dev-uid-1', hostname: 'ACME-DC01', deviceType: { category: 'Server' }, intIpAddress: '10.0.0.5', nics: [{ instance: 'NIC 1', ipv4: '10.0.0.5', macAddress: '001A2B3C4D5E' }] }] })
  if (path.startsWith('/api/v2/site/site-uid-1/devices')) return page({ devices: [dev1] })
  if (path.startsWith('/api/v2/site/site-uid-1/settings')) return { generalSettings: { name: 'Acme Industries' }, proxySettings: { host: 'proxy.acme.local', password: 'hunter2' }, mailRecipients: [] }
  if (path.startsWith('/api/v2/site/site-uid-1/variables')) return page({ variables: [{ id: 3, name: 'SiteKey', value: 'topsecret', masked: true }] })
  if (path.startsWith('/api/v2/site/site-uid-1/filters')) return page({ filters: [{ id: 7, name: 'Servers', type: 'site' }] })
  if (path.startsWith('/api/v2/site/site-uid-1/alerts/')) return page({ alerts: [alert1] })
  if (path.startsWith('/api/v2/site/site-uid-1')) return site1
  if (path.startsWith('/api/v2/filter/')) return page({ filters: [{ id: 5, name: 'All Servers', type: 'default' }] })
  if (path.startsWith('/api/v2/device/dev-uid-1/alerts/')) return page({ alerts: [alert1] })
  if (path.startsWith('/api/v2/device/macAddress/')) return { devices: [dev1] }
  if (path.startsWith('/api/v2/device/id/')) return dev1
  if (path.startsWith('/api/v2/device/')) return dev1
  if (path.includes('/software')) return page({ software: [{ name: '7-Zip', version: '24.01' }, { name: 'Google Chrome', version: '126' }] })
  if (path.startsWith('/api/v2/audit/')) return { portalUrl: dev1.portalUrl, webRemoteUrl: dev1.webRemoteUrl, systemInfo: { manufacturer: 'Dell', model: 'R750' }, nics: [], logicalDisks: [] }
  if (path.startsWith('/api/v2/activity-logs')) return { pageDetails: { nextPageUrl: 'https://vidal-api.centrastage.net/api/v2/activity-logs?searchAfter=1721217000000&searchAfter=abc' }, activities: [{ id: 'log-1', entity: 'device', category: 'monitor', action: 'alert_created', date: 1721216000000, site: { id: 101, name: 'Acme Industries' }, deviceId: 9001, hostname: 'ACME-DC01', user: { id: 55, userName: 'kflorance' }, details: 'Alert created', hasStdOut: false, hasStdErr: false }] }
  if (path.match(/^\/api\/v2\/job\/[^/]+\/components/)) return page({ jobComponents: [{ uid: 'comp-1', name: 'Disk Cleanup' }] })
  if (path.match(/^\/api\/v2\/job\/[^/]+\/results\/[^/]+\/std(out|err)/)) return { componentUid: 'comp-1', stdData: 'done' }
  if (path.match(/^\/api\/v2\/job\/[^/]+\/results\//)) return { jobUid: 'job-1', deviceUid: 'dev-uid-1', jobDeploymentStatus: 'succeeded', componentResults: [] }
  if (path.startsWith('/api/v2/job/')) return { uid: 'job-1', name: 'Patch run', status: 'completed', dateCreated: '2026-07-16T02:00:00Z' }
  return {}
}

vi.mock('@/lib/datto-rmm', () => {
  class DattoRmmClient {
    constructor() {
      return new Proxy(this, {
        get(_target, prop) {
          if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'then') return undefined
          if (prop === 'isConfigured') return () => true
          if (prop === 'getV2') return (path: string) => { calledPaths.push(path); return Promise.resolve(respond(path)) }
          forbiddenCalls.push(String(prop))
          return () => { throw new Error(`non-getV2 client method used: ${String(prop)}`) }
        },
      })
    }
  }
  return { DattoRmmClient }
})

import { registerDattoRmmTools, drmQuery, toDrmUtc, normalizeMac, redactProxy, redactVariables, compactUdf, buildAlertRow } from './mcp-datto-rmm-tools'

// ---------------------------------------------------------------------------
// Register the tools once against a capturing fake server
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean }
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>
const tools = new Map<string, { meta: { title: string; description: string }; handler: Handler }>()

registerDattoRmmTools({
  registerTool(name: string, meta: { title: string; description: string }, handler: Handler) {
    if (tools.has(name)) throw new Error(`duplicate tool name: ${name}`)
    tools.set(name, { meta, handler })
  },
})

const parse = (r: ToolResult) => JSON.parse(r.content[0].text)

/** Plausible args for every tool so the whole surface can be exercised. */
const INVOCATIONS: Record<string, Record<string, unknown>> = {
  datto_rmm_account: {},
  datto_rmm_list_sites: { includeDnetMappings: true },
  datto_rmm_get_site: { siteUid: 'site-uid-1' },
  datto_rmm_site_devices: { siteUid: 'site-uid-1', includeUdf: true },
  datto_rmm_search_devices: { hostname: 'ACME' },
  datto_rmm_get_device: { deviceUid: 'dev-uid-1' },
  datto_rmm_device_audit: { deviceUid: 'dev-uid-1' },
  datto_rmm_device_software: { deviceUid: 'dev-uid-1', nameContains: 'zip' },
  datto_rmm_site_network_interfaces: { siteUid: 'site-uid-1' },
  datto_rmm_alerts: {},
  datto_rmm_get_alert: { alertUid: 'alert-1' },
  datto_rmm_activity_logs: { from: '2026-07-01', until: '2026-07-16' },
  datto_rmm_job_status: { jobUid: 'job-1', deviceUid: 'dev-uid-1', includeOutput: true },
  datto_rmm_list_components: {},
  datto_rmm_list_filters: { type: 'custom' },
  datto_rmm_list_users: {},
  datto_rmm_variables: { scope: 'site', siteUid: 'site-uid-1' },
}

beforeEach(() => { calledPaths.length = 0; forbiddenCalls.length = 0 })

describe('registration', () => {
  it('registers every expected tool, all datto_rmm_-prefixed', () => {
    expect(Array.from(tools.keys()).sort()).toEqual(Object.keys(INVOCATIONS).sort())
    for (const name of tools.keys()) expect(name).toMatch(/^datto_rmm_[a-z_]+$/)
  })

  it('every tool description declares read-only', () => {
    for (const [, { meta }] of tools) expect(meta.description.toLowerCase()).toContain('read-only')
  })
})

describe('GET-only by construction', () => {
  it('exercising EVERY tool touches only getV2, only /api/v2/ paths, and none error', async () => {
    for (const [name, args] of Object.entries(INVOCATIONS)) {
      const tool = tools.get(name)
      expect(tool, `tool ${name} missing`).toBeDefined()
      const res = await tool!.handler(args)
      expect(res.isError, `${name} errored: ${res.content?.[0]?.text}`).toBeFalsy()
    }
    expect(forbiddenCalls).toEqual([])
    expect(calledPaths.length).toBeGreaterThan(0)
    for (const p of calledPaths) expect(p).toMatch(/^\/api\/v2\//)
  })

  it('the REAL client getV2 rejects non-/api/v2/ paths before any network call', async () => {
    const actual = await vi.importActual<typeof import('./datto-rmm')>('./datto-rmm')
    const client = new actual.DattoRmmClient()
    await expect(client.getV2('/api/v3/api-docs')).rejects.toThrow(/\/api\/v2\//)
    await expect(client.getV2('auth/oauth/token')).rejects.toThrow(/\/api\/v2\//)
  })
})

describe('console deep links (from the API\'s own portalUrl fields)', () => {
  it('site rows carry consoleUrl', async () => {
    const out = parse(await tools.get('datto_rmm_list_sites')!.handler({}))
    expect(out.sites[0].consoleUrl).toBe(site1.portalUrl)
  })

  it('device rows carry consoleUrl + webRemoteUrl and the envelope carries the site link', async () => {
    const out = parse(await tools.get('datto_rmm_site_devices')!.handler({ siteUid: 'site-uid-1' }))
    expect(out.site.consoleUrl).toBe(site1.portalUrl)
    expect(out.devices[0].consoleUrl).toBe(dev1.portalUrl)
    expect(out.devices[0].webRemoteUrl).toBe(dev1.webRemoteUrl)
  })

  it('alert rows carry BOTH referenced-device and referenced-site console links', async () => {
    const out = parse(await tools.get('datto_rmm_alerts')!.handler({}))
    expect(out.alerts[0].device.consoleUrl).toBe(dev1.portalUrl)
    expect(out.alerts[0].site.consoleUrl).toBe(site1.portalUrl)
  })

  it('activity-log rows carry the referenced site console link', async () => {
    const out = parse(await tools.get('datto_rmm_activity_logs')!.handler({ from: '2026-07-01' }))
    expect(out.activities[0].site.consoleUrl).toBe(site1.portalUrl)
    expect(out.nextSearchAfter).toEqual(['1721217000000', 'abc'])
  })
})

describe('secret redaction', () => {
  it('site proxy passwords never leave the tool', async () => {
    const res = await tools.get('datto_rmm_get_site')!.handler({ siteUid: 'site-uid-1' })
    const text = res.content[0].text
    expect(text).not.toContain('hunter2')
    expect(text).toContain('[REDACTED]')
  })

  it('masked variables always come back [MASKED]', async () => {
    for (const args of [{ scope: 'site', siteUid: 'site-uid-1' }, {}]) {
      const res = await tools.get('datto_rmm_variables')!.handler(args)
      const text = res.content[0].text
      expect(text).not.toContain('topsecret')
      expect(text).toContain('[MASKED]')
    }
  })
})

describe('input guards', () => {
  it('get_device demands exactly one identifier', async () => {
    const res = await tools.get('datto_rmm_get_device')!.handler({})
    expect(res.isError).toBe(true)
    const res2 = await tools.get('datto_rmm_get_device')!.handler({ deviceUid: 'a', deviceId: 1 })
    expect(res2.isError).toBe(true)
  })

  it('site-scoped tools demand their siteUid', async () => {
    expect((await tools.get('datto_rmm_alerts')!.handler({ scope: 'site' })).isError).toBe(true)
    expect((await tools.get('datto_rmm_variables')!.handler({ scope: 'site' })).isError).toBe(true)
    expect((await tools.get('datto_rmm_list_filters')!.handler({ type: 'site' })).isError).toBe(true)
  })
})

describe('pure helpers', () => {
  it('drmQuery skips empties and CSV-joins arrays', () => {
    expect(drmQuery({ a: 1, b: undefined, c: null, d: ['x', 'y'], e: false, f: [] })).toBe('?a=1&d=x%2Cy&e=false')
    expect(drmQuery({})).toBe('')
  })

  it('toDrmUtc handles bare dates, end-of-day, ISO datetimes, and rejects junk', () => {
    expect(toDrmUtc('2026-07-01')).toBe('2026-07-01T00:00:00Z')
    expect(toDrmUtc('2026-07-01', true)).toBe('2026-07-01T23:59:59Z')
    expect(toDrmUtc('2026-07-01T15:30:00Z')).toBe('2026-07-01T15:30:00Z')
    expect(() => toDrmUtc('yesterday')).toThrow(/Invalid date/)
  })

  it('normalizeMac accepts any separator format and rejects bad lengths', () => {
    expect(normalizeMac('00:1a:2b:3c:4d:5e')).toBe('001A2B3C4D5E')
    expect(normalizeMac('00-1A-2B-3C-4D-5E')).toBe('001A2B3C4D5E')
    expect(() => normalizeMac('001A2B')).toThrow(/Invalid MAC/)
  })

  it('redactProxy replaces only the password', () => {
    const r = redactProxy({ proxySettings: { host: 'h', username: 'u', password: 'pw' } })
    expect(r.proxySettings).toEqual({ host: 'h', username: 'u', password: '[REDACTED]' })
    expect(redactProxy({ proxySettings: null }).proxySettings).toBeNull()
    expect(redactProxy({}).proxySettings).toBeUndefined()
  })

  it('redactVariables masks masked values only', () => {
    const out = redactVariables([{ id: 1, name: 'a', value: 's3cr3t', masked: true }, { id: 2, name: 'b', value: 'plain', masked: false }])
    expect(out[0].value).toBe('[MASKED]')
    expect(out[1].value).toBe('plain')
  })

  it('compactUdf drops empty slots', () => {
    expect(compactUdf({ udf1: 'x', udf2: '', udf3: null, udf4: '  ' })).toEqual({ udf1: 'x' })
    expect(compactUdf(null)).toEqual({})
  })

  it('buildAlertRow resolves links from the provided maps and tolerates missing source info', () => {
    const links = { siteUrlByUid: new Map([['site-uid-1', 'S']]), deviceUrlByUid: new Map([['dev-uid-1', 'D']]) }
    const row = buildAlertRow(alert1, links)
    expect(row.site.consoleUrl).toBe('S')
    expect(row.device.consoleUrl).toBe('D')
    expect(row.type).toBe('perf_disk_usage_ctx')
    expect('diagnostics' in row).toBe(false)
    const bare = buildAlertRow({ alertUid: 'x' }, { siteUrlByUid: new Map(), deviceUrlByUid: new Map() })
    expect(bare.site.consoleUrl).toBeNull()
    expect(bare.device.consoleUrl).toBeNull()
    expect(bare.type).toBe('unknown')
  })
})
