/**
 * Employee Relations records — Microsoft Graph writes against TCT's OWN
 * HumanResources SharePoint site.
 *
 * WHY A THIRD GRAPH CLIENT (alongside graph.ts and graph-tct.ts):
 *   - graph.ts        → per-CUSTOMER tenants (multi-tenant portal app)
 *   - graph-tct.ts    → TCT's own tenant via the staff-SSO app (PTO/CFO)
 *   - THIS module     → TCT's own tenant via a DEDICATED, least-privilege app
 *                       that holds only `Sites.Selected` granted `write` to the
 *                       single HumanResources site. Isolating the connector's
 *                       file-write credential keeps its blast radius to one site
 *                       and keeps it out of the staff-SSO secret. (Owner decision
 *                       2026-07-15.)
 *
 * Credentials (env — all optional; the tools degrade to a clear "not configured"
 * error when unset, and stay dormant unless CONNECTOR_HR_WRITES_ENABLED === 'true'):
 *   - HR_RECORDS_TENANT_ID
 *   - HR_RECORDS_CLIENT_ID
 *   - HR_RECORDS_CLIENT_SECRET
 *
 * APP PERMISSION (Azure AD portal — admin consent):
 *   - Sites.Selected  (Application), THEN a per-site grant of the `write` role
 *     to the HumanResources site via POST /sites/{siteId}/permissions.
 *
 * NON-OBVIOUS GRAPH FACT (verified against MS Learn 2026-07-15): the Excel
 * workbook REST API's permission tables say "Application: Not supported" and the
 * overview lists only delegated scopes — that applies to /me and USER-SHARED
 * files. For an ORG-OWNED SharePoint site, an app-only token with `Sites.Selected`
 * granted to that site DOES drive the workbook API, and does NOT require
 * Sites.ReadWrite.All / Files.ReadWrite.All. If a workbook call 403s, the most
 * likely cause is that the per-site permission grant (step B in the runbook) was
 * never applied — not a code bug.
 *
 * Graph docs:
 *   - table rows add:   https://learn.microsoft.com/graph/api/table-post-rows
 *   - tables add:       https://learn.microsoft.com/graph/api/tablecollection-add
 *   - site permission:  https://learn.microsoft.com/graph/api/site-post-permissions
 *   - upload content:   https://learn.microsoft.com/graph/api/driveitem-put-content
 */

import { withRetry, withTimeout, structuredLog } from '@/lib/resilience'
import { throwClassified } from '@/lib/connector/failure-envelope'

// ---------------------------------------------------------------------------
// Configuration (env-overridable; live-verified defaults from the owner)
// ---------------------------------------------------------------------------

/** Documents-library drive of the HumanResources site (verified 2026-07). */
const DEFAULT_DRIVE_ID =
  process.env.HR_ER_DRIVE_ID ||
  'b!nhXC-RijgEyyUBGUdLTjT_bjHlTk0iVIi6o5Hdo5u0kT2Y7un8SyTIg6pt5LAt0W'
/** Workbook itemId of Employee Relations Log.xlsx (verified 2026-07). */
const DEFAULT_ITEM_ID = process.env.HR_ER_ITEM_ID || '01PWEAC3YF6BMXSB74CNDZ2PTOBVZZK5CU'

/** Site path (hostname:/sites/HumanResources) for the dynamic fallback resolve. */
const SITE_PATH = 'triplecitiestechcom.sharepoint.com:/sites/HumanResources'

/** Folder layout within the Documents library (see task spec / SOP). */
const EMPLOYEE_FILES_PATH = 'General/Employee Files'
const ER_FOLDER_NAME = '_Employee Relations'
const ER_WORKBOOK_NAME = 'Employee Relations Log.xlsx'
const PERFORMANCE_FOLDER = 'Performance & Conduct'

/** Worksheet holding the log table (override via env if the tab is renamed). */
const LOG_WORKSHEET = process.env.HR_ER_LOG_WORKSHEET || 'Log'

/**
 * The columns this tool KNOWS how to populate.
 *
 * THIS IS NOT THE ROW WIDTH. The row written to the workbook is built from the
 * table's LIVE header row read at call time (see planErRow), never from this
 * list. That distinction is the whole fix for the 2026-07-30 outage: this list
 * was 14 entries, a human had added a 15th column ("Meeting with Tech"), and
 * every append died on Graph 400 "The number of rows or columns in the input
 * array doesn't match the size or dimensions of the range." A hardcoded width
 * makes the sheet's owner unable to add a column without breaking the tool —
 * so the sheet is now the authority on width and order, and this table only
 * says which headers we have content for.
 */
export interface ErFieldSpec {
  /** Canonical workbook header. */
  column: string
  /** Key on ErLogAppendInput supplying it (absent = computed by the tool). */
  input?: keyof ErLogAppendInput
  /** How the value is normalized on the way in. */
  kind: 'text' | 'date' | 'computed'
  /** Other header spellings that mean this same column. */
  aliases?: string[]
  /**
   * The tool treats this as mandatory content. If the sheet has no column for
   * it AND the caller supplied a value, the append fails loudly rather than
   * silently dropping what the human wrote — losing an HR record's Summary or
   * Employee to a padded blank is worse than not writing the row.
   */
  contentCritical?: boolean
}

export const ER_FIELDS: readonly ErFieldSpec[] = [
  { column: 'Entry ID', kind: 'computed', contentCritical: true, aliases: ['EntryID', 'ER ID', 'ID'] },
  { column: 'Date Logged', input: 'dateLogged', kind: 'computed', contentCritical: true },
  { column: 'Date of Incident', input: 'dateOfIncident', kind: 'date', contentCritical: true, aliases: ['Incident Date'] },
  { column: 'Employee', input: 'employee', kind: 'text', contentCritical: true, aliases: ['Employee Name'] },
  { column: 'Role / Status', input: 'roleStatus', kind: 'text', contentCritical: true },
  { column: 'Category', input: 'category', kind: 'text', contentCritical: true },
  { column: 'Severity', input: 'severity', kind: 'text', contentCritical: true },
  { column: 'Summary', input: 'summary', kind: 'text', contentCritical: true },
  { column: 'Expectation Missed', input: 'expectationMissed', kind: 'text' },
  { column: 'Reference', input: 'reference', kind: 'text' },
  { column: 'Reported By', input: 'reportedBy', kind: 'text', contentCritical: true },
  { column: 'Action Taken', input: 'actionTaken', kind: 'text' },
  { column: 'Linked Document', input: 'linkedDocument', kind: 'text' },
  { column: 'Follow-Up / Status', input: 'followUpStatus', kind: 'text', aliases: ['Follow Up / Status', 'Follow-Up'] },
  // Added 2026-07-30 after the width outage: the owner had been filling this by
  // hand (populated on ER-0001 and ER-0004). Now settable through the tool.
  { column: 'Meeting with Tech', input: 'meetingWithTech', kind: 'text', aliases: ['Meeting With Technician'] },
]

/** Canonical header names, in canonical order. NOT the row width — see ER_FIELDS. */
export const ER_COLUMNS: readonly string[] = ER_FIELDS.map((f) => f.column)

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Simple-upload guard. Employee-relations docs are small; larger needs a session. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// ---------------------------------------------------------------------------
// Config / kill switch
// ---------------------------------------------------------------------------

export function isHrRecordsConfigured(): boolean {
  return Boolean(
    process.env.HR_RECORDS_TENANT_ID &&
      process.env.HR_RECORDS_CLIENT_ID &&
      process.env.HR_RECORDS_CLIENT_SECRET
  )
}

export function hrWritesEnabled(): boolean {
  return process.env.CONNECTOR_HR_WRITES_ENABLED === 'true'
}

/** Throws a single, actionable error if the tools can't run yet. */
function assertReady(): void {
  if (!hrWritesEnabled()) {
    throw new Error(
      'HR record writes are disabled. Set CONNECTOR_HR_WRITES_ENABLED=true once the ' +
        'dedicated Entra app and the HumanResources site grant are in place.'
    )
  }
  if (!isHrRecordsConfigured()) {
    throw new Error(
      'HR records app is not configured: set HR_RECORDS_TENANT_ID, HR_RECORDS_CLIENT_ID, ' +
        'and HR_RECORDS_CLIENT_SECRET (the dedicated Sites.Selected app for the HR site).'
    )
  }
}

// ---------------------------------------------------------------------------
// Token (app-only client-credentials; own cache on globalThis)
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number
}
declare global {
  // eslint-disable-next-line no-var
  var __hrRecordsGraphToken: TokenEntry | undefined
}

async function getAccessToken(): Promise<string> {
  const cached = globalThis.__hrRecordsGraphToken
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken

  const tenantId = process.env.HR_RECORDS_TENANT_ID!
  const clientId = process.env.HR_RECORDS_CLIENT_ID!
  const clientSecret = process.env.HR_RECORDS_CLIENT_SECRET!

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HR records Graph token fetch failed (${res.status}): ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  globalThis.__hrRecordsGraphToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return data.access_token
}

function siteGrantHint(path: string, status: number): string {
  if (status !== 401 && status !== 403) return ''
  return (
    `\n\nHint: a ${status} here almost always means the app's per-site permission ` +
    `was never granted (or was granted to the wrong site). Grant the dedicated app ` +
    `the "write" role on the HumanResources site: POST /sites/{siteId}/permissions ` +
    `with { roles:["write"], grantedToIdentities:[{ application:{ id:"<clientId>", ` +
    `displayName:"..." } }] } as a SharePoint admin. Sites.Selected + admin consent ` +
    `alone grants no site access. (path: ${path})`
  )
}

async function graph<T>(path: string, options?: RequestInit & { raw?: boolean }): Promise<T> {
  const token = await getAccessToken()
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`
  const { raw, ...init } = options ?? {}
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HR Graph ${path} failed (${res.status}): ${text}${siteGrantHint(path, res.status)}`)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const text = await res.text()
  if (!text || text.trim().length === 0) return undefined as T
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no Graph dependency)
// ---------------------------------------------------------------------------

/**
 * Reduce a value to plain text: strip emojis/pictographs/zero-width joiners and
 * control characters, collapse whitespace. Standing rule for this workbook —
 * the log must stay copy-paste-clean and CSV-safe.
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

/** Filename-safe token: sanitized, illegal SharePoint chars removed, no spaces/underscores. */
export function fileToken(input: unknown): string {
  return sanitizePlainText(input)
    .replace(/["*:<>?/\\|]/g, '')
    .replace(/[\s_]+/g, '')
    .replace(/^\.+|\.+$/g, '')
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

export function formatEntryId(n: number): string {
  return `ER-${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`
}

/** Highest ER-NNNN in the supplied Entry-ID cell values, + 1 (min 1). */
export function nextEntryIdNumber(entryIdCells: unknown[]): number {
  let max = 0
  for (const cell of entryIdCells) {
    const m = /^ER-(\d+)$/i.exec(String(cell ?? '').trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

/** Highest ER-DOC-NNNN across the supplied file names, + 1 (min 1). */
export function nextErDocNumber(names: string[]): number {
  let max = 0
  for (const name of names) {
    const m = /ER-DOC-(\d+)/i.exec(name)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export function buildErDocFileName(opts: {
  docNumber: number
  lastName: string
  date: string
  type: string
}): string {
  const num = `ER-DOC-${String(Math.max(1, Math.floor(opts.docNumber))).padStart(4, '0')}`
  return `${num}_${fileToken(opts.lastName)}_${opts.date}_${fileToken(opts.type)}.docx`
}

// ---------------------------------------------------------------------------
// Live-header row planning (pure — the core of the width fix)
// ---------------------------------------------------------------------------

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
 * column named "Required Action", and a spurious hard failure here blocks the
 * owner from logging a real HR issue. Anything unmarked is padded blank.
 */
export function headerMarksRequired(name: unknown): boolean {
  const s = sanitizePlainText(name)
  return /\*\s*$/.test(s) || /\(\s*required\s*\)/i.test(s)
}

export type ErRowProblem =
  | { kind: 'no_columns' }
  /** The sheet lost a column we have content for — writing would drop it. */
  | { kind: 'missing_target_column'; column: string }
  /** The sheet marks a column required and no tool input can fill it. */
  | { kind: 'unpopulatable_required_column'; column: string }

export interface ErRowPlan {
  /** Row values in LIVE column order; width === liveColumns.length by construction. */
  values: string[]
  /** Live column name → value written (a report, for the tool result). */
  byColumn: Record<string, string>
  /** Live columns no tool input maps to. Padded with '' and warned about. */
  unmappedColumns: string[]
  /** Index of the Entry ID column in the live row, for read-back verification. */
  entryIdIndex: number | null
  /** Non-empty means: do not write; raise a structured failure instead. */
  problems: ErRowProblem[]
  warnings: string[]
}

/**
 * Build the row to append from the table's LIVE header row.
 *
 * Contract:
 *   - width and order come from `liveColumns`, never from ER_FIELDS
 *   - a live column we have no input for is padded with '' (so a column a human
 *     adds tomorrow cannot break the append)
 *   - content we cannot place, or a column marked required we cannot fill, is
 *     reported as a `problem` for the caller to turn into a structured failure
 *
 * `supplied` is keyed by CANONICAL column name (see suppliedErValues).
 */
export function planErRow(
  liveColumns: readonly string[],
  supplied: Record<string, string>
): ErRowPlan {
  const warnings: string[] = []
  const problems: ErRowProblem[] = []

  const specByKey = new Map<string, ErFieldSpec>()
  for (const spec of ER_FIELDS) {
    for (const name of [spec.column, ...(spec.aliases ?? [])]) {
      specByKey.set(normalizeHeader(name), spec)
    }
  }

  const values: string[] = []
  const byColumn: Record<string, string> = {}
  const unmappedColumns: string[] = []
  const placed = new Set<string>()
  const seenKeys = new Set<string>()
  let entryIdIndex: number | null = null

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

    if (spec.column === 'Entry ID') entryIdIndex = index
    placed.add(spec.column)
    record(supplied[spec.column] ?? '')
  })

  if (liveColumns.length === 0) problems.push({ kind: 'no_columns' })

  // Content with nowhere to go. Only an error when there IS content: a blank
  // optional field losing its column costs nothing, so it must not hard-fail.
  for (const spec of ER_FIELDS) {
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

  return { values, byColumn, unmappedColumns, entryIdIndex, problems, warnings }
}

/** Canonical-column → normalized value map, driven entirely by ER_FIELDS. */
export function suppliedErValues(
  input: ErLogAppendInput,
  computed: { entryId: string; dateLogged: string }
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of ER_FIELDS) {
    if (spec.column === 'Entry ID') {
      out[spec.column] = computed.entryId
      continue
    }
    if (spec.column === 'Date Logged') {
      out[spec.column] = computed.dateLogged
      continue
    }
    // Every ErLogAppendInput field is `string | undefined`, so a keyof index is
    // type-safe here — no cast, and adding a non-string field would fail to compile.
    const raw = spec.input ? input[spec.input] : undefined
    out[spec.column] = spec.kind === 'date' ? normalizeDate(raw) : sanitizePlainText(raw)
  }
  return out
}

/**
 * Turn row-plan problems into the connector's structured failure envelope.
 *
 * Step 4 of the fix: a column the tool genuinely cannot populate must surface as
 * a routed work item naming the column, never as a raw Graph 400 that tells the
 * owner nothing about who fixes it.
 */
function throwErRowProblems(problems: ErRowProblem[], liveColumns: readonly string[]): never {
  const sheet = `Live table columns (${liveColumns.length}): ${liveColumns.join(' | ') || '(none)'}`

  if (problems.some((p) => p.kind === 'no_columns')) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        'The Employee Relations log table reports no columns, so no row can be built. The table or its header row is broken.',
      evidence: 'Graph returned an empty column collection for the resolved workbook table.',
      remediation:
        'Open "Employee Relations Log.xlsx" and confirm the log table still has its header row, then retry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_append',
    })
  }

  const unpopulatable = problems
    .filter((p): p is { kind: 'unpopulatable_required_column'; column: string } => p.kind === 'unpopulatable_required_column')
    .map((p) => p.column)
  if (unpopulatable.length > 0) {
    throwClassified({
      reasonCode: 'NOT_IMPLEMENTED',
      message:
        `The sheet marks ${unpopulatable.length === 1 ? 'a column' : 'columns'} as required that no tool ` +
        `parameter can fill: ${unpopulatable.join(', ')}. Nothing was written — a required column ` +
        `must not be silently blanked.`,
      evidence: `${sheet}. Marked required by header convention (trailing "*" or "(required)"), and no ER_FIELDS entry maps to it.`,
      remediation:
        `Either add a tool parameter for ${unpopulatable.join(', ')} (a connector change — one ER_FIELDS ` +
        `entry plus one input on hr_er_log_append), or drop the required marker from the header in Excel ` +
        `and fill that column by hand. Do NOT retry unchanged.`,
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_append',
      details: { requiredColumnsWithoutInput: unpopulatable, liveColumns: [...liveColumns] },
    })
  }

  const missing = problems
    .filter((p): p is { kind: 'missing_target_column'; column: string } => p.kind === 'missing_target_column')
    .map((p) => p.column)
  throwClassified({
    reasonCode: 'PRECONDITION_FAILED',
    message:
      `The sheet no longer has ${missing.length === 1 ? 'a column' : 'columns'} for content this entry ` +
      `carries: ${missing.join(', ')}. Nothing was written, because appending would have silently ` +
      `discarded what you wrote.`,
    evidence: `${sheet}. No live column matches ${missing.join(', ')} (compared case/punctuation-insensitively, including known aliases).`,
    remediation:
      `Restore the ${missing.join(', ')} column${missing.length === 1 ? '' : 's'} to the log table in ` +
      `"Employee Relations Log.xlsx" (or rename the replacement header back), then retry. If the column ` +
      `was removed deliberately, say so and the tool's field table can be updated to match.`,
    surface: 'hr_sharepoint',
    tool: 'hr_er_log_append',
    details: { missingColumns: missing, liveColumns: [...liveColumns] },
  })
}

// ---------------------------------------------------------------------------
// Live-header PATCH planning (pure — the update counterpart to planErRow)
// ---------------------------------------------------------------------------

/**
 * The columns an UPDATE may write. Derived from ER_FIELDS rather than listed
 * again, so the append and update surfaces can never drift apart: everything a
 * caller can supply, EXCEPT the two computed identity columns.
 *
 * Entry ID and Date Logged are excluded BY CONSTRUCTION (`kind: 'computed'`), so
 * hr_er_log_update has no parameter for either — the exclusion is a property of
 * this table, not a runtime check that a later edit could forget. Entry ID is the
 * immutable key the patch is looked up BY; Date Logged records when the entry was
 * created, and moving it would destroy the only record of when the issue was
 * first logged.
 */
export const ER_UPDATABLE_FIELDS: readonly ErFieldSpec[] = ER_FIELDS.filter(
  (f) => f.kind !== 'computed'
)

/** Canonical columns an update may never write. The runtime backstop to the above. */
export const ER_IMMUTABLE_COLUMNS: readonly string[] = ER_FIELDS.filter(
  (f) => f.kind === 'computed'
).map((f) => f.column)

/**
 * Columns whose new text may ACCUMULATE instead of replacing. Follow-up
 * conversations with a technician are additive by nature: the second thing he
 * said does not undo the first, and the earlier text is part of the record.
 */
export const ER_APPEND_MODE_FLAGS: ReadonlyArray<{
  flag: 'appendToSummary' | 'appendToMeetingWithTech'
  column: string
}> = [
  { flag: 'appendToSummary', column: 'Summary' },
  { flag: 'appendToMeetingWithTech', column: 'Meeting with Tech' },
]

/** Canonical columns the caller asked to append to rather than replace. */
export function appendModeColumns(input: {
  appendToSummary?: boolean
  appendToMeetingWithTech?: boolean
}): Set<string> {
  const out = new Set<string>()
  for (const { flag, column } of ER_APPEND_MODE_FLAGS) if (input[flag]) out.add(column)
  return out
}

/** Entry ID normalized for comparison: sanitized, trimmed, upper-cased. */
export function normalizeEntryId(input: unknown): string {
  return sanitizePlainText(input).toUpperCase()
}

/**
 * Canonical ER-NNNN form of a loosely-typed Entry ID, or null when the input is
 * not an ER id at all. "er-5" and "ER-0005" name the SAME entry, so a second
 * matching pass may compare canonically — but only after an exact match failed,
 * and never across two different numbers.
 */
export function canonicalEntryId(input: unknown): string | null {
  const m = /^ER-?(\d+)$/.exec(normalizeEntryId(input).replace(/\s+/g, ''))
  return m ? formatEntryId(parseInt(m[1], 10)) : null
}

export interface EntryIdMatch {
  /** Data-row indices (0-based, header excluded) carrying this Entry ID. */
  indices: number[]
  /** true when the match needed the canonical ER-NNNN form, not the literal text. */
  canonicalized: boolean
  /** The Entry ID exactly as the sheet spells it, for reporting back. */
  matchedAs: string | null
}

/**
 * Locate the row(s) carrying an Entry ID. Returns EVERY match — the caller must
 * refuse to write when there is more than one rather than picking a row, because
 * guessing which of two identically-keyed rows to patch can silently attach one
 * employee's follow-up to another entry.
 */
export function matchEntryIdRows(
  entryIdCells: readonly unknown[],
  wanted: unknown
): EntryIdMatch {
  const target = normalizeEntryId(wanted)
  const spelledAt = (i: number) => String(entryIdCells[i] ?? '').trim()

  const exact: number[] = []
  if (target) {
    entryIdCells.forEach((cell, i) => {
      if (normalizeEntryId(cell) === target) exact.push(i)
    })
  }
  if (exact.length > 0) {
    return { indices: exact, canonicalized: false, matchedAs: spelledAt(exact[0]) }
  }

  const canonical = canonicalEntryId(wanted)
  if (!canonical) return { indices: [], canonicalized: false, matchedAs: null }
  const loose: number[] = []
  entryIdCells.forEach((cell, i) => {
    if (canonicalEntryId(cell) === canonical) loose.push(i)
  })
  return {
    indices: loose,
    canonicalized: loose.length > 0,
    matchedAs: loose.length > 0 ? spelledAt(loose[0]) : null,
  }
}

// --- A1 addressing ---------------------------------------------------------
//
// A patch writes SINGLE CELLS, so it needs each target cell's absolute address.
// Everything below is pure so the arithmetic that decides which cell gets
// written is unit-testable without Graph: an off-by-one here would edit the
// wrong employee's row.

/** 0-based column index to Excel column letters (0 = A, 26 = AA). */
export function columnLetters(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** Excel column letters to a 0-based index. null for anything that is not letters. */
export function columnIndexOfLetters(letters: string): number | null {
  if (!/^[A-Za-z]+$/.test(letters)) return null
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export interface ParsedRangeAddress {
  /** Worksheet name, unquoted; null when the address carried no sheet prefix. */
  sheet: string | null
  /** 0-based column index of the first cell. */
  startColumnIndex: number
  /** 1-based sheet row of the first cell. */
  startRow: number
  endColumnIndex: number
  endRow: number
}

/**
 * Parse a range address as Graph reports it — "Log!A2:O6", or
 * "'Employee Log'!A2:O6" when the sheet name needs quoting.
 *
 * Returns null rather than guessing. Every cell this tool WRITES is derived from
 * this parse, so a half-understood address must stop the write, not shift it.
 */
export function parseRangeAddress(address: unknown): ParsedRangeAddress | null {
  const raw = sanitizePlainText(address).replace(/\$/g, '')
  if (!raw) return null

  let local = raw
  let sheet: string | null = null
  const bang = raw.lastIndexOf('!')
  if (bang >= 0) {
    local = raw.slice(bang + 1)
    const prefix = raw.slice(0, bang).trim()
    const quoted = prefix.length >= 2 && prefix.startsWith("'") && prefix.endsWith("'")
    sheet = quoted ? prefix.slice(1, -1).replace(/''/g, "'") : prefix
    if (!sheet) sheet = null
  }

  const m = /^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/.exec(local.trim())
  if (!m) return null
  const startColumnIndex = columnIndexOfLetters(m[1])
  const endColumnIndex = m[3] ? columnIndexOfLetters(m[3]) : startColumnIndex
  if (startColumnIndex === null || endColumnIndex === null) return null
  const startRow = parseInt(m[2], 10)
  const endRow = m[4] ? parseInt(m[4], 10) : startRow
  if (!Number.isFinite(startRow) || startRow < 1) return null
  return { sheet, startColumnIndex, startRow, endColumnIndex, endRow }
}

/** Single-cell A1 address. No sheet prefix — the worksheet sits in the URL path. */
export function cellAddress(columnIndex: number, row: number): string {
  return `${columnLetters(columnIndex)}${Math.max(1, Math.floor(row))}`
}

/**
 * Excel serial date to YYYY-MM-DD.
 *
 * Defined only from serial 61 (1900-03-01) onward: serials 1-60 sit inside
 * Excel's deliberate 1900-leap-year bug, where 60 is a date that never existed —
 * there is no honest conversion there, so it returns null instead of one.
 */
export function excelSerialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Did the cell land as intended?
 *
 * String equality, plus ONE computed equivalence: a date written as text into a
 * date-FORMATTED column comes back from Excel as a serial number, not as
 * "2026-08-01". Reporting that as a mismatch would set verified:false on every
 * date patch and teach the reader to ignore the flag — but claiming `verified`
 * without proof is the worse failure, so the equivalence is narrow and computed
 * from the documented epoch rather than assumed.
 */
export function cellValuesEqual(expected: string, actual: unknown): boolean {
  const a = String(actual ?? '').trim()
  const e = expected.trim()
  if (a === e) return true
  if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return false
  const serial = Number(a)
  return Number.isFinite(serial) && excelSerialToYmd(serial) === e
}

/** Row values keyed by the sheet's own headers. First occurrence wins, as in planErRow. */
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

function truncateForWarning(text: string, max = 80): string {
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}...` : s
}

/** One cell the patch will write, located by its position in the live header row. */
export interface ErPatchCell {
  /** The sheet's OWN header name for this column. */
  column: string
  /** 0-based position in the live header row. */
  columnIndex: number
  before: string
  after: string
}

export type ErPatchProblem =
  | { kind: 'no_columns' }
  | { kind: 'no_patch_fields' }
  /** A column the caller named does not exist in the live header row. */
  | { kind: 'missing_target_column'; column: string }
  /** Entry ID / Date Logged reached the planner despite having no parameter. */
  | { kind: 'immutable_column'; column: string }

export interface ErPatchPlan {
  /** Cells to write. EMPTY means the row already held every supplied value. */
  cells: ErPatchCell[]
  /** Live columns whose supplied value already matched the cell. */
  unchangedRequested: string[]
  /** The whole row after the patch, keyed by the sheet's own headers. */
  rowAfter: Record<string, string>
  /** Non-empty means: do not write; raise a structured failure instead. */
  problems: ErPatchProblem[]
  warnings: string[]
}

/**
 * Plan an in-place patch of ONE row from the table's LIVE header row.
 *
 * Contract, and the difference from planErRow:
 *   - column POSITIONS come from `liveColumns` at call time, never from ER_FIELDS,
 *     so a human reordering or adding a column cannot make this write the wrong cell
 *   - only columns the caller actually supplied are written; every other cell in
 *     the row is left alone, not rewritten with its current value (a full-row
 *     rewrite would replace any formula in the row with a computed value)
 *   - a supplied column that the sheet does NOT have is a `problem`, not a
 *     warning: the caller explicitly asked for that cell, so quietly not writing
 *     it is exactly the silent-drop failure this surface keeps eliminating
 *   - Entry ID and Date Logged are never written, even if they somehow arrive
 *
 * `supplied` is keyed by CANONICAL column name (see suppliedErPatchValues) and
 * contains ONLY the fields the caller passed — presence is the patch instruction.
 */
export function planErPatch(
  liveColumns: readonly string[],
  existingRow: readonly unknown[],
  supplied: Record<string, string>,
  options: { appendToColumns?: readonly string[] } = {}
): ErPatchPlan {
  const warnings: string[] = []
  const problems: ErPatchProblem[] = []
  const appendTo = new Set((options.appendToColumns ?? []).map((c) => normalizeHeader(c)))

  const specByKey = new Map<string, ErFieldSpec>()
  for (const spec of ER_FIELDS) {
    for (const name of [spec.column, ...(spec.aliases ?? [])]) specByKey.set(normalizeHeader(name), spec)
  }
  const immutable = new Set(ER_IMMUTABLE_COLUMNS)

  for (const column of ER_IMMUTABLE_COLUMNS) {
    if (column in supplied) problems.push({ kind: 'immutable_column', column })
  }
  if (liveColumns.length === 0) problems.push({ kind: 'no_columns' })
  if (Object.keys(supplied).length === 0) problems.push({ kind: 'no_patch_fields' })

  const cells: ErPatchCell[] = []
  const unchangedRequested: string[] = []
  const rowAfter: Record<string, string> = {}
  const placed = new Set<string>()
  const seenKeys = new Set<string>()

  liveColumns.forEach((live, index) => {
    const key = normalizeHeader(live)
    const before = String(existingRow[index] ?? '')
    const setAfter = (value: string) => {
      if (!(live in rowAfter)) rowAfter[live] = value
    }

    const spec = specByKey.get(key)
    const duplicate = seenKeys.has(key)
    seenKeys.add(key)
    const canonical = spec?.column
    const requestedHere =
      canonical !== undefined && canonical in supplied && !immutable.has(canonical)

    // Not a column we were asked to touch (or a duplicate header, or an identity
    // column): the cell is left exactly as it is.
    if (!requestedHere || duplicate) {
      if (requestedHere && duplicate) {
        warnings.push(
          `The sheet has more than one column matching "${live}". Only the first was patched; ` +
            `the duplicate was left as it is. Reconcile the header row.`
        )
      }
      setAfter(before)
      return
    }

    placed.add(canonical)
    const requested = supplied[canonical]
    let after: string

    if (appendTo.has(key)) {
      if (!requested) {
        warnings.push(
          `Append mode was requested for "${live}" but the supplied text was empty, so nothing ` +
            `was appended and the cell is unchanged.`
        )
        after = before
      } else if (before.trim().length === 0) {
        after = requested
      } else {
        if (before.split(/\r?\n/).some((line) => line.trim() === requested.trim())) {
          warnings.push(
            `"${live}" already contains a line identical to the text being appended, so this may ` +
              `be a repeated call. It was appended anyway — this tool never silently drops what a ` +
              `human wrote. Check the cell and remove the duplicate line if it was unintended.`
          )
        }
        after = `${before}\n${requested}`
      }
    } else {
      after = requested
      if (after === '' && before !== '') {
        warnings.push(
          `"${live}" was CLEARED: an empty value was supplied explicitly, replacing ` +
            `"${truncateForWarning(before)}".`
        )
      }
    }

    setAfter(after)
    if (after === before) unchangedRequested.push(live)
    else cells.push({ column: live, columnIndex: index, before, after })
  })

  for (const column of Object.keys(supplied)) {
    if (placed.has(column) || immutable.has(column)) continue
    problems.push({ kind: 'missing_target_column', column })
  }

  return { cells, unchangedRequested, rowAfter, problems, warnings }
}

/**
 * Canonical-column to normalized-value map for a PATCH. Unlike suppliedErValues,
 * only the fields the caller actually PASSED appear — an absent key means "leave
 * that cell alone", and an empty string means "clear it", which are different
 * instructions and must not collapse into one.
 */
export function suppliedErPatchValues(input: ErLogUpdateInput): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of ER_UPDATABLE_FIELDS) {
    // 'dateLogged' is the one ErLogAppendInput key with no update counterpart:
    // excluding it here narrows spec.input to keys ErLogPatchFields really has,
    // so this stays type-safe without a cast.
    if (!spec.input || spec.input === 'dateLogged') continue
    const raw = input[spec.input]
    if (raw === undefined) continue
    out[spec.column] = spec.kind === 'date' ? normalizeDate(raw) : sanitizePlainText(raw)
  }
  return out
}

/**
 * Turn patch-plan problems into the connector's structured failure envelope.
 *
 * Same discipline as throwErRowProblems: a column that cannot be written must
 * surface as a routed work item naming the column and the live header row, never
 * as a bare Graph error or — worse — as a success that quietly wrote less than
 * the caller asked for.
 */
function throwErPatchProblems(problems: ErPatchProblem[], liveColumns: readonly string[]): never {
  const sheet = `Live table columns (${liveColumns.length}): ${liveColumns.join(' | ') || '(none)'}`
  const patchable = ER_UPDATABLE_FIELDS.map((f) => f.input).filter(Boolean).join(', ')

  if (problems.some((p) => p.kind === 'no_patch_fields')) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message:
        'No fields to update were supplied, so there is nothing to patch. Pass entryId AND at least ' +
        `one of: ${patchable}. Nothing was written.`,
      evidence:
        'The call carried only entryId and/or the append-mode flags, which identify a row but change nothing in it.',
      remediation:
        'Add the field(s) you want to change and call again. Entry ID and Date Logged are deliberately ' +
        'not updatable: Entry ID is the key this tool looks the row up by, and Date Logged records when ' +
        'the entry was created, not when it was edited.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
    })
  }

  if (problems.some((p) => p.kind === 'no_columns')) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        'The Employee Relations log table reports no columns, so no cell can be located. The table or its header row is broken.',
      evidence: 'Graph returned an empty column collection for the resolved workbook table.',
      remediation:
        'Open "Employee Relations Log.xlsx" and confirm the log table still has its header row, then retry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
    })
  }

  const immutable = problems
    .filter((p): p is { kind: 'immutable_column'; column: string } => p.kind === 'immutable_column')
    .map((p) => p.column)
  if (immutable.length > 0) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message:
        `${immutable.join(' and ')} cannot be updated and this tool has no parameter for ${
          immutable.length === 1 ? 'it' : 'them'
        }. Nothing was written.`,
      evidence:
        'Entry ID is the immutable key the row is looked up by. Date Logged records when the entry was ' +
        'created; an edit that moved it would destroy the only record of when the issue was first logged.',
      remediation:
        'Drop those values from the call. If an entry was logged under the wrong Entry ID or the wrong ' +
        'Date Logged, that is a correction a human makes in the workbook — not a connector write.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { immutableColumns: immutable },
    })
  }

  const missing = problems
    .filter((p): p is { kind: 'missing_target_column'; column: string } => p.kind === 'missing_target_column')
    .map((p) => p.column)
  throwClassified({
    reasonCode: 'PRECONDITION_FAILED',
    message:
      `The log table has no column for ${missing.join(', ')}, so ${
        missing.length === 1 ? 'that value' : 'those values'
      } could not be written. NOTHING was written at all — a partial patch would leave the row in a ` +
      `state neither you nor the sheet describes.`,
    evidence: `${sheet}. No live column matches ${missing.join(', ')} (compared case/punctuation-insensitively, including known aliases).`,
    remediation:
      `Run hr_er_log_columns to see the live header row. Either restore/rename the ${missing.join(', ')} ` +
      `column${missing.length === 1 ? '' : 's'} in "Employee Relations Log.xlsx", or drop ${
        missing.length === 1 ? 'that field' : 'those fields'
      } from the call. Do NOT retry unchanged.`,
    surface: 'hr_sharepoint',
    tool: 'hr_er_log_update',
    details: { missingColumns: missing, liveColumns: [...liveColumns] },
  })
}

// ---------------------------------------------------------------------------
// Graph resolution helpers
// ---------------------------------------------------------------------------

interface WorkbookRef {
  driveId: string
  itemId: string
  /** true when we fell back to a dynamic path lookup (the configured ids missed). */
  resolvedDynamically: boolean
}

interface DriveItemLite {
  id: string
  name?: string
  size?: number
  webUrl?: string
  folder?: unknown
}

/**
 * Resolve the workbook item. Try the configured drive+item first (one HEAD-ish
 * GET); if that 404s (file moved/renamed), resolve by walking the known folder
 * path from the site's default drive.
 */
async function resolveWorkbook(): Promise<WorkbookRef> {
  try {
    await graph<DriveItemLite>(
      `/drives/${DEFAULT_DRIVE_ID}/items/${DEFAULT_ITEM_ID}?$select=id,name`
    )
    return { driveId: DEFAULT_DRIVE_ID, itemId: DEFAULT_ITEM_ID, resolvedDynamically: false }
  } catch {
    // Fall back to a path-based lookup.
  }
  const site = await graph<{ id: string }>(`/sites/${SITE_PATH}?$select=id`)
  const drive = await graph<{ id: string }>(`/sites/${site.id}/drive?$select=id`)
  const path = `${EMPLOYEE_FILES_PATH}/${ER_FOLDER_NAME}/${ER_WORKBOOK_NAME}`
  const item = await graph<DriveItemLite>(
    `/drives/${drive.id}/root:/${encodePath(path)}?$select=id`
  )
  return { driveId: drive.id, itemId: item.id, resolvedDynamically: true }
}

/** Encode each path segment but keep the slashes. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

interface WorkbookTable {
  id: string
  name: string
}

/**
 * Address an Excel table by its NAME (a clean token like "Table1"), never by the
 * braces-GUID `id`. Graph 404s on a percent-encoded `{...}` id in the URL path
 * (`%7B...%7D`) — which silently broke every table call in production. The name
 * is the reliable half of Graph's `/tables/{id|name}` key.
 */
function tableSeg(table: WorkbookTable): string {
  return encodeURIComponent(table.name)
}

/** True if the table's header row has an "Entry ID" column. Name-addressed. */
async function tableHasEntryId(workbookBase: string, table: WorkbookTable): Promise<boolean> {
  try {
    const cols = await graph<{ value: Array<{ name: string }> }>(
      `${workbookBase}/tables/${tableSeg(table)}/columns?$select=name`
    )
    return (cols.value ?? []).some((c) => /entry\s*id/i.test(c.name))
  } catch {
    return false
  }
}

/**
 * Resolve the Employee Relations log table at call time — never a cached or
 * hardcoded id, since the file can be replaced or edited by a human:
 *   1. Prefer the table whose header row has "Entry ID" (the ER log, wherever it
 *      lives in the workbook).
 *   2. Otherwise find the worksheet that holds the ER data (by its "Entry ID"
 *      header) and, if it isn't already a table, convert its used range into one
 *      (headers = row 1) — existing rows are preserved and future appends become
 *      atomic table appends.
 * Never falls back to an arbitrary unrelated table.
 */
async function resolveLogTable(driveId: string, itemId: string): Promise<WorkbookTable> {
  const base = `/drives/${driveId}/items/${itemId}/workbook`
  const tables =
    (await graph<{ value: WorkbookTable[] }>(`${base}/tables?$select=id,name`)).value ?? []

  for (const t of tables) {
    if (await tableHasEntryId(base, t)) return t
  }

  // No ER table yet — locate the ER worksheet and turn its used range into one.
  const worksheet = await findErWorksheet(driveId, itemId)
  const wsTables =
    (await graph<{ value: WorkbookTable[] }>(
      `${base}/worksheets/${encodeURIComponent(worksheet)}/tables?$select=id,name`
    )).value ?? []
  if (wsTables.length > 0) return wsTables[0]

  const used = await graph<{ address: string }>(
    `${base}/worksheets/${encodeURIComponent(worksheet)}/usedRange?$select=address`
  )
  return graph<WorkbookTable>(`${base}/tables/add`, {
    method: 'POST',
    body: JSON.stringify({ address: used.address, hasHeaders: true }),
  })
}

/**
 * Find the worksheet holding the ER data by its header row (a row-1 cell matching
 * "Entry ID"). Falls back to the configured worksheet (HR_ER_LOG_WORKSHEET), then
 * the first sheet.
 */
async function findErWorksheet(driveId: string, itemId: string): Promise<string> {
  const base = `/drives/${driveId}/items/${itemId}/workbook`
  const sheets =
    (await graph<{ value: Array<{ name: string; position: number }> }>(
      `${base}/worksheets?$select=name,position`
    )).value ?? []
  if (sheets.length === 0) throw new Error('HR log workbook has no worksheets.')
  const ordered = [...sheets].sort((a, b) => a.position - b.position)

  for (const w of ordered) {
    try {
      const used = await graph<{ values: unknown[][] }>(
        `${base}/worksheets/${encodeURIComponent(w.name)}/usedRange?$select=values`
      )
      const header = (used.values ?? [])[0] ?? []
      if (header.some((cell) => /entry\s*id/i.test(String(cell ?? '')))) return w.name
    } catch {
      // unreadable/empty sheet — skip
    }
  }
  const match = ordered.find((w) => w.name.toLowerCase() === LOG_WORKSHEET.toLowerCase())
  return (match ?? ordered[0]).name
}

interface LiveTableShape {
  /** Header names in live column order (sorted by the API's own index). */
  columns: string[]
  /** Entry-ID cell values, header excluded. */
  entryIdValues: string[]
}

/**
 * Read the table's LIVE shape: its header row and its Entry-ID values, in ONE
 * Graph call. The header row is the authority on the width and order of an
 * appended row — reading it at call time is what lets a human add a column
 * without breaking the tool. Table addressed by NAME (never the braces-GUID id).
 */
async function readTableShape(
  driveId: string,
  itemId: string,
  table: WorkbookTable
): Promise<LiveTableShape> {
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSeg(table)}`
  const cols = await graph<{
    value: Array<{ name: string; index: number; values: unknown[][] }>
  }>(`${base}/columns?$select=name,index,values`)

  // Sort by the API's index rather than trusting response order — the row we
  // build is positional, so a wrong order would write values into wrong columns.
  const list = [...(cols.value ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const columns = list.map((c) => String(c.name ?? ''))

  const idCol =
    list.find((c) => normalizeHeader(c.name) === normalizeHeader('Entry ID')) ??
    list.find((c) => /entry\s*id/i.test(String(c.name ?? ''))) ??
    list.find((c) => c.index === 0)
  // values is a 2-D array including the header row at [0].
  const entryIdValues = idCol
    ? (idCol.values ?? []).slice(1).map((row) => String(row?.[0] ?? '').trim())
    : []

  return { columns, entryIdValues }
}

interface LiveTableGrid {
  /** Header names in live column order (sorted by the API's own index). */
  columns: string[]
  /** Data-body rows, row-major, in live column order. Header row excluded. */
  rows: string[][]
  /** Position of the Entry ID column in the live header row. */
  entryIdIndex: number | null
  /** Worksheet holding the table, parsed from the data-body address. */
  sheetName: string | null
  /** 1-based sheet row of the FIRST data row. */
  firstDataRow: number | null
  /** 0-based sheet column of the table's first column. */
  firstColumnIndex: number | null
  /** The data-body address exactly as Graph reported it (evidence). */
  dataBodyAddress: string | null
}

/**
 * Read the table's LIVE header row, every data cell, and the ABSOLUTE address the
 * data body occupies.
 *
 * Kept separate from readTableShape rather than folded into it: the append path
 * needs only the header row and the Entry-ID column, and must not start carrying
 * every row body — or start depending on the data-body address — as a side effect
 * of the update path existing. Both read the same live table; neither is the other's
 * refactor.
 *
 * The address is what makes an in-place single-cell patch possible: every cell the
 * update later WRITES is derived from it, never from an assumed "tables start at A1".
 */
async function readTableGrid(
  driveId: string,
  itemId: string,
  table: WorkbookTable
): Promise<LiveTableGrid> {
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSeg(table)}`

  // Header row from the same authority the append path uses: the API's own column
  // collection, ordered by its own index. Response order is never trusted — the
  // cells we address are positional, so a wrong order would patch a wrong column.
  const cols = await graph<{ value: Array<{ name: string; index: number }> }>(
    `${base}/columns?$select=name,index`
  )
  const list = [...(cols.value ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const columns = list.map((c) => String(c.name ?? ''))
  let entryIdIndex = columns.findIndex((c) => normalizeHeader(c) === normalizeHeader('Entry ID'))
  if (entryIdIndex < 0) entryIdIndex = columns.findIndex((c) => /entry\s*id/i.test(c))

  let rows: string[][] = []
  let dataBodyAddress: string | null = null
  try {
    const body = await graph<{ address?: string; values?: unknown[][] }>(
      `${base}/dataBodyRange?$select=address,values`
    )
    dataBodyAddress = body?.address ?? null
    rows = (body?.values ?? []).map((row) => (row ?? []).map((cell) => String(cell ?? '')))
  } catch {
    // A table with no data body at all — leave rows empty so the caller reports
    // "Entry ID not found" against an empty log rather than crashing.
  }

  const parsed = dataBodyAddress ? parseRangeAddress(dataBodyAddress) : null
  return {
    columns,
    rows,
    entryIdIndex: entryIdIndex >= 0 ? entryIdIndex : null,
    sheetName: parsed?.sheet ?? null,
    firstDataRow: parsed?.startRow ?? null,
    firstColumnIndex: parsed?.startColumnIndex ?? null,
    dataBodyAddress,
  }
}

/** The worksheet a table sits on. Fallback for an address with no sheet prefix. */
async function resolveTableWorksheetName(
  driveId: string,
  itemId: string,
  table: WorkbookTable
): Promise<string | null> {
  try {
    const ws = await graph<{ name?: string }>(
      `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSeg(table)}/worksheet?$select=name`
    )
    return ws?.name ? String(ws.name) : null
  } catch {
    return null
  }
}

/**
 * Guard every address that reaches a range URL.
 *
 * Addresses are built from the parsed data-body address and are `[A-Z]+[0-9]+` by
 * construction, so this can never fire from ordinary use — it exists so that a
 * future caller cannot make a WIDER range (a whole column, a whole row, "A:Z")
 * reach a write. A single cell is the only range this surface may touch.
 */
function assertSingleCellAddress(address: string): void {
  if (!/^[A-Z]+[1-9]\d*$/.test(address)) {
    throw new Error(
      `Refusing to touch "${address}": not a single-cell address. This tool patches one cell at a time.`
    )
  }
}

function rangeUrl(driveId: string, itemId: string, sheetName: string, address: string): string {
  assertSingleCellAddress(address)
  return (
    `/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(sheetName)}` +
    `/range(address='${address}')`
  )
}

/**
 * Write ONE cell.
 *
 * Deliberately not a row PATCH (`/tables/{name}/rows/itemAt(index=N)`), which
 * takes the whole row's values: that would rewrite every cell in the row —
 * replacing any formula it contains with a computed value, and touching cells the
 * caller never named. "Patch only the named columns" has to mean the untouched
 * cells are never written at all, not written back with the same value.
 */
async function patchCell(
  driveId: string,
  itemId: string,
  sheetName: string,
  address: string,
  value: string
): Promise<void> {
  await graph(rangeUrl(driveId, itemId, sheetName, address), {
    method: 'PATCH',
    body: JSON.stringify({ values: [[value]] }),
  })
}

/** Read ONE cell's value. */
async function readCell(
  driveId: string,
  itemId: string,
  sheetName: string,
  address: string
): Promise<string> {
  const res = await graph<{ values?: unknown[][] }>(
    `${rangeUrl(driveId, itemId, sheetName, address)}?$select=values`
  )
  return String(res?.values?.[0]?.[0] ?? '')
}

/** Ensure a child folder exists under a parent path; returns its item. */
async function ensureFolder(
  driveId: string,
  parentPath: string,
  folderName: string
): Promise<DriveItemLite> {
  const full = `${parentPath}/${folderName}`
  try {
    return await graph<DriveItemLite>(
      `/drives/${driveId}/root:/${encodePath(full)}?$select=id,name,webUrl`
    )
  } catch {
    // Not found — create it.
  }
  return graph<DriveItemLite>(`/drives/${driveId}/root:/${encodePath(parentPath)}:/children`, {
    method: 'POST',
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  }).catch(async (err) => {
    // A concurrent create may 409 — re-read and return the existing folder.
    const item = await graph<DriveItemLite>(
      `/drives/${driveId}/root:/${encodePath(full)}?$select=id,name,webUrl`
    ).catch(() => null)
    if (item) return item
    throw err
  })
}

/** Upload bytes to a path (simple PUT); returns the created/updated item. */
async function uploadFile(
  driveId: string,
  path: string,
  bytes: Uint8Array
): Promise<DriveItemLite> {
  if (bytes.byteLength === 0) throw new Error('Document is empty (0 bytes).')
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Document is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; this tool caps simple ` +
        `uploads at ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Trim the file or add an upload session.`
    )
  }
  return graph<DriveItemLite>(
    `/drives/${driveId}/root:/${encodePath(path)}:/content?@microsoft.graph.conflictBehavior=fail`,
    {
      method: 'PUT',
      raw: true,
      headers: { 'Content-Type': DOCX_CONTENT_TYPE },
      // Uint8Array is a valid BodyInit.
      body: bytes as unknown as BodyInit,
    }
  )
}

/** Find the subject's `[Name] - [Role] [Date]` folder under Employee Files. */
async function resolveEmployeeFolder(
  driveId: string,
  opts: { employeeFolderName?: string; lastName: string }
): Promise<{ name: string; item: DriveItemLite }> {
  if (opts.employeeFolderName) {
    const full = `${EMPLOYEE_FILES_PATH}/${opts.employeeFolderName}`
    const item = await graph<DriveItemLite>(
      `/drives/${driveId}/root:/${encodePath(full)}?$select=id,name,webUrl,folder`
    ).catch(() => null)
    if (!item) {
      throw new Error(
        `Employee folder not found: "${opts.employeeFolderName}" under ${EMPLOYEE_FILES_PATH}. ` +
          `List the folder to confirm the exact name (it is "[Name] - [Role] [Date]").`
      )
    }
    return { name: item.name ?? opts.employeeFolderName, item }
  }

  // Resolve by matching the last name among the Employee Files subfolders.
  const children = await graph<{ value: DriveItemLite[] }>(
    `/drives/${driveId}/root:/${encodePath(EMPLOYEE_FILES_PATH)}:/children?$select=id,name,webUrl,folder&$top=999`
  )
  const folders = (children.value ?? []).filter((c) => c.folder && c.name && c.name !== ER_FOLDER_NAME)
  const last = sanitizePlainText(opts.lastName).toLowerCase()
  const matches = folders.filter((f) => (f.name ?? '').toLowerCase().includes(last))
  if (matches.length === 0) {
    throw new Error(
      `No employee folder under ${EMPLOYEE_FILES_PATH} matches last name "${opts.lastName}". ` +
        `Pass employeeFolderName with the exact "[Name] - [Role] [Date]" folder.`
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple employee folders match "${opts.lastName}": ${matches
        .map((m) => m.name)
        .join(' | ')}. Pass employeeFolderName to disambiguate.`
    )
  }
  return { name: matches[0].name ?? '', item: matches[0] }
}

// ---------------------------------------------------------------------------
// Public operation 1: append a row to the Employee Relations Log
// ---------------------------------------------------------------------------

export interface ErLogAppendInput {
  dateOfIncident: string
  employee: string
  roleStatus: string
  category: string
  severity: string
  summary: string
  expectationMissed?: string
  reference?: string
  reportedBy: string
  actionTaken?: string
  linkedDocument?: string
  followUpStatus?: string
  /** Free-text note of what the technician said when the issue was discussed. */
  meetingWithTech?: string
  /** Override "Date Logged" (defaults to today, Eastern). */
  dateLogged?: string
}

export interface ErLogAppendResult {
  entryId: string
  /** Live column name → value written. Keys are the sheet's own headers. */
  row: Record<string, string>
  rowIndex: number | null
  verified: boolean
  duplicateEntryIdDetected: boolean
  workbookWebUrl: string | null
  resolvedDynamically: boolean
  /** The table the row landed in. */
  tableName: string
  /** The LIVE header row the row width was built from, in order. */
  tableColumns: string[]
  /** Live columns left blank because no tool input maps to them. */
  unmappedColumns: string[]
  warnings: string[]
}

export async function appendErLogRow(input: ErLogAppendInput): Promise<ErLogAppendResult> {
  assertReady()
  const warnings: string[] = []

  const { driveId, itemId, resolvedDynamically } = await resolveWorkbook()
  const table = await resolveLogTable(driveId, itemId)
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${tableSeg(table)}`

  // Read the LIVE header row and the existing Entry IDs in one call. The header
  // row — not a hardcoded list — decides the width and order of the row we send.
  const shape = await readTableShape(driveId, itemId, table)

  // Compute the next Entry ID from the sheet's own Entry ID column (never from
  // caller input, and never inferred from the ER-DOC document numbering, which
  // has legitimately diverged from it).
  const entryId = formatEntryId(nextEntryIdNumber(shape.entryIdValues))

  const dateLogged = input.dateLogged ? normalizeDate(input.dateLogged) : todayEastern()

  const supplied = suppliedErValues(input, { entryId, dateLogged })
  const plan = planErRow(shape.columns, supplied)
  if (plan.problems.length > 0) throwErRowProblems(plan.problems, shape.columns)
  warnings.push(...plan.warnings)

  const rowValues = plan.byColumn
  const values = [plan.values]

  // Append (atomic table add; retries on transient 504 per Graph guidance).
  const added = await withTimeout(
    () =>
      withRetry(
        () =>
          graph<{ index: number | null; values: unknown[][] }>(`${base}/rows`, {
            method: 'POST',
            body: JSON.stringify({ index: null, values }),
          }),
        { maxRetries: 2, baseDelayMs: 600 }
      ),
    30_000,
    'appendErLogRow'
  )

  // Read-back verification: the created row must carry our Entry ID. Read it at
  // the Entry ID column's LIVE position, not index 0 — the column need not be first.
  const writtenId =
    plan.entryIdIndex === null ? '' : String(added?.values?.[0]?.[plan.entryIdIndex] ?? '')
  const verified = plan.entryIdIndex !== null && writtenId === entryId

  // Concurrency check: our Entry ID must be unique in the column.
  let duplicateEntryIdDetected = false
  try {
    const after = await readTableShape(driveId, itemId, table)
    const count = after.entryIdValues.filter((v) => v === entryId).length
    if (count > 1) {
      duplicateEntryIdDetected = true
      warnings.push(
        `Entry ID ${entryId} now appears ${count} times — a concurrent write likely used the ` +
          `same id. The row was still appended (no data overwritten); reconcile the duplicate in the workbook.`
      )
    }
  } catch {
    warnings.push('Could not re-read the Entry ID column to confirm uniqueness.')
  }
  if (!verified) {
    warnings.push(
      `Read-back mismatch: appended row shows "${writtenId}" but "${entryId}" was written. Verify the workbook.`
    )
  }
  if (resolvedDynamically) {
    warnings.push(
      'The configured driveId/itemId did not resolve; the workbook was located by path instead ' +
        '(it may have moved). Update HR_ER_DRIVE_ID / HR_ER_ITEM_ID.'
    )
  }

  let workbookWebUrl: string | null = null
  try {
    const meta = await graph<DriveItemLite>(`/drives/${driveId}/items/${itemId}?$select=webUrl`)
    workbookWebUrl = meta.webUrl ?? null
  } catch {
    /* non-fatal */
  }

  return {
    entryId,
    row: rowValues,
    rowIndex: added?.index ?? null,
    verified,
    duplicateEntryIdDetected,
    workbookWebUrl,
    resolvedDynamically,
    tableName: table.name,
    tableColumns: shape.columns,
    unmappedColumns: plan.unmappedColumns,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Public operation 1b: describe the live log table (READ-ONLY)
// ---------------------------------------------------------------------------

export interface ErLogTableDescription {
  tableName: string
  columnCount: number
  /** Live header row, in order. */
  columns: string[]
  /** Live columns this tool can fill, paired with the input that fills them. */
  mapped: Array<{ column: string; input: string }>
  /** Live columns no tool input maps to — appended as blanks. */
  unmapped: string[]
  /** Live columns marked required by header convention but unfillable. */
  requiredWithoutInput: string[]
  /** Canonical columns the tool knows but the sheet does not have. */
  absentCanonicalColumns: string[]
  rowCount: number
  nextEntryId: string
  workbookWebUrl: string | null
  resolvedDynamically: boolean
}

/**
 * Report the log table's live shape and how this tool maps onto it. Reads only —
 * the diagnostic that was missing when the 2026-07-30 width outage hit, so the
 * sheet can be checked against the tool WITHOUT appending a row to find out.
 */
export async function describeErLogTable(): Promise<ErLogTableDescription> {
  assertReady()
  const { driveId, itemId, resolvedDynamically } = await resolveWorkbook()
  const table = await resolveLogTable(driveId, itemId)
  const shape = await readTableShape(driveId, itemId, table)

  // Plan a probe row with every known field filled, so the mapping report shows
  // what WOULD be written rather than what a particular caller happened to send.
  const probe: Record<string, string> = {}
  for (const spec of ER_FIELDS) probe[spec.column] = `<${spec.column}>`
  const plan = planErRow(shape.columns, probe)

  const specByKey = new Map<string, ErFieldSpec>()
  for (const spec of ER_FIELDS) {
    for (const name of [spec.column, ...(spec.aliases ?? [])]) specByKey.set(normalizeHeader(name), spec)
  }
  const mapped: Array<{ column: string; input: string }> = []
  for (const live of shape.columns) {
    const spec = specByKey.get(normalizeHeader(live))
    if (spec) mapped.push({ column: live, input: spec.input ?? `(computed: ${spec.column})` })
  }
  const present = new Set(shape.columns.map((c) => normalizeHeader(c)))
  const absentCanonicalColumns = ER_FIELDS.filter((s) => !present.has(normalizeHeader(s.column))).map(
    (s) => s.column
  )

  let workbookWebUrl: string | null = null
  try {
    const meta = await graph<DriveItemLite>(`/drives/${driveId}/items/${itemId}?$select=webUrl`)
    workbookWebUrl = meta.webUrl ?? null
  } catch {
    /* non-fatal */
  }

  return {
    tableName: table.name,
    columnCount: shape.columns.length,
    columns: shape.columns,
    mapped,
    unmapped: plan.unmappedColumns,
    requiredWithoutInput: plan.problems
      .filter((p): p is { kind: 'unpopulatable_required_column'; column: string } => p.kind === 'unpopulatable_required_column')
      .map((p) => p.column),
    absentCanonicalColumns,
    rowCount: shape.entryIdValues.length,
    nextEntryId: formatEntryId(nextEntryIdNumber(shape.entryIdValues)),
    workbookWebUrl,
    resolvedDynamically,
  }
}

// ---------------------------------------------------------------------------
// Public operation 1c: patch ONE existing row of the Employee Relations Log
// ---------------------------------------------------------------------------

/**
 * The patchable half of ErLogAppendInput: every field optional, and `dateLogged`
 * removed. Deriving it from the append input is what keeps the two tools
 * interchangeable in a caller's head — the parameter names and types cannot
 * drift, because there is only one list of them.
 */
export type ErLogPatchFields = Partial<Omit<ErLogAppendInput, 'dateLogged'>>

export interface ErLogUpdateInput extends ErLogPatchFields {
  /** The row to patch, e.g. "ER-0005". Matched case-insensitively and trimmed. */
  entryId: string
  /** Append to the existing Summary on a new line instead of replacing it. */
  appendToSummary?: boolean
  /** Append to the existing Meeting with Tech on a new line instead of replacing it. */
  appendToMeetingWithTech?: boolean
}

export interface ErLogUpdateResult {
  /** The Entry ID as the SHEET spells it (not necessarily as it was typed). */
  entryId: string
  /** 0-based row index within the table's data rows. */
  rowIndex: number | null
  /** The FULL row after the patch, keyed by the sheet's own headers. */
  row: Record<string, string>
  /** One entry per cell actually written. */
  changed: Array<{ column: string; before: string; after: string }>
  /** Columns whose supplied value already matched the cell, so nothing was written. */
  unchangedRequested: string[]
  /** From read-back: every written cell was confirmed to hold its new value. */
  verified: boolean
  workbookWebUrl: string | null
  resolvedDynamically: boolean
  tableName: string
  /** The LIVE header row the cell positions were resolved from, in order. */
  tableColumns: string[]
  warnings: string[]
}

/**
 * Patch named columns of ONE existing row, located by Entry ID.
 *
 * WHY THIS EXISTS: hr_er_log_append tells the caller to leave meetingWithTech
 * unset when the conversation with the technician has not happened yet — which
 * guarantees the field needs filling later. The same is true of followUpStatus
 * when an item closes and linkedDocument when a write-up is filed afterwards.
 * Without this, those rows stayed half-finished, and the only alternative was
 * appending a second row — which would inflate the subject's disciplinary record,
 * the one failure mode this log cannot tolerate.
 *
 * Guarantees:
 *   - exactly one row is touched, identified by Entry ID; more than one match is
 *     a refusal, never a guess
 *   - only the named columns are written; every other cell is left alone
 *   - Entry ID and Date Logged are never written (no parameter exists for them,
 *     and planErPatch refuses them if they somehow arrive)
 *   - cell positions come from the LIVE header row on every call
 */
export async function updateErLogRow(input: ErLogUpdateInput): Promise<ErLogUpdateResult> {
  assertReady()
  const warnings: string[] = []

  const wantedEntryId = sanitizePlainText(input.entryId)
  if (!wantedEntryId) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: 'entryId is required: it names the single row to patch. Nothing was written.',
      evidence: 'entryId was empty or whitespace after sanitization.',
      remediation:
        'Pass the Entry ID of the row to update, e.g. "ER-0005". Run hr_er_log_columns or read the ' +
        'workbook if you do not know it. This tool never creates a row — use hr_er_log_append for a new entry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
    })
  }

  // Caller errors are settled before any Graph call: cheaper, and it keeps a
  // no-op call from touching the workbook at all.
  const supplied = suppliedErPatchValues(input)
  const appendTo = appendModeColumns(input)
  for (const { flag, column } of ER_APPEND_MODE_FLAGS) {
    if (appendTo.has(column) && !(column in supplied)) {
      warnings.push(
        `${flag} was set but no ${column} text was supplied, so there was nothing to append.`
      )
    }
  }
  if (Object.keys(supplied).length === 0) throwErPatchProblems([{ kind: 'no_patch_fields' }], [])

  const { driveId, itemId, resolvedDynamically } = await resolveWorkbook()
  const table = await resolveLogTable(driveId, itemId)
  const grid = await readTableGrid(driveId, itemId, table)
  if (grid.columns.length === 0) throwErPatchProblems([{ kind: 'no_columns' }], grid.columns)

  const entryIdIndex = grid.entryIdIndex
  if (entryIdIndex === null) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        'The log table has no Entry ID column, so a row cannot be located by Entry ID. Nothing was written.',
      evidence: `Live table columns (${grid.columns.length}): ${grid.columns.join(' | ') || '(none)'}`,
      remediation:
        'Restore the "Entry ID" column to the log table in "Employee Relations Log.xlsx" (run ' +
        'hr_er_log_columns to see the live header row), then retry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { liveColumns: grid.columns },
    })
  }

  // ── Locate the row ───────────────────────────────────────────────────────
  const entryIdCells = grid.rows.map((row) => row[entryIdIndex] ?? '')
  const match = matchEntryIdRows(entryIdCells, wantedEntryId)

  if (match.indices.length === 0) {
    const present = entryIdCells.map((v) => v.trim()).filter((v) => v.length > 0)
    const shown = present.slice(0, 40)
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `No row in the Employee Relations log carries Entry ID "${wantedEntryId}", so there was nothing ` +
        `to patch and nothing was written. This tool NEVER creates a row — a missing Entry ID is not a ` +
        `reason to append one.`,
      evidence:
        `The log has ${present.length} row(s). Entry IDs present: ${shown.join(', ') || '(none)'}` +
        `${present.length > shown.length ? ` … and ${present.length - shown.length} more` : ''}.`,
      remediation:
        'Run hr_er_log_columns to confirm the row count and the next Entry ID, then call again with an ' +
        'Entry ID that exists. If the entry was never logged, hr_er_log_append is the right tool.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { requestedEntryId: wantedEntryId, presentEntryIds: present, rowCount: present.length },
    })
  }

  if (match.indices.length > 1) {
    const rows = match.indices.map((i) => ({
      rowIndex: i,
      sheetRow: grid.firstDataRow === null ? null : grid.firstDataRow + i,
      entryId: entryIdCells[i],
    }))
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `Entry ID "${wantedEntryId}" appears on ${match.indices.length} rows, so the row to patch is ` +
        `ambiguous. NOTHING was written — patching the wrong one would attach this text to the wrong ` +
        `incident, and there is no safe way to guess which is meant.`,
      evidence:
        `Duplicate at table row indices ${match.indices.join(' and ')}` +
        `${grid.firstDataRow === null ? '' : ` (sheet rows ${rows.map((r) => r.sheetRow).join(' and ')})`}` +
        `, spelled ${rows.map((r) => `"${r.entryId}"`).join(' and ')}.`,
      remediation:
        'Reconcile the duplicate in "Employee Relations Log.xlsx" first — give one of the rows a unique ' +
        'Entry ID or remove the accidental copy — then retry. A human decides which row is the real entry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { requestedEntryId: wantedEntryId, duplicateRows: rows },
    })
  }

  const rowIndex = match.indices[0]
  const entryId = match.matchedAs || wantedEntryId
  if (match.canonicalized) {
    warnings.push(
      `"${sanitizePlainText(input.entryId)}" was matched to Entry ID "${entryId}" by its number. ` +
        `Pass the exact id to avoid any ambiguity.`
    )
  }

  // ── Plan the patch ───────────────────────────────────────────────────────
  const plan = planErPatch(grid.columns, grid.rows[rowIndex] ?? [], supplied, {
    appendToColumns: [...appendTo],
  })
  if (plan.problems.length > 0) throwErPatchProblems(plan.problems, grid.columns)
  warnings.push(...plan.warnings)

  // ── Resolve absolute addresses ───────────────────────────────────────────
  const sheetName = grid.sheetName ?? (await resolveTableWorksheetName(driveId, itemId, table))
  if (!sheetName || grid.firstDataRow === null || grid.firstColumnIndex === null) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        'The log table\'s position in the worksheet could not be resolved, so no cell can be addressed ' +
        'for an in-place patch. Nothing was written.',
      evidence: `Data-body address reported by Graph: ${grid.dataBodyAddress ?? '(none)'}; worksheet: ${sheetName ?? '(unresolved)'}.`,
      remediation:
        'Confirm the log table still exists as an Excel table with a data body in ' +
        '"Employee Relations Log.xlsx" (hr_er_log_columns reports the table it resolves), then retry.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { dataBodyAddress: grid.dataBodyAddress, worksheet: sheetName },
    })
  }
  // Held as locals, not read off `grid` inside the closure: a property narrowing
  // does not survive into a callback, and these two numbers decide which cell is
  // written.
  const firstColumnIndex = grid.firstColumnIndex
  const sheetRow = grid.firstDataRow + rowIndex
  const addressOf = (columnIndex: number) => cellAddress(firstColumnIndex + columnIndex, sheetRow)

  // Re-read the Entry ID cell at the exact address we are about to write around.
  // The grid read above and the writes below are separate calls, so a concurrent
  // insert could have shifted the row between them; this closes most of that
  // window, and the read-back after the write closes the rest.
  const liveEntryIdCell = await readCell(driveId, itemId, sheetName, addressOf(entryIdIndex))
  if (normalizeEntryId(liveEntryIdCell) !== normalizeEntryId(entryId)) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `The row moved while this update was being prepared: the cell that held Entry ID "${entryId}" now ` +
        `reads "${liveEntryIdCell}". NOTHING was written, because writing there would have edited a ` +
        `different employee's entry.`,
      evidence: `Re-read of ${addressOf(entryIdIndex)} on worksheet "${sheetName}" returned "${liveEntryIdCell}", not "${entryId}".`,
      remediation:
        'Someone else is editing the workbook. Call again from a fresh read once they are done — the row ' +
        'will be re-located by its Entry ID.',
      surface: 'hr_sharepoint',
      tool: 'hr_er_log_update',
      details: { entryId, address: addressOf(entryIdIndex), found: liveEntryIdCell },
    })
  }

  // ── Nothing to write ─────────────────────────────────────────────────────
  if (plan.cells.length === 0) {
    warnings.push(
      'No cell needed writing: the row already held every value supplied. The workbook was NOT modified.'
    )
    return {
      entryId,
      rowIndex,
      row: keyRowByColumns(grid.columns, grid.rows[rowIndex] ?? []),
      changed: [],
      unchangedRequested: plan.unchangedRequested,
      // The grid read IS the read-back here — the row was read and matches.
      verified: true,
      workbookWebUrl: await readWorkbookWebUrl(driveId, itemId),
      resolvedDynamically,
      tableName: table.name,
      tableColumns: grid.columns,
      warnings: withDynamicResolveWarning(warnings, resolvedDynamically),
    }
  }

  // ── Write, one cell at a time ────────────────────────────────────────────
  for (const cell of plan.cells) {
    await withTimeout(
      () =>
        withRetry(
          () => patchCell(driveId, itemId, sheetName, addressOf(cell.columnIndex), cell.after),
          { maxRetries: 2, baseDelayMs: 600 }
        ),
      30_000,
      'updateErLogRow'
    )
  }

  // ── Read-back verification ───────────────────────────────────────────────
  // Verified against the ENTRY ID, not against a row position: if the row moved,
  // saying so is the point, and a position-only check would miss it.
  let verified = false
  let row = plan.rowAfter
  let reportedRowIndex: number | null = rowIndex
  try {
    const after = await readTableGrid(driveId, itemId, table)
    const afterIdIndex = after.entryIdIndex
    const afterMatch = matchEntryIdRows(
      afterIdIndex === null ? [] : after.rows.map((r) => r[afterIdIndex] ?? ''),
      entryId
    )
    if (afterMatch.indices.length !== 1) {
      warnings.push(
        `Read-back could not re-locate Entry ID "${entryId}" as a single row (${afterMatch.indices.length} ` +
          `match(es)), so the patch is UNVERIFIED. The cells were written — open the workbook and confirm.`
      )
    } else {
      const afterIndex = afterMatch.indices[0]
      reportedRowIndex = afterIndex
      const afterRow = after.rows[afterIndex] ?? []
      if (afterIndex !== rowIndex) {
        warnings.push(
          `The row's position CHANGED between the read and the write (table row index ${rowIndex} to ` +
            `${afterIndex}) — someone edited the workbook at the same time. The cells were written to the ` +
            `earlier position, so they may have landed on a different row. Open the workbook and check ` +
            `both rows now.`
        )
      }
      const mismatched = plan.cells.filter((c) => !cellValuesEqual(c.after, afterRow[c.columnIndex]))
      verified = afterIndex === rowIndex && mismatched.length === 0
      row = keyRowByColumns(after.columns, afterRow)
      if (mismatched.length > 0) {
        warnings.push(
          `Read-back mismatch on ${mismatched.length} cell(s): ` +
            mismatched
              .map((c) => `"${c.column}" shows "${truncateForWarning(String(afterRow[c.columnIndex] ?? ''))}"`)
              .join('; ') +
            '. Verify the workbook before relying on this entry.'
        )
      }
    }
  } catch {
    warnings.push(
      'Could not re-read the row to verify the patch. The cells were written; verification is unconfirmed.'
    )
  }

  return {
    entryId,
    rowIndex: reportedRowIndex,
    row,
    changed: plan.cells.map((c) => ({ column: c.column, before: c.before, after: c.after })),
    unchangedRequested: plan.unchangedRequested,
    verified,
    workbookWebUrl: await readWorkbookWebUrl(driveId, itemId),
    resolvedDynamically,
    tableName: table.name,
    tableColumns: grid.columns,
    warnings: withDynamicResolveWarning(warnings, resolvedDynamically),
  }
}

/** The workbook's webUrl, or null. Non-fatal — a missing link never fails a write. */
async function readWorkbookWebUrl(driveId: string, itemId: string): Promise<string | null> {
  try {
    const meta = await graph<DriveItemLite>(`/drives/${driveId}/items/${itemId}?$select=webUrl`)
    return meta.webUrl ?? null
  } catch {
    return null
  }
}

function withDynamicResolveWarning(warnings: string[], resolvedDynamically: boolean): string[] {
  if (!resolvedDynamically) return warnings
  return [
    ...warnings,
    'The configured driveId/itemId did not resolve; the workbook was located by path instead ' +
      '(it may have moved). Update HR_ER_DRIVE_ID / HR_ER_ITEM_ID.',
  ]
}

// ---------------------------------------------------------------------------
// Public operation 2: file a .docx to the central + subject folders
// ---------------------------------------------------------------------------

export interface FileDocumentInput {
  lastName: string
  docType: string
  /** Defaults to today (Eastern). */
  date?: string
  /** Exact "[Name] - [Role] [Date]" folder; resolved by lastName when omitted. */
  employeeFolderName?: string
  /** One of these is required. */
  base64Content?: string
  sourceUrl?: string
}

export interface FiledDocument {
  fileName: string
  central: { webUrl: string | null; itemId: string; verified: boolean }
  employeeFolder: { name: string; webUrl: string | null; itemId: string; verified: boolean }
  warnings: string[]
}

async function loadDocumentBytes(input: FileDocumentInput): Promise<Uint8Array> {
  if (input.base64Content) {
    const b64 = input.base64Content.replace(/^data:[^;]+;base64,/, '')
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  if (input.sourceUrl) {
    if (!/^https:\/\//i.test(input.sourceUrl)) {
      throw new Error('sourceUrl must be an https URL we control.')
    }
    const res = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Failed to fetch sourceUrl (${res.status}).`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return buf
  }
  throw new Error('Provide either base64Content or sourceUrl.')
}

export async function fileErDocument(input: FileDocumentInput): Promise<FiledDocument> {
  assertReady()
  const warnings: string[] = []

  const bytes = await loadDocumentBytes(input)
  const { driveId } = await resolveWorkbook()

  const centralPath = `${EMPLOYEE_FILES_PATH}/${ER_FOLDER_NAME}`

  // Compute the next ER-DOC number from existing central-folder file names.
  const centralChildren = await graph<{ value: DriveItemLite[] }>(
    `/drives/${driveId}/root:/${encodePath(centralPath)}:/children?$select=name&$top=999`
  )
  const docNumber = nextErDocNumber((centralChildren.value ?? []).map((c) => c.name ?? ''))
  const date = input.date ? normalizeDate(input.date) : todayEastern()
  const fileName = buildErDocFileName({ docNumber, lastName: input.lastName, date, type: input.docType })

  // Resolve the subject's employee folder and ensure Performance & Conduct exists.
  const employee = await resolveEmployeeFolder(driveId, {
    employeeFolderName: input.employeeFolderName,
    lastName: input.lastName,
  })
  const employeePath = `${EMPLOYEE_FILES_PATH}/${employee.name}`
  await ensureFolder(driveId, employeePath, PERFORMANCE_FOLDER)
  const subjectPath = `${employeePath}/${PERFORMANCE_FOLDER}`

  // Upload to BOTH locations.
  const centralItem = await uploadFile(driveId, `${centralPath}/${fileName}`, bytes)
  const subjectItem = await uploadFile(driveId, `${subjectPath}/${fileName}`, bytes)

  // Read-back verification for each upload.
  const centralVerified = await verifyUpload(driveId, centralItem.id, bytes.byteLength)
  const subjectVerified = await verifyUpload(driveId, subjectItem.id, bytes.byteLength)
  if (!centralVerified) warnings.push('Central copy read-back did not confirm the expected size.')
  if (!subjectVerified) warnings.push('Employee-folder copy read-back did not confirm the expected size.')

  return {
    fileName,
    central: { webUrl: centralItem.webUrl ?? null, itemId: centralItem.id, verified: centralVerified },
    employeeFolder: {
      name: employee.name,
      webUrl: subjectItem.webUrl ?? null,
      itemId: subjectItem.id,
      verified: subjectVerified,
    },
    warnings,
  }
}

async function verifyUpload(driveId: string, itemId: string, expectedBytes: number): Promise<boolean> {
  try {
    const item = await graph<DriveItemLite>(`/drives/${driveId}/items/${itemId}?$select=id,size`)
    return typeof item.size === 'number' ? item.size === expectedBytes : Boolean(item.id)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Audit logging (structuredLog — the shared write-path logger). No PII, no
// file contents, no secrets: actor + action + target ids + outcome only.
// ---------------------------------------------------------------------------

export function auditHrWrite(
  operation: 'hr_er_log_append' | 'hr_er_log_update' | 'hr_file_document',
  actorEmail: string | undefined,
  outcome: 'success' | 'error',
  detail: Record<string, unknown>
): void {
  const ctx = {
    correlationId: `hr-${operation}-${Date.now()}`,
    operation,
    actor: actorEmail ?? 'unknown',
    outcome,
    ...detail,
  }
  if (outcome === 'error') structuredLog.error(ctx, `${operation} failed`)
  else structuredLog.info(ctx, `${operation} ok`)
}
