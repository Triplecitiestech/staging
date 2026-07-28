// src/lib/mcp-sales-pricing-tools.test.ts
//
// Locks the read-only sales-pricing connector tools:
//   1. the surface stays READ-ONLY (two tools, no write/stage/execute),
//   2. the quote tool reproduces a real generated comparison to the dollar,
//   3. live pricing overrides are applied AND never leak between calls.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The tools read the overrides row through @/lib/db-pool. Mocked so no test
// ever opens a socket; each test sets what the query returns.
const query = vi.fn()
vi.mock('@/lib/db-pool', () => ({ getPool: () => ({ query }) }))

import { registerSalesPricingTools, buildQuoteInput } from './mcp-sales-pricing-tools'
import { buildAllQuotes } from './sales-calculator/calc'
import { pricingSingletonIsPristine, withEffectivePricing } from './sales-calculator/pricing-source'

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>

function harness() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>()
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any, handler: Handler) {
      tools.set(name, { config, handler })
    },
  }
  registerSalesPricingTools(server)
  return {
    names: [...tools.keys()],
    config: (n: string) => tools.get(n)!.config,
    async call(n: string, args: Record<string, unknown> = {}) {
      const res = await tools.get(n)!.handler(args)
      expect(res.isError, `${n} returned an error: ${res.content[0]?.text}`).toBeFalsy()
      return JSON.parse(res.content[0].text)
    },
  }
}

const TABLE_MISSING = Object.assign(new Error('relation does not exist'), { code: '42P01' })

beforeEach(() => {
  query.mockReset()
  // Default: table not migrated → shipped pricing.json defaults.
  query.mockRejectedValue(TABLE_MISSING)
})

// ---------------------------------------------------------------------------
// Read-only surface
// ---------------------------------------------------------------------------

describe('sales pricing connector surface is read-only', () => {
  it('registers exactly the two read tools', () => {
    expect(harness().names).toEqual(['sales_pricing_catalog', 'sales_pricing_quote'])
  })

  it('exposes no write, stage, execute or save verb', () => {
    const h = harness()
    for (const name of h.names) {
      expect(name).not.toMatch(/write|stage|execute|create|update|delete|save|set_/)
      const desc = String(h.config(name).description)
      expect(desc).toMatch(/READ-ONLY|read-only/)
    }
  })

  it('labels every response as internal (costs and margins are in it)', async () => {
    const h = harness()
    for (const name of h.names) {
      const out = await h.call(name, { standardUsers: 10, windowsPCs: 10 })
      expect(out.internalOnly).toMatch(/INTERNAL/)
    }
  })
})

// ---------------------------------------------------------------------------
// Acceptance lock: Wilmar + EZ Red comparison, generated 2026-07-28
// ---------------------------------------------------------------------------
//
// Stated inputs: Manufacturing, 3 locations, 133 users, 132 Windows PCs.
// Those alone do NOT reach the published totals — the quote also carried
// 6 servers and $350/mo of package-independent add-on lines. The server count
// is forced by the numbers (only the per-server rate differs between
// Comprehensive/Complete at $115 and the rest at $100, and the gap between the
// two published groups is exactly 6 × $15); the $350 is additive and therefore
// under-determined, which the last case here demonstrates rather than hides.

const WILMAR = { standardUsers: 133, windowsPCs: 132, locations: 3, serverCount: 6, industry: 'Manufacturing' }

const PUBLISHED: Record<string, { monthly: number; annual: number }> = {
  basic: { monthly: 10525, annual: 126300 },
  standard: { monthly: 10675, annual: 128100 },
  comprehensive: { monthly: 16995, annual: 203940 },
  complete: { monthly: 21940, annual: 263280 },
  comanaged: { monthly: 12250, annual: 147000 },
}

function totals(args: Record<string, unknown>) {
  const quotes = buildAllQuotes(buildQuoteInput(args as never))
  return Object.fromEntries(quotes.map((q) => [q.packageId, { monthly: q.monthlyPrice, annual: q.annualPrice }]))
}

describe('Wilmar + EZ Red comparison (2026-07-28)', () => {
  it('prices the stated inputs from the tier rates alone — published totals minus the $350 add-on residual', () => {
    // No guessing in this case: it locks every per-user, per-device, per-site
    // and per-server rate plus the Business Line charge against real output.
    expect(totals(WILMAR)).toEqual({
      basic: { monthly: 10175, annual: 122100 },
      standard: { monthly: 10325, annual: 123900 },
      comprehensive: { monthly: 16645, annual: 199740 },
      complete: { monthly: 21590, annual: 259080 },
      comanaged: { monthly: 11900, annual: 142800 },
    })
  })

  it('matches the published comparison to the dollar with the $350 residual', () => {
    expect(totals({ ...WILMAR, sharedMailboxes: 70 })).toEqual(PUBLISHED)
  })

  it('reaches the same published totals from a different $350 mix — the residual is additive, not a hidden rate', () => {
    // 2 internal-IT admin seats ($150 each, on Ally AND as co-managed tool
    // access on the fully-managed tiers) + 10 shared mailboxes = the same $350.
    expect(
      totals({ ...WILMAR, itStaffCount: 2, internalItWantsToolAccess: true, sharedMailboxes: 10 })
    ).toEqual(PUBLISHED)
  })

  it('returns the published figures through the TOOL, per tier, with Ally named verbatim', async () => {
    const out = await harness().call('sales_pricing_quote', { ...WILMAR, sharedMailboxes: 70 })
    const byId = Object.fromEntries(out.tiers.map((t: { id: string }) => [t.id, t]))
    expect(byId.basic.monthlyPrice).toBe(10525)
    expect(byId.basic.annualPrice).toBe(126300)
    expect(byId.comanaged.name).toBe('TCT Ally (Co-Managed)')
    expect(byId.comanaged.monthlyPrice).toBe(12250)
    expect(byId.comanaged.annualPrice).toBe(147000)
    expect(byId.complete.monthlyPrice).toBe(21940)
    // M365 is a separate total, never folded into the managed figure.
    expect(byId.complete.microsoft365.billedSeparately).toBe(true)
    expect(byId.complete.monthlyPrice).not.toBe(byId.complete.monthlyPrice + byId.complete.microsoft365.monthlyPrice)
  })
})

// ---------------------------------------------------------------------------
// Input mapping
// ---------------------------------------------------------------------------

describe('buildQuoteInput', () => {
  it('maps counts straight through and defaults locations/domains to 1', () => {
    const input = buildQuoteInput({ standardUsers: 133, windowsPCs: 132 })
    expect(input.users.standard).toBe(133)
    expect(input.devices.windowsPCs).toBe(132)
    expect(input.company.locations).toBe(1)
    expect(input.company.domains).toBe(1)
    expect(input.servers).toEqual([])
  })

  it('counts Azure VMs as servers and splits the combined provisioned TB across them', () => {
    const input = buildQuoteInput({ standardUsers: 10, windowsPCs: 10, serverCount: 2, azureVmCount: 4, azureProvisionedTB: 3 })
    expect(input.servers).toHaveLength(6)
    const azure = input.servers.filter((s) => s.type === 'Azure VM')
    expect(azure).toHaveLength(4)
    expect(azure.reduce((a, s) => a + s.provisionedTB, 0)).toBeCloseTo(3, 6)
  })

  it('infers hasInternalIT from a staff count', () => {
    expect(buildQuoteInput({ standardUsers: 1, windowsPCs: 1, itStaffCount: 3 }).internalIT.hasInternalIT).toBe(true)
    expect(buildQuoteInput({ standardUsers: 1, windowsPCs: 1 }).internalIT.hasInternalIT).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

describe('live pricing overrides', () => {
  it('applies an override and leaves the shared pricing singleton pristine afterwards', () => {
    expect(pricingSingletonIsPristine()).toBe(true)

    const base = buildAllQuotes(buildQuoteInput({ standardUsers: 100, windowsPCs: 0, locations: 0 }))
    const { value: bumped } = withEffectivePricing({ 'packages.basic.perUser.price': 50 }, () =>
      buildAllQuotes(buildQuoteInput({ standardUsers: 100, windowsPCs: 0, locations: 0 }))
    )

    expect(base.find((q) => q.packageId === 'basic')!.monthlyPrice).toBe(3500)
    expect(bumped.find((q) => q.packageId === 'basic')!.monthlyPrice).toBe(5000)
    // The critical section must not leak into the next caller's quote.
    expect(pricingSingletonIsPristine()).toBe(true)
    expect(buildAllQuotes(buildQuoteInput({ standardUsers: 100, windowsPCs: 0, locations: 0 }))
      .find((q) => q.packageId === 'basic')!.monthlyPrice).toBe(3500)
  })

  it('quotes at the overridden rate and reports the override provenance', async () => {
    query.mockResolvedValue({
      rows: [{
        overrides: { 'packages.basic.perUser.price': 45 },
        note: 'Q3 uplift', updated_by: 'kurtis@triplecitiestech.com', created_at: '2026-07-27T00:00:00.000Z',
      }],
    })
    const out = await harness().call('sales_pricing_quote', { standardUsers: 100, windowsPCs: 0, locations: 0, packageId: 'basic' })
    expect(out.tiers[0].monthlyPrice).toBe(4500)
    expect(out.pricingSource.overridesApplied).toBe(1)
    expect(out.pricingSource.overridesUpdatedBy).toBe('kurtis@triplecitiestech.com')
    expect(out.pricingSource.overridesUnavailable).toBeUndefined()
    expect(pricingSingletonIsPristine()).toBe(true)
  })

  it('says so loudly when the overrides row cannot be read, instead of quietly quoting defaults', async () => {
    query.mockRejectedValue(new Error('connection refused'))
    const out = await harness().call('sales_pricing_quote', { standardUsers: 100, windowsPCs: 0, locations: 0, packageId: 'basic' })
    expect(out.tiers[0].monthlyPrice).toBe(3500)
    expect(out.pricingSource.overridesUnavailable).toMatch(/DEFAULTS only/)
  })
})

// ---------------------------------------------------------------------------
// Catalog completeness
// ---------------------------------------------------------------------------

describe('sales_pricing_catalog', () => {
  it('returns every tier with its verbatim name and cost + sell rates per unit type', async () => {
    const out = await harness().call('sales_pricing_catalog')
    expect(out.tiers.map((t: { name: string }) => t.name)).toEqual([
      'TCT Basic Care', 'TCT Standard Care', 'TCT Comprehensive Care', 'TCT Complete Care', 'TCT Ally (Co-Managed)',
    ])
    for (const tier of out.tiers) {
      for (const unit of ['perUser', 'perDevice', 'perServer', 'perSite'] as const) {
        expect(tier.perUnitRates[unit].unitCost, `${tier.id}.${unit} cost`).toBeGreaterThan(0)
        expect(tier.perUnitRates[unit].unitPrice, `${tier.id}.${unit} price`).toBeGreaterThan(0)
      }
    }
    // Ally-specific lines that make its total hard to reverse-engineer.
    const ally = out.tiers.find((t: { id: string }) => t.id === 'comanaged')
    expect(ally.perUnitRates.perComanagedAdmin.unitPrice).toBe(150)
    expect(ally.hourlyLabor.rate).toBe(150)
    expect(ally.hourlyLabor.includedInMonthly).toBe(false)
    expect(ally.businessLine.applies).toBe(true)
    expect(ally.services.sharedWithCustomerIT).toContain('Helpdesk Support')
  })

  it('states plainly that there are no volume, term or industry modifiers', async () => {
    const out = await harness().call('sales_pricing_catalog', { section: 'modifiers' })
    expect(out.modifiers.volumeTiers.applies).toBe(false)
    expect(out.modifiers.termLengthDiscounts.applies).toBe(false)
    expect(out.modifiers.industryOrVerticalAdjustments.applies).toBe(false)
    expect(out.modifiers.businessLine.floor).toBe(250)
    expect(out.modifiers.businessLine.multiplier).toBe(2)
    expect(out.modifiers.businessLine.appliesToTiers).toEqual(['comprehensive', 'complete', 'comanaged'])
    expect(out.modifiers.rounding.rule).toMatch(/2 decimals/)
  })

  it('flags Microsoft 365 as billed separately, with a rate and minimum per tier', async () => {
    const out = await harness().call('sales_pricing_catalog', { section: 'microsoft365' })
    expect(out.microsoft365.billedSeparately).toBe(true)
    expect(out.microsoft365.excludedFromManagedServicesMargin).toBe(true)
    expect(out.microsoft365.minimumLicenseByTier).toEqual({
      basic: 'Business Basic', standard: 'Business Standard',
      comprehensive: 'Business Premium', complete: 'Business Premium', comanaged: 'Business Premium',
    })
    const premium = out.microsoft365.licenses.find((l: { license: string }) => l.license === 'Business Premium')
    expect(premium.monthlyCost).toBe(23.23)
    expect(premium.monthlyPrice).toBe(26.4)
  })

  it('carries the calculation rules so the math is reproducible from the response alone', async () => {
    const out = await harness().call('sales_pricing_catalog', { section: 'calculationRules' })
    const steps = out.calculationRules.steps.join(' ')
    expect(steps).toMatch(/standardUsers × tier.perUnitRates.perUser/)
    expect(steps).toMatch(/Business Line/)
    expect(out.calculationRules.notIncludedInAnyStep.join(' ')).toMatch(/Volume discounts — none exist/)
  })

  it('surfaces the config\'s own PLACEHOLDER / confirm flags instead of presenting every figure as settled', async () => {
    const out = await harness().call('sales_pricing_catalog')
    const flagged = out.needsConfirmation.map((f: { path: string }) => f.path)
    expect(flagged).toContain('serverAddOns._flag')
    expect(flagged).toContain('m365Licenses.E3._flag')
  })

  it('reports the migration state rather than pretending overrides were read', async () => {
    const out = await harness().call('sales_pricing_catalog', { section: 'tiers' })
    expect(out.pricingSource.overridesTableMissing).toBe(true)
    expect(out.pricingSource.defaultsFile).toBe('src/config/sales-calculator/pricing.json')
  })
})
