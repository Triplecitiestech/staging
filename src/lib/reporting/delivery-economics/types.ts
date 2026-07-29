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

  /** Entries with no ticket at all — invisible to ticket-based reporting. */
  hoursWithNoTicket: number
  /** Customer work logged with no company — inflates the internal figure. */
  suspectedMisfiledCustomerHours: number

  notes: string[]
}
