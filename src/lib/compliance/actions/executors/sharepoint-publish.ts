/**
 * Real Graph executor: publish a generated/approved policy back to the
 * customer's SharePoint document library.
 *
 * This closes the loop on slice #5a (policy generation). Flow:
 *   1. Operator clicks Remediate on a failing control → TCT generates
 *      or revises the matching policy in the compliance library.
 *   2. Operator reviews the draft on workflow step 4.
 *   3. Customer HR / PoC signs off (out-of-band today; the operator
 *      represents that consent by ticking the approval checkbox in
 *      the publish modal).
 *   4. Operator hits "Publish to SharePoint" — this executor uploads
 *      the rendered HTML to the chosen folder via Graph and records
 *      the upload in the audit log.
 *
 * Important: this writes to the CUSTOMER'S tenant. Refuses cleanly
 * when the customer-approved flag is missing in metadata so a UI bug
 * can't accidentally push without sign-off being explicitly recorded.
 *
 * Idempotency: re-publishing the same policy bumps a version suffix
 * on the filename (Policy v2.html, v3.html, etc.) so we never silently
 * overwrite a previously approved version. The customer can compare
 * revisions in their own SharePoint version history if they enabled it.
 *
 * Permissions needed on the customer's TCT Portal app reg:
 *   Files.ReadWrite.All  (or Sites.ReadWrite.All scoped to the site)
 *
 * Microsoft Graph docs:
 *   https://learn.microsoft.com/graph/api/driveitem-put-content
 */

import { getGraphTokenForCompany, graphRequest } from '@/lib/graph'
import {
  parseSharePointUrl,
  pickMatchingDrive,
  safeDecode,
  type SharePointDrive,
} from '@/lib/compliance/sharepoint-url'
import { renderPolicyDocx } from '@/lib/compliance/policy-generation/docx-renderer'
import { loadLatestApproval } from '@/lib/compliance/policy-approval-store'
import { getPool } from '@/lib/db-pool'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview } from '../previewers'

interface PolicyForPublish {
  id: string
  title: string
  content: string
  source: string
  updatedAt: string
}

async function loadPolicy(companyId: string, policyId: string): Promise<PolicyForPublish | null> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<PolicyForPublish>(
      `SELECT id, title, content, source, "updatedAt"::text AS "updatedAt"
         FROM compliance_policies
        WHERE id = $1 AND "companyId" = $2`,
      [policyId, companyId]
    )
    return res.rows[0] ?? null
  } finally {
    client.release()
  }
}

async function getCompanyName(companyId: string): Promise<string> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const r = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    return r.rows[0]?.displayName ?? 'Customer'
  } finally {
    client.release()
  }
}

interface PublishMetadata {
  policyId?: string
  sharepointFolderUrl?: string
  customerApproved?: boolean
}

function readMetadata(ctx: ExecutorContext | PreviewerContext): PublishMetadata {
  const meta = (ctx as ExecutorContext).metadata ?? {}
  return {
    policyId: typeof meta.policyId === 'string' ? meta.policyId : undefined,
    sharepointFolderUrl: typeof meta.sharepointFolderUrl === 'string' ? meta.sharepointFolderUrl : undefined,
    customerApproved: meta.customerApproved === true,
  }
}

function buildFileName(policyTitle: string, existingNames: string[]): string {
  const safeTitle = policyTitle
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const base = safeTitle.length > 0 ? safeTitle : 'Policy'
  // If a file with this exact name already exists, suffix v2 / v3 / ...
  // Existing names checked case-insensitively (SharePoint is case-insensitive).
  const lowerSet = new Set(existingNames.map((n) => n.toLowerCase()))
  if (!lowerSet.has(`${base}.docx`.toLowerCase())) return `${base}.docx`
  let n = 2
  while (lowerSet.has(`${base} v${n}.docx`.toLowerCase())) n++
  return `${base} v${n}.docx`
}

async function listFolderFiles(token: string, driveId: string, relative: string): Promise<string[]> {
  // children listing — we only need names for the de-dupe versioning.
  const path = relative.length === 0
    ? `/drives/${driveId}/root/children?$select=name`
    : `/drives/${driveId}/root:/${relative.split('/').map(encodeURIComponent).join('/')}:/children?$select=name`
  try {
    const res = await graphRequest<{ value: Array<{ name: string }> }>(token, path)
    return (res?.value ?? []).map((i) => i.name)
  } catch {
    // 404 means the folder doesn't exist yet — caller will surface a clear error.
    return []
  }
}

async function resolveDestination(token: string, folderUrl: string): Promise<
  | { ok: true; drive: SharePointDrive; relativeToDrive: string; siteId: string }
  | { ok: false; error: string }
> {
  let parsedUrl
  try {
    parsedUrl = parseSharePointUrl(folderUrl)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const siteRes = await graphRequest<{ id: string }>(
    token,
    `/sites/${parsedUrl.hostname}:/sites/${encodeURIComponent(parsedUrl.siteName)}`
  ).catch((e) => { throw new Error(`Site lookup failed: ${e instanceof Error ? e.message : String(e)}`) })
  const drivesRes = await graphRequest<{ value: SharePointDrive[] }>(
    token, `/sites/${siteRes.id}/drives`
  )
  const drives = drivesRes?.value ?? []
  const matched = pickMatchingDrive(drives, parsedUrl.serverRelativePath)
  if (!matched) {
    const known = drives.map((d) => safeDecode(new URL(d.webUrl).pathname)).join(', ')
    return {
      ok: false,
      error: `URL doesn't point at any document library on this site. Available libraries: ${known}`,
    }
  }
  return { ok: true, drive: matched.drive, relativeToDrive: matched.relativeToDrive, siteId: siteRes.id }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export async function publishPolicyToSharePoint(ctx: ExecutorContext): Promise<ExecutorResult> {
  const m = readMetadata(ctx)
  if (!m.policyId) {
    return { success: false, summary: 'Missing policyId — cannot determine which policy to publish.' }
  }
  if (!m.sharepointFolderUrl) {
    return { success: false, summary: 'Missing sharepointFolderUrl — operator must pick a destination folder.' }
  }

  // Approval gate: the customer-portal approval table (C.4) is the
  // authoritative source. If the most recent approval for THIS version
  // of the policy was decided='approved', publish proceeds. Otherwise
  // fall back to the operator's customerApproved checkbox (the
  // pre-portal flow). One of the two must say yes.
  let approvalEvidence: string | null = null
  const pool = getPool()
  const evidenceClient = await pool.connect()
  try {
    const latest = await loadLatestApproval(evidenceClient, ctx.companyId, m.policyId)
    if (latest && latest.decision === 'approved' && latest.freshForCurrentContent) {
      approvalEvidence =
        `Recorded customer approval (id ${latest.id}) — decided ${latest.decidedAt ?? '(unknown)'} by ${latest.recipientEmail}`
    }
  } finally {
    evidenceClient.release()
  }
  if (!approvalEvidence && !m.customerApproved) {
    return {
      success: false,
      summary:
        'Publish refused: no customer approval on record for this version. ' +
        'Either send a customer approval request (recommended) or tick the operator-vouching checkbox in the publish modal.',
    }
  }

  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return { success: false, summary: 'Microsoft 365 is not connected for this customer — cannot publish.' }
  }

  const policy = await loadPolicy(ctx.companyId, m.policyId)
  if (!policy) {
    return { success: false, summary: `Policy ${m.policyId} not found in compliance library.` }
  }

  const dest = await resolveDestination(token, m.sharepointFolderUrl)
  if (!dest.ok) {
    return { success: false, summary: `Destination unresolved: ${dest.error}` }
  }

  const companyName = await getCompanyName(ctx.companyId)
  let docxBuffer: Buffer
  try {
    docxBuffer = await renderPolicyDocx(policy.content, {
      policyTitle: policy.title,
      companyName,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      version: '1.0',
      owner: 'Triple Cities Tech (managed)',
      approvedBy: ctx.staffEmail,
    })
  } catch (err) {
    return {
      success: false,
      summary: `Failed to render .docx: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const existingNames = await listFolderFiles(token, dest.drive.id, dest.relativeToDrive)
  const fileName = buildFileName(policy.title, existingNames)
  const relativePath = dest.relativeToDrive.length === 0
    ? fileName
    : `${dest.relativeToDrive}/${fileName}`
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')

  try {
    const uploaded = await graphRequest<{ id: string; name: string; webUrl: string; size: number }>(
      token,
      `/drives/${dest.drive.id}/root:/${encodedPath}:/content`,
      {
        method: 'PUT',
        headers: {
          // Word's official MIME type. SharePoint uses it to render
          // the file as a .docx (in-browser Word preview, "Open in
          // Word" button, etc.) instead of a generic binary download.
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        // Project's TS lib doesn't include Uint8Array in BodyInit
        // (older dom.lib.d.ts shape). Node fetch (undici) accepts a
        // Buffer / Uint8Array directly at runtime — cast is safe.
        body: new Uint8Array(docxBuffer.buffer, docxBuffer.byteOffset, docxBuffer.byteLength) as unknown as BodyInit,
      }
    )
    return {
      success: true,
      summary: `Published "${policy.title}" to SharePoint as "${uploaded.name}" (${(uploaded.size / 1024).toFixed(1)} KB). ${approvalEvidence ? `Authorized by: ${approvalEvidence}.` : 'Authorized by: operator vouch (checkbox).'} View: ${uploaded.webUrl}`,
      details: {
        policyId: policy.id,
        policyTitle: policy.title,
        approvalEvidence,
        approvedViaPortal: approvalEvidence !== null,
        sharepointFileId: uploaded.id,
        sharepointFileName: uploaded.name,
        sharepointWebUrl: uploaded.webUrl,
        driveName: dest.drive.name,
        approvedBy: ctx.staffEmail,
      },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to upload to SharePoint: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Previewer — destination resolution + file existence check, read-only.
// ---------------------------------------------------------------------------

export async function previewPublishPolicyToSharePoint(ctx: PreviewerContext): Promise<ImpactPreview> {
  const m = readMetadata(ctx)
  if (!m.sharepointFolderUrl) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: 'No SharePoint destination chosen yet — pick a folder URL in the publish modal.',
      isLiveQuery: false,
    }
  }

  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: 'Microsoft 365 is not connected for this customer — cannot preview publish.',
      isLiveQuery: false,
    }
  }

  const dest = await resolveDestination(token, m.sharepointFolderUrl)
  if (!dest.ok) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: `Destination invalid: ${dest.error}`,
      isLiveQuery: true,
      warnings: ['Fix the folder URL before attempting publish.'],
    }
  }

  const policyTitle = 'the selected policy'
  const existingNames = await listFolderFiles(token, dest.drive.id, dest.relativeToDrive)
  const policyId = m.policyId
  let projectedName = 'Policy.docx'
  if (policyId) {
    const policy = await loadPolicy(ctx.companyId, policyId)
    if (policy) {
      projectedName = buildFileName(policy.title, existingNames)
    }
  }
  const targetPath = dest.relativeToDrive.length === 0
    ? projectedName
    : `${dest.relativeToDrive}/${projectedName}`

  return {
    totalAffected: 1,
    entities: [{
      id: 'pending-upload',
      displayName: targetPath,
      type: 'other',
      currentState: existingNames.some((n) => n.toLowerCase() === projectedName.toLowerCase())
        ? 'file exists — would create a new version'
        : 'destination folder is empty for this filename',
      projectedState: `uploaded as ${projectedName} (Word .docx)`,
    }],
    truncated: false,
    summary: `Will publish ${policyTitle} to the "${dest.drive.name}" library at "${dest.relativeToDrive || '(library root)'}". Filename auto-versioned if needed.`,
    isLiveQuery: true,
    warnings: m.customerApproved
      ? undefined
      : ['Customer-approval checkbox is not ticked — apply will refuse.'],
  }
}
