/**
 * Types for the CFO dashboard — Sequence (banking) + QuickBooks shapes and the
 * computed dashboard summary. Ported from the standalone tool's data model.
 */

// ─── Sequence API shapes ────────────────────────────────────────────────────

export type TransferDirection = 'MONEY_IN' | 'MONEY_OUT' | 'INTERNAL'
export type AccountType = 'POD' | 'INCOME_SOURCE' | 'EXTERNAL_ACCOUNT' | string

export interface AccountRef {
  id?: string | null
  name?: string | null
  type?: string | null
}

export interface AccountBalance {
  balanceInCents: number | null
}

export interface Account {
  id: string
  name: string
  type: AccountType
  balance?: AccountBalance | null
  deletedAt?: string | null
  externalAccountType?: string | null
}

export interface Transfer {
  id: string
  direction: TransferDirection
  status: string
  createdAt: string // ISO timestamp
  amountInCents: number
  source?: AccountRef | null
  destination?: AccountRef | null
}

export interface TransfersByAccount {
  accountId: string
  transfers: Transfer[]
}

export interface Rule {
  id: string
  name?: string | null
  description?: string | null
  status?: string | null
  isSupported?: boolean | null
}

export interface RuleLastExecution {
  ruleId: string
  lastExecution: unknown | null
}

// ─── Category map ───────────────────────────────────────────────────────────

export type CategoryMap = Record<string, string>

// ─── Debts config ───────────────────────────────────────────────────────────

export interface DebtInput {
  name: string
  kind?: 'business' | 'personal'
  paidFromPod?: string
  balanceCents: number
  aprPct: number
  minPaymentCents: number
  aprIsEstimate?: boolean
  note?: string
}

export interface DebtsConfig {
  asOfDate?: string
  debts: DebtInput[]
}

// ─── Scheduled outflows (user-entered known upcoming payments) ──────────────
// Used by the forecast + month coverage to replace the historical baseline
// with the exact amount on a known date (e.g. next payroll, subcontractor
// invoices, one-off bills). The dashboard uses these where they're present
// and falls back to the historical baseline otherwise.

export type ScheduledOutflowCategory = 'payroll' | 'subcontractor' | 'vendor' | 'tax' | 'other'

export interface ScheduledOutflow {
  id: string                          // stable UUID for editing
  date: string                        // ISO date (YYYY-MM-DD)
  amountCents: number
  label: string                       // e.g. "Payroll 5/24", "James King invoice"
  category?: ScheduledOutflowCategory
}

export interface ScheduledOutflowsConfig {
  items: ScheduledOutflow[]
}

// ─── QuickBooks parsed shapes ────────────────────────────────────────────────

export interface QbBalanceSheet {
  asOfDate?: string | null
  bankAccountsTotalCents?: number | null
  empowerBusinessCheckingCents?: number | null
  accountsReceivableCents?: number | null
  undepositedFundsCents?: number | null
  creditCards?: { name: string; balanceCents: number }[]
  totalCreditCardOwedCents?: number | null
  visionsTaxLoanCents?: number | null
  nyStateTaxOwedCents?: number | null
  fixedAssetsNetCents?: number | null
  totalLiabilitiesCents?: number | null
  totalEquityCents?: number | null
  totalAssetsCents?: number | null
  ownersDrawsLifetimeCents?: number | null
}

export interface QbProfitAndLoss {
  startDate?: string | null
  endDate?: string | null
  incomeCents?: number | null
  cogsCents?: number | null
  grossProfitCents?: number | null
  operatingExpensesCents?: number | null
  netOperatingIncomeCents?: number | null
  otherIncomeCents?: number | null
  netIncomeCents?: number | null
  depreciationCents?: number | null
  payrollWagesCents?: number | null
  contractorsCents?: number | null
  recurringServicesIncomeCents?: number | null
  avgMonthlyNetCents?: number
  avgMonthlyGrossCents?: number
  grossMarginPct?: number | null
}

export interface QbSnapshot {
  asOfDate?: string
  periodLabel?: string
  monthsInPeriod?: number
  source?: string
  pl?: QbProfitAndLoss
  balanceSheet?: QbBalanceSheet
}

export interface ArSnapshot {
  asOfDate?: string | null
  totalOpenCents?: number
  bucketTotalsCents?: Record<string, number>
  byCustomer?: Record<string, {
    totalCents: number
    invoiceCount?: number
    oldestInvoiceDate?: string | null
    byBucketCents?: Record<string, number>
  }>
  invoiceCount?: number
}

// ─── QuickBooks spend insight (vendor / category over time + anomalies) ──────
// The Amex bill shows up in Sequence as one lump "AMEX EPAYMENT", but in
// QuickBooks it's already split into real expense accounts and vendors. We pull
// two month-summarized QBO reports — ProfitAndLoss (category × month) and
// VendorExpenses (vendor × month, == the "Expenses by Vendor" report) — parse
// them into these series, and run month-over-month anomaly detection on top.

export interface QbSpendPoint {
  key: string    // 'YYYY-MM'
  label: string  // 'Apr 26'
}

export interface QbSpendRow {
  label: string          // expense account/category name, or vendor name
  monthlyCents: number[] // aligned 1:1 with QbSpendSeries.months
  totalCents: number     // sum across the window
}

export interface QbSpendSeries {
  kind: 'category' | 'vendor'
  months: QbSpendPoint[]
  rows: QbSpendRow[]     // sorted by totalCents desc
}

export type SpendAnomalyType = 'spike' | 'new' | 'dropped'

export interface QbSpendAnomaly {
  kind: 'category' | 'vendor'
  type: SpendAnomalyType
  label: string
  monthKey: string
  monthLabel: string
  latestCents: number
  baselineCents: number  // mean of the prior complete months
  deltaCents: number     // latest − baseline (signed)
  ratio: number | null   // latest / baseline (null when baseline ≈ 0)
  monthly: number[]      // the row's full series, for the detail trail
}

export interface QbSpendInsights {
  source: 'live'
  asOfLabel: string            // last complete month, e.g. 'Apr 2026'
  months: QbSpendPoint[]
  totalMonthlyCents: number[]  // total expense per month (all categories), for the trend line
  byCategory: QbSpendRow[]     // top categories by window total
  byVendor: QbSpendRow[]       // top vendors by window total
  anomalies: QbSpendAnomaly[]  // ranked by absolute dollar impact
}
