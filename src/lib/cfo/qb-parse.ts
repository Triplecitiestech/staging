/**
 * Parse QuickBooks Online report JSON into the snapshot shapes the dashboard
 * consumes. Ported from the standalone tool's qb-parse.mjs.
 *
 * QBO reports are recursive: a Row is either a Data row with ColData[], or a
 * Section row with optional Header / nested Rows / Summary. We flatten into
 * { label, amountCents, isSummary } entries and pick lines by label matching.
 */

import type { QbBalanceSheet, QbProfitAndLoss, ArSnapshot, QbSpendSeries, QbSpendRow, QbSpendPoint } from './types'

interface ColDataCell { value?: string | null }
interface QbColMeta { Name?: string; Value?: string }
interface QbColumn { ColType?: string; ColTitle?: string; MetaData?: QbColMeta[] }
interface QbRow {
  ColData?: ColDataCell[]
  Header?: { ColData?: ColDataCell[] }
  Rows?: { Row?: QbRow[] }
  Summary?: { ColData?: ColDataCell[] }
}
export interface QbReport {
  Header?: { EndPeriod?: string; ReportDate?: string; StartPeriod?: string }
  Columns?: { Column?: QbColumn[] }
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

// ─── Month-summarized spend series (category / vendor × month) ───────────────
// A report run with summarize_column_by=Month has one Column per month (plus a
// trailing Total). Each month Column carries MetaData StartDate/EndDate, which
// we use to derive a stable 'YYYY-MM' key. Data rows then expose one ColData
// cell per column. We walk the rows ourselves (rather than reuse
// flattenReport) so we can track the top-level section — for ProfitAndLoss we
// keep only the Expenses / COGS region; VendorExpenses is a flat vendor list.

interface PeriodCol { index: number; point: QbSpendPoint }

function detectPeriodColumns(report: QbReport): PeriodCol[] {
  const cols = report?.Columns?.Column ?? []
  const periods: PeriodCol[] = []
  cols.forEach((c, index) => {
    if (index === 0) return // first column is the row label
    const title = (c.ColTitle || '').trim()
    if (/^total$/i.test(title)) return // skip the trailing Total column
    const startMeta = c.MetaData?.find((m) => /start/i.test(m.Name || ''))?.Value
    const dateStr = startMeta || (title && !Number.isNaN(new Date(title).getTime()) ? title : null)
    if (!dateStr) return
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    periods.push({ index, point: { key, label } })
  })
  return periods
}

interface RawSeriesRow { label: string; root: string | null; depth: number; monthlyCents: number[]; totalCents: number }

/**
 * Parse a month-summarized QBO report into a QbSpendSeries.
 *   kind 'category' → ProfitAndLoss: keep leaf rows in the Expenses / COGS region.
 *   kind 'vendor'   → VendorExpenses: keep every vendor data row.
 * Tolerant: if no monthly columns are present (e.g. the report didn't honor
 * summarize_column_by), returns an empty series so callers degrade gracefully.
 */
export function parseSpendSeries(report: QbReport | null | undefined, kind: 'category' | 'vendor'): QbSpendSeries {
  const periods = report ? detectPeriodColumns(report) : []
  if (!report || periods.length === 0) return { kind, months: [], rows: [] }

  const raw: RawSeriesRow[] = []
  const walk = (rowArr: QbRow[], depth: number, root: string | null) => {
    for (const row of rowArr) {
      const headerLabel = row.Header?.ColData?.[0]?.value ?? undefined
      const nextRoot = depth === 0 ? (headerLabel ?? root) : root
      // Only line-item data rows (ColData) become series rows — never the
      // section Summary rows (which would double-count their children).
      if (Array.isArray(row.ColData)) {
        const label = (row.ColData[0]?.value ?? '').trim()
        if (label && !/^total\b/i.test(label)) {
          const monthlyCents = periods.map((p) => toCents(row.ColData![p.index]?.value) ?? 0)
          const totalCents = monthlyCents.reduce((s, x) => s + x, 0)
          raw.push({ label, root: nextRoot, depth, monthlyCents, totalCents })
        }
      }
      if (row.Rows?.Row) walk(row.Rows.Row, depth + 1, nextRoot)
    }
  }
  walk(report.Rows?.Row ?? [], 0, null)

  let rows: RawSeriesRow[]
  if (kind === 'category') {
    const isExpenseRoot = (r: RawSeriesRow) => /expense|cost of goods|cogs/i.test(r.root || '')
    rows = raw.filter(isExpenseRoot)
    // Fallback if the P&L layout didn't surface an Expenses header: drop the
    // income/revenue region and keep the rest.
    if (rows.length === 0) rows = raw.filter((r) => !/income|revenue/i.test(r.root || ''))
  } else {
    rows = raw
  }

  const out: QbSpendRow[] = rows
    .filter((r) => r.totalCents !== 0)
    .map((r) => ({ label: r.label, monthlyCents: r.monthlyCents, totalCents: r.totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)

  return { kind, months: periods.map((p) => p.point), rows: out }
}
