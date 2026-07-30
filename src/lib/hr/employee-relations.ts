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
  operation: 'hr_er_log_append' | 'hr_file_document',
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
