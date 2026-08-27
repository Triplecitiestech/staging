// src/lib/mcp-write-tools.ts
//
// Registers the connector's WRITE tools and resolves the signed-in user to
// their Autotask resource so every write is impersonated (attributed to the
// real person). Identity flow: OAuth token -> WorkOS user email -> Autotask
// resource id -> ImpersonationResourceId header.

import { z } from 'zod'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import { classifyPublishVisibility, decideNotificationVerdict } from '@/lib/autotask-activity'
import * as write from '@/lib/autotask-write'
import { failureResult, toolFailure, type McpToolResult } from '@/lib/connector/failure-envelope'
import { definedFields, splitByQueryability, verifyWrittenFields } from '@/lib/mcp-project-tools'

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
 * A false verdict is deliberately FAIL-CLOSED: notifications may be dispatched
 * asynchronously, so "not observed" is not proof that none will ever fire — but
 * treating unobserved as not-notified is the only safe direction, because the
 * failure being fixed is a customer being told she was contacted when she was
 * not.
 */
async function observeCustomerNotification(
  client: AutotaskClient,
  ticketId: number,
  /** null means the PRE-write read failed — not that the ticket had no prior notification. */
  before: { lastCustomerNotificationDateTime: string | null } | null,
  writeStartedAt: Date,
) {
  const after = await client.getTicketActivityStamps(ticketId)
  const prev = before?.lastCustomerNotificationDateTime ?? null
  const now = after?.lastCustomerNotificationDateTime ?? null

  // Verdict logic is pure and separately tested (decideNotificationVerdict) —
  // notably, a MISSING baseline can never read as "previously null", or a ticket
  // notified last week would look freshly notified.
  const baselineEstablished = before !== null
  const { customerNotified: advanced } = decideNotificationVerdict({ baselineEstablished, before: prev, after: now })

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
      basis: 'Tickets.lastCustomerNotificationDateTime, read before and after the write',
      baselineEstablished,
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
      : `NO customer notification was observed. Autotask's lastCustomerNotificationDateTime did not advance (${prev ?? 'null'} before, ${now ?? 'null'} after). TELL THE USER THE CUSTOMER HAS NOT BEEN NOTIFIED — the note is on the ticket, the contact has not been emailed. The REST API has no field to request a notification, so this tool cannot send one. To reach the contact: notify from the note form in Autotask (the Notification panel), or have an Autotask Event configured to fire on customer-facing note creation. Notifications can be dispatched asynchronously, so if you want to re-check rather than act, call autotask_notification_history({ ticketId: ${ticketId} }).`,
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
        'THIS TOOL DOES NOT NOTIFY ANYONE AND CANNOT. The Autotask REST TicketNotes entity has no field for notification recipients or the UI\'s Notify behaviour (12 fields, verified against Kaseya docs and this instance\'s live entityInformation); recipients are chosen in the UI-only Notification panel. Whether the contact receives an email depends entirely on an Autotask Event (workflow rule) configured by an admin — which this tool neither controls nor can read. ' +
        'What the response DOES report, by reading Autotask back after the write: the created note id, the publish level with its live label, and customerNotified — an OBSERVATION derived from Tickets.lastCustomerNotificationDateTime before vs after the write. When customerNotified is false, the contact has NOT been emailed: say so plainly and never tell the user the customer was notified. Posting this note is not the same as contacting the customer. Confirm the exact wording with the user before calling.',
      inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), message: z.string().describe('Message to the customer'), title: z.string().optional().describe('Optional note title') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, message, title }: any, extra: any) => {
      try {
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
    { title: 'Autotask: create time entry', description: 'WRITE, BILLABLE. Log time on a ticket, attributed to the signed-in technician. roleId is REQUIRED (resolve a role name via autotask_list_roles). Autotask SERVICE tickets require a start and stop time — pass startDateTime + stopDateTime (ISO 8601); hoursWorked is then optional and derived from the interval. For non-service tickets you may instead pass hoursWorked. summaryNotes follows TCT format: Actions Taken; Root Cause/Findings; Resolution; Next Steps/Escalation; Status - prose, no bullets, do not restate the issue. NOTE: summaryNotes does NOT populate the ticket Resolution field (which drives the customer completion email) — set appendSummaryToResolution=true (or use autotask_set_ticket_resolution) to write it there. Only call after the user approves the hours and text.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), roleId: z.number().int().describe('Autotask role id (REQUIRED) — from autotask_list_roles'), summaryNotes: z.string().describe('Customer-visible work summary in TCT format'), startDateTime: z.string().optional().describe('Work start, ISO 8601 — REQUIRED for Service tickets'), stopDateTime: z.string().optional().describe('Work stop, ISO 8601 — REQUIRED for Service tickets'), hoursWorked: z.number().positive().optional().describe('Hours worked; optional if start/stop given (derived from the interval)'), internalNotes: z.string().optional().describe('Internal-only notes'), dateWorked: z.string().optional().describe('YYYY-MM-DD; defaults to the start date or today'), billingCodeId: z.number().int().optional().describe('Autotask billing code id (work type), if required'), appendSummaryToResolution: z.boolean().optional().describe('Also append summaryNotes to the ticket Resolution field (mirrors Autotask\'s checkbox) so the customer completion email has content') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, roleId, summaryNotes, startDateTime, stopDateTime, hoursWorked, internalNotes, dateWorked, billingCodeId, appendSummaryToResolution }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const result = await write.createTicketTimeEntry({ ticketID: ticketId, resourceID: rid, roleID: roleId, hoursWorked, dateWorked, startDateTime, stopDateTime, summaryNotes, internalNotes, billingCodeID: billingCodeId }, rid)
        if (appendSummaryToResolution && summaryNotes) await appendResolution(ticketId, summaryNotes, rid)
        return okTicket(ticketId, result)
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
        'VISIBILITY TRAP 1 — companyID RE-PARENTS THE TICKET: it moves the ticket to a different customer, which changes the contacts, contracts and notification recipients Autotask associates with it, and changes who can see it in the client portal. Tell the user before and after. A contactID or contractID belonging to the OLD company will not survive the move — set them in the same call, or expect Autotask to reject or clear them. ' +
        'VISIBILITY TRAP 2 — contactID CHANGES WHO AUTOTASK EMAILS about this ticket. The new contact starts receiving ticket correspondence and the previous one stops. Confirm the person before calling. ' +
        'Confirm the exact field values with the user before calling.',
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket ID (the numeric id, not the T-number — resolve a T-number with autotask_get_ticket_by_number)'),
        companyID: z.number().int().optional().describe('RE-PARENTS the ticket to this company id — changes notification recipients and portal visibility. Resolve with autotask_search_companies. A contact/contract from the old company will not survive the move.'),
        contactID: z.number().int().optional().describe('Ticket contact — CHANGES WHO AUTOTASK EMAILS about this ticket. Must belong to the ticket\'s company. Resolve with autotask_company_contacts.'),
        title: z.string().optional().describe('Replacement ticket title. Replaces the existing title entirely.'),
        description: z.string().optional().describe('Replacement ticket description. Replaces the existing text entirely — pass the full corrected description, not just the change.'),
        queueID: z.number().int().optional().describe('Queue picklist value — resolve with autotask_list_queues. Moving a ticket between queues changes which technicians see it.'),
        priority: z.number().int().optional().describe('Priority picklist value — resolve with autotask_list_priorities.'),
        ticketType: z.number().int().optional().describe('Ticket type picklist value — resolve with autotask_entity_picklist({ entity: "Tickets", field: "ticketType" }).'),
        dueDateTime: z.string().optional().describe('Due date/time, ISO 8601. Drives SLA and due-date reporting.'),
        contractID: z.number().int().optional().describe('Contract id to bill this ticket against — resolve with autotask_list_contracts. Must belong to the ticket\'s company.'),
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
            message: `No change was requested for ticket ${ticketId}: at least one of companyID, contactID, title, description, queueID, priority, ticketType, dueDateTime or contractID must be supplied. Nothing was written.`,
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

        const result = await write.updateTicket(ticketId, requested, rid)

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
                reparentedNote: `TICKET RE-PARENTED: ticket ${ticketId} moved from company ${before.companyID ?? 'none'} to company ${after.companyID ?? 'none'}. Its notification recipients, available contacts and contracts, and client-portal visibility all follow the new company. TELL THE USER. Check that contactID (${after.contactID ?? 'none'}) and contractID (${after.contractID ?? 'none'}) still belong to the new company.`,
              }
            : {}),
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
}
