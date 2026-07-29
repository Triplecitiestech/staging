// src/lib/reporting/delivery-economics/analyzer.test.ts
//
// Fixtures mirror the real shapes found in the 2026-02..07 derivation, so a
// regression here means the report would have misread live data.

import { describe, it, expect } from 'vitest'
import {
  buildDeliveryEconomicsReport,
  classifyWorkNature,
  computeBillingCapture,
  computeCapacity,
  computeMonthly,
  computeNonBillableBreakdown,
  computeNonBillableSizeBands,
  computeSuspectedMisfiledHours,
  computeTierEconomics,
  resolveCompanyTiers,
  tierFromContractName,
} from './analyzer'
import type { CapacityMember, CompanyTier, DeliveryTimeEntry, EndpointCount } from './types'

let nextId = 1
function te(over: Partial<DeliveryTimeEntry> = {}): DeliveryTimeEntry {
  return {
    id: nextId++,
    resourceName: 'Tech One',
    dateWorked: '2026-06-10T00:00:00.000Z',
    hoursWorked: 1,
    billable: true,
    companyID: 100,
    ticketID: 500,
    ticketNumber: 'T20260610.0001',
    billingCodeID: 1,
    summaryNotes: null,
    ...over,
  }
}

const CAP: CapacityMember[] = [
  { resourceName: 'Full Timer', monthlyCapacityHours: 160 },
  { resourceName: 'Part Timer', monthlyCapacityHours: 86.7 },
]

describe('tierFromContractName', () => {
  it('maps real contract names, including the internal codenames', () => {
    expect(tierFromContractName('TCT Complete Care - 2025 - 2028')).toBe('complete')
    expect(tierFromContractName('TCT Fortress')).toBe('complete')
    expect(tierFromContractName('TCT Comprehensive Care 2024 - 2027')).toBe('comprehensive')
    expect(tierFromContractName('TCT Bastion - 2026 - 2029')).toBe('comprehensive')
    expect(tierFromContractName('TCT Standard Care 2024 - 2027')).toBe('standard')
    expect(tierFromContractName('TCT Ally (Co-Managed)')).toBe('comanaged')
  })

  it('returns null for the many non-managed contracts rather than guessing', () => {
    for (const n of ['Domain Renewal', 'Cloud Backups', 'Anti Virus', 'Microsoft Licenses', 'Splashtop', '', null]) {
      expect(tierFromContractName(n), String(n)).toBeNull()
    }
  })
})

describe('resolveCompanyTiers', () => {
  it('lets the richest tier win when a company holds several managed contracts', () => {
    // Real case: a Complete Care customer who also has a Gold-category
    // "Microsoft Licenses" contract. Taking the first match misclassifies them.
    const got = resolveCompanyTiers([
      { companyID: 215, contractName: 'Microsoft Licenses', statusName: 'Active' },
      { companyID: 215, contractName: 'TCT Complete Care - 2025 - 2028', statusName: 'Active' },
    ])
    expect(got).toEqual([{ companyId: 215, tier: 'complete', sourceContractName: 'TCT Complete Care - 2025 - 2028' }])
  })

  it('ignores inactive contracts', () => {
    expect(resolveCompanyTiers([{ companyID: 9, contractName: 'TCT Complete Care', statusName: 'Inactive' }])).toEqual([])
  })
})

describe('internal vs customer split', () => {
  it('treats companyID 0 as internal — Autotask uses 0, not null', () => {
    const m = computeMonthly([
      te({ companyID: 0, hoursWorked: 3 }),
      te({ companyID: 100, hoursWorked: 1 }),
    ])
    expect(m).toEqual([{ month: '2026-06', customerHours: 1, internalHours: 3, internalSharePct: 75 }])
  })

  it('reports the month-by-month trend in order', () => {
    const m = computeMonthly([
      te({ dateWorked: '2026-07-01', companyID: 100, hoursWorked: 8 }),
      te({ dateWorked: '2026-02-01', companyID: 0, hoursWorked: 6 }),
      te({ dateWorked: '2026-02-02', companyID: 100, hoursWorked: 2 }),
    ])
    expect(m.map((x) => x.month)).toEqual(['2026-02', '2026-07'])
    expect(m[0].internalSharePct).toBe(75)
    expect(m[1].internalSharePct).toBe(0)
  })
})

describe('computeCapacity', () => {
  const entries = [
    te({ resourceName: 'Full Timer', companyID: 100, hoursWorked: 100 }),
    te({ resourceName: 'Full Timer', companyID: 0, hoursWorked: 60 }),
    te({ resourceName: 'Part Timer', companyID: 100, hoursWorked: 40 }),
    // Not on the scalable roster — must not create headroom.
    te({ resourceName: 'Owner', companyID: 100, hoursWorked: 30 }),
    te({ resourceName: 'Adviser', companyID: 100, hoursWorked: 5 }),
  ]

  it('counts only the scalable delivery roster', () => {
    const c = computeCapacity(entries, 1, CAP)
    expect(c.scalableHoursPerMonth).toBe(246.7)
    expect(c.customerHoursPerMonth).toBe(140) // 100 + 40, excludes owner and adviser
    expect(c.internalHoursPerMonth).toBe(60)
    expect(c.idleHoursPerMonth).toBe(46.7)
    expect(c.redeployableHoursPerMonth).toBe(106.7)
  })

  it('never reports negative idle when the roster is over-booked', () => {
    const over = [te({ resourceName: 'Full Timer', companyID: 100, hoursWorked: 400 })]
    expect(computeCapacity(over, 1, CAP).idleHoursPerMonth).toBe(0)
  })

  it('divides by the window length', () => {
    expect(computeCapacity(entries, 2, CAP).customerHoursPerMonth).toBe(70)
  })
})

describe('computeTierEconomics', () => {
  const tiers: CompanyTier[] = [
    { companyId: 100, tier: 'complete' },
    { companyId: 101, tier: 'standard' },
    { companyId: 102, tier: 'comprehensive' },
  ]
  const endpoints: EndpointCount[] = [
    { companyId: 100, endpoints: 50 },
    { companyId: 101, endpoints: 20 },
    { companyId: 102, endpoints: 0 }, // monitored but no endpoints
  ]

  it('computes hours per endpoint per month per tier', () => {
    const got = computeTierEconomics(
      [te({ companyID: 100, hoursWorked: 70 }), te({ companyID: 101, hoursWorked: 10 })],
      2,
      tiers,
      endpoints
    )
    const complete = got.find((t) => t.tier === 'complete')!
    expect(complete.endpoints).toBe(50)
    expect(complete.hoursPerMonth).toBe(35)
    expect(complete.hoursPerEndpointPerMonth).toBe(0.7)
    expect(complete.measured).toBe(true)
  })

  it('returns NULL — not zero — for a tier with no customers', () => {
    const got = computeTierEconomics([te({ companyID: 100, hoursWorked: 10 })], 1, tiers, endpoints)
    for (const t of ['basic', 'comanaged'] as const) {
      const row = got.find((x) => x.tier === t)!
      expect(row.hoursPerEndpointPerMonth, t).toBeNull()
      expect(row.measured, t).toBe(false)
    }
  })

  it('excludes companies with zero endpoints from the per-endpoint rate', () => {
    const got = computeTierEconomics([te({ companyID: 102, hoursWorked: 40 })], 1, tiers, endpoints)
    const comp = got.find((t) => t.tier === 'comprehensive')!
    expect(comp.companies).toBe(0)
    expect(comp.hoursPerEndpointPerMonth).toBeNull()
  })

  it('ignores internal time entirely', () => {
    const got = computeTierEconomics([te({ companyID: 0, hoursWorked: 999 })], 1, tiers, endpoints)
    expect(got.every((t) => t.hoursPerMonth === 0)).toBe(true)
  })
})

describe('computeBillingCapture', () => {
  const tiers: CompanyTier[] = [{ companyId: 100, tier: 'standard' }]

  it('prefers billingStatus over the billable boolean', () => {
    // The boolean says billable; BillingItems says it was never invoiced.
    const got = computeBillingCapture(
      [te({ companyID: 100, billable: true, billingStatus: 'non_billable', hoursWorked: 4 })],
      tiers
    )
    expect(got[0].nonBillableHours).toBe(4)
    expect(got[0].invoicedHours).toBe(0)
    expect(got[0].invoicedPct).toBe(0)
  })

  it('falls back to the boolean when billingStatus is absent', () => {
    const got = computeBillingCapture([te({ companyID: 100, billable: false, hoursWorked: 2 })], tiers)
    expect(got[0].nonBillableHours).toBe(2)
  })

  it('buckets companies with no managed contract as unmanaged', () => {
    const got = computeBillingCapture([te({ companyID: 999, billingStatus: 'invoiced', hoursWorked: 3 })], tiers)
    expect(got.find((r) => r.tier === 'unmanaged')?.invoicedHours).toBe(3)
  })
})

describe('classifyWorkNature', () => {
  it('recognises the proactive outreach template before the security patterns', () => {
    // This text mentions "security" and "Windows machines"; it must not land in
    // security-detection, or a notification campaign reads as incident work.
    expect(
      classifyWorkNature('Hi there, We need to flag a dated security item on your Windows machines. Microsoft is expiring the 2011 certificate')
    ).toBe('proactive-notification')
  })

  it('separates project labour from alert response', () => {
    expect(classifyWorkNature('Upon arriving on-site to continue the TCR project, the environment had changed')).toBe('project-implementation')
    expect(classifyWorkNature('Failing backup / Logged into Datto / Confirmed the machine')).toBe('backup-alert')
    expect(classifyWorkNature('Datto RMM generated a SMART storage alert for the system drive')).toBe('rmm-hardware-alert')
    expect(classifyWorkNature('Detection: Trojan:O97M/Phish.RV!MTB on the device')).toBe('security-detection')
  })

  it('returns unclassified for empty text rather than guessing', () => {
    expect(classifyWorkNature(null)).toBe('unclassified')
    expect(classifyWorkNature('   ')).toBe('unclassified')
  })
})

describe('non-billable breakdown', () => {
  const entries = [
    te({ companyID: 100, billable: false, hoursWorked: 0.25, summaryNotes: 'Failing backup on the server' }),
    te({ companyID: 100, billable: false, hoursWorked: 0.25, summaryNotes: 'No backup taken for 3 days' }),
    te({ companyID: 100, billable: false, hoursWorked: 17.65, summaryNotes: 'On-site to continue the TCR project' }),
    te({ companyID: 100, billable: true, hoursWorked: 5, summaryNotes: 'Billable work' }),
    te({ companyID: 0, billable: false, hoursWorked: 9, summaryNotes: 'Internal project' }),
  ]

  it('groups written-off customer time by what it was, ignoring billable and internal time', () => {
    const got = computeNonBillableBreakdown(entries)
    const project = got.find((g) => g.nature === 'project-implementation')!
    expect(project.hours).toBe(17.65)
    expect(project.projectSizedHours).toBe(17.65)
    const backup = got.find((g) => g.nature === 'backup-alert')!
    expect(backup.hours).toBe(0.5)
    expect(backup.entries).toBe(2)
    expect(backup.projectSizedHours).toBe(0) // alert response is never project-sized
    expect(got.reduce((s, g) => s + g.hours, 0)).toBeCloseTo(18.15, 2)
  })

  it('bands entries by size — the cheapest signal of alert vs project work', () => {
    const bands = computeNonBillableSizeBands(entries)
    expect(bands.find((b) => b.band === 'under-30-min')).toMatchObject({ entries: 2, hours: 0.5 })
    expect(bands.find((b) => b.band === 'over-2-h')).toMatchObject({ entries: 1, hours: 17.65 })
    expect(bands.find((b) => b.band === '30-min-to-2-h')).toMatchObject({ entries: 0, hours: 0 })
  })
})

describe('computeSuspectedMisfiledHours', () => {
  it('flags customer work sitting in the internal bucket', () => {
    const got = computeSuspectedMisfiledHours([
      te({ companyID: 0, hoursWorked: 6.17, summaryNotes: 'Received a call from Debbie of Brooms Over Broome requesting Ghenel' }),
      te({ companyID: 0, hoursWorked: 4, summaryNotes: 'Reviewing BullPhish ID client configurations' }),
      te({ companyID: 100, hoursWorked: 9, summaryNotes: 'Received a call from a customer' }),
    ])
    expect(got).toBe(6.17) // genuine internal work and real customer entries both excluded
  })
})

describe('buildDeliveryEconomicsReport', () => {
  const base = {
    tiers: [{ companyId: 100, tier: 'complete' as const }],
    endpoints: [{ companyId: 100, endpoints: 50 }],
    capacity: CAP,
    window: { from: '2026-02-01', to: '2026-07-27', months: 5.9 },
    generatedAt: '2026-07-28T00:00:00.000Z',
    deliveryCostPerHour: 13.6,
  }

  it('assembles every section and excludes departed staff from all of them', () => {
    const entries = [
      te({ resourceName: 'Full Timer', companyID: 100, hoursWorked: 60 }),
      te({ resourceName: 'Full Timer', companyID: 0, hoursWorked: 40 }),
      te({ resourceName: 'Departed', companyID: 100, hoursWorked: 500 }),
    ]
    const r = buildDeliveryEconomicsReport({ ...base, entries, excludedResources: ['Departed'] })
    expect(r.timeEntriesAnalysed).toBe(2)
    expect(r.excludedResources).toEqual(['Departed'])
    expect(r.allocation.some((a) => a.resourceName === 'Departed')).toBe(false)
    expect(r.capacity.customerHoursPerMonth).toBeCloseTo(60 / 5.9, 2)
    expect(r.tiers).toHaveLength(5)
    expect(r.generatedAt).toBe('2026-07-28T00:00:00.000Z')
  })

  it('notes the internal-share direction so the trend is stated, not just plotted', () => {
    const entries = [
      te({ dateWorked: '2026-02-05', resourceName: 'Full Timer', companyID: 0, hoursWorked: 8 }),
      te({ dateWorked: '2026-02-06', resourceName: 'Full Timer', companyID: 100, hoursWorked: 2 }),
      te({ dateWorked: '2026-07-05', resourceName: 'Full Timer', companyID: 0, hoursWorked: 1 }),
      te({ dateWorked: '2026-07-06', resourceName: 'Full Timer', companyID: 100, hoursWorked: 9 }),
    ]
    const r = buildDeliveryEconomicsReport({ ...base, entries })
    expect(r.notes.join(' ')).toMatch(/fallen from 80% \(2026-02\) to 10% \(2026-07\)/)
  })

  it('says which tiers are unmeasured instead of showing them as zero-cost', () => {
    const r = buildDeliveryEconomicsReport({ ...base, entries: [te({ resourceName: 'Full Timer', companyID: 100 })] })
    expect(r.notes.join(' ')).toMatch(/No customers on .*basic.*— hours per endpoint is null, not zero/)
  })
})
