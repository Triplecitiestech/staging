// src/lib/autotask-write.ts
//
// Write operations for the MCP connector, using a SEPARATE, write-scoped
// Autotask API user (AUTOTASK_WRITE_*), kept apart from the read client.
// Reuses the same zone base URL (AUTOTASK_API_BASE_URL).
//
// Every write passes an ImpersonationResourceId header so Autotask attributes
// the note/time entry to the ACTUAL signed-in technician (resolved from their
// login), not the API user. That is what puts the real person's name on the
// ticket history and on customer-facing notifications.
//
// TicketNotes publish: 1 = External/customer-visible, 2 = Internal only.

const RAW_BASE = process.env.AUTOTASK_API_BASE_URL || ''

function baseUrl(): string {
  if (!RAW_BASE) throw new Error('AUTOTASK_API_BASE_URL is not set.')
  return RAW_BASE.replace(/\/$/, '')
}

function writeHeaders(impersonationResourceId?: number): Record<string, string> {
  const UserName = process.env.AUTOTASK_WRITE_USERNAME
  const Secret = process.env.AUTOTASK_WRITE_SECRET
  const ApiIntegrationCode = process.env.AUTOTASK_WRITE_INTEGRATION_CODE
  if (!UserName || !Secret || !ApiIntegrationCode) {
    throw new Error(
      'Autotask write credentials are not configured. Set AUTOTASK_WRITE_USERNAME, AUTOTASK_WRITE_SECRET, and AUTOTASK_WRITE_INTEGRATION_CODE.'
    )
  }
  const h: Record<string, string> = { 'Content-Type': 'application/json', ApiIntegrationCode, UserName, Secret }
  if (impersonationResourceId) h.ImpersonationResourceId = String(impersonationResourceId)
  return h
}

async function post<T = unknown>(path: string, body: unknown, imp?: number): Promise<T> {
  const res = await fetch(`${baseUrl()}/v1.0/${path}`, { method: 'POST', headers: writeHeaders(imp), body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Autotask POST ${path} failed (${res.status}): ${text.slice(0, 500)}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function patch<T = unknown>(path: string, body: unknown, imp?: number): Promise<T> {
  const res = await fetch(`${baseUrl()}/v1.0/${path}`, { method: 'PATCH', headers: writeHeaders(imp), body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Autotask PATCH ${path} failed (${res.status}): ${text.slice(0, 500)}`)
  return (text ? JSON.parse(text) : {}) as T
}

export async function createTicketNote(
  ticketID: number,
  data: { title: string; description: string; publish?: number; noteType?: number },
  impersonationResourceId?: number
): Promise<unknown> {
  const payload = { ticketID, title: data.title, description: data.description, noteType: data.noteType ?? 1, publish: data.publish ?? 1 }
  try {
    return await post(`Tickets/${ticketID}/Notes`, payload, impersonationResourceId)
  } catch {
    return await post('TicketNotes', payload, impersonationResourceId)
  }
}

// Create a ticket time entry. Autotask requires roleID for ticket time entries,
// and SERVICE tickets additionally require a start AND stop time — so when
// startDateTime/stopDateTime are supplied they are sent as startDateTime/
// endDateTime and hoursWorked is derived from the interval if not given.
export async function createTicketTimeEntry(
  data: {
    ticketID: number;
    resourceID: number;
    roleID: number;
    hoursWorked?: number;
    dateWorked?: string;
    startDateTime?: string;
    stopDateTime?: string;
    summaryNotes?: string;
    internalNotes?: string;
    billingCodeID?: number;
  },
  impersonationResourceId?: number
): Promise<unknown> {
  const body: Record<string, unknown> = {
    ticketID: data.ticketID,
    resourceID: data.resourceID,
    roleID: data.roleID,
    summaryNotes: data.summaryNotes ?? '',
    internalNotes: data.internalNotes ?? '',
  }
  if (data.startDateTime && data.stopDateTime) {
    // Service-ticket path: Autotask requires start + stop.
    body.startDateTime = data.startDateTime
    body.endDateTime = data.stopDateTime
    body.dateWorked = data.dateWorked ?? data.startDateTime.slice(0, 10)
    const derived = (new Date(data.stopDateTime).getTime() - new Date(data.startDateTime).getTime()) / 3_600_000
    body.hoursWorked = data.hoursWorked ?? Math.round(derived * 100) / 100
  } else {
    // Non-service / task path: hours-based.
    body.dateWorked = data.dateWorked ?? new Date().toISOString().slice(0, 10)
    if (data.hoursWorked != null) body.hoursWorked = data.hoursWorked
  }
  if (data.billingCodeID) body.billingCodeID = data.billingCodeID
  return post('TimeEntries', body, impersonationResourceId)
}

export async function updateTicket(ticketID: number, fields: Record<string, unknown>, impersonationResourceId?: number): Promise<unknown> {
  return patch('Tickets', { id: ticketID, ...fields }, impersonationResourceId)
}

// Create a new ticket. Autotask enforces title + companyID + status + priority,
// plus queueID (per the ticket category's queue setting) and dueDateTime (unless
// the category supplies a default). We require the picklist fields explicitly and
// default NOTHING — omitted optional fields are simply not sent. Autotask returns
// { itemId } for the new ticket id.
export async function createTicket(
  data: {
    companyID: number;
    title: string;
    queueID: number;
    status: number;
    priority: number;
    description?: string;
    dueDateTime?: string;
    contactID?: number;
    assignedResourceID?: number;
    ticketType?: number;
  },
  impersonationResourceId?: number
): Promise<{ itemId?: number }> {
  const body: Record<string, unknown> = {
    companyID: data.companyID,
    title: data.title,
    queueID: data.queueID,
    status: data.status,
    priority: data.priority,
  }
  if (data.description !== undefined) body.description = data.description
  if (data.dueDateTime !== undefined) body.dueDateTime = data.dueDateTime
  if (data.contactID !== undefined) body.contactID = data.contactID
  if (data.assignedResourceID !== undefined) body.assignedResourceID = data.assignedResourceID
  if (data.ticketType !== undefined) body.ticketType = data.ticketType
  return post<{ itemId?: number }>('Tickets', body, impersonationResourceId)
}

// ============================================
// CONFIG WRITES (staged-write engine only)
// ============================================
// Admin-configuration writes (categories, holidays, business hours, catalog
// pricing, UDF list items, …). These are ONLY called by the staged-write
// engine (src/lib/connector/staged-writes.ts) AFTER a human approved the
// change on /admin/connector/staged-writes — never directly by an MCP tool.
// No ImpersonationResourceId: Autotask impersonation covers tickets/notes/
// time entries, not admin config; the approver is recorded in the
// connector_staged_writes audit row instead.

async function del(path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/v1.0/${path}`, { method: 'DELETE', headers: writeHeaders() })
  const text = await res.text()
  if (!res.ok) throw new Error(`Autotask DELETE ${path} failed (${res.status}): ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : {}
}

/** PATCH an entity (root or parent/child path). Body must include id. */
export async function patchConfigEntity(entityPath: string, body: Record<string, unknown>): Promise<unknown> {
  return patch(entityPath, body)
}

/** POST (create) an entity at a root or parent/child path. */
export async function createConfigEntity(entityPath: string, body: Record<string, unknown>): Promise<unknown> {
  return post(entityPath, body)
}

/** DELETE an entity by full path, e.g. HolidaySets/3/Holidays/17 */
export async function deleteConfigEntity(entityPathWithId: string): Promise<unknown> {
  return del(entityPathWithId)
}
