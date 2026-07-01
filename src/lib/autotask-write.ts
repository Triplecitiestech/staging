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

export async function createTicketTimeEntry(
  data: { ticketID: number; resourceID: number; dateWorked: string; hoursWorked: number; summaryNotes?: string; internalNotes?: string; billingCodeID?: number; roleID?: number },
  impersonationResourceId?: number
): Promise<unknown> {
  const body: Record<string, unknown> = {
    ticketID: data.ticketID,
    resourceID: data.resourceID,
    dateWorked: data.dateWorked,
    hoursWorked: data.hoursWorked,
    summaryNotes: data.summaryNotes ?? '',
    internalNotes: data.internalNotes ?? '',
  }
  if (data.billingCodeID) body.billingCodeID = data.billingCodeID
  if (data.roleID) body.roleID = data.roleID
  return post('TimeEntries', body, impersonationResourceId)
}

export async function updateTicket(ticketID: number, fields: Record<string, unknown>, impersonationResourceId?: number): Promise<unknown> {
  return patch('Tickets', { id: ticketID, ...fields }, impersonationResourceId)
}
