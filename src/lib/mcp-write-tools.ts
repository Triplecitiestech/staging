// src/lib/mcp-write-tools.ts
//
// Registers the connector's WRITE tools and resolves the signed-in user to
// their Autotask resource so every write is impersonated (attributed to the
// real person). Identity flow: OAuth token -> WorkOS user email -> Autotask
// resource id -> ImpersonationResourceId header.

import { z } from 'zod'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import * as write from '@/lib/autotask-write'

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
async function resolveResourceId(email?: string): Promise<number> {
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
function fail(err: unknown) { const m = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true } }
function okTicket(ticketId: number, data: unknown) { return ok({ result: data, ticketUrl: getAutotaskTicketUrl(String(ticketId)) }) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWriteTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  server.registerTool(
    'autotask_create_ticket',
    {
      title: 'Autotask: create ticket',
      description: 'WRITE. Create a NEW Autotask ticket, attributed to the signed-in tech. Required: companyID, title, queueID, status, priority (status/priority/queueID are numeric picklist ids — use autotask_ticket_statuses for status and autotask_search_companies for companyID). Optional: description, dueDateTime, contactID, assignedResourceID, ticketType. Note: Autotask requires dueDateTime unless the ticket category supplies a default, so include it if the create is rejected for a missing due date. Nothing is defaulted server-side. Confirm the details with the user before calling. Returns the new ticket id and ticketNumber.',
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
        ticketType: z.number().int().optional().describe('Ticket type picklist id; Autotask defaults to Service Request if omitted'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ companyID, title, queueID, status, priority, description, dueDateTime, contactID, assignedResourceID, ticketType }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const res = await write.createTicket({ companyID, title, queueID, status, priority, description, dueDateTime, contactID, assignedResourceID, ticketType }, rid)
        const newId = res?.itemId
        if (!newId) return ok({ result: res, note: 'Ticket create returned no itemId.' })
        const ticket = await new AutotaskClient().getTicket(newId)
        return ok({ id: newId, ticketNumber: ticket?.ticketNumber ?? null, ticketUrl: getAutotaskTicketUrl(String(newId)), ticket })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_add_internal_note',
    { title: 'Autotask: add internal note', description: 'WRITE. Add an INTERNAL-only note to a ticket, attributed to the signed-in tech. Only call after the user has reviewed and approved the exact text.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), note: z.string().describe('Note body'), title: z.string().optional().describe('Optional note title') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, note, title }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return okTicket(ticketId, await write.createTicketNote(ticketId, { title: title ?? 'Internal note', description: note, publish: 2 }, rid)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_add_customer_note',
    { title: 'Autotask: add customer-facing note', description: 'WRITE, CUSTOMER-FACING. Posts an externally-visible note that notifies the ticket contact(s), attributed to the signed-in tech. Confirm the exact wording with the user before calling.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), message: z.string().describe('Message to the customer'), title: z.string().optional().describe('Optional note title') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, message, title }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return okTicket(ticketId, await write.createTicketNote(ticketId, { title: title ?? 'Update', description: message, publish: 1 }, rid)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_create_time_entry',
    { title: 'Autotask: create time entry', description: 'WRITE, BILLABLE. Log time on a ticket, attributed to the signed-in technician. summaryNotes should follow TCT format: Actions Taken; Root Cause/Findings; Resolution; Next Steps/Escalation; Status - prose, no bullets, do not restate the issue. Only call after the user approves the hours and text.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), hoursWorked: z.number().positive().describe('Hours worked'), summaryNotes: z.string().describe('Customer-visible work summary in TCT format'), internalNotes: z.string().optional().describe('Internal-only notes'), dateWorked: z.string().optional().describe('YYYY-MM-DD; defaults to today'), billingCodeId: z.number().int().optional().describe('Autotask billing code id, if required'), roleId: z.number().int().optional().describe('Autotask role id, if required') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, hoursWorked, summaryNotes, internalNotes, dateWorked, billingCodeId, roleId }: any, extra: any) => {
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const dw = dateWorked ?? new Date().toISOString().slice(0, 10)
        return okTicket(ticketId, await write.createTicketTimeEntry({ ticketID: ticketId, resourceID: rid, dateWorked: dw, hoursWorked, summaryNotes, internalNotes, billingCodeID: billingCodeId, roleID: roleId }, rid))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_assign_ticket',
    { title: 'Autotask: assign ticket', description: 'WRITE. Set a ticket\'s assigned resource. Use autotask_find_resource to resolve a name/email to a resourceId. Confirm with the user first.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), resourceId: z.number().int().describe('Autotask resource ID to assign the ticket to') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, resourceId }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return okTicket(ticketId, await write.updateTicket(ticketId, { assignedResourceID: resourceId }, rid)) } catch (e) { return fail(e) }
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
