// src/lib/reporting/delivery-economics/billing-units.test.ts
//
// The fixtures in the invoice-reconciliation block are TWO REAL Complete Care
// invoices, transcribed line for line. They are the reason this module exists:
// the two customers bill 15 users against 20 devices and 32 users against 28
// devices, at $100/user and $33.60/user respectively. Any model that reduces
// either to a single endpoint count, or that reads rates from the service
// catalogue, gets both customers wrong.
//
// If a change here makes the reconciliation assertions fail, the model no
// longer reproduces a real invoice — fix the model, not the expected totals.

import { describe, it, expect } from 'vitest'
import {
  buildCompanyBilling,
  classifyServiceUnitType,
  computeRateVariance,
  computeTierUnitMix,
  computeUnitEconomics,
  fitLaborModel,
  type ContractServiceRow,
  type ContractServiceUnitRow,
  type LaborObservation,
} from './billing-units'
import type { CompanyTier, ServiceCatalogEntry } from './types'

// ---------------------------------------------------------------------------
// Service classification
// ---------------------------------------------------------------------------

describe('classifyServiceUnitType', () => {
  it('maps every tier family to the unit it is billed against', () => {
    // Names taken verbatim from the live Autotask service catalogue.
    expect(classifyServiceUnitType('TCT-Complete-User')).toBe('user')
    expect(classifyServiceUnitType('TCT-Complete-Device')).toBe('device')
    expect(classifyServiceUnitType('TCT-Complete-Server')).toBe('server')
    expect(classifyServiceUnitType('TCT Complete Business')).toBe('business')
    expect(classifyServiceUnitType('TCT-Comprehensive-User')).toBe('user')
    expect(classifyServiceUnitType('TCT-Comprehensive-Device')).toBe('device')
    expect(classifyServiceUnitType('TCT-Standard-User')).toBe('user')
    expect(classifyServiceUnitType('TCT Standard Business')).toBe('business')
    expect(classifyServiceUnitType('TCT-Essential-Device')).toBe('device')
    expect(classifyServiceUnitType('Ally-User')).toBe('user')
    expect(classifyServiceUnitType('Ally-Server')).toBe('server')
    expect(classifyServiceUnitType('Ally-Network')).toBe('site')
    expect(classifyServiceUnitType('Ally-Business')).toBe('business')
    expect(classifyServiceUnitType('Ally-Admin-Seat')).toBe('user')
    expect(classifyServiceUnitType('Watchtower-Device')).toBe('device')
    expect(classifyServiceUnitType('Bastion-User')).toBe('user')
    expect(classifyServiceUnitType('Fortress | Business')).toBe('business')
    expect(classifyServiceUnitType('Fortress | Device')).toBe('device')
  })

  it('does not read a resold Microsoft licence as the per-company business line', () => {
    // The trap that makes pattern order load-bearing: three catalogue entries
    // contain "Business" but none of them is the per-company charge.
    expect(classifyServiceUnitType('Microsoft 365 Business Premium [NCE] - Month to Month')).toBe('license')
    expect(classifyServiceUnitType('Microsoft 365 Business Basic [NCE] - Month to Month')).toBe('license')
    expect(classifyServiceUnitType('Microsoft 365 Business Standard')).toBe('license')
    expect(classifyServiceUnitType('Exchange Online (Plan 2) [NCE] - Annual Commit')).toBe('license')
    expect(classifyServiceUnitType('Office 365 E3 [NCE] - Monthly - 1YR Commit')).toBe('license')
    expect(classifyServiceUnitType('Google Workspace Enterprise Standard')).toBe('license')
    expect(classifyServiceUnitType('Microsoft Entra ID P1')).toBe('license')
  })

  it('does not read a shared mailbox or a password manager as a user seat', () => {
    expect(classifyServiceUnitType('TCT-Complete-User-SharedMailbox')).toBe('addon')
    expect(classifyServiceUnitType('Business Password Manager Subscription')).toBe('addon')
    expect(classifyServiceUnitType('Email Protection - Business')).toBe('addon')
  })

  it('separates backups, which are billed per instance rather than per unit', () => {
    expect(classifyServiceUnitType('Backups - TCT Cloud Complete')).toBe('backup')
    expect(classifyServiceUnitType('Backups - Datto - Alto 3 - ICR')).toBe('backup')
    expect(classifyServiceUnitType('Datto SaaS Protection - ICR - 1 Year Commit')).toBe('backup')
    expect(classifyServiceUnitType('TCT Endpoint Backup')).toBe('backup')
  })

  it('classifies site-level monitoring separately from devices', () => {
    expect(classifyServiceUnitType('TCT Network Monitoring')).toBe('site')
    expect(classifyServiceUnitType('Server Monitoring')).toBe('server')
    expect(classifyServiceUnitType('UNMS Monitoring & Hosting')).toBe('site')
  })

  it('returns other rather than guessing, so a new SKU is visible', () => {
    expect(classifyServiceUnitType('Dark Web Monitoring')).toBe('other')
    expect(classifyServiceUnitType('')).toBe('other')
    expect(classifyServiceUnitType(null)).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// Invoice reconciliation — the acceptance test for this module
// ---------------------------------------------------------------------------

const CATALOG: ServiceCatalogEntry[] = [
  { id: 53, name: 'TCT-Complete-User', unitPrice: 80, unitCost: 29.42 },
  { id: 52, name: 'TCT-Complete-Device', unitPrice: 50, unitCost: 5.32 },
  { id: 66, name: 'TCT-Complete-Server', unitPrice: 125, unitCost: 5.23 },
  { id: 99, name: 'TCT Complete Business', unitPrice: 250, unitCost: 0 },
  { id: 35, name: 'Remote PC Access - Monthly', unitPrice: 15, unitCost: 1 },
  { id: 103, name: 'Exchange Online (Plan 2) [NCE] - Annual Commit', unitPrice: 10, unitCost: 7.04 },
  { id: 88, name: 'Microsoft 365 Business Premium [NCE] - Month to Month', unitPrice: 24, unitCost: 21.12 },
  { id: 90, name: 'Microsoft 365 Business Basic [NCE] - Month to Month', unitPrice: 6, unitCost: 5.28 },
  { id: 18, name: 'Backups - TCT Cloud Complete', unitPrice: 0, unitCost: 10 },
]

// Contract ids are arbitrary; company ids are the live Autotask ones.
const TRIBROS = 398
const EZRED = 420

const CONTRACTS = [
  { id: 9001, companyID: TRIBROS, contractName: 'TCT Complete Care' },
  { id: 9002, companyID: EZRED, contractName: 'TCT Complete Care - 2024 - 2027' },
  { id: 9003, companyID: EZRED, contractName: 'Microsoft Licenses' },
  { id: 9004, companyID: EZRED, contractName: 'Cloud Backup - Synology - New Jersey' },
]

const TIERS: CompanyTier[] = [
  { companyId: TRIBROS, tier: 'complete', sourceContractName: 'TCT Complete Care' },
  { companyId: EZRED, tier: 'complete', sourceContractName: 'TCT Complete Care - 2024 - 2027' },
]

// Rates exactly as they appear in the invoices' Rate/Cost column.
const CONTRACT_SERVICES: ContractServiceRow[] = [
  { id: 1, contractID: 9001, serviceID: 53, unitPrice: 100, unitCost: 4.46 },
  { id: 2, contractID: 9001, serviceID: 52, unitPrice: 50, unitCost: 5.33 },
  { id: 3, contractID: 9001, serviceID: 99, unitPrice: 250, unitCost: 0 },
  { id: 4, contractID: 9001, serviceID: 35, unitPrice: 15, unitCost: 1 },
  { id: 5, contractID: 9001, serviceID: 103, unitPrice: 10, unitCost: 7.04 },
  { id: 6, contractID: 9002, serviceID: 53, unitPrice: 33.6, unitCost: 4.46 },
  { id: 7, contractID: 9002, serviceID: 52, unitPrice: 60, unitCost: 5.33 },
  { id: 8, contractID: 9002, serviceID: 99, unitPrice: 500, unitCost: 0 },
  { id: 9, contractID: 9003, serviceID: 88, unitPrice: 26.4, unitCost: 21.12 },
  { id: 10, contractID: 9003, serviceID: 90, unitPrice: 7.2, unitCost: 5.28 },
  { id: 11, contractID: 9004, serviceID: 18, unitPrice: 100, unitCost: 10 },
]

const P = { startDate: '2026-07-01T00:00:00', endDate: '2026-07-31T00:00:00' }

const CONTRACT_SERVICE_UNITS: ContractServiceUnitRow[] = [
  { contractID: 9001, serviceID: 53, units: 15, ...P },
  { contractID: 9001, serviceID: 52, units: 20, ...P },
  { contractID: 9001, serviceID: 99, units: 1, ...P },
  { contractID: 9001, serviceID: 35, units: 1, ...P },
  { contractID: 9001, serviceID: 103, units: 3, ...P },
  { contractID: 9002, serviceID: 53, units: 32, ...P },
  { contractID: 9002, serviceID: 52, units: 28, ...P },
  { contractID: 9002, serviceID: 99, units: 1, ...P },
  { contractID: 9003, serviceID: 88, units: 27, ...P },
  { contractID: 9003, serviceID: 90, units: 5, ...P },
  { contractID: 9004, serviceID: 18, units: 1, ...P },
]

function build(anchorDate = '2026-07-15') {
  return buildCompanyBilling({
    contracts: CONTRACTS,
    services: CATALOG,
    contractServices: CONTRACT_SERVICES,
    contractServiceUnits: CONTRACT_SERVICE_UNITS,
    tiers: TIERS,
    anchorDate,
  })
}

describe('buildCompanyBilling — reconciles against real Complete Care invoices', () => {
  it('reproduces EZ Red invoice INV100439 to the cent', () => {
    const ez = build().companies.find((c) => c.companyId === EZRED)!
    // Managed lines: 32 x 33.60 + 28 x 60.00 + 1 x 500.00
    expect(ez.revenue.user).toBeCloseTo(1075.2, 2)
    expect(ez.revenue.device).toBeCloseTo(1680, 2)
    expect(ez.revenue.business).toBeCloseTo(500, 2)
    expect(ez.managedRevenue).toBeCloseTo(3255.2, 2)
    // Separately billed: 27 x 26.40 + 5 x 7.20 licences, plus 1 x 100 backup.
    expect(ez.revenue.license).toBeCloseTo(748.8, 2)
    expect(ez.revenue.backup).toBeCloseTo(100, 2)
    expect(ez.passthroughRevenue).toBeCloseTo(848.8, 2)
    // The invoice's Total Billable Amount.
    expect(ez.managedRevenue + ez.passthroughRevenue).toBeCloseTo(4104, 2)
  })

  it('reproduces Tri-Bros invoice INV100424 to the cent, prorations aside', () => {
    const tb = build().companies.find((c) => c.companyId === TRIBROS)!
    expect(tb.revenue.user).toBeCloseTo(1500, 2)
    expect(tb.revenue.device).toBeCloseTo(1000, 2)
    expect(tb.revenue.business).toBeCloseTo(250, 2)
    expect(tb.managedRevenue).toBeCloseTo(2750, 2)
    // Remote PC Access ($15) + Exchange Online 3 x $10.
    expect(tb.passthroughRevenue).toBeCloseTo(45, 2)
    // Invoice total was $2,845.00, which includes +$50.00 of mid-month user
    // prorations. This model reports the monthly run rate, so the difference is
    // exactly the proration and nothing else.
    expect(tb.managedRevenue + tb.passthroughRevenue).toBeCloseTo(2845 - 50, 2)
  })

  it('keeps users and devices as independent counts', () => {
    const { companies } = build()
    const tb = companies.find((c) => c.companyId === TRIBROS)!
    const ez = companies.find((c) => c.companyId === EZRED)!
    expect(tb.units.user).toBe(15)
    expect(tb.units.device).toBe(20)
    expect(ez.units.user).toBe(32)
    expect(ez.units.device).toBe(28)
    // The ratio inverts between the two customers — the exact reason a single
    // endpoint denominator cannot carry per-unit cost.
    expect(tb.units.user / tb.units.device).toBeLessThan(1)
    expect(ez.units.user / ez.units.device).toBeGreaterThan(1)
  })

  it('bills the contracted rate, never the catalogue rate', () => {
    const { companies } = build()
    const userLine = (id: number) =>
      companies.find((c) => c.companyId === id)!.lines.find((l) => l.serviceName === 'TCT-Complete-User')!
    // Same catalogue entry ($80), two live contracts, neither at list.
    expect(userLine(TRIBROS).unitPrice).toBe(100)
    expect(userLine(EZRED).unitPrice).toBe(33.6)
    expect(userLine(TRIBROS).catalogUnitPrice).toBe(80)
    expect(userLine(TRIBROS).rateSource).toBe('contract')
  })

  it('rolls a multi-contract customer up under one company', () => {
    // EZ Red's licences and backup sit on separate contracts from the managed
    // one. Grouping by contract instead of company would triple-count them.
    const { companies } = build()
    expect(companies).toHaveLength(2)
    const ez = companies.find((c) => c.companyId === EZRED)!
    expect(new Set(ez.lines.map((l) => l.contractName)).size).toBe(3)
  })

  it('names services it cannot classify instead of absorbing them', () => {
    const { unclassifiedServices } = buildCompanyBilling({
      contracts: CONTRACTS,
      services: [...CATALOG, { id: 999, name: 'Dark Web Monitoring', unitPrice: 100, unitCost: 25 }],
      contractServices: [...CONTRACT_SERVICES, { id: 99, contractID: 9001, serviceID: 999, unitPrice: 100, unitCost: 25 }],
      contractServiceUnits: [...CONTRACT_SERVICE_UNITS, { contractID: 9001, serviceID: 999, units: 1, ...P }],
      tiers: TIERS,
      anchorDate: '2026-07-15',
    })
    expect(unclassifiedServices).toContain('Dark Web Monitoring')
  })
})

describe('buildCompanyBilling — billing period selection', () => {
  const multiPeriod: ContractServiceUnitRow[] = [
    { contractID: 9001, serviceID: 53, units: 11, startDate: '2026-05-01', endDate: '2026-05-31' },
    { contractID: 9001, serviceID: 53, units: 13, startDate: '2026-06-01', endDate: '2026-06-30' },
    { contractID: 9001, serviceID: 53, units: 15, startDate: '2026-07-01', endDate: '2026-07-31' },
    { contractID: 9001, serviceID: 53, units: 17, startDate: '2026-08-01', endDate: '2026-08-31' },
  ]

  const one = (anchorDate: string) =>
    buildCompanyBilling({
      contracts: CONTRACTS,
      services: CATALOG,
      contractServices: CONTRACT_SERVICES,
      contractServiceUnits: multiPeriod,
      tiers: TIERS,
      anchorDate,
    }).companies.find((c) => c.companyId === TRIBROS)!

  it('takes the period covering the anchor date, never the sum', () => {
    // Summing would report 56 users for a 15-user customer.
    expect(one('2026-07-15').units.user).toBe(15)
    expect(one('2026-06-15').units.user).toBe(13)
    expect(one('2026-08-15').units.user).toBe(17)
  })

  it('falls back to the latest started period rather than reporting zero', () => {
    // Anchor past every written period: the customer still exists.
    expect(one('2026-12-15').units.user).toBe(17)
  })

  it('ignores periods that start after the anchor', () => {
    expect(one('2026-05-15').units.user).toBe(11)
  })
})

// ---------------------------------------------------------------------------
// Labour attribution
// ---------------------------------------------------------------------------

const obs = (users: number, devices: number, hoursPerMonth: number, i: number): LaborObservation => ({
  companyId: 1000 + i,
  hoursPerMonth,
  users,
  devices,
  servers: 0,
  managedRevenue: users * 100 + devices * 50,
})

describe('fitLaborModel', () => {
  it('recovers the per-user and per-device hours it was generated from', () => {
    // Synthetic truth: 0.30 h/user + 0.10 h/device + 4 h fixed.
    const shapes: [number, number][] = [
      [10, 20], [15, 12], [32, 28], [8, 30], [45, 40],
      [22, 9], [60, 55], [5, 14], [28, 33], [12, 25],
    ]
    const data = shapes.map(([u, d], i) => obs(u, d, 0.3 * u + 0.1 * d + 4, i))
    const fit = fitLaborModel(data)
    expect(fit.method).toBe('regression')
    expect(fit.perUserHours).toBeCloseTo(0.3, 2)
    expect(fit.perDeviceHours).toBeCloseTo(0.1, 2)
    expect(fit.fixedHoursPerCompany).toBeCloseTo(4, 1)
    expect(fit.r2).toBeGreaterThan(0.99)
  })

  it('falls back to an even allocation when there are too few customers', () => {
    const fit = fitLaborModel([obs(10, 10, 5, 1), obs(20, 20, 10, 2)])
    expect(fit.method).toBe('unit-share')
    expect(fit.r2).toBeNull()
    expect(fit.warnings.join(' ')).toMatch(/allocated by unit share/)
  })

  it('falls back rather than reporting a fit that explains nothing', () => {
    // Hours that swing hard but independently of customer size. Note that RAW
    // R² for this data is ~0.48 — high enough to look like a real relationship,
    // which is exactly why the gate is on adjusted R² (~0.22 here). If this test
    // starts passing as 'regression', the gate has been loosened back to raw R².
    const shapes: [number, number][] = [
      [10, 20], [15, 12], [32, 28], [8, 30], [45, 40],
      [22, 9], [60, 55], [5, 14], [28, 33], [12, 25],
    ]
    const fit = fitLaborModel(shapes.map(([u, d], i) => obs(u, d, 40 + (i % 2 ? 30 : -30), i)))
    expect(fit.method).toBe('unit-share')
    expect(fit.warnings.join(' ')).toMatch(/explain only/)
  })

  it('reports adjusted R2 alongside raw R2 on an accepted fit', () => {
    const shapes: [number, number][] = [
      [10, 20], [15, 12], [32, 28], [8, 30], [45, 40],
      [22, 9], [60, 55], [5, 14], [28, 33], [12, 25],
    ]
    const fit = fitLaborModel(shapes.map(([u, d], i) => obs(u, d, 0.3 * u + 0.1 * d + 4, i)))
    expect(fit.adjustedR2).not.toBeNull()
    expect(fit.adjustedR2!).toBeLessThanOrEqual(fit.r2!)
    expect(fit.adjustedR2!).toBeGreaterThan(0.99)
  })

  it('never returns a negative hours-per-unit', () => {
    // Devices anti-correlated with hours would fit a negative coefficient.
    const shapes: [number, number][] = [
      [10, 90], [15, 80], [20, 70], [25, 60], [30, 50],
      [35, 40], [40, 30], [45, 20], [50, 10], [55, 5],
    ]
    const fit = fitLaborModel(shapes.map(([u, d], i) => obs(u, d, 0.4 * u, i)))
    for (const v of [fit.perUserHours, fit.perDeviceHours, fit.fixedHoursPerCompany]) {
      if (v != null) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('says so when no customer carries a billed server', () => {
    const shapes: [number, number][] = [
      [10, 20], [15, 12], [32, 28], [8, 30], [45, 40],
      [22, 9], [60, 55], [5, 14], [28, 33], [12, 25],
    ]
    const fit = fitLaborModel(shapes.map(([u, d], i) => obs(u, d, 0.3 * u + 0.1 * d + 4, i)))
    expect(fit.perServerHours).toBeNull()
    expect(fit.warnings.join(' ')).toMatch(/no customer had billed server units/i)
  })
})

// ---------------------------------------------------------------------------
// Unit economics
// ---------------------------------------------------------------------------

describe('computeUnitEconomics', () => {
  const companies = build().companies

  it('computes contribution per unit from contracted revenue, tooling and labour', () => {
    const fit = {
      method: 'regression' as const,
      perUserHours: 0.3,
      perDeviceHours: 0.1,
      perServerHours: null,
      fixedHoursPerCompany: 4,
      r2: 0.9,
      adjustedR2: 0.86,
      observations: 10,
      warnings: [],
    }
    const rows = computeUnitEconomics(companies, fit, 13.6)
    const user = rows.find((r) => r.unitType === 'user')!
    // 47 user units across the two customers; revenue 1075.20 + 1500.00.
    expect(user.unitsBilled).toBe(47)
    expect(user.monthlyRevenue).toBeCloseTo(2575.2, 2)
    expect(user.laborHoursPerUnit).toBe(0.3)
    expect(user.monthlyLaborCost).toBeCloseTo(47 * 0.3 * 13.6, 2)
    const expected = 2575.2 - user.monthlyToolingCost - 47 * 0.3 * 13.6
    expect(user.monthlyContribution).toBeCloseTo(expected, 1)
    expect(user.contributionMarginPct).toBeCloseTo((expected / 2575.2) * 100, 0)
  })

  it('charges the fixed per-company hours to the business line, once per company', () => {
    const fit = {
      method: 'regression' as const,
      perUserHours: 0.3,
      perDeviceHours: 0.1,
      perServerHours: null,
      fixedHoursPerCompany: 4,
      r2: 0.9,
      adjustedR2: 0.86,
      observations: 10,
      warnings: [],
    }
    const business = computeUnitEconomics(companies, fit, 13.6).find((r) => r.unitType === 'business')!
    // Two companies x 4 h x $13.60 — not per business UNIT.
    expect(business.monthlyLaborCost).toBeCloseTo(2 * 4 * 13.6, 2)
  })

  it('reports null rather than zero labour cost where labour is unattributed', () => {
    const fit = {
      method: 'unit-share' as const,
      perUserHours: null,
      perDeviceHours: null,
      perServerHours: null,
      fixedHoursPerCompany: null,
      r2: null,
      adjustedR2: null,
      observations: 2,
      warnings: [],
    }
    for (const r of computeUnitEconomics(companies, fit, 13.6)) {
      expect(r.monthlyLaborCost).toBeNull()
      expect(r.monthlyContribution).toBeNull()
      expect(r.contributionMarginPct).toBeNull()
      // Revenue is still measured — only the labour half is unknown.
      expect(r.monthlyRevenue).toBeGreaterThan(0)
    }
  })

  it('excludes pass-through licences and backups from managed unit economics', () => {
    const rows = computeUnitEconomics(companies, {
      method: 'unit-share', perUserHours: null, perDeviceHours: null, perServerHours: null,
      fixedHoursPerCompany: null, r2: null, adjustedR2: null, observations: 2, warnings: [],
    }, 13.6)
    expect(rows.map((r) => r.unitType)).not.toContain('license')
    expect(rows.map((r) => r.unitType)).not.toContain('backup')
  })
})

describe('computeTierUnitMix', () => {
  it('shows per-user and per-device lines as the bulk of managed revenue', () => {
    const mix = computeTierUnitMix(build().companies)
    const complete = mix.find((m) => m.tier === 'complete')!
    expect(complete.companies).toBe(2)
    expect(complete.units.user).toBe(47)
    expect(complete.units.device).toBe(48)
    expect(complete.managedRevenue).toBeCloseTo(6005.2, 2)
    const perUnitLines = complete.revenue.user + complete.revenue.device
    expect(perUnitLines / complete.managedRevenue).toBeGreaterThan(0.8)
  })
})

describe('computeRateVariance', () => {
  it('surfaces the discount against list without altering what is billed', () => {
    const rows = computeRateVariance(build().companies)
    const ezUser = rows.find((r) => r.companyId === EZRED && r.serviceName === 'TCT-Complete-User')!
    expect(ezUser.contractedUnitPrice).toBe(33.6)
    expect(ezUser.catalogUnitPrice).toBe(80)
    expect(ezUser.monthlyGap).toBeCloseTo((33.6 - 80) * 32, 2)
    expect(ezUser.gapPct).toBeLessThan(0)
    // Tri-Bros bills ABOVE list on the same service — a premium, not a discount.
    const tbUser = rows.find((r) => r.companyId === TRIBROS && r.serviceName === 'TCT-Complete-User')!
    expect(tbUser.gapPct).toBeGreaterThan(0)
  })

  it('ignores gaps inside the noise threshold', () => {
    const rows = computeRateVariance(build().companies, 200)
    expect(rows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Pagination regression
// ---------------------------------------------------------------------------

describe('contract service unit fetching', () => {
  it('scopes unit queries per contract and to a window', async () => {
    // The first live run returned $0 managed revenue because unit rows were
    // pulled account-wide: ContractServiceUnits holds one row per service PER
    // BILLING PERIOD, so a three-year contract contributes ~36 rows per
    // service, the query exceeded the 500-record first page, and this zone
    // 405s on the nextPageUrl GET for includeFields queries. Every unit query
    // must therefore carry BOTH a contractId and a date window.
    const { fetchDeliveryTelemetry } = await import('./service')
    const unitCalls: { contractId?: number; from?: Date; to?: Date }[] = []
    const serviceCalls: { contractId?: number }[] = []

    const autotask = {
      searchTimeEntries: async () => [],
      listContracts: async () => [
        { id: 9001, companyID: 398, contractName: 'TCT Complete Care', statusName: 'Active' },
      ],
      getServicesList: async () => ({ services: CATALOG, serviceBundles: [] }),
      listContractServices: async (o: { contractId?: number } = {}) => {
        serviceCalls.push(o)
        return CONTRACT_SERVICES.filter((r) => r.contractID === o.contractId)
      },
      listContractServiceUnits: async (o: { contractId?: number; from?: Date; to?: Date } = {}) => {
        unitCalls.push(o)
        return CONTRACT_SERVICE_UNITS.filter((r) => r.contractID === o.contractId)
      },
    }
    const datto = { getV2: async () => ({ sites: [] }) }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const t = await fetchDeliveryTelemetry({
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
      autotask: autotask as any,
      datto: datto as any,
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(unitCalls).toHaveLength(1)
    expect(unitCalls[0].contractId).toBe(9001)
    expect(unitCalls[0].from).toBeInstanceOf(Date)
    expect(unitCalls[0].to).toBeInstanceOf(Date)
    expect(serviceCalls[0].contractId).toBe(9001)
    // And the billed units actually landed.
    expect(t.billing.find((b) => b.companyId === 398)?.units.user).toBe(15)
  })

  it('reports an empty Datto response as a failed source, not as zero endpoints', async () => {
    const { fetchDeliveryTelemetry } = await import('./service')
    const autotask = {
      searchTimeEntries: async () => [],
      listContracts: async () => [],
      getServicesList: async () => ({ services: CATALOG, serviceBundles: [] }),
      listContractServices: async () => [],
      listContractServiceUnits: async () => [],
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const t = await fetchDeliveryTelemetry({
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
      autotask: autotask as any,
      datto: { getV2: async () => ({ sites: [] }) } as any,
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const datto = t.dataSources.find((d) => d.source === 'datto-endpoints')!
    expect(datto.ok).toBe(false)
    expect(t.warnings.join(' ')).toMatch(/not because those tiers have no customers/)
  })
})
