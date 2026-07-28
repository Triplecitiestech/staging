// src/lib/connector/capability-registry.test.ts
//
// Drift guard for tct_connector_capabilities.
//
// The whole point of the capability tool is that it cannot lie about what is
// registered. Two failure modes would break that promise:
//   1. The recorder stops seeing registrations (report goes stale/empty).
//   2. TOOL_FACTS falls behind the registry, so new tools report a DEFAULT risk
//      class ('read') that nobody actually reviewed — the dangerous case, since
//      a write could be advertised as a read.
// Both are caught here. Adding a tool without classifying it fails the build.

import { describe, it, expect } from 'vitest'
import {
  recordingServer,
  buildCapabilityReport,
  TOOL_FACTS,
  vendorOf,
  type RecordedTool,
  type ToolRegisteringServer,
} from './capability-registry'
import { KNOWN_LIMITS, type ReasonCode } from './known-limits'
import { z } from 'zod'

/** Minimal stand-in for the MCP server: records nothing itself. */
function fakeServer(): ToolRegisteringServer & { names: string[] } {
  const names: string[] = []
  return {
    names,
    registerTool(name: string) {
      names.push(name)
      return undefined
    },
  }
}

/**
 * Register the connector's real tool modules against a recording proxy. This is
 * the same code path the live route uses, so the recorded list here is the
 * production surface (minus the 28 tools registered inline in the route file,
 * which cannot be imported without the route's module graph).
 */
async function recordRealModules(): Promise<RecordedTool[]> {
  const { server, recorded } = recordingServer(fakeServer())
  const [configRead, configWrite, write, itglue, unifi, hr, datto, salesPricing] = await Promise.all([
    import('@/lib/mcp-config-read-tools'),
    import('@/lib/mcp-config-write-tools'),
    import('@/lib/mcp-write-tools'),
    import('@/lib/mcp-itglue-tools'),
    import('@/lib/mcp-unifi-site-tools'),
    import('@/lib/mcp-hr-tools'),
    import('@/lib/mcp-datto-rmm-tools'),
    import('@/lib/mcp-sales-pricing-tools'),
  ])
  configRead.registerConfigReadTools(server)
  configWrite.registerConfigWriteTools(server)
  write.registerWriteTools(server)
  itglue.registerItGlueTools(server)
  unifi.registerUnifiSiteTools(server)
  hr.registerHrTools(server)
  datto.registerDattoRmmTools(server)
  salesPricing.registerSalesPricingTools(server)
  return recorded
}

describe('recordingServer', () => {
  it('records name, description and params, and still forwards registration', () => {
    const target = fakeServer()
    const { server, recorded } = recordingServer(target)

    server.registerTool(
      'demo_tool',
      {
        title: 'Demo',
        description: 'A demo tool.',
        inputSchema: {
          siteId: z.string().describe('the site'),
          verbose: z.boolean().optional().describe('chatty'),
        },
      },
      async () => undefined
    )

    // Forwarded to the real server — the proxy observes, it does not intercept.
    expect(target.names).toEqual(['demo_tool'])

    expect(recorded).toHaveLength(1)
    expect(recorded[0].name).toBe('demo_tool')
    expect(recorded[0].params).toEqual([
      { name: 'siteId', required: true, type: 'string', description: 'the site', enumValues: undefined },
      { name: 'verbose', required: false, type: 'boolean', description: 'chatty', enumValues: undefined },
    ])
  })

  it('records a tool with no inputSchema without throwing', () => {
    const { server, recorded } = recordingServer(fakeServer())
    server.registerTool('no_args', { description: 'x', inputSchema: {} }, async () => undefined)
    expect(recorded[0].params).toEqual([])
  })

  it('never lets a malformed schema break registration', () => {
    const target = fakeServer()
    const { server, recorded } = recordingServer(target)
    // A getter that throws is the pathological case: registration must survive.
    const hostile = { get isOptional() { throw new Error('boom') } }
    server.registerTool('hostile', { description: 'x', inputSchema: { bad: hostile } }, async () => undefined)
    expect(target.names).toEqual(['hostile'])
    expect(recorded).toHaveLength(1)
  })

  it('passes through non-registerTool members of the wrapped server', () => {
    const target = Object.assign(fakeServer(), { somethingElse: () => 'kept' })
    const { server } = recordingServer(target)
    expect((server as unknown as { somethingElse: () => string }).somethingElse()).toBe('kept')
  })
})

describe('buildCapabilityReport is generated from the live registry', () => {
  it('reflects a tool added at registration time — including one it has never seen before', async () => {
    const { server, recorded } = recordingServer(fakeServer())
    server.registerTool('itglue_publish_document', { title: 'p', description: 'WRITE.', inputSchema: {} }, async () => undefined)

    const before = buildCapabilityReport(recorded)
    expect(before.summary.totalTools).toBe(1)
    expect(before.tools.map((t) => t.name)).not.toContain('throwaway_probe_tool')

    // The proof the owner asked for, as a permanent test rather than a manual
    // deploy-and-remove dance: a brand-new tool appears in the report purely by
    // being registered, and is flagged `unclassified` because it has no
    // reviewed TOOL_FACTS entry — so an unvetted tool can never masquerade as
    // a reviewed read.
    server.registerTool('throwaway_probe_tool', { title: 't', description: 'probe', inputSchema: {} }, async () => undefined)
    const after = buildCapabilityReport(recorded)
    expect(after.summary.totalTools).toBe(2)
    const probe = after.tools.find((t) => t.name === 'throwaway_probe_tool')
    expect(probe?.unclassified).toBe(true)
  })

  it('reports counts, risk classes and the staged-gate flag from TOOL_FACTS', async () => {
    const recorded = await recordRealModules()
    const report = buildCapabilityReport(recorded)

    expect(report.summary.totalTools).toBe(recorded.length)
    expect(report.summary.reads + report.summary.writes).toBe(recorded.length)
    expect(report.summary.stagedApprovalRequired).toBeGreaterThan(0)

    const exec = report.tools.find((t) => t.name === 'autotask_execute_staged_write')
    expect(exec?.stagedApprovalRequired).toBe(true)
    expect(exec?.risk).toBe('destructive')
    expect(exec?.access).toBe('write')

    // A read must never be advertised as anything else.
    const read = report.tools.find((t) => t.name === 'autotask_entity_capabilities')
    expect(read?.access).toBe('read')
    expect(read?.stagedApprovalRequired).toBe(false)
  })

  it('filters by vendor', async () => {
    const recorded = await recordRealModules()
    const report = buildCapabilityReport(recorded, { vendor: 'itglue' })
    expect(report.tools.length).toBeGreaterThan(0)
    expect(report.tools.every((t) => t.name.startsWith('itglue_'))).toBe(true)
  })

  it('returns the vendor\'s KNOWN LIMITS when filtered by tool-name prefix, not an empty object', async () => {
    const recorded = await recordRealModules()
    // Regression: 'IT Glue'.toLowerCase() does not contain 'itglue', so the
    // limits section came back {} — reading as "no known limitations" for the
    // one vendor with the most stale-belief history. squash() fixes it.
    for (const [filter, expectVendor] of [
      ['itglue', 'IT Glue'],
      ['autotask', 'Autotask PSA (Kaseya)'],
      ['datto', 'Datto RMM'],
      ['unifi', 'UniFi / Ubiquiti'],
    ] as const) {
      const report = buildCapabilityReport(recorded, { vendor: filter })
      expect(Object.keys(report.knownLimits), `vendor=${filter}`).toContain(expectVendor)
      expect(report.knownLimits[expectVendor].length).toBeGreaterThan(0)
      expect(report.knownLimitsNote).toBeUndefined()
    }
  })

  it('says so explicitly when a vendor filter matches no limits section', async () => {
    const recorded = await recordRealModules()
    const report = buildCapabilityReport(recorded, { vendor: 'hr' })
    if (Object.keys(report.knownLimits).length === 0) {
      expect(report.knownLimitsNote).toMatch(/NOT the same as "no limitations"/)
    }
  })

  it('drops params when includeParams is false', async () => {
    const recorded = await recordRealModules()
    const report = buildCapabilityReport(recorded, { includeParams: false })
    expect(report.tools.every((t) => t.requiredParams.length === 0 && t.optionalParams.length === 0)).toBe(true)
  })

  it('tells the caller not to treat a thin search as proof of absence', () => {
    const report = buildCapabilityReport([])
    expect(report.usageNote).toMatch(/UNKNOWN/)
    expect(report.generatedFrom).toMatch(/LIVE MCP tool registry/)
  })
})

describe('TOOL_FACTS completeness (the drift guard)', () => {
  it('classifies every tool the real modules register', async () => {
    const recorded = await recordRealModules()
    const missing = recorded.map((t) => t.name).filter((n) => !TOOL_FACTS[n])
    expect(
      missing,
      `These registered tools have no TOOL_FACTS entry, so tct_connector_capabilities would report an UNREVIEWED default risk class for them. Add each to TOOL_FACTS in capability-registry.ts with its real access/risk/staged values: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('has no stale TOOL_FACTS entries for tools that no longer exist', async () => {
    const recorded = await recordRealModules()
    const live = new Set(recorded.map((t) => t.name))
    // Tools registered inline in the route file cannot be imported here, so
    // they are allowlisted by prefix rather than checked by name.
    const ROUTE_INLINE = /^(unifi_(list_sites|list_hosts|list_devices|summary|site_networks)|autotask_(search_companies|get_company|company_projects|company_tickets|get_ticket|get_ticket_by_number|ticket_notes|ticket_time_entries|time_entries_search|active_projects|list_roles|company_contacts|get_contact|list_priorities|list_ticket_types|search_tickets|list_slas|ticket_sla_results|list_companies|list_contracts|list_resources|search_time_entries|survey_results)|tct_connector_capabilities)$/
    const stale = Object.keys(TOOL_FACTS).filter((n) => !live.has(n) && !ROUTE_INLINE.test(n))
    expect(stale, `TOOL_FACTS describes tools that are not registered anywhere: ${stale.join(', ')}`).toEqual([])
  })

  it('marks every write tool with a risk class that is not "read"', async () => {
    const recorded = await recordRealModules()
    const wrong = recorded
      .map((t) => ({ name: t.name, facts: TOOL_FACTS[t.name] }))
      .filter(({ facts }) => facts?.access === 'write' && facts.risk === 'read')
      .map(({ name }) => name)
    expect(wrong, `Write tools cannot carry risk 'read': ${wrong.join(', ')}`).toEqual([])
  })

  it('gives every kill-switched tool a real env var name', async () => {
    const KNOWN = new Set([
      'CONNECTOR_CONFIG_WRITES_ENABLED',
      'CONNECTOR_UNIFI_WRITES_ENABLED',
      'CONNECTOR_HR_WRITES_ENABLED',
    ])
    const bad = Object.entries(TOOL_FACTS)
      .filter(([, f]) => f.killSwitch && !KNOWN.has(f.killSwitch))
      .map(([n, f]) => `${n} -> ${f.killSwitch}`)
    expect(bad).toEqual([])
  })
})

describe('vendorOf', () => {
  it('maps tool-name prefixes to vendors, with datto_rmm before the bare prefix', () => {
    expect(vendorOf('datto_rmm_alerts')).toMatch(/Datto RMM/)
    expect(vendorOf('autotask_get_ticket')).toMatch(/Autotask/)
    expect(vendorOf('itglue_publish_document')).toMatch(/IT Glue/)
    expect(vendorOf('unifi_site_devices')).toMatch(/UniFi/)
    expect(vendorOf('hr_er_log_append')).toMatch(/SharePoint/)
    expect(vendorOf('tct_connector_capabilities')).toMatch(/meta/)
    expect(vendorOf('mystery_tool')).toBe('unclassified')
  })

  it('leaves no registered tool unclassified', async () => {
    const recorded = await recordRealModules()
    const unclassified = recorded.map((t) => t.name).filter((n) => vendorOf(n) === 'unclassified')
    expect(unclassified, `Add a prefix to VENDORS for: ${unclassified.join(', ')}`).toEqual([])
  })
})

describe('KNOWN_LIMITS', () => {
  const VALID: ReasonCode[] = ['NOT_BUILT', 'VENDOR_NO_API', 'BLOCKED', 'POLICY_GATED']

  it('gives every limit a valid reason code and a non-empty verifiedBy', () => {
    for (const [vendor, limits] of Object.entries(KNOWN_LIMITS)) {
      expect(limits.length, `${vendor} has no limits listed`).toBeGreaterThan(0)
      for (const l of limits) {
        expect(VALID, `${vendor} / ${l.capability}: bad reason code ${l.reason}`).toContain(l.reason)
        // An unsourced claim is the stale-belief bug this feature exists to fix.
        expect(l.verifiedBy?.trim().length, `${vendor} / ${l.capability}: verifiedBy is empty`).toBeGreaterThan(20)
      }
    }
  })

  it('gives every BLOCKED limit a failure mode', () => {
    for (const [vendor, limits] of Object.entries(KNOWN_LIMITS)) {
      for (const l of limits.filter((x) => x.reason === 'BLOCKED')) {
        expect(l.failureMode?.trim().length, `${vendor} / ${l.capability}: BLOCKED with no failureMode`).toBeGreaterThan(10)
      }
    }
  })

  it('gives every NOT_BUILT limit a priority so "not yet" is actionable', () => {
    for (const [vendor, limits] of Object.entries(KNOWN_LIMITS)) {
      for (const l of limits.filter((x) => x.reason === 'NOT_BUILT')) {
        expect(['high', 'medium', 'low'], `${vendor} / ${l.capability}: NOT_BUILT with no priority`).toContain(l.priority)
      }
    }
  })

  it('records the vendors that are not connected at all', () => {
    const section = KNOWN_LIMITS['Not connected at all (client exists in the app, no MCP tools)']
    expect(section).toBeDefined()
    const caps = section.map((l) => l.capability).join(' ')
    expect(caps).toMatch(/RocketCyber/)
    expect(caps).toMatch(/Datto EDR/)
  })
})
