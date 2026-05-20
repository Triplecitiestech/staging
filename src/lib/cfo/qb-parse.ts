/**
 * Parse QuickBooks Online report JSON into the snapshot shapes the dashboard
 * consumes. Ported from the standalone tool's qb-parse.mjs.
 *
 * QBO reports are recursive: a Row is either a Data row with ColData[], or a
 * Section row with optional Header / nested Rows / Summary. We flatten into
 * { label, amountCents, isSummary } entries and pick lines by label matching.
 */

import type { QbBalanceSheet, QbProfitAndLoss, ArSnapshot } from './types'

interface ColDataCell { value?: string | null }
interface QbRow {
  ColData?: ColDataCell[]
  Header?: { ColData?: ColDataCell[] }
  Rows?: { Row?: QbRow[] }
  Summary?: { ColData?: ColDataCell[] }
}
export interface QbReport {
  Header?: { EndPeriod?: string; ReportDate?: string; StartPeriod?: string }
  Columns?: { Column?: { ColType?: string; ColTitle?: string }[] }
  Rows?: { Row?: QbRow[] }
}

interface FlatRow {
  label: string
  amountCents: number | null
  isSummary: boolean
  depth: number
  section: string | null
  isHeader?: boolean
  colData?: ColDataCell[]
}

const toCents = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/[,$]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function flattenReport(report: QbReport | null | undefined): FlatRow[] {
  const out: FlatRow[] = []
  const rows = report?.Rows?.Row
  if (!Array.isArray(rows)) return out

  const walk = (rowArr: QbRow[], depth: number, section: string | null) => {
    for (const row of rowArr) {
      const headerLabel = row.Header?.ColData?.[0]?.value ?? undefined
      if (row.ColData && Array.isArray(row.ColData)) {
        const label = row.ColData[0]?.value ?? ''
        const lastWithVal = [...row.ColData].reverse().find((c) => c.value !== '' && c.value != null)
        out.push({ label, amountCents: toCents(lastWithVal?.value), isSummary: false, depth, section, colData: row.ColData })
      }
      if (headerLabel) {
        out.push({ label: headerLabel, amountCents: null, isSummary: false, depth, isHeader: true, section })
      }
      if (row.Rows?.Row) walk(row.Rows.Row, depth + 1, headerLabel || section)
      if (row.Summary?.ColData) {
        const label = row.Summary.ColData[0]?.value ?? ''
        const lastWithVal = [...row.Summary.ColData].reverse().find((c) => c.value !== '' && c.value != null)
        out.push({ label, amountCents: toCents(lastWithVal?.value), isSummary: true, depth, section, colData: row.Summary.ColData })
      }
    }
  }
  walk(rows, 0, null)
  return out
}

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

function find(flat: FlatRow[], ...matchers: (string | RegExp)[]): number | null {
  for (const m of matchers) {
    const re = m instanceof RegExp ? m : new RegExp(norm(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const hit = flat.find((r) => re.test(norm(r.label)) && r.amountCents != null)
    if (hit) return hit.amountCents
  }
  return null
}

export function parseBalanceSheet(report: QbReport): QbBalanceSheet {
  const flat = flattenReport(report)
  const creditCards = flat
    .filter((r) => !r.isSummary && !r.isHeader && /credit cards?/i.test(r.section || '') && r.amountCents)
    .map((r) => ({ name: r.label, balanceCents: r.amountCents as number }))

  return {
    asOfDate: report?.Header?.EndPeriod || report?.Header?.ReportDate || null,
    bankAccountsTotalCents: find(flat, /total .*bank accounts/, 'total bank accounts'),
    empowerBusinessCheckingCents: find(flat, /empower.*business checking|business checking empower/),
    accountsReceivableCents: find(flat, /total .*accounts receivable/, 'accounts receivable (a/r)', /accounts receivable/),
    undepositedFundsCents: find(flat, /undeposited funds/),
    creditCards,
    totalCreditCardOwedCents: find(flat, /total .*credit cards?/),
    visionsTaxLoanCents: find(flat, /visions.*back tax|visions loan/),
    nyStateTaxOwedCents: find(flat, /nys?.*(taxation|dtf)|new york state tax/),
    fixedAssetsNetCents: find(flat, /total .*fixed assets/),
    totalLiabilitiesCents: find(flat, /^total liabilities$/, /total liabilities(?! and)/),
    totalEquityCents: find(flat, /total equity/),
    totalAssetsCents: find(flat, /^total assets$/, /total assets/),
    ownersDrawsLifetimeCents: find(flat, /total .*owner.s draw|owner.s draw/),
  }
}

export function parseProfitAndLoss(report: QbReport): QbProfitAndLoss {
  const flat = flattenReport(report)
  const h = report?.Header || {}
  return {
    startDate: h.StartPeriod || null,
    endDate: h.EndPeriod || null,
    incomeCents: find(flat, /^total income$/, /^total for income$/, /^income$/),
    cogsCents: find(flat, /^total cost of goods sold$/, /^total for cost of goods sold$/, /^total cogs$/),
    grossProfitCents: find(flat, /^gross profit$/),
    operatingExpensesCents: find(flat, /^total expenses$/, /^total for expenses$/),
    netOperatingIncomeCents: find(flat, /net operating income/),
    otherIncomeCents: find(flat, /net other income/, /total other income/),
    netIncomeCents: find(flat, /^net income$/, /net income/),
    depreciationCents: find(flat, /depreciation/),
    payrollWagesCents: find(flat, /payroll wage|wage expense/),
    contractorsCents: find(flat, /^contractors$/, /contractors/),
    recurringServicesIncomeCents: find(flat, /recurring services/),
  }
}

interface ArInvoice { bucket: string; customer: string; date: string; openCents: number }

export function parseAgedReceivableDetail(report: QbReport): ArSnapshot {
  const cols = (report?.Columns?.Column || []).map((c) => norm(c.ColType || c.ColTitle))
  const idx = {
    customer: cols.findIndex((c) => /cust|name/.test(c)),
    date: cols.findIndex((c) => c === 'date' || /txndate/.test(c)),
    amount: cols.findIndex((c) => /openbalance|open balance|amount|subt|balance/.test(c)),
  }

  const invoices: ArInvoice[] = []
  const rows = report?.Rows?.Row || []
  const walk = (rowArr: QbRow[], bucket: string | null) => {
    for (const row of rowArr) {
      const sectionLabel = row.Header?.ColData?.[0]?.value ?? undefined
      const nextBucket = sectionLabel && /current|past due|days/i.test(sectionLabel) ? sectionLabel : bucket
      if (row.ColData) {
        const cd = row.ColData
        const customer = (idx.customer >= 0 ? cd[idx.customer]?.value : cd[3]?.value) || ''
        const amtRaw = idx.amount >= 0 ? cd[idx.amount]?.value : cd[cd.length - 1]?.value
        const openCents = toCents(amtRaw)
        const date = (idx.date >= 0 ? cd[idx.date]?.value : cd[0]?.value) || ''
        if (customer && openCents != null) {
          invoices.push({ bucket: nextBucket || 'Unspecified', customer, date, openCents })
        }
      }
      if (row.Rows?.Row) walk(row.Rows.Row, nextBucket)
    }
  }
  walk(rows, null)

  const bucketName = (b: string): string => {
    const n = norm(b)
    if (/^current/.test(n)) return 'Current'
    if (/1 ?- ?30/.test(n)) return '1 - 30 days past due'
    if (/31 ?- ?60/.test(n)) return '31 - 60 days past due'
    if (/61 ?- ?90/.test(n)) return '61 - 90 days past due'
    if (/91|over|more/.test(n)) return '91 or more days past due'
    return b
  }

  const bucketTotalsCents: Record<string, number> = {}
  const byCustomer: Record<string, { totalCents: number; invoiceCount: number; oldestInvoiceDate: string | null; byBucketCents: Record<string, number> }> = {}
  for (const inv of invoices) {
    const bk = bucketName(inv.bucket)
    bucketTotalsCents[bk] = (bucketTotalsCents[bk] || 0) + inv.openCents
    if (!byCustomer[inv.customer]) byCustomer[inv.customer] = { totalCents: 0, invoiceCount: 0, oldestInvoiceDate: null, byBucketCents: {} }
    const c = byCustomer[inv.customer]
    c.totalCents += inv.openCents
    c.invoiceCount += 1
    c.byBucketCents[bk] = (c.byBucketCents[bk] || 0) + inv.openCents
    if (!c.oldestInvoiceDate || inv.date < c.oldestInvoiceDate) c.oldestInvoiceDate = inv.date
  }

  const sortedByCustomer = Object.fromEntries(
    Object.entries(byCustomer).sort(([, a], [, b]) => b.totalCents - a.totalCents)
  )

  return {
    asOfDate: report?.Header?.EndPeriod || report?.Header?.ReportDate || null,
    totalOpenCents: invoices.reduce((s, i) => s + i.openCents, 0),
    bucketTotalsCents,
    byCustomer: sortedByCustomer,
    invoiceCount: invoices.length,
  }
}
