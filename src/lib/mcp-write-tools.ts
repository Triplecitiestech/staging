// src/lib/mcp-write-tools.ts
//
// Registers the connector's WRITE tools and resolves the signed-in user to
// their Autotask resource so every write is impersonated (attributed to the
// real person). Identity flow: OAuth token -> WorkOS user email -> Autotask
// resource id -> ImpersonationResourceId header.

import { z } from 'zod'
import { AutotaskClient } from '@/lib/autotask'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWriteTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  server.registerTool(
    'autotask_add_internal_note',
    { title: 'Autotask: add internal note', description: 'WRITE. Add an INTERNAL-only note to a ticket, attributed to the signed-in tech. Only call after the user has reviewed and approved the exact text.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), note: z.string().describe('Note body'), title: z.string().optional().describe('Optional note title') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, note, title }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return ok(await write.createTicketNote(ticketId, { title: title ?? 'Internal note', description: note, publish: 2 }, rid)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_add_customer_note',
    { title: 'Autotask: add customer-facing note', description: 'WRITE, CUSTOMER-FACING. Posts an externally-visible note that notifies the ticket contact(s), attributed to the signed-in tech. Confirm the exact wording with the user before calling.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), message: z.string().describe('Message to the customer'), title: z.string().optional().describe('Optional note title') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, message, title }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return ok(await write.createTicketNote(ticketId, { title: title ?? 'Update', description: message, publish: 1 }, rid)) } catch (e) { return fail(e) }
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
        return ok(await write.createTicketTimeEntry({ ticketID: ticketId, resourceID: rid, dateWorked: dw, hoursWorked, summaryNotes, internalNotes, billingCodeID: billingCodeId, roleID: roleId }, rid))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_assign_ticket',
    { title: 'Autotask: assign ticket', description: 'WRITE. Set a ticket\'s assigned resource. Use autotask_find_resource to resolve a name/email to a resourceId. Confirm with the user first.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), resourceId: z.number().int().describe('Autotask resource ID to assign the ticket to') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, resourceId }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return ok(await write.updateTicket(ticketId, { assignedResourceID: resourceId }, rid)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_set_ticket_status',
    { title: 'Autotask: set ticket status', description: 'WRITE. Set a ticket\'s status (numeric picklist value). Confirm with the user first.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID'), status: z.number().int().describe('Autotask ticket status picklist value') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ ticketId, status }: any, extra: any) => {
      try { const rid = await resolveResourceId(emailOf(extra)); return ok(await write.updateTicket(ticketId, { status }, rid)) } catch (e) { return fail(e) }
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
