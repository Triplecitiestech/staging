// src/lib/mcp-write-tools.ts
//
// Registers the connector's WRITE tools and resolves the signed-in user to
// their Autotask resource so every write is impersonated (attributed to the
// real person). Identity flow: OAuth token -> WorkOS user email -> Autotask
// resource id -> ImpersonationResourceId header.

import { z } from 'zod'
import { ROLE_RATE_WARNING, suggestRoleForWork } from '@/lib/connector/autotask-role-findings'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import { classifyPublishVisibility, observeNotificationAdvance } from '@/lib/autotask-activity'
import * as write from '@/lib/autotask-write'
import { failureResult, toolFailure, type McpToolResult } from '@/lib/connector/failure-envelope'
import { definedFields, splitByQueryability, verifyWrittenFields } from '@/lib/mcp-project-tools'
import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_ENTITIES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_PUBLISH,
  ATTACHMENT_WINDOW_NOTE,
  attachmentBytesMatch,
  attachmentReadBackFields,
  buildAttachmentBody,
  describeAttribution,
  planAttachment,
  verifyAttachmentReadBack,
  type AttachmentEntity,
  type AttachmentEntityConfig,
  type AttachmentMismatch,
  type AttachmentPhase,
  type StoredAttachmentFields,
  type VerificationState,
} from '@/lib/autotask-attachments'
import { getEntityCapabilitySnapshot } from '@/lib/connector/autotask-capability'
import { resolvePicklistId } from '@/lib/connector/autotask-picklists'
import { classifyError } from '@/lib/resilience'
import {
  buildCustomerUpdateEmail,
  customerMailReadiness,
  isSendableEmailAddress,
  sendCustomerUpdateEmail,
} from '@/lib/customer-mail'

// WorkOS user id -> email. Uses the email claim if the token carries one,
// otherwise looks the user up via the WorkOS Management API.
const emailCache = new Map<string, string>()
export async function resolveUserEmail(sub?: string, tokenEmail?: unknown): Promise<string | undefined> {
  if (typeof tokenEmail === 'string' && tokenEmail.includes('@')) return tokenEmail
  if (!sub) return undefined
  const cached = emailCache.get(sub)
  if (cached) return cached
  const key = process.env.WORKOS_API_KEY
  if (!key) return undefined
  try {
    const r = await fetch(`https://api.workos.com/user_management/users/${sub}`, { headers: { Authorization: `Bearer ${key}` } })
    if (!r.ok) return undefined
    const u = (await r.json()) as { email?: string }
    if (u?.email) emailCache.set(sub, u.email)
    return u?.email
  } catch {
    return undefined
  }
}

// email -> Autotask resource id (cached). Reads use the existing read client.
const resourceCache = new Map<string, number>()
/**
 * Exported so the project/task/CRM tools attribute writes the SAME way, rather
 * than growing a second identity path. Behaviour is unchanged for every
 * existing caller — this adds the keyword and nothing else.
 */
export async function resolveResourceId(email?: string): Promise<number> {
  if (!email) {
    throw new Error('Cannot attribute this action: no signed-in user email was available. Sign in to the connector so the write can be recorded under your name.')
  }
  const k = email.toLowerCase()
  const cached = resourceCache.get(k)
  if (cached) return cached
  const res = await new AutotaskClient().getResourceByEmail(email)
  if (!res?.id) {
    throw new Error(`No active Autotask resource found for ${email}. Your connector sign-in email must match your Autotask resource email.`)
  }
  resourceCache.set(k, res.id)
  return res.id
}

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }

/**
 * The MCP request context the SDK passes as a handler's second argument.
 *
 * Typed rather than `any` (the older tools in this file predate it): the only
 * fields any write tool reads are the caller's identity claims, and naming them
 * is what makes it obvious that impersonation attribution comes from the token
 * and nowhere else.
 */
interface McpCallExtra { authInfo?: { extra?: { email?: unknown; sub?: string } } }

// Read client for the read-backs these write tools depend on. Cached for the
// same reason every other client in this repo is: a fresh one per invocation
// re-does credential setup on every call.
let _readClient: AutotaskClient | null = null
function autotask(): AutotaskClient { if (!_readClient) _readClient = new AutotaskClient(); return _readClient }
// Structured envelope on failure (see src/lib/connector/failure-envelope.ts).
// On these impersonated ticket writes the distinction that matters most is
// PERMISSION_DENIED (this technician's Autotask rights) versus INVALID_INPUT
// (a missing required field) versus TRANSIENT — three very different fixes that
// used to look identical in the error text.
function fail(err: unknown) { return toolFailure(err, { surface: 'autotask' }) }
function okTicket(ticketId: number, data: unknown) { return ok({ result: data, ticketUrl: getAutotaskTicketUrl(String(ticketId)) }) }

// ---------------------------------------------------------------------------
// Assignment read-back
// ---------------------------------------------------------------------------
//
// Autotask requires assignedResourceID and assignedResourceRoleID TOGETHER
// (HTTP 500 "Data violation" otherwise), so both tools that assign now accept
// the role and default it. An accepted write is still not a done write: this
// re-reads the ticket and reports what Autotask actually stored. A silent
// no-op is returned as a FAILURE, never as success-shaped output — the exact
// pattern that let the IT Glue folder-move defect survive twelve days.
const ROLE_GUIDANCE =
  'Role ids in this instance: Engineer 29683355 (default), Help Desk 29683464, Network Engineer 29683460 — resolve others with autotask_list_roles. Do NOT use Low/High Voltage Technician (29683465) for ticket delivery.'

async function verifyAssignment(
  ticketId: number,
  requested: { resourceId: number; roleId: number },
): Promise<{ verified: true; assignment: { assignedResourceID: number | null; assignedResourceRoleID: number | null } } | { verified: false; result: McpToolResult }> {
  const assignment = await new AutotaskClient().getTicketAssignment(ticketId)
  if (assignment?.assignedResourceID === requested.resourceId && assignment?.assignedResourceRoleID === requested.roleId) {
    return { verified: true, assignment }
  }
  return {
    verified: false,
    result: failureResult({
      reasonCode: 'PRECONDITION_FAILED',
      message:
        `Autotask accepted the assignment write for ticket ${ticketId} but the read-back does not show it. Requested resource ${requested.resourceId} with role ${requested.roleId}; the ticket now reports resource ${assignment?.assignedResourceID ?? 'none'} with role ${assignment?.assignedResourceRoleID ?? 'none'}. Do NOT report this ticket as assigned.`,
      evidence:
        'Verified by re-reading assignedResourceID + assignedResourceRoleID off the ticket after the write (autotask_get_ticket-equivalent narrow query), not by trusting the write\'s HTTP status.',
      remediation:
        `Check the ticket in Autotask before doing anything else — the resource may not be a member of the queue, or the role may not be one the resource holds. ${ROLE_GUIDANCE}`,
      surface: 'autotask',
      details: { ticketId, requested, actual: assignment },
    }),
  }
}

// ---------------------------------------------------------------------------
// Ticket-note read-back, and what "notified" can actually be proven
// ---------------------------------------------------------------------------
//
// 2026-07-30, ticket 34648: autotask_add_customer_note advertised that it
// "posts an externally-visible note that notifies the ticket contact(s)". Two
// notes were posted for a contact with receivesEmailNotifications true and
// NEITHER notified her; the owner notified the customer by hand. The write
// returned only { result: { itemId } }, so the assistant reported the customer
// as notified when she was not.
//
// The REST TicketNotes entity has NO notification field — 12 fields, verified
// against both the Kaseya docs and this instance's live entityInformation, none
// of which controls recipients or the UI's Notify behaviour:
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/TicketNotesEntity.htm
// Notification recipients are chosen in the UI-only Notification panel:
//   https://www.autotask.net/help/content/3_features/1_SharedFeatures/Notifications/NotificationPanel.htm
// So the API cannot ASK for a notification. What it CAN do is observe whether
// one happened, via two read-only Tickets fields plus NotificationHistory:
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/TicketsEntity.htm
//   https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/NotificationHistoryEntity.htm
//
// Hence: read the note back, report the publish level Autotask stored, and
// report notification state as an OBSERVATION with its evidence. Never as an
// assumption, and never as an outcome the tool arranged.

/** Look up the live label for a publish id so the response never guesses it. */
async function publishLabel(client: AutotaskClient, publish: number | null | undefined): Promise<string | null> {
  if (publish == null) return null
  try {
    const labels = await client.picklistLabelMap('TicketNotes', 'publish')
    return labels.get(publish) ?? null
  } catch {
    return null
  }
}

/**
 * Read a just-created note back and describe what Autotask actually stored.
 * A POST's itemId proves a row exists; it says nothing about the row's
 * visibility, which is the thing a customer-facing write is claiming.
 */
async function readBackNote(client: AutotaskClient, ticketId: number, noteId: number) {
  const note = await client.getTicketNoteById(ticketId, noteId)
  if (!note) {
    return {
      noteReadBack: false as const,
      note: null,
      readBackNote:
        `Autotask returned note id ${noteId} for ticket ${ticketId} but a read-back query did not return it. Do not describe this note as posted until you have checked the ticket.`,
    }
  }
  const label = await publishLabel(client, note.publish)
  return {
    noteReadBack: true as const,
    note: {
      id: note.id,
      createDateTime: note.createDateTime ?? null,
      title: note.title ?? null,
      publish: note.publish ?? null,
      publishLabel: label,
      visibility: classifyPublishVisibility(note.publish, label),
      noteType: note.noteType ?? null,
      creatorResourceID: note.creatorResourceID ?? null,
      impersonatorCreatorResourceID: note.impersonatorCreatorResourceID ?? null,
    },
    readBackNote: null,
  }
}

/**
 * Was a CUSTOMER notification observed for this ticket after the write?
 *
 * The verdict comes from Tickets.lastCustomerNotificationDateTime — Autotask's
 * own stamp for when a customer notification last went out — compared before
 * and after the write. That avoids having to guess from recipient addresses
 * whether a NotificationHistory row was a customer email or a staff one.
 * NotificationHistory is still read, to name the template and recipients for
 * the human.
 *
 * A false verdict is deliberately FAIL-CLOSED on the POSITIVE claim: nothing
 * reports a customer as contacted without Autotask's own stamp advancing. It is
 * NOT a claim that no email went out — notifications dispatch asynchronously
 * (26s observed live), so the stamp is re-read for a bounded window and an
 * unadvanced result is worded as "not observed within Ns", never "not sent".
 */
async function observeCustomerNotification(
  client: AutotaskClient,
  ticketId: number,
  /** null means the PRE-write read failed — not that the ticket had no prior notification. */
  before: { lastCustomerNotificationDateTime: string | null } | null,
  writeStartedAt: Date,
) {
  const prev = before?.lastCustomerNotificationDateTime ?? null

  // Verdict logic is pure and separately tested (decideNotificationVerdict) —
  // notably, a MISSING baseline can never read as "previously null", or a ticket
  // notified last week would look freshly notified.
  //
  // POLLED, not read once. Autotask sends notifications asynchronously: on
  // 2026-09-22 a connector-created ticket's customer email was recorded 26s
  // after the write, and the single immediate read this used to take reported
  // "the customer has NOT been emailed" about an email that was on its way.
  const baselineEstablished = before !== null
  const observation = await observeNotificationAdvance({
    baselineEstablished,
    before: prev,
    readAfter: async () => (await client.getTicketActivityStamps(ticketId))?.lastCustomerNotificationDateTime ?? null,
  })
  const advanced = observation.verdict.customerNotified
  const now = observation.after

  // Widen slightly behind the write to absorb clock skew between us and Autotask.
  const from = new Date(writeStartedAt.getTime() - 60_000)
  let notifications: Array<Record<string, unknown>> = []
  let historyError: string | null = null
  try {
    const hist = await client.getNotificationHistory({ ticketId, from, max: 25 })
    notifications = hist.notifications
  } catch (e) {
    historyError = e instanceof Error ? e.message : String(e)
  }

  return {
    customerNotified: advanced,
    notificationEvidence: {
      basis: 'Tickets.lastCustomerNotificationDateTime, read before the write and then re-read until it advanced or the observation window closed',
      baselineEstablished,
      observationWindowSeconds: observation.windowSeconds,
      observedAfterSeconds: observation.observedAfterSeconds,
      reads: observation.reads,
      lastCustomerNotificationDateTimeBefore: prev,
      lastCustomerNotificationDateTimeAfter: now,
      notificationHistorySinceWrite: notifications.map((n) => ({
        templateName: n.templateName ?? null,
        recipientEmailAddress: n.recipientEmailAddress ?? null,
        notificationSentTime: n.notificationSentTime ?? null,
      })),
      notificationHistoryError: historyError,
    },
    notificationNote: advanced
      ? `A customer notification WAS observed: Autotask advanced lastCustomerNotificationDateTime to ${now}. Recipients and template are in notificationEvidence.notificationHistorySinceWrite.`
      : !baselineEstablished
      ? `CANNOT CONFIRM: the pre-write read of lastCustomerNotificationDateTime failed, so there is no baseline to compare against and no notification can be confirmed either way (the ticket currently reports ${now ?? 'null'}). Treat the customer as NOT notified — do not report her as contacted. Check autotask_notification_history({ ticketId: ${ticketId} }) and the ticket in Autotask.`
      : `NO customer notification was observed within ${observation.windowSeconds}s. Autotask's lastCustomerNotificationDateTime did not advance (${prev ?? 'null'} before, ${now ?? 'null'} after ${observation.reads} reads). Do NOT tell the user the customer was contacted. Equally, do not state as fact that no email was sent: Autotask dispatches notifications asynchronously (26s observed on 2026-09-22), so re-check with autotask_notification_history({ ticketId: ${ticketId} }) before acting on either reading. On this instance a connector-added customer-visible note has not been observed to send an email (test ticket 35991, 2026-09-22) — if the contact must be told, email them directly or notify from the note form's Notification panel in Autotask. The REST API has no field to request a notification, so this tool cannot send one.`,
  }
}

// ---------------------------------------------------------------------------
// Editing an existing note: proving the edit actually landed
// ---------------------------------------------------------------------------
//
// The connector could create notes but not edit them, so every correction became
// another note and a ticket accumulated a stack of them — unreadable for the tech
// who has to follow it. Autotask does support the edit: live entityInformation on
// 2026-08-10 reports TicketNotes.canUpdate true with description, title and
// publish all isReadOnly false (canDelete is FALSE, so there is no delete to
// build and none is faked).
//
// The verification below is the point of the tool, not decoration. An accepted
// PATCH that Autotask silently dropped is the failure mode that let the IT Glue
// folder-move defect survive twelve days returning moved:false with no error, so
// every field is compared against what the note actually says afterwards.

/** One requested field whose live value does not match what was asked for. */
export interface NoteFieldMismatch {
  field: 'description' | 'title' | 'publish'
  requested: string | number
  actual: string | number | null
}

const EDITABLE_NOTE_FIELDS = ['description', 'title', 'publish'] as const

/**
 * Normalize line endings before comparing note text.
 *
 * A TRANSPORT equivalence, not a semantic one: text sent with \n can come back
 * \r\n, and reporting that as a failed write would return PRECONDITION_FAILED on
 * an edit that landed perfectly. That is worse than having no check at all,
 * because it teaches the reader to ignore the verification flag — the same
 * reasoning that made hr_er_log_update compare a date against its Excel serial
 * rather than flagging every date patch as unverified. NOTHING else is
 * normalized: trailing whitespace, casing and interior spacing are compared
 * exactly, so a real truncation or substitution still fails.
 */
function normalizeNoteText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

type NoteFieldValues = { description?: string; title?: string; publish?: number }

/**
 * Compare what was REQUESTED against what the note now says.
 *
 * Deliberately requested-vs-live rather than before-vs-after, because the
 * caller's goal is an end state. Re-sending a value the note already had changes
 * nothing and is still a success — reported in `unchangedFields` so the response
 * never implies an edit that did not happen — whereas a value that did not stick
 * is a hard failure regardless of the HTTP status Autotask returned.
 *
 * Pure, and exported for the regression test.
 */
export function verifyNoteEdit(
  requested: write.TicketNoteEdit,
  before: NoteFieldValues,
  after: NoteFieldValues,
): { mismatches: NoteFieldMismatch[]; changedFields: string[]; unchangedFields: string[] } {
  const mismatches: NoteFieldMismatch[] = []
  const changedFields: string[] = []
  const unchangedFields: string[] = []

  const matches = (field: (typeof EDITABLE_NOTE_FIELDS)[number], want: string | number, got: unknown): boolean => {
    if (field === 'publish') return got === want
    return typeof got === 'string' && normalizeNoteText(got) === normalizeNoteText(String(want))
  }

  for (const field of EDITABLE_NOTE_FIELDS) {
    const want = requested[field]
    if (want === undefined) continue
    const got = after[field]
    if (!matches(field, want, got)) {
      // Fail closed: a field the read-back did not return at all counts as not
      // landed, never as "probably fine".
      mismatches.push({ field, requested: want, actual: (got as string | number | undefined) ?? null })
      continue
    }
    ;(matches(field, want, before[field]) ? unchangedFields : changedFields).push(field)
  }

  return { mismatches, changedFields, unchangedFields }
}

/**
 * Describe a publish transition in full, with both LIVE labels.
 *
 * Changing publish can move a note from internal to customer-visible or back, so
 * the response must never make the reader infer that from two bare ids. Labels
 * are resolved from the live picklist because these ids are actively misleading
 * — 1 "All Autotask Users" is the CUSTOMER-VISIBLE state on this instance, and
 * there is no id 3.
 */
async function describePublishChange(client: AutotaskClient, beforePublish: number | null | undefined, afterPublish: number | null | undefined) {
  const [beforeLabel, afterLabel] = await Promise.all([
    publishLabel(client, beforePublish),
    publishLabel(client, afterPublish),
  ])
  const beforeVisibility = classifyPublishVisibility(beforePublish, beforeLabel)
  const afterVisibility = classifyPublishVisibility(afterPublish, afterLabel)
  const changed = (beforePublish ?? null) !== (afterPublish ?? null)
  const scopeChanged = beforeVisibility.scope !== afterVisibility.scope

  return {
    publishChanged: changed,
    publishBefore: { publish: beforePublish ?? null, publishLabel: beforeLabel, visibility: beforeVisibility },
    publishAfter: { publish: afterPublish ?? null, publishLabel: afterLabel, visibility: afterVisibility },
    publishChangeNote: !changed
      ? `The note's publish level was NOT changed — it remains ${beforePublish ?? 'unset'} "${beforeLabel ?? 'label not resolved'}" (${beforeVisibility.scope}).`
      : `VISIBILITY CHANGED: this note moved from publish ${beforePublish ?? 'unset'} "${beforeLabel ?? 'label not resolved'}" (${beforeVisibility.scope}) to publish ${afterPublish ?? 'unset'} "${afterLabel ?? 'label not resolved'}" (${afterVisibility.scope}).` +
        (scopeChanged
          ? afterVisibility.scope === 'customer_visible'
            ? ' TELL THE USER THIS NOTE IS NOW CUSTOMER-VISIBLE — it was internal before, and customers with Client Portal access to the ticket can now read it.'
            : afterVisibility.scope === 'internal'
            ? ' TELL THE USER THIS NOTE IS NO LONGER CUSTOMER-VISIBLE — it was readable by the customer before and is now internal only.'
            : ' The resulting visibility could not be classified from the live picklist — check the note in Autotask before describing who can see it.'
          : ' The audience scope did not change.'),
  }
}

// Append text to a ticket's Resolution field (GET current, concat, PATCH).
// Resolution — not the time-entry summary — is what fills the customer
// completion email, so this is used on close.
async function appendResolution(ticketId: number, text: string, rid: number): Promise<void> {
  const current = await new AutotaskClient().getTicketResolution(ticketId)
  const merged = current && current.trim() ? `${current}\n\n${text}` : text
  await write.updateTicket(ticketId, { resolution: merged }, rid)
}

// ---------------------------------------------------------------------------
// Customer note + email to the ticket's contact (notifyContact: true)
// ---------------------------------------------------------------------------
//
// Autotask cannot be asked to email a customer through the REST API (see
// src/lib/customer-mail.ts for the evidence), so the connector sends the email
// itself. The ORDER is the design:
//
//   1. Everything that could refuse is checked BEFORE any write — kill switch,
//      credential, ticket, contact, address. A note posted and then an email
//      refused leaves the user believing the customer was told.
//   2. The note is posted and must return an id; without one there is no record
//      to point the customer at, so nothing is sent.
//   3. The email is sent ONCE. Graph sendMail is not idempotent, so a failure
//      after the note exists is reported with the note id and an instruction
//      NOT to re-call this tool (that would post a duplicate note).
//   4. An internal note records who was emailed, from where, and when — the
//      only trace of the send inside Autotask, because Autotask's own
//      NotificationHistory will never show an email it did not send. Best
//      effort: the customer has already been emailed, so its failure is
//      reported, never turned into a failure of the call.

const CUSTOMER_NOTE_TOOL = 'autotask_add_customer_note'

function customerEmailRefusal(message: string, remediation: string, details: Record<string, unknown>): McpToolResult {
  return failureResult({
    reasonCode: 'PRECONDITION_FAILED',
    message: `${message} Nothing was written and nothing was sent.`,
    remediation,
    surface: 'autotask',
    tool: CUSTOMER_NOTE_TOOL,
    details: { ...details, noteCreated: false, customerEmailed: false },
  })
}

/**
 * Map a send failure to a reason code. Pure, exported for the tests.
 *
 * A TIMEOUT is singled out because it is the one failure that does not prove
 * the email was NOT sent — Graph may have accepted it after the connector gave
 * up waiting.
 */
export function classifyCustomerMailFailure(err: unknown): {
  reasonCode: 'PERMISSION_DENIED' | 'TRANSIENT' | 'PRECONDITION_FAILED'
  mayHaveSent: boolean
} {
  const c = classifyError(err)
  if (c.category === 'auth' || /token fetch failed/i.test(c.message)) return { reasonCode: 'PERMISSION_DENIED', mayHaveSent: false }
  if (c.category === 'timeout') return { reasonCode: 'TRANSIENT', mayHaveSent: true }
  if (c.isTransient) return { reasonCode: 'TRANSIENT', mayHaveSent: false }
  return { reasonCode: 'PRECONDITION_FAILED', mayHaveSent: false }
}

async function addCustomerNoteAndEmail(input: {
  ticketId: number
  message: string
  title?: string
  extra: unknown
}): Promise<McpToolResult> {
  const { ticketId, message, title } = input

  const readiness = customerMailReadiness()
  if (!readiness.ready) return failureResult({ ...readiness.failure, tool: CUSTOMER_NOTE_TOOL })

  const signedIn = (input.extra as McpCallExtra | undefined)?.authInfo?.extra?.email
  const rid = await resolveResourceId(typeof signedIn === 'string' ? signedIn : undefined)
  const client = new AutotaskClient()

  // The recipient comes from the ticket and nowhere else.
  const ticket = await client.getTicket(ticketId)
  if (!ticket) {
    return customerEmailRefusal(`Ticket ${ticketId} was not found.`, 'Check the ticket id with autotask_get_ticket_by_number.', { ticketId })
  }
  const ticketNumber = ticket.ticketNumber ?? String(ticketId)
  if (!ticket.contactID) {
    return customerEmailRefusal(
      `Ticket ${ticketNumber} has no contact, so there is nobody to email.`,
      'Set the contact first with autotask_update_ticket ({ ticketId, contactID } — find the id with autotask_company_contacts), then call this again.',
      { ticketId, ticketNumber, contactID: null },
    )
  }
  const contact = await client.getContactById(ticket.contactID)
  if (!contact) {
    return customerEmailRefusal(
      `Ticket ${ticketNumber} points at contact ${ticket.contactID}, which Autotask did not return.`,
      'Open the ticket in Autotask and re-select the contact, or set a valid one with autotask_update_ticket.',
      { ticketId, ticketNumber, contactID: ticket.contactID },
    )
  }
  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || null
  if (!contact.isActive) {
    return customerEmailRefusal(
      `The ticket's contact ${contactName ?? contact.id} is INACTIVE in Autotask.`,
      'Confirm with the user who should receive this update and set that contact on the ticket with autotask_update_ticket.',
      { ticketId, ticketNumber, contactID: contact.id },
    )
  }
  if (!isSendableEmailAddress(contact.emailAddress)) {
    return customerEmailRefusal(
      `The ticket's contact ${contactName ?? contact.id} has no usable email address in Autotask.`,
      'Add the address to the contact with autotask_update_contact (or pick a different contact on the ticket), then call this again.',
      { ticketId, ticketNumber, contactID: contact.id },
    )
  }
  const to = contact.emailAddress.trim()

  // Note first: it is the record the email refers to.
  const res = await write.createTicketNote(ticketId, { title: title ?? 'Update', description: message, publish: 1 }, rid)
  const noteId = (res as { itemId?: number } | null)?.itemId
  if (!noteId) {
    return failureResult({
      reasonCode: 'VERIFY_FAILED',
      message: `Autotask accepted the note write on ticket ${ticketNumber} but returned no note id, so the note could not be confirmed. The customer was NOT emailed.`,
      remediation: `Check ticket ${ticketNumber} in Autotask for the note before doing anything else. Do not call this tool again until you know whether the note exists — a second call would post it twice.`,
      surface: 'autotask',
      tool: CUSTOMER_NOTE_TOOL,
      details: { ticketId, ticketNumber, noteCreated: 'unknown', customerEmailed: false, verificationState: 'unverified' },
    })
  }
  const back = await readBackNote(client, ticketId, noteId).catch(() => null)

  const email = buildCustomerUpdateEmail({ ticketNumber, ticketTitle: ticket.title ?? null, contactFirstName: contact.firstName ?? null, message })
  let sent: Awaited<ReturnType<typeof sendCustomerUpdateEmail>>
  try {
    sent = await sendCustomerUpdateEmail({ to, toName: contactName, email })
  } catch (e) {
    const { reasonCode, mayHaveSent } = classifyCustomerMailFailure(e)
    return failureResult({
      reasonCode,
      message:
        `The customer-visible note WAS posted on ticket ${ticketNumber} (note ${noteId}), but emailing ${contactName ?? 'the contact'} failed. ` +
        (mayHaveSent
          ? 'The send TIMED OUT, so the email may or may not have gone out.'
          : 'The customer has NOT been emailed.'),
      remediation:
        'Do NOT call this tool again — the note already exists and a second call would post it twice. ' +
        (mayHaveSent ? `Check Sent Items in ${readiness.sender} before resending anything. ` : '') +
        `To reach the customer now, open note ${noteId} in Autotask and send it from the Notification panel (tick Ticket Contact), or email them directly.` +
        (reasonCode === 'PERMISSION_DENIED' ? ' The mail app\'s permission needs fixing: docs/runbooks/CUSTOMER_MAIL_SETUP.md.' : ''),
      surface: 'customer_mail',
      tool: CUSTOMER_NOTE_TOOL,
      vendorError: (e instanceof Error ? e.message : String(e)).slice(0, 800),
      details: { ticketId, ticketNumber, noteId, noteCreated: true, customerEmailed: mayHaveSent ? 'unknown' : false, sender: readiness.sender },
    })
  }

  // Audit trail inside Autotask. Best effort — the email is already gone.
  let auditNoteId: number | null = null
  let auditNoteError: string | null = null
  try {
    const audit = await write.createTicketNote(
      ticketId,
      {
        title: 'Customer emailed',
        description: `Customer update (note ${noteId}) emailed to ${contactName ?? 'the ticket contact'} <${to}> from ${sent.sender} at ${sent.acceptedAt}. Sent through the TCT connector; Microsoft 365 accepted it for delivery (HTTP ${sent.httpStatus}). Subject: ${sent.subject}`,
        publish: 2,
      },
      rid,
    )
    auditNoteId = (audit as { itemId?: number } | null)?.itemId ?? null
  } catch (e) {
    auditNoteError = e instanceof Error ? e.message : String(e)
  }

  return ok({
    result: res,
    ticketUrl: getAutotaskTicketUrl(String(ticketId)),
    ...(back ?? { noteReadBack: false, readBackNote: 'The read-back query failed; the note was created but its stored publish level was not confirmed.' }),
    customerNotified: true,
    customerEmail: {
      status: sent.status,
      to,
      toName: contactName,
      contactID: contact.id,
      sender: sent.sender,
      subject: sent.subject,
      acceptedAt: sent.acceptedAt,
      httpStatus: sent.httpStatus,
    },
    notificationEvidence: {
      basis: `Microsoft Graph sendMail from ${sent.sender} returned HTTP ${sent.httpStatus} (Accepted). Graph documents 202 as "accepted", not "delivered", and returns no delivery status; a bounce would arrive in ${sent.sender}. Autotask's own NotificationHistory will NOT show this email — Autotask did not send it.`,
    },
    auditNote: auditNoteId
      ? { noteId: auditNoteId, publish: 2 }
      : { noteId: null, error: auditNoteError ?? 'Autotask returned no id for the audit note.' },
    notificationNote:
      `Emailed to ${contactName ?? 'the ticket contact'} <${to}> from ${sent.sender}; Microsoft 365 accepted it for delivery. ` +
      (auditNoteId
        ? `An internal note (${auditNoteId}) on the ticket records the send.`
        : 'The internal note recording the send could NOT be written — tell the user, so the ticket history is corrected by hand.'),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWriteTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  server.registerTool(
    'autotask_create_ticket',
    {
      title: 'Autotask: create ticket',
      description: 'WRITE. Create a NEW Autotask ticket, attributed to the signed-in tech. Required: companyID, title, queueID, status, priority (status/priority/queueID are numeric picklist ids — use autotask_ticket_statuses for status and autotask_search_companies for companyID). Optional: description, dueDateTime, contactID, assignedResourceID + assignedResourceRoleID, ticketType. ASSIGNMENT: Autotask rejects a resource without a role ("Data violation: you must assign both a assignedResourceID and assignedResourceRoleID"), so passing assignedResourceID alone DEFAULTS the role to Engineer (29683355). ' + ROLE_GUIDANCE + ' Note: Autotask requires dueDateTime unless the ticket category supplies a default, so include it if the create is rejected for a missing due date. Nothing else is defaulted server-side. The response reports the assignment READ BACK off the created ticket — if assignmentVerified is false the resource did not stick, so do not tell the user it is assigned. Confirm the details with the user before calling. Returns the new ticket id and ticketNumber.',
      inputSchema: {
        companyID: z.number().int().describe('Autotask company ID (required)'),
        title: z.string().describe('Ticket title (required)'),
        queueID: z.number().int().describe('Queue picklist id (required)'),
        status: z.number().int().describe('Status picklist id (required) — from autotask_ticket_statuses'),
        priority: z.number().int().describe('Priority picklist id (required)'),
        description: z.string().optional().describe('Ticket description / details'),
        dueDateTime: z.string().optional().describe('Due date-time, ISO 8601 (e.g. 2026-07-05T17:00:00Z)'),
        contactID: z.number().int().optional().describe('Autotask contact id (from autotask_company_contacts)'),
        assignedResourceID: z.number().int().optional().describe('Resource id to assign (from autotask_find_resource)'),
        assignedResourceRoleID: z.number().int().optional().describe('Role id for that resource — REQUIRED BY AUTOTASK whenever assignedResourceID is set; defaults to Engineer 29683355 if omitted. From autotask_list_roles'),
        ticketType: z.number().int().optional().describe('Ticket type picklist id; Autotask defaults to Service Request if omitted'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ companyID, title, queueID, status, priority, description, dueDateTime, contactID, assignedResourceID, assignedResourceRoleID, ticketType }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const res = await write.createTicket({ companyID, title, queueID, status, priority, description, dueDateTime, contactID, assignedResourceID, assignedResourceRoleID, ticketType }, rid)
        const newId = res?.itemId
        if (!newId) return ok({ result: res, note: 'Ticket create returned no itemId.' })
        const ticket = await new AutotaskClient().getTicket(newId)
        const base = { id: newId, ticketNumber: ticket?.ticketNumber ?? null, ticketUrl: getAutotaskTicketUrl(String(newId)), ticket }
        // Ticket exists, so this is never a hard failure — but an assignment
        // that did not take must be reported as unverified, not omitted.
        if (assignedResourceID == null) return ok(base)
        const roleId = assignedResourceRoleID ?? write.DEFAULT_ASSIGNED_RESOURCE_ROLE_ID
        const check = await verifyAssignment(newId, { resourceId: assignedResourceID, roleId }).catch(() => null)
        return ok({
          ...base,
          assignmentRequested: { assignedResourceID, assignedResourceRoleID: roleId, roleDefaulted: assignedResourceRoleID == null },
          assignmentVerified: check?.verified === true,
          ...(check?.verified === true
            ? { assignment: check.assignment }
            : { assignmentNote: `The ticket was created, but the read-back does NOT confirm resource ${assignedResourceID} with role ${roleId}. Tell the user the ticket exists and the assignment needs checking in Autotask — do not report it as assigned.` }),
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_add_internal_note',
    {
      title: 'Autotask: add internal note',
      description: 'WRITE. Add an internal note to a ticket (publish 2), attributed to the signed-in tech. The response reports the publish level READ BACK off the created note with its live Autotask label, so the note\'s actual visibility is observed rather than assumed. Only call after the user has reviewed and approved the exact text.',
      inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), note: z.string().describe('Note body'), title: z.string().optional().describe('Optional note title') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, note, title }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const res = await write.createTicketNote(ticketId, { title: title ?? 'Internal note', description: note, publish: 2 }, rid)
        const noteId = (res as { itemId?: number } | null)?.itemId
        if (!noteId) return okTicket(ticketId, { result: res, note: 'Autotask returned no itemId for the note; visibility could not be verified by read-back.' })
        const back = await readBackNote(new AutotaskClient(), ticketId, noteId).catch(() => null)
        return ok({ result: res, ticketUrl: getAutotaskTicketUrl(String(ticketId)), ...(back ?? { noteReadBack: false, readBackNote: 'The read-back query failed; the note was created but its stored publish level was not confirmed.' }) })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_add_customer_note',
    {
      title: 'Autotask: add customer-facing note',
      description:
        'WRITE, CUSTOMER-VISIBLE. Adds a ticket note at publish 1 ("All Autotask Users" — the Internal-cleared state, which per Kaseya\'s note-form docs is viewable by Client Portal customers), attributed to the signed-in tech. ' +
        'BY ITSELF THE NOTE EMAILS NOBODY. Autotask\'s REST TicketNotes entity has no field for the note form\'s "Quick Notification" boxes (Ticket Contact etc.), and live evidence (2026-09-22) is that connector-created notes and time entries never trigger a customer email — only the ticket-create rule does. ' +
        'TO TELL THE CUSTOMER, pass notifyContact: true. The connector then emails the SAME message to the ticket\'s own contact from TCT\'s support mailbox via Microsoft 365, and logs an internal note on the ticket recording who was emailed and when. The recipient is always the ticket\'s contact record — there is no parameter for any other address. Everything is checked BEFORE anything is written: the feature must be enabled, and the ticket must have an active contact with an email address; otherwise the call fails and neither the note nor the email happens. If the note is posted but the send fails, the call FAILS with details.noteId — the note exists, the customer was NOT emailed; say exactly that. ' +
        'Without notifyContact the response reports customerNotified, an OBSERVATION: Tickets.lastCustomerNotificationDateTime is re-read for up to ~35s after the write. true = Autotask itself sent a customer notification. false = none was OBSERVED in that window — never tell the user the customer was contacted, and do not state as fact that no email went out either (Autotask sends asynchronously). ' +
        'Confirm the exact wording — and whether the contact should be emailed — with the user before calling.',
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket ID'),
        message: z.string().describe('Message to the customer. With notifyContact this exact text is also the body of the email.'),
        title: z.string().optional().describe('Optional note title'),
        notifyContact: z
          .boolean()
          .optional()
          .describe('true = also email this message to the ticket\'s contact from the support mailbox and log an internal "customer emailed" note. Default false (note only, nobody emailed). The recipient is resolved from the ticket; it cannot be supplied.'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, message, title, notifyContact }: any, extra: any) => {
      try {
        if (notifyContact === true) return await addCustomerNoteAndEmail({ ticketId, message, title, extra })
        const rid = await resolveResourceId(emailOf(extra))
        const client = new AutotaskClient()
        // Read the notification stamp BEFORE the write — the only way an
        // "advanced" comparison afterwards means anything.
        const before = await client.getTicketActivityStamps(ticketId).catch(() => null)
        const writeStartedAt = new Date()

        const res = await write.createTicketNote(ticketId, { title: title ?? 'Update', description: message, publish: 1 }, rid)
        const noteId = (res as { itemId?: number } | null)?.itemId

        const back = noteId
          ? await readBackNote(client, ticketId, noteId).catch(() => null)
          : null
        const notified = await observeCustomerNotification(client, ticketId, before, writeStartedAt).catch((e) => ({
          customerNotified: false,
          notificationEvidence: { basis: 'observation FAILED', error: e instanceof Error ? e.message : String(e) },
          notificationNote:
            'Could not observe notification state (the read-back query failed). Treat the customer as NOT notified until confirmed — do not report her as contacted.',
        }))

        return ok({
          result: res,
          ticketUrl: getAutotaskTicketUrl(String(ticketId)),
          ...(back ?? {
            noteReadBack: false,
            readBackNote: noteId
              ? 'The read-back query failed; the note was created but its stored publish level was not confirmed.'
              : 'Autotask returned no itemId for the note, so nothing could be read back. Check the ticket before reporting the note as posted.',
          }),
          ...notified,
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_update_ticket_note',
    {
      title: 'Autotask: edit an existing ticket note',
      description:
        'WRITE. Edits an EXISTING ticket note IN PLACE — use this to correct a note rather than posting a follow-up correction note, because stacked corrections make a ticket unreadable for the technician who has to follow it. ' +
        'Takes noteId (the note\'s OWN id — from autotask_ticket_notes or autotask_ticket_activity, not the ticket id) plus AT LEAST ONE of description, title, publish. A call supplying none of the three is rejected as INVALID_INPUT. ' +
        'ONLY the fields you pass are written: Autotask\'s PATCH updates just the properties named and leaves every omitted field untouched (its docs: "if the JSON input does not include a property for a field, the API will not update that field"), so there is NO GET-and-merge and an unsupplied field can never be blanked. Autotask relaxes required-field rules for PATCH, which is why editing description alone is legal even though the entity marks several fields required. ' +
        'Attributed to the signed-in technician via Autotask resource impersonation, which Autotask records in impersonatorUpdaterResourceID. ' +
        'READ-BACK VERIFIED: the note is re-read after the write and every requested field compared against what Autotask actually stored. If a value did not stick you get PRECONDITION_FAILED — an accepted PATCH is never reported as success on its HTTP status alone. Re-sending a value the note already had succeeds but is listed in unchangedFields, so the response never implies an edit that did not happen. ' +
        'VISIBILITY TRAP: changing publish can move a note from internal to customer-visible OR the reverse. Whenever publish changes, the response reports publishChanged with the before and after ids, their LIVE Autotask labels and the resulting scope — surface that to the user. Beware that publish 1 "All Autotask Users" is the CUSTOMER-VISIBLE state on this instance, not an internal one. Editing the text of an already customer-visible note also changes what the customer can read. ' +
        'This tool does NOT notify anyone and CANNOT: the REST TicketNotes entity has no notification field of any kind, so an edit reaches nobody by email. ' +
        'There is NO delete — live entityInformation reports TicketNotes.canDelete false, so a note can be corrected but never removed; do not offer to delete one. ' +
        'Confirm the exact replacement wording with the user before calling.',
      inputSchema: {
        noteId: z.number().int().describe('The ticket NOTE id to edit (TicketNotes.id) — from autotask_ticket_notes or autotask_ticket_activity. NOT the ticket id.'),
        description: z.string().optional().describe('Replacement note body. Replaces the existing text entirely — pass the full corrected note, not just the change.'),
        title: z.string().optional().describe('Replacement note title'),
        publish: z.number().int().optional().describe('Replacement publish level. On this instance: 1 = "All Autotask Users" (CUSTOMER-VISIBLE), 2 = "Internal Project Team", 4 = "Internal & Co-Managed". There is no 3. Confirm with autotask_entity_picklist if unsure — changing this changes who can read the note.'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ noteId, description, title, publish }: any, extra: any) => {
      try {
        // Build the payload from ONLY what the caller supplied. Assembled by
        // explicit key so an unrelated argument can never reach the PATCH body.
        const requested: write.TicketNoteEdit = {}
        if (description !== undefined) requested.description = description
        if (title !== undefined) requested.title = title
        if (publish !== undefined) requested.publish = publish

        if (Object.keys(requested).length === 0) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message:
              `No change was requested for note ${noteId}: at least one of description, title or publish must be supplied. Nothing was written.`,
            evidence: 'The tool refuses an empty edit before contacting Autotask — a PATCH carrying only an id would be a pointless write against a note it might not even be able to prove it changed.',
            remediation: 'Call again with the field(s) you want to change. To read the note\'s current text first, use autotask_ticket_notes or autotask_ticket_activity.',
            surface: 'autotask',
            tool: 'autotask_update_ticket_note',
            details: { noteId },
          })
        }

        const rid = await resolveResourceId(emailOf(extra))
        const client = new AutotaskClient()

        // Pre-read: establishes the note EXISTS, captures the before values the
        // verification and the publish-change report compare against, and yields
        // the ticket id (this tool deliberately does not ask the caller for one).
        // A THROW here is a lookup failure and classifies as TRANSIENT/etc; only
        // a clean null means "no such note".
        const before = await client.getTicketNoteByNoteId(noteId)
        if (!before) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `No Autotask ticket note has id ${noteId}, so there is nothing to edit. Nothing was written.`,
            evidence: `A TicketNotes query filtered on id ${noteId} succeeded and returned no rows (a failed query would have raised a different error, so this is a genuine absence, not a broken lookup).`,
            remediation:
              'Check the note id — a TICKET id passed here will not match a note. List the ticket\'s notes with autotask_ticket_notes, or its full timeline with autotask_ticket_activity, and use the id of the note you mean.',
            surface: 'autotask',
            tool: 'autotask_update_ticket_note',
            details: { noteId },
          })
        }

        const ticketId = before.ticketID
        const result = await write.updateTicketNote(ticketId, noteId, requested, rid)

        // Read back and prove it. Unlike the pre-read, a failure here means the
        // write may well have landed — so this can never be reported as success.
        const after = await client.getTicketNoteByNoteId(noteId)
        if (!after) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message:
              `Autotask accepted the edit to note ${noteId} on ticket ${ticketId}, but the note could not be read back afterwards, so nothing about the edit is confirmed. Do NOT report the note as corrected.`,
            evidence: 'The post-write TicketNotes read returned no row for a note id that existed moments earlier, so the stored values could not be compared against what was requested.',
            remediation: `Open the ticket in Autotask and check the note before doing anything else: ${getAutotaskTicketUrl(String(ticketId))}. Do not retry blindly — the edit may already have applied.`,
            surface: 'autotask',
            tool: 'autotask_update_ticket_note',
            details: { noteId, ticketId, requestedFields: Object.keys(requested) },
          })
        }

        const { mismatches, changedFields, unchangedFields } = verifyNoteEdit(requested, before, after)
        const visibility = await describePublishChange(client, before.publish, after.publish).catch(() => null)

        if (mismatches.length) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message:
              `Autotask accepted the PATCH for note ${noteId} on ticket ${ticketId} but the read-back does not show ${mismatches
                .map((m) => `${m.field} (asked for ${JSON.stringify(m.requested)}, the note now reports ${JSON.stringify(m.actual)})`)
                .join('; ')}. Do NOT report this note as corrected.` +
              (changedFields.length ? ` Note that ${changedFields.join(' and ')} DID change, so the note is now partially edited.` : ''),
            evidence:
              'Verified by re-reading the note by id after the write and comparing every requested field against the stored value, rather than trusting the PATCH\'s HTTP status. Line endings are the only difference tolerated.',
            remediation:
              `Read the note as it now stands (autotask_ticket_notes on ticket ${ticketId}) and check it in Autotask before retrying: ${getAutotaskTicketUrl(String(ticketId))}. Retrying the identical call is unlikely to behave differently — a field Autotask silently drops needs a different approach, not another attempt.`,
            surface: 'autotask',
            tool: 'autotask_update_ticket_note',
            details: { noteId, ticketId, mismatches, changedFields, unchangedFields },
          })
        }

        return ok({
          result,
          noteId,
          ticketId,
          ticketUrl: getAutotaskTicketUrl(String(ticketId)),
          editVerified: true,
          requestedFields: Object.keys(requested),
          changedFields,
          unchangedFields,
          ...(unchangedFields.length
            ? {
                unchangedNote: `${unchangedFields.join(' and ')} already held the requested value, so ${
                  unchangedFields.length === 1 ? 'that field' : 'those fields'
                } did not actually change. Do not describe ${unchangedFields.length === 1 ? 'it' : 'them'} as edited.`,
              }
            : {}),
          note: {
            id: after.id,
            title: after.title ?? null,
            description: after.description ?? null,
            publish: after.publish ?? null,
            noteType: after.noteType ?? null,
            lastActivityDate: after.lastActivityDate ?? null,
          },
          ...(visibility ?? {
            publishChanged: null,
            publishChangeNote:
              'The publish picklist labels could not be resolved, so this response cannot state who can see the note. The field values themselves were verified — check the note in Autotask before describing its visibility.',
          }),
          verifiedBy:
            'The note was re-read by id after the write and every requested field matched the stored value. Autotask records the editing technician in impersonatorUpdaterResourceID.',
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_create_time_entry',
    { title: 'Autotask: create time entry', description: `WRITE, BILLABLE. Log time on a ticket, attributed to the signed-in technician. roleId is REQUIRED (resolve a role name via autotask_list_roles). ${ROLE_RATE_WARNING} Settled 2026-09-09: every active role validates for this instance's resources, so an inappropriate role is NOT refused — it bills wrong. The response reports a suggestedRole derived from your summaryNotes; it is ADVISORY and the roleId you pass is what is written, because auto-selecting a 225/hr role from keyword matching would be a billing decision made by a regex. Autotask SERVICE tickets require a start and stop time — pass startDateTime + stopDateTime (ISO 8601); hoursWorked is then optional and derived from the interval. For non-service tickets you may instead pass hoursWorked. summaryNotes follows TCT format: Actions Taken; Root Cause/Findings; Resolution; Next Steps/Escalation; Status - prose, no bullets, do not restate the issue. NOTE: summaryNotes does NOT populate the ticket Resolution field (which drives the customer completion email) — set appendSummaryToResolution=true (or use autotask_set_ticket_resolution) to write it there. Only call after the user approves the hours and text.`, inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), roleId: z.number().int().describe('Autotask role id (REQUIRED) — from autotask_list_roles. Network/infrastructure/connectivity work: Network Engineer 29683460. Account/billing/vendor administration: Administration 29682834. Strategic/advisory: vCIO 29683467 (225/hr). Routine end-user support: Help Desk 29683464'), summaryNotes: z.string().describe('Customer-visible work summary in TCT format'), startDateTime: z.string().optional().describe('Work start, ISO 8601 — REQUIRED for Service tickets'), stopDateTime: z.string().optional().describe('Work stop, ISO 8601 — REQUIRED for Service tickets'), hoursWorked: z.number().positive().optional().describe('Hours worked; optional if start/stop given (derived from the interval)'), internalNotes: z.string().optional().describe('Internal-only notes'), dateWorked: z.string().optional().describe('YYYY-MM-DD; defaults to the start date or today'), billingCodeId: z.number().int().optional().describe('Autotask billing code id (work type), if required'), appendSummaryToResolution: z.boolean().optional().describe('Also append summaryNotes to the ticket Resolution field (mirrors Autotask\'s checkbox) so the customer completion email has content') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, roleId, summaryNotes, startDateTime, stopDateTime, hoursWorked, internalNotes, dateWorked, billingCodeId, appendSummaryToResolution }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const result = await write.createTicketTimeEntry({ ticketID: ticketId, resourceID: rid, roleID: roleId, hoursWorked, dateWorked, startDateTime, stopDateTime, summaryNotes, internalNotes, billingCodeID: billingCodeId }, rid)
        if (appendSummaryToResolution && summaryNotes) await appendResolution(ticketId, summaryNotes, rid)

        // Role guidance, reported AFTER the write and never applied to it. The
        // entry is written with exactly the roleId the caller passed; this only
        // tells them whether the role they chose matches the work they
        // described, because since 2026-09-09 we know every active role
        // validates and therefore a wrong role bills wrong instead of failing.
        const suggestion = suggestRoleForWork(String(summaryNotes ?? ''), { resourceId: rid })
        const roleMismatch = suggestion.matched && suggestion.roleId !== roleId
        return okTicket(ticketId, {
          ...(result && typeof result === 'object' ? result : { result }),
          roleUsed: roleId,
          suggestedRole: suggestion,
          ...(roleMismatch
            ? {
                roleAdvisory: `HEADS UP — the entry was written with role ${roleId} as you asked, and nothing has been changed. But the work you described reads like ${suggestion.roleName} (${suggestion.roleId}, ${suggestion.hourlyRate}/hr): ${suggestion.rationale} If ${suggestion.roleName} is the right role, edit the entry with autotask_update_time_entry — the role sets the bill rate, so this is a billing difference, not a cosmetic one.`,
              }
            : {}),
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_set_ticket_resolution',
    { title: 'Autotask: set ticket resolution', description: 'WRITE. Set (or append to) the ticket Resolution field. IMPORTANT: Resolution — not the time-entry summary — is what fills the customer "ticket completed" notification email, so populate it BEFORE setting the ticket to Complete. append=true (default) preserves any existing resolution and adds this text below it; false overwrites. Confirm the wording with the user first.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), resolution: z.string().describe('Resolution text (customer-facing; appears in the completion email)'), append: z.boolean().optional().describe('Append to existing resolution (default true); false replaces it') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, resolution, append }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        if (append === false) await write.updateTicket(ticketId, { resolution }, rid)
        else await appendResolution(ticketId, resolution, rid)
        return okTicket(ticketId, { resolutionUpdated: true })
      } catch (e) { return fail(e) }
    }
  )

  // -------------------------------------------------------------------------
  // General ticket field update
  // -------------------------------------------------------------------------
  //
  // 2026-08-27, ticket 35432 (T20260827.0018): an inbound email ticket landed
  // with companyID 0 and could not be mapped to a customer. The connector could
  // assign, set status, set resolution and add notes — but had no way to correct
  // a ticket's core fields, so the fix had to be done by hand in the Autotask UI.
  //
  // Every field below reports isReadOnly false on this instance's live
  // entityInformation (checked before this tool was written). A field the API
  // reports read-only is deliberately absent from the schema rather than
  // accepted-and-ignored: silently dropping a caller's value is the failure this
  // connector keeps having to undo.
  //
  // 2026-08-28: the re-parent this tool was BUILT for did not work. Autotask
  // stamps a companyLocationID on every ticket at create time, it belongs to
  // the old company, and it does not survive a company change:
  //
  //   PATCH Tickets 500 {"errors":["The companyLocationID[285] cannot be
  //   associated with the Ticket. The CompanyLocation must belong to the
  //   Ticket's, ConfigurationItem's, or the Contact's Company."]}
  //
  // So every real re-parent failed — the exact case the tool exists for. The
  // field is settable (live entityInformation: isReadOnly false, isRequired
  // false, integer, reference to CompanyLocation), so this was a connector gap,
  // not a vendor limit. It is now a parameter, and a company change carries the
  // location with it rather than leaving a value from the previous customer:
  // the NEW company's own primary location, which is what Autotask's own ticket
  // form defaults to, or a clear when that company declares no primary.
  // Plain-language meaning of each companyLocation.source, shipped with the
  // response so a reader never has to guess what the connector did to a field
  // they did not name.
  const LOCATION_SOURCE_TEXT: Record<string, string> = {
    caller: 'the location you supplied',
    new_company_primary: "the new company's own primary location, read live from CompanyLocations",
    cleared_no_primary:
      'cleared, because the new company declares no active primary location — the field is optional, so an empty site is the honest answer rather than a guessed one',
    untouched: 'unchanged — this call did not move the ticket between companies',
  }

  server.registerTool(
    'autotask_update_ticket',
    {
      title: 'Autotask: update ticket fields',
      description:
        'WRITE. Corrects an EXISTING ticket\'s core fields in place — the tool to reach for when a ticket landed with the wrong company, contact, queue, priority, type, due date or contract, or needs its title/description fixed. ' +
        'Takes ticketId plus AT LEAST ONE of companyID, contactID, title, description, queueID, priority, ticketType, dueDateTime, contractID. A call supplying none of them is rejected as INVALID_INPUT. ' +
        'ONLY the fields you pass are written: Autotask\'s PATCH updates just the properties named and leaves every omitted field untouched, so there is NO GET-and-merge and an unsupplied field can never be blanked. ' +
        'Every parameter here reports isReadOnly false on this instance\'s LIVE entityInformation — there is no parameter for a field Autotask will not accept. For assignment use autotask_assign_ticket (resource and role must move together), for status autotask_set_ticket_status, for resolution autotask_set_ticket_resolution. ' +
        'Attributed to the signed-in technician via Autotask resource impersonation. ' +
        'READ-BACK VERIFIED: the ticket is re-read after the write and every requested field compared against what Autotask actually stored. If a value did not stick you get PRECONDITION_FAILED — an accepted PATCH is never reported as success on its HTTP status alone. Re-sending a value the ticket already had succeeds but is listed in unchangedFields, so the response never implies an edit that did not happen. ' +
        'VISIBILITY TRAP 1 — companyID RE-PARENTS THE TICKET: it moves the ticket to a different customer, which changes the contacts, contracts and notification recipients Autotask associates with it, and changes who can see it in the client portal. Tell the user before and after. ' +
        'A COMPANY CHANGE MOVES TWO OTHER FIELDS WITH IT, because Autotask REJECTS the whole PATCH while the previous company\'s location or contact is still attached (both live-confirmed 2026-08-28). companyLocationID is set to the NEW company\'s primary location, or cleared if it declares none. contactID is CLEARED when the ticket carries one from the old company — a contact is a person, so there is no non-arbitrary replacement, and one left attached keeps receiving mail about a ticket that now belongs to somebody else. Every clear is CONFIRMED against the read-back before it is reported, never claimed from an accepted PATCH. ' +
        'A CONTRACT BLOCKS THE MOVE AND THIS TOOL CANNOT CLEAR IT: if the ticket is attached to a contract belonging to the old company, Autotask rejects the whole change, and a null sent for contractID does NOT clear it — Autotask accepts the PATCH and keeps the old value, leaving the ticket on the new company holding the old company\'s contract, so this tool never sends one. Such a call is REFUSED BEFORE ANY WRITE with PRECONDITION_FAILED naming the contract. To move the ticket: pass contractID for a contract belonging to the NEW company in the SAME call, or clear the Contract field in the Autotask UI first. ' +
        'All of it is reported in companyLocation.source, clearedOnReparent and failedToClear, and named in reparentedNote. Pass companyLocationID, contactID or contractID yourself in the SAME call to set the new company\'s own records instead. ' +
        'VISIBILITY TRAP 2 — contactID CHANGES WHO AUTOTASK EMAILS about this ticket. The new contact starts receiving ticket correspondence and the previous one stops. Confirm the person before calling. ' +
        'Confirm the exact field values with the user before calling.',
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket ID (the numeric id, not the T-number — resolve a T-number with autotask_get_ticket_by_number)'),
        companyID: z.number().int().optional().describe('RE-PARENTS the ticket to this company id — changes notification recipients and portal visibility. Resolve with autotask_search_companies. A contact/contract from the old company will not survive the move; the site location is handled for you (see companyLocationID).'),
        companyLocationID: z.number().int().nullable().optional().describe('Site location for the ticket, from the ticket\'s OWN company (Autotask rejects a location belonging to any other company). Pass null to clear it. Leave it out on a company change and the new company\'s primary location is used automatically — the response reports which location was applied and lists the company\'s locations so you can correct it in one follow-up call.'),
        contactID: z.number().int().nullable().optional().describe('Ticket contact — CHANGES WHO AUTOTASK EMAILS about this ticket. Must belong to the ticket\'s company (Autotask rejects one from any other company, which is why a company change clears a stale one). Pass null to clear it. Resolve with autotask_company_contacts.'),
        title: z.string().optional().describe('Replacement ticket title. Replaces the existing title entirely.'),
        description: z.string().optional().describe('Replacement ticket description. Replaces the existing text entirely — pass the full corrected description, not just the change.'),
        queueID: z.number().int().optional().describe('Queue picklist value — resolve with autotask_list_queues. Moving a ticket between queues changes which technicians see it.'),
        priority: z.number().int().optional().describe('Priority picklist value — resolve with autotask_list_priorities.'),
        ticketType: z.number().int().optional().describe('Ticket type picklist value — resolve with autotask_entity_picklist({ entity: "Tickets", field: "ticketType" }).'),
        dueDateTime: z.string().optional().describe('Due date/time, ISO 8601. Drives SLA and due-date reporting.'),
        contractID: z.number().int().nullable().optional().describe('Contract id to bill this ticket against — resolve with autotask_list_contracts. Must belong to the ticket\'s company (Autotask rejects one from any other company, which is why a company change clears a stale one). Pass null to clear it.'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_update_ticket'
      try {
        // Built from ONLY what the caller supplied, by explicit key, so an
        // unrelated argument can never reach the PATCH body.
        const requested = definedFields({
          companyID: rest.companyID,
          companyLocationID: rest.companyLocationID,
          contactID: rest.contactID,
          title: rest.title,
          description: rest.description,
          queueID: rest.queueID,
          priority: rest.priority,
          ticketType: rest.ticketType,
          dueDateTime: rest.dueDateTime,
          contractID: rest.contractID,
        })

        if (Object.keys(requested).length === 0) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `No change was requested for ticket ${ticketId}: at least one of companyID, companyLocationID, contactID, title, description, queueID, priority, ticketType, dueDateTime or contractID must be supplied. Nothing was written.`,
            evidence: 'The tool refuses an empty edit before contacting Autotask — a PATCH carrying only an id would be a pointless write against a ticket it might not even be able to prove it changed.',
            remediation: `Call again with the field(s) you want to change. To read the ticket's current values first, use autotask_get_ticket({ ticketId: ${ticketId} }).`,
            surface: 'autotask',
            tool: TOOL,
            details: { ticketId },
          })
        }

        const rid = await resolveResourceId(emailOf(extra))
        const client = new AutotaskClient()

        // Pre-read: proves the ticket EXISTS and captures the before values the
        // verification compares against. A THROW here is a lookup failure and
        // classifies as TRANSIENT/etc; only a clean null means "no such ticket".
        const before = await client.getTicketCoreFields(ticketId)
        if (!before) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `No Autotask ticket has id ${ticketId}, so there is nothing to update. Nothing was written.`,
            evidence: `A Tickets query filtered on id ${ticketId} succeeded and returned no rows (a failed query would have raised a different error, so this is a genuine absence, not a broken lookup).`,
            remediation: 'Check the ticket id — a ticket NUMBER (T20260827.0018) passed here will not match. Resolve one with autotask_get_ticket_by_number.',
            surface: 'autotask',
            tool: TOOL,
            details: { ticketId },
          })
        }

        const companyIsChanging =
          requested.companyID !== undefined && Number(requested.companyID) !== Number(before.companyID)

        // ------------------------------------------------------------------
        // A stale CONTRACT blocks the re-parent, and this tool CANNOT clear it.
        //
        // Established by A/B on ticket 35437, same source company, same
        // destination, same contract, one variable:
        //
        //   PATCH {companyID, companyLocationID, contractID: null} -> 200. The
        //     company moved. The contract did NOT clear. Autotask validated the
        //     SUBMITTED null and persisted the OLD value, leaving the ticket on
        //     one company holding another's contract.
        //   PATCH {companyID, companyLocationID}                   -> 500
        //     "contractID [29683617] is not associated to companyID [423] or
        //     its parent."
        //
        // So the null does not clear anything — it SUPPRESSES the check and
        // produces a silently corrupt cross-company state, which is worse than
        // the failure it hides. Sending it is therefore never right.
        //
        // Which leaves the re-parent genuinely blocked. Refusing here, before
        // any write, rather than letting Autotask's 500 surface: the tool
        // already knows the ticket's contract and the destination company, so
        // it can name the actual remedy instead of handing back a vendor error
        // whose owner is ambiguous (the caller never sent contractID, so
        // "correct the argument" is the wrong instruction).
        // ------------------------------------------------------------------
        if (companyIsChanging && requested.contractID === undefined && before.contractID != null) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message:
              `Ticket ${ticketId} cannot be moved to company ${requested.companyID} while it is attached to contract ${before.contractID}, which belongs to company ${before.companyID}. Autotask rejects the whole change, and this tool cannot clear the contract for you. NOTHING WAS WRITTEN — the ticket is untouched.`,
            evidence:
              `Autotask answers this with 500 "contractID [${before.contractID}] is not associated to companyID [${requested.companyID}] or its parent." Verified live on 2026-08-28, and refused here BEFORE the write rather than after it. Sending contractID: null alongside the change is not a way around it: Autotask then accepts the PATCH but does NOT store the null, leaving the ticket on the new company still holding the old company's contract — a silent cross-company state, which is why this tool never sends one.`,
            remediation:
              `Two ways forward, both needing a decision this tool must not make for you. (1) Call again with contractID set to a contract that belongs to company ${requested.companyID} — resolve one with autotask_list_contracts({ companyId: ${requested.companyID} }) — and it moves in the same call. (2) If the ticket should carry no contract, clear the Contract field in the Autotask UI first, then re-run this call: ${getAutotaskTicketUrl(String(ticketId))}. Do NOT retry this call unchanged; it fails identically every time.`,
            surface: 'autotask',
            tool: TOOL,
            details: {
              ticketId,
              blockingContractId: Number(before.contractID),
              contractBelongsToCompanyId: Number(before.companyID),
              targetCompanyId: Number(requested.companyID),
              retryable: false,
            },
          })
        }

        // ------------------------------------------------------------------
        // The site location has to move with the company.
        //
        // Autotask stamps companyLocationID at create time and refuses the
        // whole PATCH while it points at the previous customer's location, so
        // leaving it alone is not an option — it breaks every re-parent. Two
        // things are true and decide the default:
        //   - the field is OPTIONAL, so clearing it is always legal, and
        //   - the company's own isPrimary location is a fact read from the API,
        //     not a guess, and is what Autotask's own ticket form defaults to.
        // So: the caller's value wins; otherwise the new company's primary;
        // otherwise a clear, which is the honest answer when the company
        // declares no primary. This is applied ONLY when the company actually
        // changes — a call that does not touch companyID never touches the
        // location.
        // ------------------------------------------------------------------
        let locationSource: 'caller' | 'new_company_primary' | 'cleared_no_primary' | 'untouched' =
          requested.companyLocationID !== undefined ? 'caller' : 'untouched'
        let companyLocations: Array<{ id: number; name: string | null; isPrimary: boolean; isActive: boolean }> = []
        const autoFields: Record<string, unknown> = {}
        const attemptedClears: Array<{ field: string; was: number; why: string }> = []

        if (companyIsChanging && requested.companyLocationID === undefined) {
          companyLocations = await client.getCompanyLocations(Number(requested.companyID))
          const primary = companyLocations.find((l) => l.isPrimary && l.isActive)
          autoFields.companyLocationID = primary ? primary.id : null
          locationSource = primary ? 'new_company_primary' : 'cleared_no_primary'
        }

        // ------------------------------------------------------------------
        // The stale CONTACT. Live-confirmed 2026-08-28: it blocks the whole
        // re-parent exactly like the location did —
        //
        //   {"errors":["Data violation: contactID is not associated to the
        //    companyID or its Parent Company.."]}
        //
        // and this is the majority case, not an edge case: a mis-filed inbound
        // ticket almost always HAS a contact, so handling only the location
        // left the re-parent broken for most of the tickets this tool exists
        // to correct.
        //
        // It is CLEARED rather than re-resolved, and the asymmetry with the
        // location is deliberate. A company's primary LOCATION is its own
        // declared default — a fact to read. A contact is a person: the new
        // company's primary contact is a stranger to this ticket and would
        // start receiving mail about it. Clearing is also the safer half on its
        // own terms, since the OLD customer's contact left attached keeps being
        // emailed about a ticket that is no longer theirs. contactID is
        // isRequired false and a null IS honoured (verified live), and a caller
        // who knows the right contact passes it in the same call instead.
        //
        // contractID is NOT touched here, and the reason is a RETRACTION —
        // see the stale-contract-warning block after the write.
        // ------------------------------------------------------------------
        if (companyIsChanging && requested.contactID === undefined && before.contactID != null) {
          autoFields.contactID = null
          attemptedClears.push({
            field: 'contactID',
            was: Number(before.contactID),
            why: 'the contact belongs to the previous company; Autotask rejects the whole re-parent while it is attached, and leaving it would keep emailing the old customer about this ticket',
          })
        }

        const result = await write.updateTicket(ticketId, { ...requested, ...autoFields }, rid)

        // Read back and prove it. Unlike the pre-read, a failure here means the
        // write may well have landed — so this can never be reported as success.
        const after = await client.getTicketCoreFields(ticketId)
        if (!after) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the update to ticket ${ticketId}, but the ticket could not be read back afterwards, so nothing about the change is confirmed. Do NOT report the ticket as updated.`,
            evidence: 'The post-write Tickets read returned no row for a ticket id that existed moments earlier, so the stored values could not be compared against what was requested.',
            remediation: `Open the ticket in Autotask and check it before doing anything else: ${getAutotaskTicketUrl(String(ticketId))}. Do not retry blindly — the update may already have applied.`,
            surface: 'autotask',
            tool: TOOL,
            details: { ticketId, requestedFields: Object.keys(requested) },
          })
        }

        // Split by LIVE queryability first so a field a read cannot see is
        // reported as explicitly unverified rather than failed or silently
        // omitted. All nine are isQueryable true today; this is not hardcoded
        // so a Kaseya change is picked up instead of frozen into this file.
        const { verifiable, unverifiable, reason } = await splitByQueryability('Tickets', Object.keys(requested))
        const checked = Object.fromEntries(verifiable.map((f) => [f, requested[f]]))
        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(checked, before, after)

        if (mismatches.length) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message:
              `Autotask accepted the PATCH for ticket ${ticketId} but the read-back does not show ${mismatches
                .map((m) => `${m.field} (asked for ${JSON.stringify(m.requested)}, the ticket now reports ${JSON.stringify(m.actual)})`)
                .join('; ')}. Do NOT report this ticket as updated.` +
              (changedFields.length ? ` Note that ${changedFields.join(' and ')} DID change, so the ticket is now partially updated.` : ''),
            evidence:
              'Verified by re-reading the ticket by id after the write and comparing every requested field against the stored value, rather than trusting the PATCH\'s HTTP status.',
            remediation:
              `Read the ticket as it now stands (autotask_get_ticket({ ticketId: ${ticketId} })) and check it in Autotask before retrying: ${getAutotaskTicketUrl(String(ticketId))}. Retrying the identical call is unlikely to behave differently — a contact or contract that belongs to a different company, or a picklist value that is not valid for this ticket's category, is rejected or dropped no matter how many times it is sent.`,
            surface: 'autotask',
            tool: TOOL,
            details: { ticketId, mismatches, changedFields, unchangedFields },
          })
        }

        const reparented = changedFields.includes('companyID')
        const contactChanged = changedFields.includes('contactID')

        // The location is reported as an OBSERVATION, not verified as a
        // requested field, when this tool chose it rather than the caller. A
        // read-back disagreement there means Autotask re-stamped the ticket
        // itself — worth saying out loud, but it is not a failure of what the
        // caller actually asked for, and failing the whole re-parent over it
        // would be the verifier crying wolf. A location the CALLER supplied is
        // in `requested` and stays strictly verified like every other field.
        // A clear is only reported once the READ-BACK shows it. The auto-applied
        // fields are exempt from the strict verifier — failing a landed
        // re-parent over a field nobody asked for is the verifier crying wolf —
        // but that exemption applies to OBSERVING state, never to CLAIMING an
        // action. Reporting "contractID was CLEARED" off the back of an
        // accepted PATCH is exactly the success-shaped-output defect this
        // connector keeps undoing, and this tool shipped it on 2026-08-28.
        const clearedOnReparent = attemptedClears.filter((c) => after[c.field] == null)
        const failedToClear = attemptedClears
          .filter((c) => after[c.field] != null)
          .map((c) => ({ field: c.field, was: c.was, stillReads: after[c.field] as number }))

        const locationBefore = (before.companyLocationID as number | null) ?? null
        const locationAfter = (after.companyLocationID as number | null) ?? null
        const locationApplied = 'companyLocationID' in autoFields ? (autoFields.companyLocationID as number | null) : undefined
        const locationDiverged = locationApplied !== undefined && Number(locationApplied ?? -1) !== Number(locationAfter ?? -1)

        return ok({
          result,
          ticketId,
          ticketUrl: getAutotaskTicketUrl(String(ticketId)),
          updateVerified: true,
          requestedFields: Object.keys(requested),
          changedFields,
          unchangedFields,
          ...(unchangedFields.length
            ? {
                unchangedNote: `${unchangedFields.join(' and ')} already held the requested value, so ${
                  unchangedFields.length === 1 ? 'that field' : 'those fields'
                } did not actually change. Do not describe ${unchangedFields.length === 1 ? 'it' : 'them'} as edited.`,
              }
            : {}),
          ...(reparented
            ? {
                reparentedNote: `TICKET RE-PARENTED: ticket ${ticketId} moved from company ${before.companyID ?? 'none'} to company ${after.companyID ?? 'none'}. Its notification recipients, available contacts and contracts, and client-portal visibility all follow the new company. TELL THE USER. The site location moved with it — it had to, because Autotask rejects the whole change while the ticket still points at the old company's records: companyLocationID went from ${locationBefore ?? 'none'} to ${locationAfter ?? 'none'} (${LOCATION_SOURCE_TEXT[locationSource]}).${
                  clearedOnReparent.length
                    ? ` ${clearedOnReparent
                        .map((c) => `${c.field} was CLEARED (was ${c.was}, confirmed by read-back) — ${c.why}`)
                        .join('; ')}. Set ${clearedOnReparent.length === 1 ? 'it' : 'them'} to the new company's own record with another autotask_update_ticket call if this ticket needs ${clearedOnReparent.length === 1 ? 'one' : 'them'}.`
                    : ''
                }${
                  failedToClear.length
                    ? ` ${failedToClear
                        .map((c) => `${c.field} could NOT be cleared — Autotask kept ${c.stillReads}`)
                        .join('; ')}. Fix that in the Autotask UI.`
                    : ''
                } The ticket now reports contactID ${after.contactID ?? 'none'} and contractID ${after.contractID ?? 'none'}.`,
              }
            : {}),
          ...(clearedOnReparent.length
            ? {
                clearedOnReparent,
                clearedOnReparentNote:
                  'These fields were cleared by the re-parent, not by the caller, and the clear is CONFIRMED against the read-back rather than assumed from the PATCH. Autotask refuses a company change while the previous company\'s contact is attached, and no non-arbitrary replacement exists — a contact is a person. SAY SO to the user: a cleared contact changes who Autotask emails.',
              }
            : {}),
          ...(failedToClear.length
            ? {
                failedToClear,
                failedToClearNote:
                  'This tool sent a null for these fields and Autotask did NOT clear them — the read-back still shows the old value. They are reported as NOT cleared, because a clear claimed on the strength of an accepted PATCH is the success-shaped-output failure this connector keeps having to undo. Fix them in the Autotask UI, or pass a valid replacement for the new company.',
              }
            : {}),

          companyLocation: {
            before: locationBefore,
            after: locationAfter,
            source: locationSource,
            sourceMeaning: LOCATION_SOURCE_TEXT[locationSource],
            ...(companyLocations.length ? { companyLocations } : {}),
            ...(locationDiverged
              ? {
                  divergedNote: `This tool sent companyLocationID ${locationApplied ?? 'null'} but the ticket reads back ${locationAfter ?? 'null'} — Autotask set the location itself. The company change is verified; the location is reported as observed, not as requested.`,
                }
              : {}),
          },
          ...(contactChanged
            ? {
                contactChangeNote: `NOTIFICATION RECIPIENT CHANGED: the ticket contact moved from ${before.contactID ?? 'none'} to ${after.contactID ?? 'none'}. Autotask now emails the new contact about this ticket and stops emailing the previous one. TELL THE USER.`,
              }
            : {}),
          ...(unverifiable.length ? { unverifiableFields: unverifiable, unverifiableNote: reason } : {}),
          ticket: after,
          verifiedBy:
            'The ticket was re-read by id after the write and every requested field matched the stored value. Autotask records the updating technician via resource impersonation.',
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_assign_ticket',
    {
      title: 'Autotask: assign ticket',
      description: 'WRITE. Set a ticket\'s assigned resource AND that resource\'s role — Autotask requires the pair and rejects a resource on its own ("Data violation: you must assign both a assignedResourceID and assignedResourceRoleID"). Omitting assignedResourceRoleID defaults it to Engineer (29683355). ' + ROLE_GUIDANCE + ' Use autotask_find_resource to resolve a name/email to a resourceId. The write is VERIFIED by read-back: if Autotask accepts the PATCH but the ticket does not show the assignment, this returns a PRECONDITION_FAILED failure rather than success. Confirm with the user first.',
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket ID'),
        resourceId: z.number().int().describe('Autotask resource ID to assign the ticket to (Autotask field assignedResourceID)'),
        assignedResourceRoleID: z.number().int().optional().describe('Role id for that resource — REQUIRED BY AUTOTASK alongside the resource; defaults to Engineer 29683355 if omitted. From autotask_list_roles'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, resourceId, assignedResourceRoleID }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const roleId = assignedResourceRoleID ?? write.DEFAULT_ASSIGNED_RESOURCE_ROLE_ID
        const result = await write.updateTicket(ticketId, { assignedResourceID: resourceId, assignedResourceRoleID: roleId }, rid)
        const check = await verifyAssignment(ticketId, { resourceId, roleId })
        if (!check.verified) return check.result
        return ok({
          result,
          ticketUrl: getAutotaskTicketUrl(String(ticketId)),
          assignment: check.assignment,
          assignmentVerified: true,
          roleDefaulted: assignedResourceRoleID == null,
          note: 'Verified by read-back: the ticket reports this resource and role.',
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_set_ticket_status',
    { title: 'Autotask: set ticket status', description: 'WRITE. Set a ticket\'s status (numeric picklist value). Confirm with the user first.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), status: z.number().int().describe('Autotask ticket status picklist value') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, status }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return okTicket(ticketId, await write.updateTicket(ticketId, { status }, rid)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_find_resource',
    { title: 'Autotask: find resource', description: 'Look up an Autotask resource (technician) by email to get their resource ID (e.g. for assignment).', inputSchema: { email: z.string().describe('Resource email address') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ email }: any) => {
      try { const res = await new AutotaskClient().getResourceByEmail(email); return ok(res ? { id: res.id, email, found: true } : { found: false }) } catch (e) { return fail(e) }
    }
  )

  // -------------------------------------------------------------------------
  // File attachments on tickets, time entries and ticket notes
  // -------------------------------------------------------------------------
  //
  // Built for the RingCentral call-transcript pipeline (UTF-8 .txt, 3-10 KB).
  // The rules that shape this surface, and the vendor citations, are in
  // src/lib/autotask-attachments.ts. What the handler below guarantees:
  //
  //   1. publish is ALWAYS sent (default INTERNAL 2) and ALWAYS read back. Live
  //      entityInformation calls it read-only AND required, which cannot both
  //      be true of a create; the vendor's own documented create sends it.
  //   2. Size and content type are checked BEFORE any upload (INVALID_INPUT).
  //   3. Every step is PHASE-TAGGED (validate | post | readback | rollback).
  //      Anything that fails AFTER Autotask accepted the POST is VERIFY_FAILED
  //      / fixableBy connector — never the caller's — and the envelope always
  //      carries details.createdAttachmentId, parentType, parentId and
  //      verificationState so "nothing was created" and "created but
  //      unverified" can never be confused again. (2026-09-08: the first live
  //      call created row 28465, the read-back 500'd on a wrong projection, the
  //      failure said INVALID_INPUT / caller, omitted the id, and no rollback
  //      ran. Eight read-only calls were needed to establish what existed.)
  //   4. A read-back that fails, returns nothing, or disagrees with the request
  //      triggers a ROLLBACK (DELETE of the created id). If that also fails,
  //      verificationState is rollback_failed WITH the id.
  //   5. The read-back projection is PER ENTITY, intersected with live
  //      entityInformation — a shared list is what produced the 500.
  //
  // One handler serves the three create tools; they differ in parent entity,
  // parent field and how the parent is pre-read.
  type AttachmentKind = 'ticket' | 'time_entry' | 'ticket_note'
  interface AttachmentKindConfig extends AttachmentEntityConfig {
    tool: string
    parentLabel: string
    idParam: 'ticketId' | 'timeEntryId' | 'ticketNoteId'
  }
  const ATTACHMENT_KINDS: Record<AttachmentKind, AttachmentKindConfig> = {
    ticket: { ...ATTACHMENT_ENTITIES.TicketAttachments, tool: 'autotask_add_ticket_attachment', parentLabel: 'ticket', idParam: 'ticketId' },
    time_entry: { ...ATTACHMENT_ENTITIES.TimeEntryAttachments, tool: 'autotask_add_time_entry_attachment', parentLabel: 'time entry', idParam: 'timeEntryId' },
    ticket_note: { ...ATTACHMENT_ENTITIES.TicketNoteAttachments, tool: 'autotask_add_ticket_note_attachment', parentLabel: 'ticket note', idParam: 'ticketNoteId' },
  }
  const PARENT_TYPE_TO_KIND: Record<'ticket' | 'time_entry' | 'ticket_note', AttachmentKind> = { ticket: 'ticket', time_entry: 'time_entry', ticket_note: 'ticket_note' }

  const ATTACHMENT_SHARED_DESCRIPTION =
    `The file is validated BEFORE anything is sent: contentType must be one of ${Object.keys(ATTACHMENT_CONTENT_TYPES).join(', ')} (a connector allowlist, not an Autotask limit), the filename extension must agree with it, and the decoded size must not exceed ${ATTACHMENT_MAX_BYTES.toLocaleString('en-US')} bytes — the lower bound of Kaseya's documented "6 to 7 MB" per-file API limit, chosen because the vendor gives a range, not a number. ${ATTACHMENT_WINDOW_NOTE} ` +
    'Pass content (UTF-8 text) for a text file or contentBase64 for binary bytes, never both. ' +
    `VISIBILITY: defaults to INTERNAL (publish ${ATTACHMENT_PUBLISH.INTERNAL} "Internal Users Only"). Pass customerVisible: true ONLY when the customer should see the file — that stores publish ${ATTACHMENT_PUBLISH.CUSTOMER_VISIBLE} "All Autotask Users", the Internal-cleared state that Client Portal customers can open, so a call transcript or internal note attached that way is exposed to the customer verbatim. ` +
    'The stored publish level is READ BACK off the created attachment and reported with its live label; it is never claimed from the accepted POST. ' +
    'READ-BACK VERIFIED, then ROLLED BACK ON ANY DOUBT: after the POST the attachment is re-read by id (publish, parent, title, fullPath, attachmentType) and its stored bytes fetched and compared to what was sent. If the read-back fails, returns nothing, or disagrees with the request, the attachment is DELETED again and the call returns reasonCode VERIFY_FAILED (fixableBy connector) with details.createdAttachmentId, details.parentType, details.parentId and details.verificationState — rolled_back (removed and confirmed), rollback_failed (the id REMAINS and a human must remove it, e.g. with autotask_delete_attachment) or unverified. A failure BEFORE the POST never carries createdAttachmentId, so the two cases are always distinguishable. Every failure also carries details.phase (validate | post | readback | rollback). contentType is reported (stored vs requested) rather than enforced, because Autotask may normalise it. ' +
    'Attributed to the signed-in technician via Autotask resource impersonation; the response reports which resource Autotask actually recorded. ' +
    'Attachments cannot be edited afterwards (Autotask: "It is not possible to update an attachment"); a wrong one is removed with autotask_delete_attachment and re-uploaded. Confirm the filename, title and visibility with the user before calling.'

  const ATTACHMENT_INPUT = {
    filename: z.string().describe('File name Autotask should show, with extension (e.g. "call-2026-09-08-1432.txt"). Bare name only — no path. Max 255 characters.'),
    contentType: z.string().describe(`MIME type of the file. Allowed: ${Object.keys(ATTACHMENT_CONTENT_TYPES).join(', ')}. The filename extension must match.`),
    content: z.string().optional().describe('The file content as UTF-8 text (for .txt/.csv/.md/.json). Use this for call transcripts. Mutually exclusive with contentBase64.'),
    contentBase64: z.string().optional().describe('The file bytes as standard base64 (for PDFs or any binary). Mutually exclusive with content.'),
    title: z.string().optional().describe('Attachment title shown in Autotask; defaults to the filename. Max 255 characters.'),
    customerVisible: z.boolean().optional().describe(`EXPLICIT OPT-IN to customer visibility. Default false = INTERNAL (publish ${ATTACHMENT_PUBLISH.INTERNAL}). true stores publish ${ATTACHMENT_PUBLISH.CUSTOMER_VISIBLE} "All Autotask Users", which Client Portal customers can open — a verbatim call transcript attached this way is exposed to the customer. Leave unset unless the user explicitly asked for the customer to see the file.`),
  }

  /** Live label for a publish id on an attachment entity; null when unresolved. */
  const attachmentPublishLabel = async (client: AutotaskClient, entity: AttachmentEntity, publish: number | null | undefined): Promise<string | null> => {
    if (publish == null) return null
    try {
      return (await client.picklistLabelMap(entity, 'publish')).get(publish) ?? null
    } catch {
      return null
    }
  }

  /**
   * The read-back projection for one entity, from LIVE entityInformation.
   * A failed metadata lookup falls back to the declared per-entity list and
   * says so — it never blocks the read-back, and it can never reintroduce a
   * field from another entity.
   */
  const readBackProjection = async (entity: AttachmentEntity) => {
    try {
      const { snapshot } = await getEntityCapabilitySnapshot(entity)
      return attachmentReadBackFields(entity, snapshot.fields.map((f) => ({ name: f.name, isQueryable: f.isQueryable })))
    } catch {
      return attachmentReadBackFields(entity, null)
    }
  }

  interface RollbackOutcome {
    attempted: boolean
    deleted: boolean
    /** true = re-read found nothing; false = still present; null = re-read failed. */
    confirmedAbsent: boolean | null
    error?: string
  }

  /** DELETE the row this call created, then prove it by re-reading. Never throws. */
  const rollbackAttachment = async (
    client: AutotaskClient,
    K: AttachmentKindConfig,
    parentId: number,
    attachmentId: number,
    fields: string[],
    rid: number,
  ): Promise<RollbackOutcome> => {
    const out: RollbackOutcome = { attempted: true, deleted: false, confirmedAbsent: null }
    try {
      await write.deleteAttachment(K.parentEntity, parentId, attachmentId, rid)
      out.deleted = true
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e)
      return out
    }
    try {
      const again = await client.getAttachmentRecord(K.entity, K.parentField, parentId, attachmentId, fields)
      out.confirmedAbsent = again === null
    } catch {
      out.confirmedAbsent = null
    }
    return out
  }

  // rolled_back requires BOTH an accepted DELETE and a re-read that did not
  // return the row. A DELETE that was accepted while the row is still readable
  // has not removed anything the caller can rely on, so it is rollback_failed.
  const verificationStateOf = (rollback: RollbackOutcome | null): VerificationState =>
    !rollback || !rollback.attempted
      ? 'unverified'
      : rollback.deleted && rollback.confirmedAbsent !== false
        ? 'rolled_back'
        : 'rollback_failed'

  const rollbackSentence = (rollback: RollbackOutcome, attachmentId: number): string =>
    rollback.deleted
      ? rollback.confirmedAbsent === true
        ? `The attachment (id ${attachmentId}) was REMOVED again and the removal confirmed by read-back; nothing remains on the record.`
        : rollback.confirmedAbsent === false
          ? `A DELETE for attachment ${attachmentId} was accepted but a re-read STILL RETURNS IT — treat it as present and remove it by hand.`
          : `A DELETE for attachment ${attachmentId} was accepted but the re-read to confirm it failed — check the record.`
      : `The attachment COULD NOT be removed (${rollback.error ?? 'unknown error'}) — attachment ${attachmentId} REMAINS on the record and a human must delete it now (autotask_delete_attachment, or the Autotask UI).`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addAttachment = async (kind: AttachmentKind, args: any, extra: any): Promise<McpToolResult> => {
    const K = ATTACHMENT_KINDS[kind]
    const TOOL = K.tool
    const parentId: number = args[K.idParam]
    const baseDetails = { [K.idParam]: parentId, parentType: K.parentEntity, parentId }

    // ---- Phase: validate ---------------------------------------------------
    const planned = planAttachment({
      filename: args.filename,
      contentType: args.contentType,
      content: args.content,
      contentBase64: args.contentBase64,
      title: args.title,
      customerVisible: args.customerVisible,
    })
    if (!planned.ok) return failureResult({ ...planned.failure, tool: TOOL, details: { ...planned.failure.details, ...baseDetails, phase: 'validate' as AttachmentPhase } })
    const plan = planned.plan

    let rid: number
    let client: AutotaskClient
    let parentTicketId: number | null
    try {
      rid = await resolveResourceId(emailOf(extra))
      client = new AutotaskClient()
      // The parent must exist. A clean null is a genuine absence; a thrown
      // lookup failure classifies on its own. Nothing has been created yet.
      parentTicketId = await (async () => {
        if (kind === 'ticket') return (await client.getTicket(parentId)) ? parentId : null
        if (kind === 'time_entry') {
          const te = await client.getTimeEntryById(parentId)
          if (!te) return null
          return typeof te.ticketID === 'number' && te.ticketID > 0 ? te.ticketID : -1
        }
        const note = await client.getTicketNoteByNoteId(parentId)
        if (!note) return null
        return typeof note.ticketID === 'number' && note.ticketID > 0 ? note.ticketID : -1
      })()
    } catch (e) {
      return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ...baseDetails, phase: 'validate' as AttachmentPhase, createdAttachmentId: null } })
    }
    if (parentTicketId === null) {
      return failureResult({
        reasonCode: 'PRECONDITION_FAILED',
        message: `No Autotask ${K.parentLabel} has id ${parentId}, so there is nothing to attach the file to. Nothing was uploaded.`,
        evidence: `A query filtered on ${K.parentLabel} id ${parentId} succeeded and returned no rows. A failed lookup raises a different error, so this is a genuine absence, not a broken query.`,
        remediation:
          kind === 'ticket'
            ? 'Check the id — this tool takes the numeric ticket id, not the T-number; resolve a ticket NUMBER with autotask_get_ticket_by_number first.'
            : kind === 'time_entry'
              ? 'Check the id — this tool takes the TimeEntries.id (from autotask_ticket_time_entries or autotask_ticket_activity, where each time entry carries its id), not a ticket id.'
              : 'Check the id — this tool takes the TicketNotes.id (from autotask_ticket_notes or autotask_ticket_activity), not a ticket id.',
        surface: 'autotask',
        tool: TOOL,
        details: { ...baseDetails, phase: 'validate' as AttachmentPhase, createdAttachmentId: null },
      })
    }
    const ticketUrl = parentTicketId > 0 ? getAutotaskTicketUrl(String(parentTicketId)) : undefined

    // ---- Phase: post -------------------------------------------------------
    let res: Awaited<ReturnType<typeof write.createAttachment>>
    try {
      res = await write.createAttachment(K.parentEntity, parentId, buildAttachmentBody(plan), rid)
    } catch (e) {
      // Autotask refused (or the request never completed). Nothing is known to
      // exist; classified by the shared classifier (vendor rejection, auth,
      // transient…), tagged with the phase.
      return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ...baseDetails, phase: 'post' as AttachmentPhase, createdAttachmentId: null } })
    }
    const newId = res.result?.itemId
    if (!newId) {
      return failureResult({
        reasonCode: 'VERIFY_FAILED',
        message: `Autotask accepted the attachment at ${res.pathUsed} but returned no itemId, so a record may exist that this call cannot read back or remove. Do NOT report the file as attached.`,
        evidence: 'A create is only confirmed by the id it returns; without one there is nothing to verify against and nothing to roll back.',
        remediation: `Open the ${K.parentLabel} in Autotask and check its Attachments before retrying — a blind retry can attach the file twice${ticketUrl ? `: ${ticketUrl}` : '.'}`,
        surface: 'autotask',
        tool: TOOL,
        details: { ...baseDetails, phase: 'post' as AttachmentPhase, createdAttachmentId: null, verificationState: 'unverified' as VerificationState, pathUsed: res.pathUsed, pathAttempts: res.attempts },
      })
    }

    // ---- Phase: readback ---------------------------------------------------
    // From here on a record EXISTS. Every exit path below either verifies it
    // or rolls it back, and every failure names it.
    const projection = await readBackProjection(K.entity)
    const created = { createdAttachmentId: newId, pathUsed: res.pathUsed, pathAttempts: res.attempts, readBackProjection: projection }

    const verifyFailed = async (why: {
      summary: string
      evidence: string
      mismatches?: AttachmentMismatch[]
      stored?: StoredAttachmentFields | null
      dataVerified?: boolean | null
      readBackError?: string
    }): Promise<McpToolResult> => {
      const rollback = await rollbackAttachment(client, K, parentId, newId, projection.fields, rid)
      const state = verificationStateOf(rollback)
      return failureResult({
        reasonCode: 'VERIFY_FAILED',
        message: `Autotask accepted the attachment at ${res.pathUsed} (attachment id ${newId} on ${K.parentLabel} ${parentId}), but ${why.summary} ${rollbackSentence(rollback, newId)} Do NOT report the file as attached.`,
        evidence: why.evidence,
        remediation:
          state === 'rolled_back'
            ? 'Nothing remains on the record. Report this envelope to Claude Code as a connector defect (the write itself succeeded; the verification did not). Do not retry with identical arguments until the cause is understood — if the read-back disagreed on publish, this instance did not honour the requested visibility and attachments must be added in the Autotask UI.'
            : `Attachment ${newId} may still be on ${K.parentLabel} ${parentId}${ticketUrl ? ` (${ticketUrl})` : ''}. Remove it with autotask_delete_attachment({ parentType: "${kind}", parentId: ${parentId}, attachmentId: ${newId} }) or in the Autotask UI, then report this envelope to Claude Code as a connector defect.`,
        surface: 'autotask',
        tool: TOOL,
        details: {
          ...baseDetails,
          ...created,
          phase: (rollback.attempted && !rollback.deleted ? 'rollback' : 'readback') as AttachmentPhase,
          verificationState: state,
          rollback,
          ...(why.mismatches ? { mismatches: why.mismatches } : {}),
          ...(why.stored !== undefined ? { stored: why.stored } : {}),
          ...(why.dataVerified !== undefined ? { dataVerified: why.dataVerified } : {}),
          ...(why.readBackError ? { readBackError: why.readBackError } : {}),
        },
      })
    }

    let stored: StoredAttachmentFields | null
    try {
      stored = await client.getAttachmentRecord(K.entity, K.parentField, parentId, newId, projection.fields)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return verifyFailed({
        summary: `the read-back query (${K.parentField} = ${parentId} AND id = ${newId}, fields ${projection.fields.join(',')}) FAILED: ${msg}.`,
        evidence: `The post-write query threw rather than returning rows, so nothing about the stored file — including its visibility — could be compared. Projection source: ${projection.source}${projection.dropped.length ? `; dropped as absent from live entityInformation: ${projection.dropped.join(', ')}` : ''}.`,
        readBackError: msg,
      })
    }
    if (!stored) {
      return verifyFailed({
        summary: `a read-back query for id ${newId} under ${K.parentLabel} ${parentId} returned NO ROW.`,
        evidence: `The post-write query (${K.parentField} = ${parentId} AND id = ${newId}) returned nothing for a record Autotask reported creating moments earlier. Attachment queries must carry the parent id (Kaseya, "Changes to Attachment entities"), so either the row is not under this ${K.parentLabel} or the read cannot see it.`,
        stored: null,
      })
    }

    const verification = verifyAttachmentReadBack(plan, { field: K.parentField, id: parentId }, stored)
    const publishLabel = await attachmentPublishLabel(client, K.entity, stored.publish)
    const visibility = classifyPublishVisibility(stored.publish, publishLabel)

    if (verification.mismatches.length) {
      const parts = verification.mismatches.map((m) => `${m.field} (asked for ${JSON.stringify(m.requested)}, stored ${JSON.stringify(m.actual)})`)
      const publishMismatch = verification.mismatches.some((m) => m.field === 'publish')
      return verifyFailed({
        summary: `the read-back DISAGREES with the request: ${parts.join('; ')}${publishMismatch ? ` — stored publish ${stored.publish ?? 'null'}${publishLabel ? ` "${publishLabel}"` : ''} is ${visibility.scope}` : ''}.`,
        evidence: 'Verified by re-reading the attachment by id after the write and comparing every requested field against the stored value, rather than trusting the HTTP status. Line-ending translation and attachmentType case are the only differences tolerated.' + (publishMismatch ? ' entityInformation reports publish as isReadOnly on this entity; this call is the live test of whether a create can set it, and on this call the answer was no.' : ''),
        mismatches: verification.mismatches,
        stored,
      })
    }

    // Bytes: the child GET is the only read that returns `data`.
    let dataVerified: boolean | null
    let fileSizeStored: number | null = null
    try {
      const content = await client.getAttachmentContent(K.parentEntity, parentId, newId)
      fileSizeStored = content?.fileSize ?? null
      dataVerified = attachmentBytesMatch(plan.base64, content?.data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return verifyFailed({
        summary: `the stored bytes could not be read back (GET ${K.parentEntity}/${parentId}/Attachments/${newId}: ${msg}).`,
        evidence: 'The fields were re-read and matched, but the content comparison — the child GET that returns data — failed, so the stored file is unconfirmed.',
        stored,
        dataVerified: null,
        readBackError: msg,
      })
    }
    if (dataVerified !== true) {
      return verifyFailed({
        summary: dataVerified === false
          ? `the STORED BYTES differ from what was sent (${plan.sizeBytes} bytes sent, fileSize ${fileSizeStored ?? 'unknown'} stored).`
          : `the child GET returned no data field, so the stored bytes could not be compared.`,
        evidence: 'Bytes are compared exactly after base64 decoding; a missing data field is treated as unverified, never as a match.',
        stored,
        dataVerified,
      })
    }

    const attribution = describeAttribution(stored, rid)
    return ok({
      attachment: {
        id: newId,
        [K.idParam]: parentId,
        parentType: K.parentEntity,
        ...(kind !== 'ticket' ? { ticketId: parentTicketId > 0 ? parentTicketId : null } : {}),
        title: stored.title ?? null,
        fullPath: stored.fullPath ?? null,
        attachmentType: stored.attachmentType ?? null,
        contentType: stored.contentType ?? null,
        publish: stored.publish ?? null,
        publishLabel,
        visibility,
        attachDate: stored.attachDate ?? null,
        sizeBytesSent: plan.sizeBytes,
        fileSizeStored,
      },
      verification: {
        verifiedFields: [...verification.verifiedFields, 'data'],
        contentType: verification.contentType,
        ...(verification.contentType.matches === false
          ? { contentTypeNote: `Autotask stored contentType ${JSON.stringify(verification.contentType.stored)} for a request that sent ${JSON.stringify(plan.contentType)}. Reported rather than failed: entityInformation marks contentType read-only and the vendor may normalise it. The file itself is verified by its bytes.` }
          : {}),
        dataVerified: true,
        readBackProjection: projection,
        ...(plan.contentTypeAsPassed ? { contentTypeNormalizedFrom: plan.contentTypeAsPassed } : {}),
        basis: `Re-read by ${K.parentField} + id after the write (publish, parent, title, fullPath, attachmentType) with a projection intersected against live ${K.entity} entityInformation, and the stored bytes fetched through the child URL and compared to what was sent. fileSize is not queryable and is reported as the child GET returned it.`,
      },
      attribution,
      pathUsed: res.pathUsed,
      ...(ticketUrl ? { ticketUrl } : {}),
      activityNote:
        kind === 'ticket'
          ? `Appears in autotask_ticket_activity({ ticketId: ${parentId} }) as sourceEntity TicketAttachments.`
          : parentTicketId > 0
            ? `Appears in autotask_ticket_activity({ ticketId: ${parentTicketId} }) as sourceEntity TicketAttachments with parent.${kind === 'time_entry' ? 'timeEntryId' : 'ticketNoteId'} ${parentId} — Autotask returns attachments parented to a ticket's notes and time entries in the ticket's attachment query.`
            : 'This time entry belongs to a project TASK, not a ticket. autotask_task_activity does not read attachments, so the file will not appear in any connector activity read; verify in the Autotask UI.',
    })
  }

  server.registerTool(
    ATTACHMENT_KINDS.ticket.tool,
    {
      title: 'Autotask: attach a file to a ticket',
      description:
        'WRITE. Uploads a FILE as an attachment on an Autotask TICKET (creates a TicketAttachments record via POST Tickets/{ticketId}/Attachments), attributed to the signed-in technician. Built for attaching RingCentral call transcripts (.txt) to the ticket for the call; also fine for a .csv/.md/.json/.pdf a technician wants on the record. ' +
        ATTACHMENT_SHARED_DESCRIPTION,
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket ID (the numeric id, not the T-number — resolve a T-number with autotask_get_ticket_by_number)'),
        ...ATTACHMENT_INPUT,
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => addAttachment('ticket', args, extra),
  )

  server.registerTool(
    ATTACHMENT_KINDS.time_entry.tool,
    {
      title: 'Autotask: attach a file to a time entry',
      description:
        'WRITE. Uploads a FILE as an attachment on an Autotask TIME ENTRY (creates a TimeEntryAttachments record via POST TimeEntries/{timeEntryId}/Attachments), attributed to the signed-in technician. Built for attaching the RingCentral transcript of a call to the time entry logged for that call. Takes the TimeEntries.id (from autotask_ticket_time_entries / autotask_ticket_activity, or the id returned by autotask_create_time_entry), NOT the ticket id. ' +
        "An attachment on a ticket's time entry shows up in autotask_ticket_activity for that ticket, tagged with parent.timeEntryId. " +
        ATTACHMENT_SHARED_DESCRIPTION,
      inputSchema: {
        timeEntryId: z.number().int().describe('Autotask TIME ENTRY id (TimeEntries.id) — from autotask_ticket_time_entries, autotask_ticket_activity, or the itemId returned by autotask_create_time_entry. Not a ticket id.'),
        ...ATTACHMENT_INPUT,
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => addAttachment('time_entry', args, extra),
  )

  server.registerTool(
    ATTACHMENT_KINDS.ticket_note.tool,
    {
      title: 'Autotask: attach a file to a ticket note',
      description:
        'WRITE. Uploads a FILE as an attachment on an Autotask TICKET NOTE (creates a TicketNoteAttachments record via POST TicketNotes/{ticketNoteId}/Attachments), attributed to the signed-in technician. Takes the TicketNotes.id (from autotask_ticket_notes / autotask_ticket_activity, or the itemId returned by autotask_add_internal_note), NOT the ticket id. ' +
        "An attachment on a ticket's note shows up in autotask_ticket_activity for that ticket, tagged with parent.ticketNoteId. The attachment's own publish is set here and read back independently of the note's publish. " +
        ATTACHMENT_SHARED_DESCRIPTION,
      inputSchema: {
        ticketNoteId: z.number().int().describe('Autotask TICKET NOTE id (TicketNotes.id) — from autotask_ticket_notes, autotask_ticket_activity, or the itemId returned by autotask_add_internal_note. Not a ticket id.'),
        ...ATTACHMENT_INPUT,
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => addAttachment('ticket_note', args, extra),
  )

  // -------------------------------------------------------------------------
  // Attachment delete
  // -------------------------------------------------------------------------
  //
  // Exposed at the owner's direction on 2026-09-08: a create whose
  // verification failed left row 28465 in place and there was no way to remove
  // it through the connector. canDelete is true on all three entities (live).
  // ONE attachment per call, addressed by parent + id, pre-read so the response
  // says what was removed, and confirmed absent by re-read afterwards.
  server.registerTool(
    'autotask_delete_attachment',
    {
      title: 'Autotask: delete an attachment',
      description:
        'WRITE, DESTRUCTIVE. Permanently deletes ONE file attachment from a ticket, time entry or ticket note (DELETE {Tickets|TimeEntries|TicketNotes}/{parentId}/Attachments/{attachmentId}), attributed to the signed-in technician. ' +
        'The attachment is READ FIRST (it must exist under the named parent — a mismatch is PRECONDITION_FAILED and nothing is deleted) so the response can report exactly what was removed (title, fullPath, publish, attachDate, who attached it), and READ AGAIN after the delete: a row that is still returned is reported as VERIFY_FAILED, never as deleted. ' +
        'There is no undo — attachments cannot be edited or restored through the API. Use it to remove a file uploaded to the wrong record, a wrong version, or a rollback_failed leftover from autotask_add_*_attachment (its envelope names the parentType, parentId and createdAttachmentId to pass here). Confirm with the user which attachment before calling.',
      inputSchema: {
        parentType: z.enum(['ticket', 'time_entry', 'ticket_note']).describe('What the attachment hangs off: ticket (TicketAttachments), time_entry (TimeEntryAttachments) or ticket_note (TicketNoteAttachments).'),
        parentId: z.number().int().describe('The parent record id — ticket id, TimeEntries.id or TicketNotes.id, matching parentType.'),
        attachmentId: z.number().int().describe('The attachment id to delete — from autotask_ticket_activity (attachment items carry their id) or from a create envelope\'s details.createdAttachmentId.'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ parentType, parentId, attachmentId }: any, extra: any) => {
      const TOOL = 'autotask_delete_attachment'
      const K = ATTACHMENT_KINDS[PARENT_TYPE_TO_KIND[parentType as keyof typeof PARENT_TYPE_TO_KIND]]
      const baseDetails = { parentType: K.parentEntity, parentId, attachmentId }
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const client = new AutotaskClient()
        const projection = await readBackProjection(K.entity)
        const before = await client.getAttachmentRecord(K.entity, K.parentField, parentId, attachmentId, projection.fields)
        if (!before) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `No attachment with id ${attachmentId} exists under ${K.parentLabel} ${parentId}, so there is nothing to delete. Nothing was changed.`,
            evidence: `A query (${K.parentField} = ${parentId} AND id = ${attachmentId}) on ${K.entity} succeeded and returned no rows. A failed lookup raises a different error, so this is a genuine absence — the id may belong to a different parent or parentType, or the attachment is already gone.`,
            remediation: 'List the parent\'s attachments with autotask_ticket_activity({ ticketId }) — each attachment item carries its id and parent — and call again with the matching parentType, parentId and attachmentId.',
            surface: 'autotask',
            tool: TOOL,
            details: { ...baseDetails, phase: 'validate' as AttachmentPhase },
          })
        }
        const publishLabel = await attachmentPublishLabel(client, K.entity, before.publish)
        const removed = {
          id: attachmentId,
          parentType: K.parentEntity,
          parentId,
          title: before.title ?? null,
          fullPath: before.fullPath ?? null,
          publish: before.publish ?? null,
          publishLabel,
          visibility: classifyPublishVisibility(before.publish, publishLabel),
          attachDate: before.attachDate ?? null,
          attachedByResourceID: before.attachedByResourceID ?? null,
          impersonatorCreatorResourceID: before.impersonatorCreatorResourceID ?? null,
        }

        try {
          await write.deleteAttachment(K.parentEntity, parentId, attachmentId, rid)
        } catch (e) {
          return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ...baseDetails, phase: 'post' as AttachmentPhase, attachment: removed } })
        }

        let after: StoredAttachmentFields | null | undefined
        try {
          after = await client.getAttachmentRecord(K.entity, K.parentField, parentId, attachmentId, projection.fields)
        } catch (e) {
          return failureResult({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask accepted the DELETE for attachment ${attachmentId} on ${K.parentLabel} ${parentId}, but the re-read to confirm its removal failed (${e instanceof Error ? e.message : String(e)}). Do NOT report it as deleted until confirmed.`,
            evidence: 'The post-delete query threw rather than returning rows, so absence could not be confirmed.',
            remediation: `Re-read with autotask_ticket_activity, or check the record in Autotask. Report this envelope to Claude Code.`,
            surface: 'autotask',
            tool: TOOL,
            details: { ...baseDetails, phase: 'readback' as AttachmentPhase, verificationState: 'unverified' as VerificationState, attachment: removed },
          })
        }
        if (after) {
          return failureResult({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask accepted the DELETE for attachment ${attachmentId} on ${K.parentLabel} ${parentId}, but a re-read STILL RETURNS the row. Do NOT report it as deleted.`,
            evidence: `The post-delete query (${K.parentField} = ${parentId} AND id = ${attachmentId}) returned the attachment, so the accepted DELETE did not remove it.`,
            remediation: 'Check the attachment in the Autotask UI and delete it there if it is still present. Report this envelope to Claude Code as a connector defect.',
            surface: 'autotask',
            tool: TOOL,
            details: { ...baseDetails, phase: 'readback' as AttachmentPhase, verificationState: 'unverified' as VerificationState, attachment: removed, stored: after },
          })
        }

        return ok({
          deleted: true,
          verified: true,
          attachment: removed,
          pathUsed: `${K.parentEntity}/${parentId}/Attachments/${attachmentId}`,
          basis: `Pre-read by ${K.parentField} + id, DELETE at the child URL, then re-read by the same query returned no row.`,
          ...(removed.visibility.scope === 'customer_visible' ? { note: 'The deleted attachment was CUSTOMER-VISIBLE (publish 1); a customer who had opened it in the Client Portal will no longer find it.' } : {}),
        })
      } catch (e) { return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ...baseDetails, phase: 'validate' as AttachmentPhase } }) }
    },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // TICKET CHARGES — products and costs billed on a ticket
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // 2026-09-21: a $45 shipping charge could not be put on a ticket, because the
  // connector had 79 Autotask tools and none of them touched TicketCharges —
  // while entityInformation had been reporting TicketCharges.canCreate,
  // canUpdate and canDelete all true the whole time.
  //
  // autotask_entity_create can now reach this entity like any other. These
  // three tools exist ON TOP of that because a charge carries arithmetic and
  // vocabulary the metadata does not explain:
  //
  //   - unitPrice is what the CUSTOMER pays; unitCost is what TCT paid. Getting
  //     them the wrong way round invoices a customer at cost, and the API takes
  //     both without complaint.
  //   - billableAmount and extendedCost are COMPUTED by Autotask (isReadOnly
  //     true) — never sent, always read back, and the read-back is how the
  //     caller learns what the customer will actually be charged.
  //   - chargeType is a required picklist, resolved live rather than hardcoded.
  //     Five hardcoded picklist ids in this repo have been wrong.
  //   - isBillableToCompany is the difference between a charge that reaches an
  //     invoice and one that sits on the ticket for cost tracking only.

  const CHARGE_FIELDS = [
    'id', 'ticketID', 'name', 'description', 'notes', 'chargeType', 'unitQuantity', 'unitPrice', 'unitCost',
    'billableAmount', 'extendedCost', 'isBillableToCompany', 'isBilled', 'datePurchased', 'productID',
    'billingCodeID', 'contractServiceID', 'contractServiceBundleID', 'purchaseOrderNumber',
    'internalPurchaseOrderNumber', 'status', 'createDate', 'creatorResourceID',
  ]

  /** Live field projection for a charge read-back, intersected with this entity's own metadata. */
  const chargeReadBackFields = async (): Promise<string[]> => {
    try {
      const { snapshot } = await getEntityCapabilitySnapshot('TicketCharges')
      const live = new Map(snapshot.fields.map((f) => [f.name.toLowerCase(), f]))
      // Sibling Autotask entities do NOT share a schema — a shared field list
      // 500'd every TimeEntryAttachments read-back on 2026-09-08. Intersect.
      const kept = CHARGE_FIELDS.map((f) => live.get(f.toLowerCase())).filter((f): f is NonNullable<typeof f> => Boolean(f) && f!.isQueryable !== false).map((f) => f.name)
      return kept.length ? Array.from(new Set(['id', 'ticketID', ...kept])) : CHARGE_FIELDS
    } catch {
      // Metadata unavailable is not a reason to skip verification.
      return CHARGE_FIELDS
    }
  }

  const readCharge = async (chargeId: number, ticketId?: number): Promise<Record<string, unknown> | null> => {
    const fields = await chargeReadBackFields()
    const filters: Array<{ field: string; op: string; value?: unknown }> = [{ field: 'id', op: 'eq', value: chargeId }]
    if (ticketId != null) filters.push({ field: 'ticketID', op: 'eq', value: ticketId })
    const res = await autotask().queryConfigEntity('TicketCharges', filters, fields, 1)
    return res.items[0] ?? null
  }

  /** Round-trip a charge's money fields so the response states what the customer pays. */
  const chargeMoney = (row: Record<string, unknown>) => ({
    unitQuantity: row.unitQuantity ?? null,
    unitPrice: row.unitPrice ?? null,
    unitCost: row.unitCost ?? null,
    billableAmountComputedByAutotask: row.billableAmount ?? null,
    extendedCostComputedByAutotask: row.extendedCost ?? null,
    isBillableToCompany: row.isBillableToCompany ?? null,
    isBilled: row.isBilled ?? null,
  })

  const CHARGE_MONEY_NOTE =
    'unitPrice is what the CUSTOMER is charged per unit; unitCost is what TCT paid. billableAmount and extendedCost are computed by Autotask and are returned from the read-back, never sent — they are how you confirm what the customer will actually be billed.'

  server.registerTool(
    'autotask_add_ticket_charge',
    {
      title: 'Autotask: add a product or cost charge to a ticket',
      description:
        'Put a CHARGE on a ticket — a part, a product, shipping, a one-off cost — so it reaches the customer\'s invoice alongside the labour. This is the tool for "add the $45 shipping to that ticket". chargeType is resolved from the LIVE picklist (Operational / Capitalized) rather than assumed, and defaults to Operational, which is the ordinary expensed charge; Capitalized is for an asset being placed on the balance sheet. ' +
        CHARGE_MONEY_NOTE +
        ' Set billable false for a cost you want tracked on the ticket but NOT invoiced. READ-BACK VERIFIED per field: an accepted HTTP status is never reported as success, and the response returns Autotask\'s own computed billableAmount. Attributed to you by resource impersonation.',
      inputSchema: {
        ticketId: z.number().int().describe('The ticket the charge goes on'),
        name: z.string().describe('What the charge is, as it appears on the invoice, e.g. "Overnight shipping"'),
        unitQuantity: z.number().describe('How many. Use 1 for a single flat charge.'),
        unitPrice: z.number().describe('Price per unit CHARGED TO THE CUSTOMER (not TCT\'s cost)'),
        unitCost: z.number().optional().describe('What TCT paid per unit. Optional; used for margin reporting, never billed.'),
        billable: z.boolean().optional().describe('Should this reach the customer\'s invoice? Default true.'),
        description: z.string().optional().describe('Longer description shown with the charge'),
        notes: z.string().optional().describe('Internal notes on the charge'),
        productId: z.number().int().optional().describe('Link to an Autotask Product (autotask_list_products)'),
        billingCodeId: z.number().int().optional().describe('Material/expense billing code (autotask_list_billing_codes)'),
        purchaseOrderNumber: z.string().optional().describe('Customer-facing PO number'),
        internalPurchaseOrderNumber: z.string().optional().describe('TCT-internal PO number'),
        datePurchased: z.string().optional().describe('ISO date the item was purchased. Defaults to today.'),
        chargeType: z.enum(['Operational', 'Capitalized']).optional().describe('Default Operational. Resolved to its live picklist id.'),
      },
    },
    async (args: {
      ticketId: number; name: string; unitQuantity: number; unitPrice: number; unitCost?: number; billable?: boolean
      description?: string; notes?: string; productId?: number; billingCodeId?: number
      purchaseOrderNumber?: string; internalPurchaseOrderNumber?: string; datePurchased?: string; chargeType?: 'Operational' | 'Capitalized'
    }, extra: McpCallExtra) => {
      const TOOL = 'autotask_add_ticket_charge'
      try {
        const rid = await resolveResourceId(await resolveUserEmail(extra?.authInfo?.extra?.sub, extra?.authInfo?.extra?.email))
        const charge = await resolvePicklistId('TicketCharges', 'chargeType', args.chargeType ?? 'Operational', 1)

        const body = definedFields({
          ticketID: args.ticketId,
          name: args.name,
          unitQuantity: args.unitQuantity,
          unitPrice: args.unitPrice,
          unitCost: args.unitCost,
          chargeType: charge.id,
          isBillableToCompany: args.billable ?? true,
          datePurchased: args.datePurchased ?? new Date().toISOString(),
          description: args.description,
          notes: args.notes,
          productID: args.productId,
          billingCodeID: args.billingCodeId,
          purchaseOrderNumber: args.purchaseOrderNumber,
          internalPurchaseOrderNumber: args.internalPurchaseOrderNumber,
        })

        const written = await write.writeAtFirstWorkingPath<{ itemId?: number }>(
          'POST',
          [{ path: `Tickets/${args.ticketId}/Charges`, body }, { path: 'TicketCharges', body }],
          rid,
        )
        const chargeId = written.result?.itemId
        if (!chargeId) {
          return failureResult({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask accepted the charge on ticket ${args.ticketId} but returned no id, so the connector cannot say which row it made.`,
            remediation: 'Do NOT retry blindly — a charge may exist. List the ticket\'s charges with autotask_ticket_charges before adding another.',
            surface: 'autotask', tool: TOOL,
            details: { ticketId: args.ticketId, pathUsed: written.pathUsed, pathAttempts: written.attempts, verificationState: 'unverified' },
          })
        }

        const stored = await readCharge(chargeId, args.ticketId)
        if (!stored) {
          return failureResult({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask returned charge id ${chargeId} on ticket ${args.ticketId}, but a read-back by that id returns nothing.`,
            remediation: 'A charge with that id may exist. Check the ticket in Autotask before creating another.',
            surface: 'autotask', tool: TOOL,
            details: { ticketId: args.ticketId, chargeId, pathUsed: written.pathUsed, verificationState: 'unverified' },
          })
        }

        const verify = verifyWrittenFields(
          definedFields({ ticketID: args.ticketId, name: args.name, unitQuantity: args.unitQuantity, unitPrice: args.unitPrice, unitCost: args.unitCost, chargeType: charge.id, isBillableToCompany: args.billable ?? true }),
          null,
          stored,
        )
        if (verify.mismatches.length) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Charge ${chargeId} was created on ticket ${args.ticketId}, but the read-back does not show ${verify.mismatches.map((m) => m.field).join(', ')} as requested.`,
            evidence: JSON.stringify(verify.mismatches),
            remediation: 'The charge EXISTS — do not add another. Correct it with autotask_update_ticket_charge, or remove it with autotask_delete_ticket_charge.',
            surface: 'autotask', tool: TOOL,
            details: { ticketId: args.ticketId, chargeId, mismatches: verify.mismatches, pathUsed: written.pathUsed, verificationState: 'unverified' },
          })
        }

        return ok({
          chargeId,
          ticketId: args.ticketId,
          ticketUrl: getAutotaskTicketUrl(String(args.ticketId)),
          verified: true,
          charge: stored,
          money: chargeMoney(stored),
          chargeType: { requested: args.chargeType ?? 'Operational', id: charge.id, resolvedFrom: charge.resolvedFrom, ...(charge.warning ? { warning: charge.warning } : {}) },
          pathUsed: written.pathUsed,
          note: CHARGE_MONEY_NOTE,
        })
      } catch (e) { return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ticketId: args.ticketId } }) }
    },
  )

  server.registerTool(
    'autotask_update_ticket_charge',
    {
      title: 'Autotask: correct a charge on a ticket',
      description:
        'Change a charge already on a ticket — fix a price, a quantity, a description, or flip whether it is billable. Only the fields you name are sent. READ-BACK VERIFIED per field, and the response returns Autotask\'s recomputed billableAmount so you can see what the customer will now be charged. ' +
        CHARGE_MONEY_NOTE +
        ' A charge that has ALREADY BEEN BILLED (isBilled true) is reported in the response: changing one does not un-bill or re-issue the invoice it is on, so check that before telling a customer the amount changed.',
      inputSchema: {
        chargeId: z.number().int().describe('The charge id (from autotask_ticket_charges or the create response)'),
        ticketId: z.number().int().describe('The ticket it belongs to — required, so a charge on the wrong ticket is never edited by id alone'),
        name: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        unitQuantity: z.number().optional(),
        unitPrice: z.number().optional().describe('Price per unit CHARGED TO THE CUSTOMER'),
        unitCost: z.number().optional().describe('What TCT paid per unit'),
        billable: z.boolean().optional().describe('Whether it reaches the invoice'),
        purchaseOrderNumber: z.string().optional(),
        internalPurchaseOrderNumber: z.string().optional(),
      },
    },
    async (args: {
      chargeId: number; ticketId: number; name?: string; description?: string; notes?: string
      unitQuantity?: number; unitPrice?: number; unitCost?: number; billable?: boolean
      purchaseOrderNumber?: string; internalPurchaseOrderNumber?: string
    }, extra: McpCallExtra) => {
      const TOOL = 'autotask_update_ticket_charge'
      try {
        const before = await readCharge(args.chargeId, args.ticketId)
        if (!before) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `No charge ${args.chargeId} on ticket ${args.ticketId}.`,
            remediation: `List the ticket's charges with autotask_ticket_charges({ ticketId: ${args.ticketId} }) and use an id from there. Nothing was changed.`,
            surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId, ticketId: args.ticketId },
          })
        }

        const changes = definedFields({
          name: args.name, description: args.description, notes: args.notes,
          unitQuantity: args.unitQuantity, unitPrice: args.unitPrice, unitCost: args.unitCost,
          isBillableToCompany: args.billable,
          purchaseOrderNumber: args.purchaseOrderNumber, internalPurchaseOrderNumber: args.internalPurchaseOrderNumber,
        })
        if (!Object.keys(changes).length) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: 'Name at least one field to change.',
            remediation: 'Pass one or more of name, description, notes, unitQuantity, unitPrice, unitCost, billable or a PO number.',
            surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId },
          })
        }

        const rid = await resolveResourceId(await resolveUserEmail(extra?.authInfo?.extra?.sub, extra?.authInfo?.extra?.email))
        const written = await write.writeAtFirstWorkingPath(
          'PATCH',
          [
            { path: `Tickets/${args.ticketId}/Charges`, body: { id: args.chargeId, ...changes } },
            { path: 'TicketCharges', body: { id: args.chargeId, ...changes } },
          ],
          rid,
        )

        const after = await readCharge(args.chargeId, args.ticketId)
        const verify = after ? verifyWrittenFields(changes, before, after) : { mismatches: Object.entries(changes).map(([field, requested]) => ({ field, requested, actual: undefined })), changedFields: [], unchangedFields: [] }
        if (verify.mismatches.length) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the edit to charge ${args.chargeId} but the read-back does not show ${verify.mismatches.map((m) => m.field).join(', ')} as requested.`,
            evidence: JSON.stringify(verify.mismatches),
            remediation: `Do not retry unchanged. Re-read the charge; a billed charge (isBilled ${String(before.isBilled)}) may not accept every edit.`,
            surface: 'autotask', tool: TOOL,
            details: { chargeId: args.chargeId, ticketId: args.ticketId, mismatches: verify.mismatches, pathUsed: written.pathUsed },
          })
        }

        return ok({
          chargeId: args.chargeId, ticketId: args.ticketId, verified: true,
          changedFields: verify.changedFields,
          before, after,
          money: chargeMoney(after!),
          pathUsed: written.pathUsed,
          ...(before.isBilled === true ? { warning: 'This charge was ALREADY BILLED (isBilled true) before the edit. Autotask does not re-issue or correct an invoice that has gone out — check the invoice before telling the customer the amount has changed.' } : {}),
          note: CHARGE_MONEY_NOTE,
        })
      } catch (e) { return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId, ticketId: args.ticketId } }) }
    },
  )

  server.registerTool(
    'autotask_delete_ticket_charge',
    {
      title: 'Autotask: remove a charge from a ticket',
      description:
        'Remove a charge from a ticket, VERIFIED BY RE-READ — a delete Autotask accepts but does not perform is reported as a failure, never as success. REFUSES a charge that has already been billed (isBilled true) unless you pass force: deleting a billed line removes revenue from an invoice that may already have been sent, and the invoice is not reissued.',
      inputSchema: {
        chargeId: z.number().int().describe('The charge id'),
        ticketId: z.number().int().describe('The ticket it belongs to — required, so a charge on another ticket is never deleted by id alone'),
        force: z.boolean().optional().describe('Delete even though the charge has been billed. Say why in the conversation first; this removes money from an issued invoice.'),
      },
    },
    async (args: { chargeId: number; ticketId: number; force?: boolean }, extra: McpCallExtra) => {
      const TOOL = 'autotask_delete_ticket_charge'
      try {
        const before = await readCharge(args.chargeId, args.ticketId)
        if (!before) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `No charge ${args.chargeId} on ticket ${args.ticketId} — nothing was deleted.`,
            remediation: `List the ticket's charges with autotask_ticket_charges({ ticketId: ${args.ticketId} }).`,
            surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId, ticketId: args.ticketId },
          })
        }
        if (before.isBilled === true && args.force !== true) {
          return failureResult({
            reasonCode: 'POLICY_BLOCKED',
            message: `Charge ${args.chargeId} has already been BILLED, so deleting it removes money from an invoice that may already have gone to the customer.`,
            evidence: `The live charge row reports isBilled true (billableAmount ${String(before.billableAmount)}).`,
            remediation: 'Confirm with whoever owns the invoice first. If the removal is genuinely wanted, call again with force: true — and expect to correct the invoice in Autotask separately, because Autotask does not reissue it.',
            surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId, ticketId: args.ticketId, isBilled: true },
          })
        }

        const rid = await resolveResourceId(await resolveUserEmail(extra?.authInfo?.extra?.sub, extra?.authInfo?.extra?.email))
        const written = await write.writeAtFirstWorkingPath(
          'DELETE',
          [{ path: `Tickets/${args.ticketId}/Charges/${args.chargeId}` }, { path: `TicketCharges/${args.chargeId}` }],
          rid,
        )

        const after = await readCharge(args.chargeId, args.ticketId)
        if (after) {
          return failureResult({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask accepted the DELETE for charge ${args.chargeId}, but a re-read STILL RETURNS it. Do NOT report it as deleted.`,
            evidence: `A follow-up query (ticketID = ${args.ticketId} AND id = ${args.chargeId}) returned the charge.`,
            remediation: 'Check the ticket in the Autotask UI and remove the charge there if it is still present. Report this envelope to Claude Code as a connector defect.',
            surface: 'autotask', tool: TOOL,
            details: { chargeId: args.chargeId, ticketId: args.ticketId, phase: 'readback', verificationState: 'unverified', stored: after },
          })
        }

        return ok({
          deleted: true, verified: true, chargeId: args.chargeId, ticketId: args.ticketId,
          deletedCharge: before, money: chargeMoney(before),
          pathUsed: written.pathUsed,
          basis: 'Pre-read by ticketID + id, DELETE at the child URL, then a re-read by the same query returned no row.',
          ...(before.isBilled === true ? { warning: 'The deleted charge had already been BILLED. The invoice it is on is NOT reissued by Autotask — correct it separately.' } : {}),
        })
      } catch (e) { return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { chargeId: args.chargeId, ticketId: args.ticketId } }) }
    },
  )

  server.registerTool(
    'autotask_ticket_charges',
    {
      title: 'Autotask: charges on a ticket',
      description:
        'List the CHARGES on a ticket — products, parts, shipping and one-off costs billed alongside the labour — with Autotask\'s own computed billableAmount and extendedCost per line, a billed/unbilled split, and a total. Call this before adding a charge, so a duplicate is not created, and before quoting a customer a ticket total, because ticket time entries do NOT include these. READ-ONLY.',
      inputSchema: {
        ticketId: z.number().int().describe('The ticket'),
        includeBilled: z.boolean().optional().describe('Include charges already billed (default true)'),
      },
    },
    async ({ ticketId, includeBilled }: { ticketId: number; includeBilled?: boolean }) => {
      const TOOL = 'autotask_ticket_charges'
      try {
        const fields = await chargeReadBackFields()
        const res = await autotask().queryConfigEntity('TicketCharges', [{ field: 'ticketID', op: 'eq', value: ticketId }], fields, 500)
        const rows = (includeBilled ?? true) ? res.items : res.items.filter((r) => r.isBilled !== true)
        const sum = (pick: (r: Record<string, unknown>) => unknown) =>
          rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0)
        return ok({
          ticketId,
          ticketUrl: getAutotaskTicketUrl(String(ticketId)),
          count: rows.length,
          hasMore: res.hasMore,
          totals: {
            billableAmount: sum((r) => r.billableAmount),
            extendedCost: sum((r) => r.extendedCost),
            billedLines: rows.filter((r) => r.isBilled === true).length,
            unbilledLines: rows.filter((r) => r.isBilled !== true).length,
          },
          charges: rows,
          note: 'Totals are Autotask\'s own computed billableAmount / extendedCost summed across the returned lines — they are not recalculated here. Ticket TIME entries are separate; autotask_ticket_time_entries covers those.',
        })
      } catch (e) { return toolFailure(e, { surface: 'autotask', tool: TOOL, details: { ticketId } }) }
    },
  )

}
