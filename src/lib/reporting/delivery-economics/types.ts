// src/lib/reporting/delivery-economics/types.ts
//
// Delivery Economics report — shared types.
//
// This report answers three questions the pricing tools cannot:
//   1. What does it actually cost us to serve an endpoint, by tier?
//   2. How much delivery capacity is left?
//   3. Is billable work actually being billed?
//
// Every figure is derived from Autotask time entries joined to Datto RMM
// endpoint counts and Autotask contracts. Snapshots are stored weekly so the
// figures become a time series rather than a point-in-time reading — the
// trend is the point (internal-work share fell from 66% to 25% over the first
// six months measured, which no single reading would have shown).

/** One Autotask time entry, reduced to the fields this report needs. */
export interface DeliveryTimeEntry {
  id: number
  resourceName: string
  dateWorked: string
  hoursWorked: number
  billable: boolean
  companyID: number
  ticketID: number | null
  ticketNumber: string | null
  billingCodeID: number | null
  summaryNotes: string | null
  /** invoiced | approved_not_invoiced | unposted | non_billable — from BillingItems. */
  billingStatus?: string | null
}

/** Managed endpoints for one Autotask company, from Datto RMM. */
export interface EndpointCount {
  companyId: number
  endpoints: number
}

/** Which service tier a company is on, derived from its active contracts. */
export type DeliveryTier = 'basic' | 'standard' | 'comprehensive' | 'complete' | 'comanaged'
export type TierOrUnmanaged = DeliveryTier | 'unmanaged'

export interface CompanyTier {
  companyId: number
  companyName?: string | null
  tier: TierOrUnmanaged
  /** The contract name the tier was read from — provenance for a disputed row. */
  sourceContractName?: string | null
}

/** A delivery person's scalable capacity. Fixed-fee advisers carry none. */
export interface CapacityMember {
  resourceName: string
  /** Available delivery hours per month, net of PTO and holidays. */
  monthlyCapacityHours: number
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface ResourceAllocation {
  resourceName: string
  totalHours: number
  customerHours: number
  internalHours: number
  internalSharePct: number
  /** Present only for people with declared scalable capacity. */
  capacityHours: number | null
  utilisationPct: number | null
}

export interface MonthlyPoint {
  month: string // YYYY-MM
  customerHours: number
  internalHours: number
  internalSharePct: number
}

export interface TierEconomics {
  tier: DeliveryTier
  companies: number
  endpoints: number
  hoursPerMonth: number
  hoursPerEndpointPerMonth: number | null
  /** Null when the tier has no customers — never a fabricated zero. */
  measured: boolean
}

// ---------------------------------------------------------------------------
// Billed units — the real cost denominators
// ---------------------------------------------------------------------------

/**
 * The unit a recurring service is billed against.
 *
 * TCT does not bill per endpoint. An invoice carries independent per-user,
 * per-device, per-server, per-site and per-company lines, plus resold licences
 * and backups that are billed separately. The first five carry delivery labour;
 * the rest are pass-through and must not be mixed into a cost-to-serve figure.
 */
export type BilledUnitType =
  | 'user'
  | 'device'
  | 'server'
  | 'site'
  | 'business'
  | 'license'
  | 'backup'
  | 'addon'
  | 'labor'
  | 'other'

/** One reconstructed recurring invoice line. */
export interface BillingUnitLine {
  serviceId: number
  serviceName: string
  unitType: BilledUnitType
  units: number
  unitPrice: number
  unitCost: number
  monthlyRevenue: number
  monthlyToolingCost: number
  /** The catalogue list rate, for discount comparison. Null if unknown. */
  catalogUnitPrice: number | null
  /** Where the rate came from. 'catalog' means the contract carried none. */
  rateSource: 'contract' | 'period' | 'catalog'
  contractName: string | null
}

export interface CompanyBilling {
  companyId: number
  tier: TierOrUnmanaged
  lines: BillingUnitLine[]
  units: Record<BilledUnitType, number>
  revenue: Record<BilledUnitType, number>
  toolingCost: Record<BilledUnitType, number>
  /** Per user/device/server/site/business — the services TCT delivers. */
  managedRevenue: number
  /** Resold licences, backups, add-ons — billed through, not delivered. */
  passthroughRevenue: number
}

/** A service catalogue entry, reduced to what the billing layer needs. */
export interface ServiceCatalogEntry {
  id: number
  name: string
  unitPrice: number | null
  unitCost: number | null
}

/**
 * How delivery hours were attributed across the billed unit types.
 *
 * `method` is part of the finding, not metadata: 'regression' means the split
 * was measured from the relationship between unit counts and hours, while
 * 'unit-share' means there was not enough signal and the hours were allocated
 * evenly. Presenting the second as though it were the first would be the same
 * class of error as the per-endpoint model this replaced.
 */
export interface LaborFit {
  method: 'regression' | 'unit-share'
  perUserHours: number | null
  perDeviceHours: number | null
  perServerHours: number | null
  /** Hours per company that do not scale with unit counts. */
  fixedHoursPerCompany: number | null
  r2: number | null
  /**
   * R² adjusted for the number of fitted parameters — the figure the fit is
   * accepted or rejected on. At this sample size raw R² flatters noise, so it
   * is reported alongside but never gated on.
   */
  adjustedR2: number | null
  observations: number
  warnings: string[]
}

export interface UnitEconomics {
  unitType: BilledUnitType
  unitsBilled: number
  companies: number
  monthlyRevenue: number
  monthlyToolingCost: number
  monthlyLaborCost: number | null
  laborHoursPerUnit: number | null
  revenuePerUnit: number | null
  toolingCostPerUnit: number | null
  laborCostPerUnit: number | null
  contributionPerUnit: number | null
  monthlyContribution: number | null
  contributionMarginPct: number | null
}

export interface TierUnitMix {
  tier: TierOrUnmanaged
  companies: number
  units: Record<BilledUnitType, number>
  revenue: Record<BilledUnitType, number>
  managedRevenue: number
  passthroughRevenue: number
}

export interface RateVariance {
  companyId: number
  tier: TierOrUnmanaged
  serviceName: string
  unitType: BilledUnitType
  units: number
  contractedUnitPrice: number
  catalogUnitPrice: number
  gapPct: number
  monthlyGap: number
}

export interface CapacitySummary {
  scalableHoursPerMonth: number
  customerHoursPerMonth: number
  internalHoursPerMonth: number
  idleHoursPerMonth: number
  /** Idle + internal: the theoretical runway if internal work were redirected. */
  redeployableHoursPerMonth: number
  utilisationPct: number
}

export interface BillingCapture {
  tier: TierOrUnmanaged
  invoicedHours: number
  nonBillableHours: number
  unpostedHours: number
  totalHours: number
  invoicedPct: number | null
}

/** What non-billable customer time was actually spent on. */
export type WorkNature =
  | 'proactive-notification'
  | 'backup-alert'
  | 'rmm-hardware-alert'
  | 'security-detection'
  | 'project-implementation'
  | 'unclassified'

export interface NonBillableBreakdown {
  nature: WorkNature
  hours: number
  entries: number
  /** Hours in entries of 2h+ — project-sized write-offs, the recoverable end. */
  projectSizedHours: number
}

export interface NonBillableSizeBand {
  band: 'under-30-min' | '30-min-to-2-h' | 'over-2-h'
  entries: number
  hours: number
}

export interface DeliveryEconomicsReport {
  generatedAt: string
  window: { from: string; to: string; months: number }
  timeEntriesAnalysed: number
  excludedResources: string[]

  capacity: CapacitySummary
  allocation: ResourceAllocation[]
  monthly: MonthlyPoint[]
  tiers: TierEconomics[]
  billingCapture: BillingCapture[]
  nonBillable: NonBillableBreakdown[]
  nonBillableSizeBands: NonBillableSizeBand[]

  /**
   * Cost-to-serve on the denominators TCT actually bills against. Empty when
   * contract service lines could not be read — the endpoint view above still
   * works, but per-unit economics are unavailable rather than guessed.
   */
  unitEconomics: UnitEconomics[]
  tierUnitMix: TierUnitMix[]
  laborFit: LaborFit | null
  rateVariance: RateVariance[]
  /** Services whose billing unit could not be determined from the name. */
  unclassifiedServices: string[]
  /** Managed recurring revenue per month at contracted rates. */
  managedRevenuePerMonth: number
  passthroughRevenuePerMonth: number

  /** Entries with no ticket at all — invisible to ticket-based reporting. */
  hoursWithNoTicket: number
  /** Customer work logged with no company — inflates the internal figure. */
  suspectedMisfiledCustomerHours: number

  notes: string[]
}
