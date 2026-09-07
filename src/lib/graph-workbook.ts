// src/lib/graph-workbook.ts
//
// Shared, pure helpers for appending a row to an Excel workbook table that a
// HUMAN also edits, through the Microsoft Graph workbook API.
//
// Extracted from src/lib/hr/employee-relations.ts on 2026-09-07 when the Raven
// scan filing pipeline needed the same row planner. Nothing here is new logic —
// it is the code that fixed the 2026-07-30 outage, where hr_er_log_append had
// the row width hardcoded at 14 values, the owner added a 15th column to the
// workbook, and every append died on Graph 400 "The number of rows or columns in
// the input array doesn't match the size or dimensions of the range."
//
// The rule that came out of that outage, and the whole point of this module:
//
//   THE SHEET'S LIVE HEADER ROW IS THE AUTHORITY ON WIDTH AND ORDER.
//   A field-spec list only says which headers we have content for.
//
// It is shared rather than copied precisely because the copy would have to
// re-learn that the hard way.

// ---------------------------------------------------------------------------
// Text and date normalisation
// ---------------------------------------------------------------------------

/**
 * Reduce a value to plain text: strip emojis/pictographs/zero-width joiners and
 * control characters, collapse whitespace. Standing rule for these workbooks —
 * they must stay copy-paste-clean and CSV-safe.
 */
export function sanitizePlainText(input: unknown): string {
  if (input === null || input === undefined) return ''
  const s = String(input).normalize('NFKC')
  return s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      ''
    )
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** YYYY-MM-DD in America/New_York for "now". */
export function todayEastern(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Normalize a date input to YYYY-MM-DD (Eastern). A bare YYYY-MM-DD passes
 * through unchanged (no timezone shift); anything else is parsed and reformatted
 * in Eastern. Unparseable input is returned sanitized so nothing is silently lost.
 */
export function normalizeDate(input: unknown): string {
  const s = sanitizePlainText(input)
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return todayEastern(d)
  return s
}

/**
 * Header-matching key: case-, spacing- and punctuation-insensitive.
 * "Role / Status", "Role/Status" and "role status" all collapse to "rolestatus",
 * so cosmetic header edits by a human do not silently unmap a column.
 */
export function normalizeHeader(name: unknown): string {
  return sanitizePlainText(name).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Does this header opt into being mandatory?
 *
 * IMPORTANT: Excel tables carry NO required-column metadata, and Graph reports
 * none — so this is a HEADER-TEXT CONVENTION the sheet's owner can use, not a
 * fact read from the workbook. Deliberately narrow (a trailing `*`, or an
 * explicit `(required)`): a bare word like "required" would false-positive on a
 * column named "Required Action", and a spurious hard failure blocks the owner
 * from recording something real.
 */
export function headerMarksRequired(name: unknown): boolean {
  const s = sanitizePlainText(name)
  return /\*\s*$/.test(s) || /\(\s*required\s*\)/i.test(s)
}

// ---------------------------------------------------------------------------
// Field specs and row planning
// ---------------------------------------------------------------------------

/**
 * One column this tool KNOWS how to populate.
 *
 * THIS IS NOT THE ROW WIDTH. See the module header — a list like this describing
 * width is the exact bug that made this module exist.
 */
export interface WorkbookFieldSpec {
  /** Canonical workbook header. */
  column: string
  /** How the value is normalized on the way in. */
  kind: 'text' | 'date' | 'computed'
  /** Other header spellings that mean this same column. */
  aliases?: string[]
  /**
   * The tool treats this as mandatory content. If the sheet has no column for it
   * AND the caller supplied a value, the append fails loudly rather than silently
   * dropping what the human wrote.
   */
  contentCritical?: boolean
}

export type RowProblem =
  | { kind: 'no_columns' }
  /** The sheet lost a column we have content for — writing would drop it. */
  | { kind: 'missing_target_column'; column: string }
  /** The sheet marks a column required and no tool input can fill it. */
  | { kind: 'unpopulatable_required_column'; column: string }

export interface RowPlan {
  /** Row values in LIVE column order; width === liveColumns.length by construction. */
  values: string[]
  /** Live column name → value written (a report, for the tool result). */
  byColumn: Record<string, string>
  /** Live columns no tool input maps to. Padded with '' and warned about. */
  unmappedColumns: string[]
  /** Index of the identifier column in the live row, for read-back verification. */
  idColumnIndex: number | null
  /** Non-empty means: do not write; raise a structured failure instead. */
  problems: RowProblem[]
  warnings: string[]
}

/**
 * Build the row to append from the table's LIVE header row.
 *
 * Contract:
 *   - width and order come from `liveColumns`, never from `fields`
 *   - a live column we have no input for is padded with '' (so a column a human
 *     adds tomorrow cannot break the append)
 *   - content we cannot place, or a column marked required we cannot fill, is
 *     reported as a `problem` for the caller to turn into a structured failure
 *
 * `supplied` is keyed by CANONICAL column name.
 */
export function planWorkbookRow(
  liveColumns: readonly string[],
  supplied: Record<string, string>,
  opts: { fields: readonly WorkbookFieldSpec[]; idColumn: string }
): RowPlan {
  const { fields, idColumn } = opts
  const warnings: string[] = []
  const problems: RowProblem[] = []

  const specByKey = new Map<string, WorkbookFieldSpec>()
  for (const spec of fields) {
    for (const name of [spec.column, ...(spec.aliases ?? [])]) {
      specByKey.set(normalizeHeader(name), spec)
    }
  }

  const values: string[] = []
  const byColumn: Record<string, string> = {}
  const unmappedColumns: string[] = []
  const placed = new Set<string>()
  const seenKeys = new Set<string>()
  let idColumnIndex: number | null = null

  liveColumns.forEach((live, index) => {
    const key = normalizeHeader(live)
    const record = (value: string) => {
      values.push(value)
      if (!(live in byColumn)) byColumn[live] = value
    }

    if (seenKeys.has(key)) {
      warnings.push(
        `The sheet has more than one column matching "${live}". Only the first was ` +
          `populated; the duplicate was left blank. Reconcile the header row.`
      )
      record('')
      return
    }
    seenKeys.add(key)

    const spec = specByKey.get(key)
    if (!spec) {
      if (headerMarksRequired(live)) problems.push({ kind: 'unpopulatable_required_column', column: live })
      else unmappedColumns.push(live)
      record('')
      return
    }

    if (spec.column === idColumn) idColumnIndex = index
    placed.add(spec.column)
    record(supplied[spec.column] ?? '')
  })

  if (liveColumns.length === 0) problems.push({ kind: 'no_columns' })

  // Content with nowhere to go. Only an error when there IS content: a blank
  // optional field losing its column costs nothing, so it must not hard-fail.
  for (const spec of fields) {
    if (placed.has(spec.column)) continue
    if (!(supplied[spec.column] ?? '')) continue
    if (spec.contentCritical) problems.push({ kind: 'missing_target_column', column: spec.column })
    else
      warnings.push(
        `The sheet has no "${spec.column}" column, so that value was not written. ` +
          `Add the column to the sheet if it should be recorded.`
      )
  }

  if (unmappedColumns.length > 0) {
    warnings.push(
      `The sheet has ${unmappedColumns.length} column(s) this tool has no input for: ` +
        `${unmappedColumns.join(', ')}. They were left blank so the row width matches the ` +
        `table. If one should be filled by this tool, a parameter needs adding for it.`
    )
  }

  return { values, byColumn, unmappedColumns, idColumnIndex, problems, warnings }
}

/** Row values keyed by the sheet's own headers. First occurrence wins, as in planWorkbookRow. */
export function keyRowByColumns(
  columns: readonly string[],
  values: readonly unknown[]
): Record<string, string> {
  const out: Record<string, string> = {}
  columns.forEach((column, i) => {
    if (!(column in out)) out[column] = String(values[i] ?? '')
  })
  return out
}

/**
 * Address an Excel table by its NAME (a clean token like "Table1"), never by the
 * braces-GUID `id`. Graph 404s on a percent-encoded `{...}` id in the URL path
 * (`%7B...%7D`) — which silently broke every table call in production on
 * 2026-07-16. The name is the reliable half of Graph's `/tables/{id|name}` key.
 */
export function tableSegment(table: { name: string }): string {
  return encodeURIComponent(table.name)
}
