// src/lib/autotask-attachments.ts
//
// Pure helpers for creating FILE attachments on Autotask tickets and time
// entries through the MCP connector: input validation (before any byte leaves
// the connector), the request body, and the read-back comparison afterwards.
//
// No I/O lives here. The tools in mcp-write-tools.ts and the writer in
// autotask-write.ts call these, and the unit tests exercise every rule without
// a socket — which is the point of keeping them apart from the handlers.
//
// WHAT THE VENDOR DOCUMENTS (read 2026-09-08, cited so the next reader can
// re-check rather than trust this file):
//
//   "Working with attachments in the REST API"
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/API_Calls/REST_Attachments.htm
//     - "When adding an attachment to an entity via the API, the attachment must
//        be encoded as base64 binary data."
//     - "The API size limit for individual attachment files is 6 to 7 MB, with a
//        maximum of 10,000,000 bytes within a five-minute period. If the
//        integration exceeds 10,000,000 bytes within a five-minute span, the API
//        will also stop accepting attachment creation calls for five minutes."
//     - "Attachments support create, delete, and query functions only. It is not
//        possible to update an attachment."
//     - "To create or delete attachments, you must use the child collection URL
//        for each attachment type." Create example: POST
//        /v1.0/Tickets/90/Attachments with body {attachmentType:
//        "FILE_ATTACHMENT", fullPath, publish, title, data}.
//     - Resource impersonation: "In the header of the request, we've specified
//        an ImpersonationResourceId value … the author of this attachment being
//        attributed to the resource with the corresponding identifier."
//     - "Attachment types are limited to the file types allowed in Autotask."
//
//   TicketAttachments / TimeEntryAttachments entity references
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/TicketAttachmentsEntity.htm
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/TimeEntryAttachmentsEntity.htm
//     - "The Data field is required when you create an attachment with
//        attachmentType = FILE_ATTACHMENT."
//     - "The following fields from this entity will return an error when
//        queried: creatorType, data, fileSize."
//
//   The zone's own Swagger (public, no auth):
//   https://webservices14.autotask.net/atservicesrest/swagger/docs/v1
//     - POST exists ONLY at /V1.0/Tickets/{parentId}/Attachments and
//       /V1.0/TimeEntries/{parentId}/Attachments (the root TicketAttachments /
//       TimeEntryAttachments resources offer query, entityInformation and GET
//       by id — no POST). DELETE exists only at the child path too.
//     - The POST body model (TicketAttachmentModel / TimeEntryAttachmentModel)
//       lists title, fullPath, publish, attachmentType, contentType and data as
//       plain properties; only parentType, soapParentPropertyId and
//       isTaskAttachment are marked readOnly there.
//
// THE CONTRADICTION THIS SURFACE LIVES WITH: live entityInformation on both
// entities reports title, fullPath, publish and attachmentType as isRequired
// TRUE and isReadOnly TRUE at once, and only `data` and `attachedByContactID`
// as writable. The vendor's own documented create request sends all four. The
// flags cannot be right about a create — a field cannot be required of the
// caller and unwritable by the caller — so this module SENDS them, and the tool
// SETTLES the question on every call by reading the stored publish back. It
// never omits publish and hopes for a default: a transcript of a customer call
// landing in the Client Portal is the failure the whole guardrail exists for.

import type { FailureInput } from '@/lib/connector/failure-envelope'

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Maximum decoded file size accepted, in bytes.
 *
 * CHOSEN, from a DOCUMENTED RANGE: Kaseya states the per-file API limit as
 * "6 to 7 MB" without a single number. 6,000,000 bytes is the lower bound of
 * that range in decimal megabytes, so a file this tool accepts is never one the
 * vendor's own statement might refuse. The real payloads (call transcripts,
 * 3-10 KB) are three orders of magnitude below it.
 */
export const ATTACHMENT_MAX_BYTES = 6_000_000

/**
 * The vendor's rolling window, quoted for the tool description. NOT enforced
 * here: a serverless function has no shared counter to enforce it with, and a
 * pretend limit is worse than a stated one. A vendor refusal for this reason
 * comes back through the failure envelope as whatever Autotask returns.
 */
export const ATTACHMENT_WINDOW_NOTE =
  'Kaseya also caps attachment uploads at 10,000,000 bytes per five-minute window across the whole API user; exceeding it suspends attachment creation for five minutes. Not enforced by the connector — surfaced as the vendor error if hit.'

/**
 * Content types this tool will upload, each with the file extensions it must
 * carry. CHOSEN, not documented: Autotask's own allowlist is a per-instance
 * admin setting ("Attachment types are limited to the file types allowed in
 * Autotask") that the API does not expose, so this is the connector's own
 * narrow set — the transcript pipeline's text/plain plus a few document types
 * a technician plausibly attaches to a ticket. Widening it is a reviewed
 * change, not a parameter.
 */
export const ATTACHMENT_CONTENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  'text/plain': ['txt', 'log', 'text'],
  'text/csv': ['csv'],
  'text/markdown': ['md', 'markdown'],
  'application/json': ['json'],
  'application/pdf': ['pdf'],
}

/** Autotask's own maximum for fullPath and title (entity reference: string, 255). */
export const ATTACHMENT_NAME_MAX = 255

/**
 * Live publish picklist on BOTH attachment entities (read 2026-09-08 via
 * autotask_entity_picklist): 1 "All Autotask Users", 2 "Internal Users Only",
 * 4 "Internal & Co-Managed". Id 1 is the Internal-cleared state that Client
 * Portal customers can see. Note the labels differ from TicketNotes ("Internal
 * Project Team") — never assume two entities share a picklist.
 */
export const ATTACHMENT_PUBLISH = {
  INTERNAL: 2,
  CUSTOMER_VISIBLE: 1,
} as const

/** The value Autotask stores for a file (as opposed to a link) attachment. */
export const FILE_ATTACHMENT_TYPE = 'FILE_ATTACHMENT'

// ---------------------------------------------------------------------------
// The three attachment entities this connector writes, and how each is read back
// ---------------------------------------------------------------------------
//
// 2026-09-08, live: the first real autotask_add_time_entry_attachment call
// created row 28465 and then the read-back 500'd —
//   {"errors":["Unable to find ticketNoteID in the TimeEntryAttachment Entity."]}
// — because ONE field list was shared across entities. Verified against live
// entityInformation the same day: TicketAttachments has ticketNoteID and
// parentAttachmentID; TimeEntryAttachments has NEITHER (it has taskID instead);
// TicketNoteAttachments has ticketNoteID but no timeEntryID, taskID or
// parentAttachmentID. So the projection is declared PER ENTITY below, and then
// intersected with the live field list at call time (attachmentReadBackFields),
// so a vendor schema change drops a field from the read instead of failing it.

export type AttachmentEntity = 'TicketAttachments' | 'TimeEntryAttachments' | 'TicketNoteAttachments'
export type AttachmentParentEntity = 'Tickets' | 'TimeEntries' | 'TicketNotes'
export type AttachmentParentField = 'ticketID' | 'timeEntryID' | 'ticketNoteID'

export interface AttachmentEntityConfig {
  entity: AttachmentEntity
  /** Child-collection URL root: POST/GET/DELETE {parentEntity}/{parentId}/Attachments[/{id}]. */
  parentEntity: AttachmentParentEntity
  /** The field on the row that must equal the parent id the caller named. */
  parentField: AttachmentParentField
  /**
   * Queryable fields wanted from a read-back — the maximal set for THIS entity.
   * creatorType, data and fileSize are never here (they error when queried).
   * Intersected with live entityInformation before use.
   */
  readBackFields: readonly string[]
}

const COMMON_READ_BACK = [
  'id', 'parentID', 'publish', 'title', 'fullPath', 'attachmentType', 'contentType', 'attachDate',
  'attachedByResourceID', 'attachedByContactID', 'impersonatorCreatorResourceID',
] as const

export const ATTACHMENT_ENTITIES: Readonly<Record<AttachmentEntity, AttachmentEntityConfig>> = {
  TicketAttachments: {
    entity: 'TicketAttachments',
    parentEntity: 'Tickets',
    parentField: 'ticketID',
    readBackFields: [...COMMON_READ_BACK, 'ticketID', 'ticketNoteID', 'timeEntryID', 'parentAttachmentID'],
  },
  TimeEntryAttachments: {
    entity: 'TimeEntryAttachments',
    parentEntity: 'TimeEntries',
    parentField: 'timeEntryID',
    readBackFields: [...COMMON_READ_BACK, 'timeEntryID', 'ticketID', 'taskID'],
  },
  TicketNoteAttachments: {
    entity: 'TicketNoteAttachments',
    parentEntity: 'TicketNotes',
    parentField: 'ticketNoteID',
    readBackFields: [...COMMON_READ_BACK, 'ticketNoteID', 'ticketID'],
  },
}

/**
 * The projection to request from a read-back, given the entity's LIVE field
 * names. Names the live metadata does not carry are dropped and reported, so
 * the query degrades to fewer columns instead of a 500. `id` and the parent
 * field are always kept — without them there is nothing to verify against.
 *
 * `liveFieldNames` null = the metadata lookup failed; the declared per-entity
 * list is used unfiltered, which is already entity-specific and therefore
 * cannot reproduce the shared-list defect.
 */
export function attachmentReadBackFields(
  entity: AttachmentEntity,
  liveFieldNames: readonly string[] | null,
): { fields: string[]; dropped: string[]; source: 'live-intersection' | 'declared-fallback' } {
  const cfg = ATTACHMENT_ENTITIES[entity]
  const declared = [...new Set([...cfg.readBackFields])]
  if (!liveFieldNames) return { fields: declared, dropped: [], source: 'declared-fallback' }
  const live = new Map(liveFieldNames.map((n) => [n.toLowerCase(), n]))
  const fields: string[] = []
  const dropped: string[] = []
  for (const name of declared) {
    const liveName = live.get(name.toLowerCase())
    const mustKeep = name === 'id' || name === cfg.parentField
    if (liveName) fields.push(liveName)
    else if (mustKeep) fields.push(name)
    else dropped.push(name)
  }
  return { fields, dropped, source: 'live-intersection' }
}

/** Which step of a write a failure belongs to. Set on every attachment envelope. */
export type AttachmentPhase = 'validate' | 'post' | 'readback' | 'rollback'

/**
 * What was left behind when a write failed after Autotask accepted it.
 *   unverified      — a record may exist; the connector could not remove or confirm it (no id, or rollback not attempted)
 *   rolled_back     — the connector deleted the record it created
 *   rollback_failed — the delete itself failed; the record with createdAttachmentId REMAINS and a human must remove it
 */
export type VerificationState = 'unverified' | 'rolled_back' | 'rollback_failed'

// ---------------------------------------------------------------------------
// Input → plan
// ---------------------------------------------------------------------------

export interface AttachmentInput {
  filename: string
  contentType: string
  /** UTF-8 text content. Exactly one of content / contentBase64 must be given. */
  content?: string
  /** Base64-encoded bytes, for non-text payloads. */
  contentBase64?: string
  title?: string
  customerVisible?: boolean
}

export interface AttachmentPlan {
  filename: string
  title: string
  /** The bare media type sent to Autotask (parameters such as charset stripped). */
  contentType: string
  /** What the caller passed, when it differed from contentType after normalisation. */
  contentTypeAsPassed?: string
  sizeBytes: number
  base64: string
  publish: number
  customerVisible: boolean
}

export type AttachmentPlanResult =
  | { ok: true; plan: AttachmentPlan }
  | { ok: false; failure: FailureInput }

const STRICT_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

function invalid(message: string, remediation: string, details: Record<string, unknown>): AttachmentPlanResult {
  return {
    ok: false,
    failure: {
      reasonCode: 'INVALID_INPUT',
      message: `${message} Nothing was uploaded.`,
      evidence: 'Rejected by the connector\'s own input validation before any request to Autotask — no network call was made.',
      remediation,
      surface: 'autotask',
      details,
    },
  }
}

/** Lower-case media type with any parameters (e.g. "; charset=utf-8") removed. */
export function normalizeContentType(raw: string): string {
  return raw.split(';')[0].trim().toLowerCase()
}

/** The extension after the last dot, lower-cased; '' when there is none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot <= 0 || dot === filename.length - 1 ? '' : filename.slice(dot + 1).toLowerCase()
}

/**
 * Validate the caller's input and turn it into the exact payload plan.
 *
 * Every rule here runs BEFORE any byte reaches Autotask, and every refusal is
 * INVALID_INPUT with the argument named. Order matters only for which message
 * the caller sees first; all of them are independent.
 */
export function planAttachment(input: AttachmentInput): AttachmentPlanResult {
  const filename = (input.filename ?? '').trim()
  if (!filename) {
    return invalid('filename is required.', 'Pass the file name Autotask should show, including its extension (e.g. "call-2026-09-08.txt").', { filename: input.filename })
  }
  if (filename.length > ATTACHMENT_NAME_MAX) {
    return invalid(
      `filename is ${filename.length} characters; Autotask stores fullPath as at most ${ATTACHMENT_NAME_MAX}.`,
      `Shorten the filename to ${ATTACHMENT_NAME_MAX} characters or fewer.`,
      { filenameLength: filename.length, max: ATTACHMENT_NAME_MAX },
    )
  }
  if (/[\\/]/.test(filename) || /[\u0000-\u001f\u007f]/.test(filename)) {
    return invalid(
      'filename must be a bare file name — no path separators or control characters.',
      'Pass just the name (e.g. "transcript.txt"), not a path.',
      { filename },
    )
  }

  const hasText = typeof input.content === 'string'
  const hasBase64 = typeof input.contentBase64 === 'string'
  if (hasText === hasBase64) {
    return invalid(
      hasText ? 'Both content and contentBase64 were supplied; exactly one is allowed.' : 'Neither content nor contentBase64 was supplied.',
      'Pass content (UTF-8 text) for a text file, or contentBase64 for binary bytes — one or the other.',
      { content: hasText, contentBase64: hasBase64 },
    )
  }

  const contentType = normalizeContentType(input.contentType ?? '')
  const allowedExtensions = ATTACHMENT_CONTENT_TYPES[contentType]
  if (!allowedExtensions) {
    return invalid(
      `contentType "${input.contentType}" is not on the connector's allowlist.`,
      `Use one of: ${Object.keys(ATTACHMENT_CONTENT_TYPES).join(', ')}. The allowlist is a reviewed connector decision (src/lib/autotask-attachments.ts), not an Autotask limit — widening it is a code change.`,
      { contentType: input.contentType, allowed: Object.keys(ATTACHMENT_CONTENT_TYPES) },
    )
  }
  const ext = fileExtension(filename)
  if (!allowedExtensions.includes(ext)) {
    return invalid(
      `filename "${filename}" ${ext ? `has extension ".${ext}", which` : 'has no extension, and one'} does not match contentType ${contentType} (expected .${allowedExtensions.join(' / .')}).`,
      'Make the filename extension agree with the content type, so the stored attachment opens as what it is.',
      { filename, extension: ext || null, contentType, expectedExtensions: allowedExtensions },
    )
  }

  let bytes: Buffer
  if (hasText) {
    bytes = Buffer.from(input.content as string, 'utf8')
  } else {
    const b64 = (input.contentBase64 as string).replace(/\s+/g, '')
    if (!b64 || b64.length % 4 !== 0 || !STRICT_BASE64.test(b64)) {
      return invalid(
        'contentBase64 is not valid standard base64.',
        'Encode the bytes as standard (not URL-safe) base64 with padding, or pass text via content instead.',
        { contentBase64Length: b64.length },
      )
    }
    bytes = Buffer.from(b64, 'base64')
  }

  if (bytes.length === 0) {
    return invalid('The file content is empty.', 'Pass the actual content — an empty attachment is not a record of anything.', { sizeBytes: 0 })
  }
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    return invalid(
      `The file is ${bytes.length.toLocaleString('en-US')} bytes; the connector caps attachments at ${ATTACHMENT_MAX_BYTES.toLocaleString('en-US')} bytes.`,
      `Reduce the file below ${ATTACHMENT_MAX_BYTES.toLocaleString('en-US')} bytes (the lower bound of Kaseya's documented "6 to 7 MB" per-file API limit), or split it. ${ATTACHMENT_WINDOW_NOTE}`,
      { sizeBytes: bytes.length, maxBytes: ATTACHMENT_MAX_BYTES, capBasis: 'chosen: lower bound of the documented 6-7 MB range' },
    )
  }

  const title = (input.title ?? '').trim() || filename
  if (title.length > ATTACHMENT_NAME_MAX) {
    return invalid(
      `title is ${title.length} characters; Autotask stores title as at most ${ATTACHMENT_NAME_MAX}.`,
      `Shorten the title to ${ATTACHMENT_NAME_MAX} characters or fewer.`,
      { titleLength: title.length, max: ATTACHMENT_NAME_MAX },
    )
  }

  const customerVisible = input.customerVisible === true
  const passed = (input.contentType ?? '').trim()
  return {
    ok: true,
    plan: {
      filename,
      title,
      contentType,
      ...(passed !== contentType ? { contentTypeAsPassed: passed } : {}),
      sizeBytes: bytes.length,
      base64: bytes.toString('base64'),
      publish: customerVisible ? ATTACHMENT_PUBLISH.CUSTOMER_VISIBLE : ATTACHMENT_PUBLISH.INTERNAL,
      customerVisible,
    },
  }
}

// ---------------------------------------------------------------------------
// Plan → request body
// ---------------------------------------------------------------------------

export interface AttachmentCreateBody {
  attachmentType: typeof FILE_ATTACHMENT_TYPE
  fullPath: string
  title: string
  publish: number
  contentType: string
  data: string
}

/**
 * The POST body, shaped on the vendor's documented create example. The parent
 * id travels in the URL, never here; the read-only stamps the example carries
 * (id 0, attachDate, the attachedBy* nulls) are omitted because a create has no
 * business asserting them, and impersonation is a HEADER, not a body field.
 */
export function buildAttachmentBody(plan: AttachmentPlan): AttachmentCreateBody {
  return {
    attachmentType: FILE_ATTACHMENT_TYPE,
    fullPath: plan.filename,
    title: plan.title,
    publish: plan.publish,
    contentType: plan.contentType,
    data: plan.base64,
  }
}

// ---------------------------------------------------------------------------
// Read-back comparison
// ---------------------------------------------------------------------------

/** The queryable fields a re-read returns (creatorType/data/fileSize error when queried). */
export interface StoredAttachmentFields {
  id?: number
  ticketID?: number | null
  timeEntryID?: number | null
  ticketNoteID?: number | null
  taskID?: number | null
  parentID?: number | null
  parentAttachmentID?: number | null
  title?: string | null
  fullPath?: string | null
  contentType?: string | null
  attachmentType?: string | null
  publish?: number | null
  attachDate?: string | null
  attachedByResourceID?: number | null
  attachedByContactID?: number | null
  impersonatorCreatorResourceID?: number | null
}

export interface AttachmentMismatch {
  field: string
  requested: unknown
  actual: unknown
}

export interface AttachmentVerification {
  /** Every requested field the read-back confirmed. */
  verifiedFields: string[]
  /** Requested fields whose stored value differs. Any entry here is a failure. */
  mismatches: AttachmentMismatch[]
  /**
   * True whenever the read-back disagrees with the request on ANY compared
   * field. The tool contract (2026-09-08, owner-directed after row 28465 was
   * left in place) is: a create that cannot be verified as stored-as-requested
   * is removed again. The caller deletes what it just created and reports
   * verificationState.
   */
  rollbackWarranted: boolean
  /**
   * contentType is REPORTED, not enforced. entityInformation marks it
   * read-only and Autotask may normalise a MIME string it stores; failing the
   * whole create on it — with no evidence yet of how this instance behaves —
   * risks a guard that fails 100% of calls, which is the first thing to
   * suspect when a guard fails every time (2026-09-08, the scan pipeline).
   */
  contentType: { requested: string; stored: string | null; matches: boolean | null }
}

const norm = (v: unknown): string => (v == null ? '' : String(v)).replace(/\r\n/g, '\n').trim()

/**
 * Compare what was asked for against what Autotask now holds.
 *
 * `parent` names the field the parent id must appear in (ticketID for a ticket
 * attachment, timeEntryID for a time-entry attachment) so a file that landed
 * on the wrong record is a mismatch, not a success with a surprising id.
 */
export function verifyAttachmentReadBack(
  plan: AttachmentPlan,
  parent: { field: AttachmentParentField; id: number },
  stored: StoredAttachmentFields,
): AttachmentVerification {
  const verifiedFields: string[] = []
  const mismatches: AttachmentMismatch[] = []
  const check = (field: string, requested: unknown, actual: unknown, same: boolean) => {
    if (same) verifiedFields.push(field)
    else mismatches.push({ field, requested, actual: actual ?? null })
  }

  check('publish', plan.publish, stored.publish, stored.publish === plan.publish)
  check(parent.field, parent.id, stored[parent.field], Number(stored[parent.field]) === parent.id)
  check('title', plan.title, stored.title, norm(stored.title) === norm(plan.title))
  check('fullPath', plan.filename, stored.fullPath, norm(stored.fullPath) === norm(plan.filename))
  check(
    'attachmentType',
    FILE_ATTACHMENT_TYPE,
    stored.attachmentType,
    norm(stored.attachmentType).toUpperCase() === FILE_ATTACHMENT_TYPE,
  )

  const storedType = stored.contentType == null ? null : normalizeContentType(String(stored.contentType))
  return {
    verifiedFields,
    mismatches,
    rollbackWarranted: mismatches.length > 0,
    contentType: {
      requested: plan.contentType,
      stored: stored.contentType ?? null,
      matches: storedType === null ? null : storedType === plan.contentType,
    },
  }
}

/**
 * Do the stored bytes equal what was sent? Compared as decoded bytes so a
 * re-encoded or re-padded base64 string from Autotask cannot read as a
 * difference. null means the stored data was not available to compare.
 */
export function attachmentBytesMatch(sentBase64: string, storedBase64: string | null | undefined): boolean | null {
  if (storedBase64 == null) return null
  const sent = Buffer.from(sentBase64, 'base64')
  const stored = Buffer.from(String(storedBase64).replace(/\s+/g, ''), 'base64')
  return sent.length === stored.length && sent.equals(stored)
}

/**
 * Who Autotask recorded as the author, in the connector's terms.
 *
 * Kaseya: a standard POST attributes the file to "API User"; with an
 * ImpersonationResourceId header "the author of this attachment [is] attributed
 * to the resource with the corresponding identifier." Which FIELD carries that
 * (attachedByResourceID vs impersonatorCreatorResourceID) is not stated, so both
 * are read and either match counts — reported, never asserted from the header.
 */
export function describeAttribution(
  stored: StoredAttachmentFields,
  signedInResourceId: number,
): { attributedToSignedInTech: boolean; attachedByResourceID: number | null; impersonatorCreatorResourceID: number | null; basis: string } {
  const by = stored.attachedByResourceID ?? null
  const imp = stored.impersonatorCreatorResourceID ?? null
  const matched = by === signedInResourceId || imp === signedInResourceId
  return {
    attributedToSignedInTech: matched,
    attachedByResourceID: by,
    impersonatorCreatorResourceID: imp,
    basis: matched
      ? `The read-back carries resource ${signedInResourceId} in ${by === signedInResourceId ? 'attachedByResourceID' : 'impersonatorCreatorResourceID'}, so Autotask recorded the signed-in technician.`
      : `Neither attachedByResourceID (${by ?? 'null'}) nor impersonatorCreatorResourceID (${imp ?? 'null'}) is the signed-in technician (${signedInResourceId}); Autotask attributed the file to the API user. Check the impersonation setup for this API user before relying on attachment authorship.`,
  }
}
