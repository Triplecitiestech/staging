// src/lib/scan-filing/graph.ts
//
// Microsoft Graph access for the Raven scan filing pipeline.
//
// AUTH. A DEDICATED Entra app — "TCT Scan Filer (connector)", client id
// e28b8696-3a31-4713-822e-fbd46f46f7e2 — following the one-app-per-surface
// convention this tenant already uses (TCT MCP Connector, TCT HR Records
// Writer). It is NOT the staff-SSO app and NOT the HR records app.
//
// Its Mail.Read is deliberately NOT consented tenant-wide. It is supplied by
// Exchange Application RBAC, scoped by a management scope (`Alias -eq 'kurtis'`)
// so the app can read exactly one mailbox. That distinction is load-bearing:
// Microsoft's own documentation is explicit that an Entra grant and an App RBAC
// scope are UNIONED, so a tenant-wide Mail.Read consent would silently defeat
// the scope and hand this app every mailbox in the company. Verified 2026-09-07
// with Test-ServicePrincipalAuthorization: in-scope True for kurtis@, False for
// a control mailbox.
//
// The SharePoint side of the grant is a separate decision (Sites.Selected per
// site vs Sites.ReadWrite.All) and is NOT settled by this module. What IS
// settled here: whichever grant is made, the destination is checked against the
// routing policy in ./destinations.ts before a single byte is written, using the
// drive's own webUrl as reported by Graph.

import { throwClassified } from '@/lib/connector/failure-envelope'
import { structuredLog } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The one mailbox the app is scoped to read. Env-overridable for a re-scope. */
export const SCAN_MAILBOX = process.env.SCAN_MAILBOX || 'kurtis@triplecitiestech.com'

/** The scanner's sender address — reported so a caller can sanity-check origin. */
export const RAVEN_SENDER = 'raw39v@import.raven.com'

/** Simple-upload ceiling. Above this Graph wants a resumable upload session. */
export const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
/** Hard ceiling for either path. A scan larger than this is not a scan. */
export const MAX_SCAN_BYTES = 60 * 1024 * 1024

export function isScanFilerConfigured(): boolean {
  return Boolean(
    process.env.SCAN_FILER_TENANT_ID &&
      process.env.SCAN_FILER_CLIENT_ID &&
      process.env.SCAN_FILER_CLIENT_SECRET
  )
}

export function scanToolsEnabled(): boolean {
  return process.env.CONNECTOR_SCAN_WRITES_ENABLED === 'true'
}

/**
 * One actionable refusal covering both gates.
 *
 * The kill switch covers the WHOLE scan surface, reads included, because the
 * read is a read of Kurtis's mailbox — the same posture the HR surface takes
 * with hr_er_log_columns.
 */
export function assertScanReady(): void {
  if (!scanToolsEnabled()) {
    throwClassified({
      reasonCode: 'POLICY_BLOCKED',
      message: 'The Raven scan filing tools are disabled by their kill switch.',
      remediation:
        'Set CONNECTOR_SCAN_WRITES_ENABLED=true in the Vercel project once the TCT Scan Filer app has a ' +
        'client secret and its SharePoint grant. This is an environment change, not a code change.',
      surface: 'scan_filer',
    })
  }
  if (!isScanFilerConfigured()) {
    throwClassified({
      reasonCode: 'POLICY_BLOCKED',
      message: 'The TCT Scan Filer Entra app is not configured, so the connector holds no credential for it.',
      remediation:
        'Set SCAN_FILER_TENANT_ID, SCAN_FILER_CLIENT_ID and SCAN_FILER_CLIENT_SECRET in the Vercel project. ' +
        'The client id is e28b8696-3a31-4713-822e-fbd46f46f7e2; the secret is created by Kurtis in Entra and ' +
        'never passes through a conversation.',
      surface: 'scan_filer',
    })
  }
}

// ---------------------------------------------------------------------------
// Token (app-only client credentials, cached on globalThis across cold starts)
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number
}
declare global {
  // eslint-disable-next-line no-var
  var __scanFilerGraphToken: TokenEntry | undefined
}

async function getAccessToken(): Promise<string> {
  const cached = globalThis.__scanFilerGraphToken
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken

  const url = `https://login.microsoftonline.com/${process.env.SCAN_FILER_TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SCAN_FILER_CLIENT_ID!,
    client_secret: process.env.SCAN_FILER_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Scan filer Graph token fetch failed (${res.status}): ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  globalThis.__scanFilerGraphToken = {
    accessToken: data.access_token,
    // 5-minute safety margin, same as every other Graph client here.
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return data.access_token
}

/**
 * A 401/403 on this surface has two very different causes and one useless
 * generic message, so name both.
 */
function grantHint(path: string, status: number): string {
  if (status !== 401 && status !== 403) return ''
  if (path.includes('/messages')) {
    return (
      `\n\nHint: a ${status} on a mail path means the Exchange Application RBAC assignment for ` +
      `TCT Scan Filer is missing, was removed, or no longer resolves the mailbox. Re-run ` +
      `Set-ScanConnectorMailboxScope.ps1 — it is idempotent and re-runs both authorization tests.`
    )
  }
  return (
    `\n\nHint: a ${status} on a drive path means the app has no write access to that SITE. If the tenant ` +
    `chose Sites.Selected, each destination site needs its own grant: POST /sites/{siteId}/permissions ` +
    `with { roles:["write"], grantedToIdentities:[{ application:{ id:"<clientId>" } }] } as a SharePoint ` +
    `admin. Sites.Selected plus admin consent alone grants access to nothing. (path: ${path})`
  )
}

interface GraphOptions extends RequestInit {
  /** Skip the JSON Content-Type header (binary uploads). */
  raw?: boolean
  /** Return the response body as bytes rather than parsed JSON. */
  binary?: boolean
  timeoutMs?: number
}

async function graph<T>(path: string, options?: GraphOptions): Promise<T> {
  const token = await getAccessToken()
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`
  const { raw, binary, timeoutMs, ...init } = options ?? {}

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(timeoutMs ?? 30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Scan Graph ${path} failed (${res.status}): ${text}${grantHint(path, res.status)}`)
  }
  if (binary) return new Uint8Array(await res.arrayBuffer()) as unknown as T
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const text = await res.text()
  if (!text || text.trim().length === 0) return undefined as T
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export interface ScanMessage {
  id: string
  subject: string | null
  receivedDateTime: string | null
  /** Outlook deep link — this is what the log's "Source email" column holds. */
  webLink: string | null
  fromAddress: string | null
  hasAttachments: boolean
  /** True when the sender matches the Raven scanner. Reported, never enforced. */
  fromRavenScanner: boolean
}

export interface ScanAttachmentMeta {
  id: string
  name: string
  contentType: string | null
  size: number | null
  isInline: boolean
}

export async function getScanMessage(messageId: string): Promise<ScanMessage> {
  const m = await graph<{
    id: string
    subject?: string
    receivedDateTime?: string
    webLink?: string
    hasAttachments?: boolean
    from?: { emailAddress?: { address?: string } }
  }>(
    `/users/${encodeURIComponent(SCAN_MAILBOX)}/messages/${encodeURIComponent(messageId)}` +
      `?$select=id,subject,receivedDateTime,webLink,hasAttachments,from`
  )
  const fromAddress = m.from?.emailAddress?.address ?? null
  return {
    id: m.id,
    subject: m.subject ?? null,
    receivedDateTime: m.receivedDateTime ?? null,
    webLink: m.webLink ?? null,
    fromAddress,
    hasAttachments: Boolean(m.hasAttachments),
    fromRavenScanner: (fromAddress ?? '').toLowerCase() === RAVEN_SENDER,
  }
}

/**
 * List a message's attachments WITHOUT their bytes.
 *
 * The $select is not cosmetic: the default representation of a fileAttachment
 * includes `contentBytes`, so an unselected list of a 900 KB scan would drag the
 * whole base64 payload back through this process for nothing.
 */
export async function listScanAttachments(messageId: string): Promise<ScanAttachmentMeta[]> {
  const res = await graph<{ value: Array<Record<string, unknown>> }>(
    `/users/${encodeURIComponent(SCAN_MAILBOX)}/messages/${encodeURIComponent(messageId)}` +
      `/attachments?$select=id,name,contentType,size,isInline`
  )
  return (res?.value ?? []).map((a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    contentType: typeof a.contentType === 'string' ? a.contentType : null,
    size: typeof a.size === 'number' ? a.size : null,
    isInline: Boolean(a.isInline),
  }))
}

export interface FetchedAttachment {
  meta: ScanAttachmentMeta
  message: ScanMessage
  bytes: Uint8Array
}

/**
 * Fetch one attachment's bytes.
 *
 * Two deliberate choices. The attachment is LOCATED in the message's own
 * attachment list first, so a wrong id fails with the ids that do exist rather
 * than a bare 404 — the same reason hr_er_log_update lists the Entry IDs it
 * found. And the downloaded length is compared against the size Graph reported:
 * a short read is a truncated download, and filing a truncated PDF that opens to
 * a blank page is worse than not filing it.
 */
export async function fetchScanAttachment(
  messageId: string,
  attachmentId: string
): Promise<FetchedAttachment> {
  const message = await getScanMessage(messageId)
  const attachments = await listScanAttachments(messageId)

  const meta = attachments.find((a) => a.id === attachmentId)
  if (!meta) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: `Message ${messageId} has no attachment with id ${attachmentId}.`,
      evidence:
        attachments.length === 0
          ? 'The message reports no attachments at all.'
          : `The message's attachments are: ${attachments
              .map((a) => `${a.name} (${a.id})`)
              .join(' | ')}`,
      remediation:
        'Re-read the message to get a current attachment id. Attachment ids are per-message and change ' +
        'if the message is moved between mailboxes.',
      surface: 'scan_filer',
    })
  }

  if (meta.size !== null && meta.size > MAX_SCAN_BYTES) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `Attachment "${meta.name}" is ${(meta.size / 1024 / 1024).toFixed(1)} MB, above this pipeline's ${MAX_SCAN_BYTES / 1024 / 1024} MB ceiling.`,
      remediation: 'File this one by hand from Outlook, and tell Kurtis if scans this size are now normal.',
      surface: 'scan_filer',
    })
  }

  const bytes = await graph<Uint8Array>(
    `/users/${encodeURIComponent(SCAN_MAILBOX)}/messages/${encodeURIComponent(messageId)}` +
      `/attachments/${encodeURIComponent(attachmentId)}/$value`,
    { binary: true, timeoutMs: 30_000 }
  )

  if (!bytes || bytes.byteLength === 0) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: `Attachment "${meta.name}" downloaded as 0 bytes.`,
      evidence: `Graph reported size ${meta.size ?? 'unknown'} but /$value returned an empty body.`,
      remediation: 'Retry once; if it repeats, open the message in Outlook and confirm the attachment opens.',
      surface: 'scan_filer',
    })
  }

  if (meta.size !== null && bytes.byteLength !== meta.size) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `Attachment "${meta.name}" downloaded short: ${bytes.byteLength} bytes against the ${meta.size} ` +
        `bytes Graph reported. The download is incomplete, so it is not filed.`,
      evidence: 'Compared the /$value body length against the attachment collection\'s own size field.',
      remediation: 'Retry the call. A repeat short read is an upstream problem worth reporting to Kurtis.',
      surface: 'scan_filer',
    })
  }

  return { meta, message, bytes }
}

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------

export interface DriveInfo {
  id: string
  name: string | null
  /** Graph's own URL for the drive — the ONLY proof of which site it belongs to. */
  webUrl: string | null
  driveType: string | null
}

export async function getDrive(driveId: string): Promise<DriveInfo> {
  const d = await graph<{ id: string; name?: string; webUrl?: string; driveType?: string }>(
    `/drives/${encodeURIComponent(driveId)}?$select=id,name,webUrl,driveType`
  )
  return {
    id: d.id,
    name: d.name ?? null,
    webUrl: d.webUrl ?? null,
    driveType: d.driveType ?? null,
  }
}

export interface DriveItemInfo {
  id: string
  name: string | null
  webUrl: string | null
  size: number | null
  isFolder: boolean
  parentPath: string | null
}

export async function getDriveItem(driveId: string, itemId: string): Promise<DriveItemInfo> {
  const i = await graph<{
    id: string
    name?: string
    webUrl?: string
    size?: number
    folder?: unknown
    parentReference?: { path?: string }
  }>(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}` +
      `?$select=id,name,webUrl,size,folder,parentReference`
  )
  return {
    id: i.id,
    name: i.name ?? null,
    webUrl: i.webUrl ?? null,
    size: typeof i.size === 'number' ? i.size : null,
    isFolder: Boolean(i.folder),
    parentPath: i.parentReference?.path ?? null,
  }
}

export interface UploadResult {
  itemId: string
  name: string
  webUrl: string | null
  size: number | null
  /** Read back after the write; a name differing from the request means a rename. */
  renamed: boolean
  /** Size read back equals the bytes sent. */
  verified: boolean
  uploadPath: 'simple' | 'session'
}

/**
 * Upload bytes into a folder and VERIFY BY READ-BACK.
 *
 * conflictBehavior is 'rename' or 'fail' only. There is no 'replace' parameter —
 * not "replace is discouraged", but no way to express it — because a scan
 * overwriting an existing filed document destroys a record with nothing left to
 * recover it from, and this pipeline runs unattended.
 */
export async function uploadScanFile(input: {
  driveId: string
  parentItemId: string
  filename: string
  bytes: Uint8Array
  conflictBehavior: 'rename' | 'fail'
}): Promise<UploadResult> {
  const { driveId, parentItemId, filename, bytes, conflictBehavior } = input

  if (bytes.byteLength === 0) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: 'Refusing to upload an empty file.',
      surface: 'scan_filer',
    })
  }
  if (bytes.byteLength > MAX_SCAN_BYTES) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `File is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, above this pipeline's ${MAX_SCAN_BYTES / 1024 / 1024} MB ceiling.`,
      surface: 'scan_filer',
    })
  }

  const uploadPath: 'simple' | 'session' =
    bytes.byteLength <= SIMPLE_UPLOAD_MAX_BYTES ? 'simple' : 'session'

  const created =
    uploadPath === 'simple'
      ? await simpleUpload(driveId, parentItemId, filename, bytes, conflictBehavior)
      : await sessionUpload(driveId, parentItemId, filename, bytes, conflictBehavior)

  // Read-back. An accepted PUT is not proof the item is there and complete;
  // this connector's standing rule is that the READ-BACK is the evidence.
  const readBack = await getDriveItem(driveId, created.id).catch(() => null)
  const size = readBack?.size ?? null
  const name = readBack?.name ?? created.name ?? filename

  if (!readBack) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `The upload of "${filename}" was accepted but the item could not be read back, so the connector ` +
        `cannot confirm the file is filed. Do not report this scan as filed.`,
      evidence: `Graph accepted the ${uploadPath} upload and returned item id ${created.id}, but the follow-up GET on that item failed.`,
      remediation:
        'Check the destination folder in SharePoint before re-uploading — a blind retry is how a scan ends ' +
        'up filed twice under two names.',
      surface: 'scan_filer',
    })
  }

  return {
    itemId: created.id,
    name,
    webUrl: readBack.webUrl,
    size,
    renamed: name !== filename,
    verified: size === bytes.byteLength,
    uploadPath,
  }
}

interface CreatedItem {
  id: string
  name?: string
}

async function simpleUpload(
  driveId: string,
  parentItemId: string,
  filename: string,
  bytes: Uint8Array,
  conflictBehavior: 'rename' | 'fail'
): Promise<CreatedItem> {
  return graph<CreatedItem>(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/` +
      `${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=${conflictBehavior}`,
    {
      method: 'PUT',
      raw: true,
      headers: { 'Content-Type': 'application/pdf' },
      body: bytes as unknown as BodyInit,
      timeoutMs: 45_000,
    }
  )
}

/**
 * Resumable-upload path for anything over the 4 MB simple-upload limit, sent as
 * one range. Multi-range chunking would add a resume state machine for a case
 * that does not occur here — a scan large enough to need it belongs in a human's
 * hands, which is what the MAX_SCAN_BYTES ceiling enforces.
 */
async function sessionUpload(
  driveId: string,
  parentItemId: string,
  filename: string,
  bytes: Uint8Array,
  conflictBehavior: 'rename' | 'fail'
): Promise<CreatedItem> {
  const session = await graph<{ uploadUrl: string }>(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/` +
      `${encodeURIComponent(filename)}:/createUploadSession`,
    {
      method: 'POST',
      body: JSON.stringify({
        item: { '@microsoft.graph.conflictBehavior': conflictBehavior, name: filename },
      }),
    }
  )

  const total = bytes.byteLength
  // The upload URL is pre-authorized; sending the bearer token to it is both
  // unnecessary and a credential leak to a URL we did not construct.
  const res = await fetch(session.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(total),
      'Content-Range': `bytes 0-${total - 1}/${total}`,
    },
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Scan upload session PUT failed (${res.status}): ${text}`)
  }
  return (await res.json()) as CreatedItem
}

// ---------------------------------------------------------------------------
// Workbook access (the scan log) — same Graph credential, Excel endpoints
// ---------------------------------------------------------------------------

export async function graphJson<T>(path: string, options?: GraphOptions): Promise<T> {
  return graph<T>(path, options)
}

// ---------------------------------------------------------------------------
// Audit logging. Actor + action + target ids + outcome. Never document content,
// never a filename's contents, never a secret.
// ---------------------------------------------------------------------------

export function auditScanWrite(
  operation: string,
  actorEmail: string | undefined,
  outcome: 'success' | 'error',
  detail: Record<string, unknown>
): void {
  const ctx = {
    correlationId: `scan-${operation}-${Date.now()}`,
    operation,
    actor: actorEmail ?? 'unknown',
    outcome,
    ...detail,
  }
  if (outcome === 'error') structuredLog.error(ctx, `${operation} failed`)
  else structuredLog.info(ctx, `${operation} ok`)
}
