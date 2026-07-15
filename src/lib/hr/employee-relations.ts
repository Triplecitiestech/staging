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

/** Column order — MUST match the workbook header row exactly. */
export const ER_COLUMNS = [
  'Entry ID',
  'Date Logged',
  'Date of Incident',
  'Employee',
  'Role / Status',
  'Category',
  'Severity',
  'Summary',
  'Expectation Missed',
  'Reference',
  'Reported By',
  'Action Taken',
  'Linked Document',
  'Follow-Up / Status',
] as const

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
 * Find the log table, or convert the used range of the log worksheet into a
 * table on first run. Preference order: a table whose header contains "Entry ID";
 * else the first table on the workbook; else create one from the worksheet's
 * used range (hasHeaders=true) so future appends are atomic table appends.
 */
async function resolveLogTable(driveId: string, itemId: string): Promise<WorkbookTable> {
  const base = `/drives/${driveId}/items/${itemId}/workbook`
  const tables = await graph<{ value: WorkbookTable[] }>(`${base}/tables?$select=id,name`)
  const existing = tables.value ?? []

  for (const t of existing) {
    try {
      const cols = await graph<{ value: Array<{ name: string }> }>(
        `${base}/tables/${encodeURIComponent(t.id)}/columns?$select=name`
      )
      if ((cols.value ?? []).some((c) => /entry\s*id/i.test(c.name))) return t
    } catch {
      // ignore and keep looking
    }
  }
  if (existing.length > 0) return existing[0]

  // No table yet — convert the used range of the log worksheet into one.
  const worksheet = await pickLogWorksheet(driveId, itemId)
  const used = await graph<{ address: string }>(
    `${base}/worksheets/${encodeURIComponent(worksheet)}/usedRange?$select=address`
  )
  const created = await graph<WorkbookTable>(`${base}/tables/add`, {
    method: 'POST',
    body: JSON.stringify({ address: used.address, hasHeaders: true }),
  })
  return created
}

/** The configured worksheet if present, else the first worksheet by position. */
async function pickLogWorksheet(driveId: string, itemId: string): Promise<string> {
  const base = `/drives/${driveId}/items/${itemId}/workbook`
  const sheets = await graph<{ value: Array<{ name: string; position: number }> }>(
    `${base}/worksheets?$select=name,position`
  )
  const all = sheets.value ?? []
  const match = all.find((w) => w.name.toLowerCase() === LOG_WORKSHEET.toLowerCase())
  if (match) return match.name
  const first = [...all].sort((a, b) => a.position - b.position)[0]
  if (!first) throw new Error('HR log workbook has no worksheets.')
  return first.name
}

/** Read the Entry-ID column values (header excluded). */
async function readEntryIdColumn(
  driveId: string,
  itemId: string,
  table: WorkbookTable
): Promise<string[]> {
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(table.id)}`
  const cols = await graph<{
    value: Array<{ name: string; index: number; values: unknown[][] }>
  }>(`${base}/columns?$select=name,index,values`)
  const list = cols.value ?? []
  const col = list.find((c) => /entry\s*id/i.test(c.name)) ?? list.find((c) => c.index === 0)
  if (!col) return []
  // values is a 2-D array including the header row at [0].
  return (col.values ?? []).slice(1).map((row) => String(row?.[0] ?? '').trim())
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
  /** Override "Date Logged" (defaults to today, Eastern). */
  dateLogged?: string
}

export interface ErLogAppendResult {
  entryId: string
  row: Record<string, string>
  rowIndex: number | null
  verified: boolean
  duplicateEntryIdDetected: boolean
  workbookWebUrl: string | null
  resolvedDynamically: boolean
  warnings: string[]
}

export async function appendErLogRow(input: ErLogAppendInput): Promise<ErLogAppendResult> {
  assertReady()
  const warnings: string[] = []

  const { driveId, itemId, resolvedDynamically } = await resolveWorkbook()
  const table = await resolveLogTable(driveId, itemId)
  const base = `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(table.id)}`

  // Compute the next Entry ID from the live table (never trust caller input).
  const existingIds = await readEntryIdColumn(driveId, itemId, table)
  const entryId = formatEntryId(nextEntryIdNumber(existingIds))

  const dateLogged = input.dateLogged ? normalizeDate(input.dateLogged) : todayEastern()

  // Build the row in the canonical column order, all sanitized to plain text.
  const rowValues: Record<string, string> = {
    'Entry ID': entryId,
    'Date Logged': dateLogged,
    'Date of Incident': normalizeDate(input.dateOfIncident),
    Employee: sanitizePlainText(input.employee),
    'Role / Status': sanitizePlainText(input.roleStatus),
    Category: sanitizePlainText(input.category),
    Severity: sanitizePlainText(input.severity),
    Summary: sanitizePlainText(input.summary),
    'Expectation Missed': sanitizePlainText(input.expectationMissed),
    Reference: sanitizePlainText(input.reference),
    'Reported By': sanitizePlainText(input.reportedBy),
    'Action Taken': sanitizePlainText(input.actionTaken),
    'Linked Document': sanitizePlainText(input.linkedDocument),
    'Follow-Up / Status': sanitizePlainText(input.followUpStatus),
  }
  const values = [ER_COLUMNS.map((c) => rowValues[c] ?? '')]

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

  // Read-back verification: the created row must carry our Entry ID.
  const writtenId = String(added?.values?.[0]?.[0] ?? '')
  const verified = writtenId === entryId

  // Concurrency check: our Entry ID must be unique in the column.
  let duplicateEntryIdDetected = false
  try {
    const after = await readEntryIdColumn(driveId, itemId, table)
    const count = after.filter((v) => v === entryId).length
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
    warnings,
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
