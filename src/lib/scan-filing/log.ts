// src/lib/scan-filing/log.ts
//
// The running log of every processed Raven scan: what arrived, what it was
// identified as, what it was renamed to, where it landed, and whether Rio was
// told. One row per scan, append-only, with clickable links.
//
// Built on the SAME shared row planner as the Employee Relations log
// (src/lib/graph-workbook.ts), which means it inherits the rule that fixed the
// 2026-07-30 outage: the workbook's LIVE header row decides the width and order
// of the appended row, so Kurtis can add a column to the sheet without breaking
// the tool. SCAN_FIELDS below says only which headers this tool has content for.
//
// The Scan ID is computed from the sheet's own Scan ID column, never passed in
// and never inferred from anything else. That is the same discipline the ER log
// enforces, and for the same reason: two rows claiming to be SCAN-0007 makes the
// log worse than no log.

import {
  keyRowByColumns,
  normalizeDate,
  normalizeHeader,
  planWorkbookRow,
  sanitizePlainText,
  tableSegment,
  todayEastern,
  type WorkbookFieldSpec,
} from '@/lib/graph-workbook'
import { throwClassified } from '@/lib/connector/failure-envelope'
import { withRetry, withTimeout } from '@/lib/resilience'
import { assertScanReady, graphJson } from './graph'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Workbook location. No live-verified default exists — unlike the HR log, this
 * workbook is created as part of standing the pipeline up, so a hardcoded id
 * here would be a guess. Absent config fails with instructions instead.
 */
function logLocation(): { driveId: string; itemId: string } {
  const driveId = process.env.SCAN_LOG_DRIVE_ID
  const itemId = process.env.SCAN_LOG_ITEM_ID
  if (!driveId || !itemId) {
    throwClassified({
      reasonCode: 'POLICY_BLOCKED',
      message: 'The scan log workbook is not configured, so no scan can be logged yet.',
      remediation:
        'Create the scan log workbook (an .xlsx with the header row listed in SCAN_LOG_HEADER_ROW, ' +
        'formatted as an Excel table), then set SCAN_LOG_DRIVE_ID and SCAN_LOG_ITEM_ID in the Vercel ' +
        'project. Both ids come from Graph: GET /drives/{driveId}/root:/{path}:/ returns the item id.',
      surface: 'scan_filer',
      details: {
        headerRow: SCAN_LOG_HEADER_ROW,
        missing: [!driveId && 'SCAN_LOG_DRIVE_ID', !itemId && 'SCAN_LOG_ITEM_ID'].filter(Boolean),
      },
    })
  }
  return { driveId, itemId }
}

/** Worksheet tab holding the log table, if the workbook has several. */
const LOG_WORKSHEET = process.env.SCAN_LOG_WORKSHEET || 'Scans'

export interface ScanFieldSpec extends WorkbookFieldSpec {
  /** Key on ScanLogAppendInput supplying it (absent = computed by the tool). */
  input?: keyof ScanLogAppendInput
}

/**
 * The columns this tool knows how to populate — NOT the row width.
 *
 * Column names come from the build spec's log table. Aliases cover the
 * spellings a human is most likely to use when creating the sheet, so a header
 * typed as "Filed To" or "Original file name" still maps.
 */
export const SCAN_FIELDS: readonly ScanFieldSpec[] = [
  { column: 'Scan ID', kind: 'computed', contentCritical: true, aliases: ['ScanID', 'ID'] },
  {
    column: 'Received',
    input: 'received',
    kind: 'text',
    contentCritical: true,
    aliases: ['Received At', 'Date Received', 'Received Date'],
  },
  {
    column: 'Original filename',
    input: 'originalFilename',
    kind: 'text',
    contentCritical: true,
    aliases: ['Original file name', 'Original Name', 'Source filename'],
  },
  {
    column: 'Identified as',
    input: 'identifiedAs',
    kind: 'text',
    contentCritical: true,
    aliases: ['Identified As', 'Document Type', 'Identification'],
  },
  {
    column: 'Renamed to',
    input: 'renamedTo',
    kind: 'text',
    aliases: ['Renamed To', 'New filename', 'Final filename'],
  },
  {
    column: 'Filed to',
    input: 'filedTo',
    kind: 'text',
    aliases: ['Filed To', 'Destination', 'Location', 'File URL'],
  },
  {
    column: 'Source email',
    input: 'sourceEmail',
    kind: 'text',
    contentCritical: true,
    aliases: ['Source Email', 'Email link', 'Message link'],
  },
  {
    column: 'Rio notified',
    input: 'rioNotified',
    kind: 'text',
    aliases: ['Rio Notified', 'Notified'],
  },
  { column: 'Confidence', input: 'confidence', kind: 'text', aliases: ['Confidence Level'] },
  // Not in the original spec table, and optional: when a scan lands in
  // _Needs Review or on an unconfirmed site the reason belongs in the log, not
  // only in a chat message nobody can search a week later.
  { column: 'Notes', input: 'notes', kind: 'text', aliases: ['Note', 'Comments', 'Remarks'] },
]

/** The header row to create the workbook with. Order is a suggestion; the sheet wins. */
export const SCAN_LOG_HEADER_ROW: readonly string[] = SCAN_FIELDS.map((f) => f.column)

/** Values the pipeline uses for the Rio-notified column. */
export const RIO_NOTIFIED_VALUES = ['Yes', 'No', 'N/A'] as const
export type RioNotified = (typeof RIO_NOTIFIED_VALUES)[number]

/** Values the pipeline uses for the confidence column. */
export const CONFIDENCE_VALUES = ['High', 'Low'] as const
export type ScanConfidence = (typeof CONFIDENCE_VALUES)[number]

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function formatScanId(n: number): string {
  return `SCAN-${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`
}

/** Highest SCAN-NNNN in the supplied Scan-ID cell values, + 1 (min 1). */
export function nextScanIdNumber(cells: readonly unknown[]): number {
  let max = 0
  for (const cell of cells) {
    const m = /^SCAN-(\d+)$/i.exec(String(cell ?? '').trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

/**
 * Normalise a received timestamp for the log.
 *
 * Graph hands back UTC ISO ("2026-09-07T13:04:10Z"); the log is read by people
 * in Binghamton, so it is stored in Eastern with the offset shown. A bare
 * YYYY-MM-DD is left alone rather than being given a fabricated midnight.
 */
export function formatReceived(input: unknown, now: Date = new Date()): string {
  const s = sanitizePlainText(input)
  if (!s) return `${todayEastern(now)} (received time not reported)`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')} ${get('timeZoneName')}`
}

export interface ScanLogAppendInput {
  received?: string
  originalFilename: string
  identifiedAs: string
  renamedTo?: string
  filedTo?: string
  sourceEmail: string
  rioNotified?: string
  confidence?: string
  notes?: string
}

/** Canonical-column → normalized value map, driven entirely by SCAN_FIELDS. */
export function suppliedScanValues(
  input: ScanLogAppendInput,
  computed: { scanId: string; received: string }
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of SCAN_FIELDS) {
    if (spec.column === 'Scan ID') {
      out[spec.column] = computed.scanId
      continue
    }
    if (spec.column === 'Received') {
      out[spec.column] = computed.received
      continue
    }
    const raw = spec.input ? input[spec.input] : undefined
    out[spec.column] = spec.kind === 'date' ? normalizeDate(raw) : sanitizePlainText(raw)
  }
  return out
}

/**
 * Turn row-plan problems into a routed failure.
 *
 * A column the tool cannot populate must name itself and its owner. A raw Graph
 * 400 about array dimensions tells the reader nothing about which column to add
 * — that was the entire 2026-07-30 lesson.
 */
function throwRowProblems(
  problems: ReturnType<typeof planWorkbookRow>['problems'],
  liveColumns: readonly string[]
): never {
  const sheet = `Live table columns (${liveColumns.length}): ${liveColumns.join(' | ') || '(none)'}`

  const noColumns = problems.find((p) => p.kind === 'no_columns')
  if (noColumns) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: 'The scan log table has no columns, so there is no row shape to append to.',
      evidence: sheet,
      remediation:
        `Give the sheet a header row and format it as an Excel table. The expected headers are: ` +
        `${SCAN_LOG_HEADER_ROW.join(' | ')}.`,
      surface: 'scan_filer',
    })
  }

  const missing = problems.filter((p) => p.kind === 'missing_target_column') as Array<{
    kind: 'missing_target_column'
    column: string
  }>
  if (missing.length > 0) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `The scan log has no column for ${missing.map((m) => `"${m.column}"`).join(', ')}, and this scan ` +
        `has content for ${missing.length === 1 ? 'it' : 'them'}. Nothing was written — dropping the value ` +
        `silently would leave a log row that looks complete and is not.`,
      evidence: sheet,
      remediation: `Add the column(s) to the scan log table, then call again.`,
      surface: 'scan_filer',
    })
  }

  const unfillable = problems.filter((p) => p.kind === 'unpopulatable_required_column') as Array<{
    kind: 'unpopulatable_required_column'
    column: string
  }>
  throwClassified({
    reasonCode: 'NOT_IMPLEMENTED',
    message:
      `The scan log marks ${unfillable.map((u) => `"${u.column}"`).join(', ')} as required (a trailing "*" ` +
      `or "(required)" in the header) and this tool has no input that fills it.`,
    evidence: sheet,
    remediation:
      'Either drop the required marker from that header, or ask Claude Code to add a parameter for it. ' +
      'A required column the tool cannot fill is a connector gap, not a caller error.',
    surface: 'scan_filer',
  })
}

// ---------------------------------------------------------------------------
// Graph: locating the table
// ---------------------------------------------------------------------------

interface WorkbookTable {
  id: string
  name: string
}

async function tableHasScanId(base: string, table: WorkbookTable): Promise<boolean> {
  try {
    const cols = await graphJson<{ value: Array<{ name: string }> }>(
      `${base}/tables/${tableSegment(table)}/columns?$select=name`
    )
    return (cols.value ?? []).some((c) => normalizeHeader(c.name) === normalizeHeader('Scan ID'))
  } catch {
    return false
  }
}

/**
 * Resolve the log table at CALL TIME, never from a cached or hardcoded id — the
 * workbook belongs to a human who may rename a tab or replace the file.
 *
 * Unlike the ER log, this deliberately does NOT create a table out of a
 * worksheet's used range if it cannot find one. The ER workbook predates its
 * tooling and had rows to preserve; this workbook is created for this pipeline,
 * so "no table with a Scan ID column" means the setup step was not done, and
 * inventing a table would paper over that with a sheet nobody designed.
 */
async function resolveLogTable(driveId: string, itemId: string): Promise<WorkbookTable> {
  const base = `/drives/${driveId}/items/${itemId}/workbook`
  const tables = (await graphJson<{ value: WorkbookTable[] }>(`${base}/tables?$select=id,name`)).value ?? []

  for (const t of tables) {
    if (await tableHasScanId(base, t)) return t
  }

  throwClassified({
    reasonCode: 'PRECONDITION_FAILED',
    message:
      'The scan log workbook has no Excel table with a "Scan ID" column, so there is nothing to append to.',
    evidence:
      tables.length === 0
        ? 'The workbook contains no Excel tables at all (a plain range of cells is not a table).'
        : `The workbook's tables are: ${tables.map((t) => t.name).join(', ')} — none has a "Scan ID" column.`,
    remediation:
      `In the workbook, put this header row on the "${LOG_WORKSHEET}" sheet and use Insert > Table with ` +
      `"My table has headers" ticked: ${SCAN_LOG_HEADER_ROW.join(' | ')}.`,
    surface: 'scan_filer',
  })
}

interface LiveTableShape {
  columns: string[]
  scanIdValues: string[]
  tableName: string
}

/** Read the table's LIVE header row and existing Scan IDs in one call. */
async function readTableShape(
  driveId: string,
  itemId: string,
  table: WorkbookTable
): Promise<LiveTableShape> {
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSegment(table)}`
  const cols = await graphJson<{
    value: Array<{ name: string; index: number; values: unknown[][] }>
  }>(`${base}/columns?$select=name,index,values`)

  // Sort by the API's own index rather than trusting response order — the row
  // we build is POSITIONAL, so a wrong order writes values into wrong columns.
  const list = [...(cols.value ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const columns = list.map((c) => String(c.name ?? ''))

  const idCol =
    list.find((c) => normalizeHeader(c.name) === normalizeHeader('Scan ID')) ??
    list.find((c) => c.index === 0)
  const scanIdValues = idCol
    ? (idCol.values ?? []).slice(1).map((row) => String(row?.[0] ?? '').trim())
    : []

  return { columns, scanIdValues, tableName: table.name }
}

// ---------------------------------------------------------------------------
// Public operation 1: report the live shape (writes nothing)
// ---------------------------------------------------------------------------

export interface ScanLogShapeReport {
  tableName: string
  columns: string[]
  rowCount: number
  lastScanId: string | null
  nextScanId: string
  /** Live columns no parameter of scan_log_append maps to. */
  unmappedColumns: string[]
  /** Columns this tool has content for that the sheet does not have. */
  missingColumns: string[]
  workbookWebUrl: string | null
}

/**
 * Report the log's live shape WITHOUT writing.
 *
 * This exists because of a specific past failure: before hr_er_log_columns, the
 * only way to find out what a workbook's columns were was to attempt an append
 * and read the error. A diagnostic whose only form is a failed write is not a
 * diagnostic.
 */
export async function describeScanLogTable(): Promise<ScanLogShapeReport> {
  assertScanReady()
  const { driveId, itemId } = logLocation()
  const table = await resolveLogTable(driveId, itemId)
  const shape = await readTableShape(driveId, itemId, table)

  const known = new Set<string>()
  for (const spec of SCAN_FIELDS) {
    known.add(normalizeHeader(spec.column))
    for (const a of spec.aliases ?? []) known.add(normalizeHeader(a))
  }
  const liveKeys = new Set(shape.columns.map((c) => normalizeHeader(c)))

  const workbookWebUrl = await graphJson<{ webUrl?: string }>(
    `/drives/${driveId}/items/${itemId}?$select=webUrl`
  )
    .then((i) => i.webUrl ?? null)
    .catch(() => null)

  const lastScanId = [...shape.scanIdValues].reverse().find((v) => /^SCAN-\d+$/i.test(v)) ?? null

  return {
    tableName: shape.tableName,
    columns: shape.columns,
    rowCount: shape.scanIdValues.length,
    lastScanId,
    nextScanId: formatScanId(nextScanIdNumber(shape.scanIdValues)),
    unmappedColumns: shape.columns.filter((c) => !known.has(normalizeHeader(c))),
    missingColumns: SCAN_FIELDS.filter((f) => !liveKeys.has(normalizeHeader(f.column))).map(
      (f) => f.column
    ),
    workbookWebUrl,
  }
}

// ---------------------------------------------------------------------------
// Public operation 2: append one row
// ---------------------------------------------------------------------------

export interface ScanLogAppendResult {
  scanId: string
  row: Record<string, string>
  rowIndex: number | null
  verified: boolean
  duplicateScanIdDetected: boolean
  tableName: string
  tableColumns: string[]
  unmappedColumns: string[]
  workbookWebUrl: string | null
  warnings: string[]
}

export async function appendScanLogRow(input: ScanLogAppendInput): Promise<ScanLogAppendResult> {
  assertScanReady()
  const warnings: string[] = []

  const { driveId, itemId } = logLocation()
  const table = await resolveLogTable(driveId, itemId)
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSegment(table)}`
  const shape = await readTableShape(driveId, itemId, table)

  const scanId = formatScanId(nextScanIdNumber(shape.scanIdValues))
  const received = formatReceived(input.received)

  const supplied = suppliedScanValues(input, { scanId, received })
  const plan = planWorkbookRow(shape.columns, supplied, {
    fields: SCAN_FIELDS,
    idColumn: 'Scan ID',
  })
  if (plan.problems.length > 0) throwRowProblems(plan.problems, shape.columns)
  warnings.push(...plan.warnings)

  const added = await withTimeout(
    () =>
      withRetry(
        () =>
          graphJson<{ index: number | null; values: unknown[][] }>(`${base}/rows`, {
            method: 'POST',
            body: JSON.stringify({ index: null, values: [plan.values] }),
          }),
        { maxRetries: 2, baseDelayMs: 600 }
      ),
    30_000,
    'appendScanLogRow'
  )

  // Read-back: the created row must carry our Scan ID, read at the Scan ID
  // column's LIVE position — it need not be the first column.
  const writtenId =
    plan.idColumnIndex === null ? '' : String(added?.values?.[0]?.[plan.idColumnIndex] ?? '')
  const verified = plan.idColumnIndex !== null && writtenId === scanId
  if (!verified) {
    warnings.push(
      `Read-back mismatch: the appended row shows "${writtenId}" where "${scanId}" was written. ` +
        `Check the workbook before treating this scan as logged.`
    )
  }

  // Concurrency: two runs computing the same next id would both append.
  let duplicateScanIdDetected = false
  try {
    const after = await readTableShape(driveId, itemId, table)
    const count = after.scanIdValues.filter((v) => v === scanId).length
    if (count > 1) {
      duplicateScanIdDetected = true
      warnings.push(
        `Scan ID ${scanId} now appears ${count} times — a concurrent run likely claimed the same id. ` +
          `The row was still appended (nothing was overwritten); reconcile the duplicate in the workbook.`
      )
    }
  } catch {
    warnings.push('Could not re-read the Scan ID column to confirm the id is unique.')
  }

  const workbookWebUrl = await graphJson<{ webUrl?: string }>(
    `/drives/${driveId}/items/${itemId}?$select=webUrl`
  )
    .then((i) => i.webUrl ?? null)
    .catch(() => null)

  return {
    scanId,
    row: keyRowByColumns(shape.columns, plan.values),
    rowIndex: added?.index ?? null,
    verified,
    duplicateScanIdDetected,
    tableName: shape.tableName,
    tableColumns: shape.columns,
    unmappedColumns: plan.unmappedColumns,
    workbookWebUrl,
    warnings,
  }
}
