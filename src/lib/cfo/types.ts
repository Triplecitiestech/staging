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
  bankAccountsTotalCents?: number
  empowerBusinessCheckingCents?: number
  accountsReceivableCents?: number
  totalLiabilitiesCents?: number
  totalEquityCents?: number
  totalAssetsCents?: number
  [key: string]: number | undefined
}

export interface QbProfitAndLoss {
  incomeCents?: number
  cogsCents?: number
  grossProfitCents?: number
  netIncomeCents?: number
  avgMonthlyNetCents?: number
  avgMonthlyGrossCents?: number
  grossMarginPct?: number | null
  [key: string]: number | null | undefined
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
  asOfDate?: string
  totalOpenCents?: number
  bucketTotalsCents?: Record<string, number>
  byCustomer?: Record<string, {
    totalCents: number
    invoiceCount?: number
    oldestInvoiceDate?: string
    byBucketCents?: Record<string, number>
  }>
  invoiceCount?: number
}
