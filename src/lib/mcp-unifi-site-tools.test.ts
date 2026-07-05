import { describe, expect, it, vi } from 'vitest'

// The tools module pulls in the staged-write DB half → mock prisma so
// importing it never needs a database.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { matchUnifiConsoles, registerUnifiSiteTools } from './mcp-unifi-site-tools'
import type { UnifiConsoleInfo } from './ubiquiti-proxy'

const consoles: UnifiConsoleInfo[] = [
  { consoleId: 'c-ezred', name: 'EZ Red - New York', ipAddress: null, isOnlineInSiteManager: true },
  { consoleId: 'c-ezred2', name: 'EZ Red - Binghamton', ipAddress: null, isOnlineInSiteManager: true },
  { consoleId: 'c-mont', name: 'XNG - Montrose', ipAddress: null, isOnlineInSiteManager: true },
  { consoleId: 'c-vestal', name: 'Vestal Dental', ipAddress: null, isOnlineInSiteManager: null },
]

describe('matchUnifiConsoles — never guesses', () => {
  it('resolves an exact name', () => {
    const { best } = matchUnifiConsoles('XNG - Montrose', consoles)
    expect(best?.consoleId).toBe('c-mont')
  })

  it('resolves an unambiguous substring', () => {
    const { best } = matchUnifiConsoles('montrose', consoles)
    expect(best?.consoleId).toBe('c-mont')
  })

  it('returns candidates, not a guess, when several consoles match', () => {
    const { best, candidates } = matchUnifiConsoles('EZ Red', consoles)
    expect(best).toBeNull()
    expect(candidates.map((c) => c.consoleId).sort()).toEqual(['c-ezred', 'c-ezred2'])
  })

  it('treats word-overlap-only hits as candidates even when there is exactly one', () => {
    // "dental office vestal" hits 'Vestal Dental' on words only — the site
    // could as easily be a different dental customer, so it must not auto-pick.
    const { best, candidates } = matchUnifiConsoles('dental office vestal', consoles)
    expect(best).toBeNull()
    expect(candidates.map((c) => c.consoleId)).toContain('c-vestal')
  })

  it('is punctuation/case-insensitive', () => {
    const { best } = matchUnifiConsoles('xng   MONTROSE!', consoles)
    expect(best?.consoleId).toBe('c-mont')
  })

  it('handles no match and empty query', () => {
    expect(matchUnifiConsoles('completely unknown site', consoles).best).toBeNull()
    expect(matchUnifiConsoles('', consoles)).toEqual({ best: null, candidates: [] })
  })
})

// ---------------------------------------------------------------------------
// Structural single-target guardrail: no tool schema may accept an array
// anywhere, and every write tool takes exactly one consoleId + one siteId.
// This test pins the BUSINESS RULE — one site at a time through the MCP;
// mass changes happen in unifi.ui.com, done by a human.
// ---------------------------------------------------------------------------

interface Registered {
  name: string
  description: string
  schema: Record<string, unknown>
}

function registerAll(): Registered[] {
  const tools: Registered[] = []
  const fakeServer = {
    registerTool(name: string, meta: { description: string; inputSchema: Record<string, unknown> }) {
      tools.push({ name, description: meta.description, schema: meta.inputSchema ?? {} })
    },
  }
  registerUnifiSiteTools(fakeServer)
  return tools
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(t: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = t
  while (cur?._def && ['ZodOptional', 'ZodDefault', 'ZodNullable'].includes(cur._def.typeName)) {
    cur = cur._def.innerType
  }
  return cur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const typeNameOf = (t: any): string => unwrap(t)?._def?.typeName ?? 'unknown'

const WRITE_TOOLS = [
  'unifi_restart_device',
  'unifi_power_cycle_port',
  'unifi_authorize_guest',
  'unifi_unauthorize_guest',
  'unifi_create_hotspot_voucher',
  'unifi_delete_hotspot_voucher',
  'unifi_stage_config_write',
]

describe('single-target schema constraint (structural guardrail)', () => {
  const tools = registerAll()

  it('registers every expected write tool', () => {
    const names = tools.map((t) => t.name)
    for (const w of WRITE_TOOLS) expect(names).toContain(w)
  })

  it('no tool schema accepts an array parameter — the mass-change vector is unrepresentable', () => {
    for (const tool of tools) {
      for (const [field, schema] of Object.entries(tool.schema)) {
        expect(typeNameOf(schema), `${tool.name}.${field} must not be an array`).not.toBe('ZodArray')
      }
    }
  })

  it('every write tool takes exactly one consoleId and one siteId, both plain strings', () => {
    for (const name of WRITE_TOOLS) {
      const tool = tools.find((t) => t.name === name)!
      expect(typeNameOf(tool.schema.consoleId), `${name}.consoleId`).toBe('ZodString')
      expect(typeNameOf(tool.schema.siteId), `${name}.siteId`).toBe('ZodString')
    }
  })

  it('no tool schema has a plural-target field', () => {
    const forbidden = ['consoleIds', 'siteIds', 'deviceIds', 'clientIds', 'targetIds', 'voucherIds', 'macAddresses', 'policyIds']
    for (const tool of tools) {
      for (const field of Object.keys(tool.schema)) {
        expect(forbidden, `${tool.name}.${field}`).not.toContain(field)
      }
    }
  })

  it('single-target id fields on tier-1 writes are plain strings (one device, one client, one voucher)', () => {
    const idFields: Record<string, string> = {
      unifi_restart_device: 'deviceId',
      unifi_power_cycle_port: 'deviceId',
      unifi_authorize_guest: 'clientId',
      unifi_unauthorize_guest: 'clientId',
      unifi_delete_hotspot_voucher: 'voucherId',
    }
    for (const [name, field] of Object.entries(idFields)) {
      const tool = tools.find((t) => t.name === name)!
      expect(typeNameOf(tool.schema[field]), `${name}.${field}`).toBe('ZodString')
    }
  })

  it('voucher creation is capped, not unbounded', () => {
    const tool = tools.find((t) => t.name === 'unifi_create_hotspot_voucher')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = unwrap(tool.schema.count as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxCheck = count?._def?.checks?.find((c: any) => c.kind === 'max')
    expect(maxCheck?.value).toBe(10)
  })

  it('does not re-register or shadow the five existing aggregate UniFi tools', () => {
    const names = tools.map((t) => t.name)
    for (const existing of ['unifi_list_sites', 'unifi_list_hosts', 'unifi_list_devices', 'unifi_summary', 'unifi_site_networks']) {
      expect(names).not.toContain(existing)
    }
  })
})
