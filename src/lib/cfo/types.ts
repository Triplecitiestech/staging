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
