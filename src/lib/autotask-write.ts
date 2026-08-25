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

type WriteMethod = 'POST' | 'PATCH' | 'DELETE'

interface RawWriteResponse {
  ok: boolean
  status: number
  text: string
}

/**
 * One write request, returning the STATUS rather than only throwing.
 *
 * The status is what lets writeAtFirstWorkingPath() below distinguish "this URL
 * does not exist" from "this URL exists and rejected the payload" — a
 * distinction whose absence manufactured the stale "task PATCH is BLOCKED"
 * claim. post()/patch() keep throwing exactly the message they always did, so
 * every existing caller and every error classifier is unaffected.
 *
 * The AbortSignal.timeout is new as of 2026-08-25 and deliberate: these helpers
 * were the last external fetches in the connector without one, and a hung
 * Autotask write would otherwise block the whole serverless function (see the
 * critical gotcha in CLAUDE.md). It changes nothing about a request that
 * completes.
 */
async function request(method: WriteMethod, path: string, body: unknown, imp?: number): Promise<RawWriteResponse> {
  const res = await fetch(`${baseUrl()}/v1.0/${path}`, {
    method,
    headers: writeHeaders(imp),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

/** Byte-compatible with the error these helpers have always thrown. */
function writeError(method: WriteMethod, path: string, res: RawWriteResponse): Error {
  return new Error(`Autotask ${method} ${path} failed (${res.status}): ${res.text.slice(0, 500)}`)
}

function parseBody<T>(text: string): T {
  return (text ? JSON.parse(text) : {}) as T
}

async function post<T = unknown>(path: string, body: unknown, imp?: number): Promise<T> {
  const res = await request('POST', path, body, imp)
  if (!res.ok) throw writeError('POST', path, res)
  return parseBody<T>(res.text)
}

async function patch<T = unknown>(path: string, body: unknown, imp?: number): Promise<T> {
  const res = await request('PATCH', path, body, imp)
  if (!res.ok) throw writeError('PATCH', path, res)
  return parseBody<T>(res.text)
}

// ---------------------------------------------------------------------------
// Addressing an Autotask child entity: try paths, but NEVER swallow a rejection
// ---------------------------------------------------------------------------
//
// Autotask exposes some entities only beneath their parent
// (Companies/{id}/Projects, Projects/{id}/Tasks, Tasks/{id}/Notes) and some at
// the root as well. Which form a given entity accepts for a given METHOD is not
// derivable from entityInformation — the metadata is served at the root path for
// child entities too — so the working path has to be established by trying.
//
// THE RULE THAT MATTERS, and the reason this helper exists at all:
//
//   A 404 means the PATH is wrong → try the next candidate.
//   Any other failure means the path was RIGHT and the REQUEST was wrong
//   → stop immediately and surface THAT error.
//
// The previous implementation (AutotaskClient.updateTaskStatus) fell through on
// every error and threw only the LAST one. So a 500 "Data violation" from the
// correct parent-scoped URL was discarded, and the 404 from a later candidate —
// `ProjectTasks`, an entity that does not exist on this instance at all — became
// the recorded symptom. That is how "task PATCH returns 404 on all 3 entity
// paths" got written into CLAUDE.md as a vendor limitation when the API reports
// Tasks.canUpdate true.
//
// Every attempt is returned either way, so the response can state which URL
// actually worked instead of leaving the next reader to re-derive it.

export interface WriteAttempt {
  path: string
  method: WriteMethod
  status: number
  /** ok = accepted · path-not-found = 404, moved on · rejected = the path exists and refused this payload */
  outcome: 'ok' | 'path-not-found' | 'rejected'
  error?: string
}

export interface PathResolvedWrite<T> {
  result: T
  /** The path Autotask accepted. Report it — it is the answer to "how is this entity addressed?" */
  pathUsed: string
  attempts: WriteAttempt[]
}

/** One candidate URL and the body to send to it (they differ: a parent-scoped path supplies the parent id). */
export interface WriteCandidate {
  path: string
  body?: unknown
}

export async function writeAtFirstWorkingPath<T = unknown>(
  method: WriteMethod,
  candidates: WriteCandidate[],
  imp?: number,
): Promise<PathResolvedWrite<T>> {
  const attempts: WriteAttempt[] = []

  for (const candidate of candidates) {
    const res = await request(method, candidate.path, candidate.body, imp)

    if (res.ok) {
      attempts.push({ path: candidate.path, method, status: res.status, outcome: 'ok' })
      return { result: parseBody<T>(res.text), pathUsed: candidate.path, attempts }
    }

    if (res.status === 404) {
      attempts.push({ path: candidate.path, method, status: 404, outcome: 'path-not-found' })
      continue
    }

    // The path resolved and Autotask refused the payload. Falling through here
    // would hide the only informative error in the whole exchange.
    attempts.push({
      path: candidate.path,
      method,
      status: res.status,
      outcome: 'rejected',
      error: res.text.slice(0, 500),
    })
    throw writeError(method, candidate.path, res)
  }

  // Every candidate 404'd. This is the ONLY circumstance in which a path-level
  // 404 is the real answer, and the message names every URL tried so the claim
  // can be checked rather than believed.
  throw new Error(
    `Autotask ${method} failed: none of the candidate paths exist (${attempts
      .map((a) => `${a.path} → 404`)
      .join(', ')}). Every attempt returned 404, so this is a path/entity problem, not a payload problem.`
  )
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

/**
 * Fields an existing ticket note can be edited through. Deliberately a closed
 * set of the three the API reports writable and a human would want to correct —
 * live entityInformation 2026-08-10: TicketNotes.canUpdate true, with
 * description / title / publish all isReadOnly false.
 *
 * noteType and ticketID are writable upstream too and are NOT here on purpose:
 * re-typing a note or moving it to another ticket are different operations from
 * fixing its text, and neither is what the correction-note problem needs.
 */
export interface TicketNoteEdit {
  description?: string
  title?: string
  publish?: number
}

/**
 * Update an EXISTING ticket note in place.
 *
 * PATCH, never PUT, and carrying ONLY the fields the caller supplied. Autotask
 * documents the difference explicitly: PATCH "will update only the properties of
 * the target that you designate. If the JSON input does not include a property
 * for a field, the API will not update that field", whereas PUT "will update all
 * properties of the target" and defaults every omitted field to null.
 * https://ww1.autotask.net/help/DeveloperHelp/Content/APIs/REST/API_Calls/REST_Updating_Data_PATCH.htm
 *
 * So there is NO GET-and-merge here, and there must never be one. Autotask
 * relaxes its required-field rules for PATCH (required applies to POST), which
 * is why a body of `id` + one field is legal even though description, publish,
 * noteType and ticketID all report isRequired true. Rebuilding the record from a
 * read would also introduce a lost-update window: a colleague's edit landing
 * between the read and the write would be silently overwritten with stale text.
 *
 * The caller passes ticketID for the URL only — it is never re-sent in the body,
 * because a field the caller did not ask to change has no business in a partial
 * write.
 *
 * PATH ORDER mirrors createTicketNote, for the same reason: Kaseya documents
 * child collections as having their own access URLs and points at its Swagger
 * instance for the exact form rather than stating it in the entity reference, so
 * the working path is established by trying the parent collection and falling
 * back to the root entity — not assumed.
 */
export async function updateTicketNote(
  ticketID: number,
  noteID: number,
  fields: TicketNoteEdit,
  impersonationResourceId?: number
): Promise<unknown> {
  const payload = { id: noteID, ...fields }
  try {
    return await patch(`Tickets/${ticketID}/Notes`, payload, impersonationResourceId)
  } catch {
    return await patch('TicketNotes', payload, impersonationResourceId)
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

// ---------------------------------------------------------------------------
// Resource assignment: Autotask requires the resource and its ROLE together
// ---------------------------------------------------------------------------
//
// Any write that sets assignedResourceID without assignedResourceRoleID is
// rejected with HTTP 500 and:
//
//   "Data violation: When assigning a Resource, you must assign both a
//    assignedResourceID and assignedResourceRoleID."
//
// So assignment on create and on PATCH both failed 100% of the time until
// 2026-07-29. The pairing is enforced HERE rather than in the MCP tools, so no
// current or future caller of createTicket/updateTicket can reintroduce a lone
// assignedResourceID.

/**
 * Role used when a caller supplies a resource but no role.
 *
 * Live role ids in this instance (from autotask_list_roles): Engineer 29683355,
 * Help Desk 29683464, Network Engineer 29683460. Engineer is the default
 * because it is the general-purpose delivery role. DO NOT default to Low/High
 * Voltage Technician (29683465) — it is a cabling role and would misattribute
 * the work, and its rate is wrong for ticket delivery.
 */
export const DEFAULT_ASSIGNED_RESOURCE_ROLE_ID = 29683355

/**
 * Complete an assignment payload so the required pair is never half-supplied.
 *
 * Pure, and exported for the regression test. Only fills the role when a real
 * resource is being SET: clearing an assignment (null) must not acquire a role,
 * and a payload that touches neither field is returned untouched.
 */
export function applyAssignedResourceRole(fields: Record<string, unknown>): Record<string, unknown> {
  const resource = fields.assignedResourceID
  const assigningSomeone = typeof resource === 'number' && resource > 0
  if (!assigningSomeone) return fields
  if (fields.assignedResourceRoleID != null) return fields
  return { ...fields, assignedResourceRoleID: DEFAULT_ASSIGNED_RESOURCE_ROLE_ID }
}

export async function updateTicket(ticketID: number, fields: Record<string, unknown>, impersonationResourceId?: number): Promise<unknown> {
  return patch('Tickets', { id: ticketID, ...applyAssignedResourceRole(fields) }, impersonationResourceId)
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
    /** Required by Autotask WITH assignedResourceID; defaulted if omitted. */
    assignedResourceRoleID?: number;
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
  if (data.assignedResourceRoleID !== undefined) body.assignedResourceRoleID = data.assignedResourceRoleID
  if (data.ticketType !== undefined) body.ticketType = data.ticketType
  return post<{ itemId?: number }>('Tickets', applyAssignedResourceRole(body), impersonationResourceId)
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

// ============================================
// PROJECT / TASK / CRM WRITES (impersonated, direct — no staged gate)
// ============================================
//
// GATING DECISION (2026-08-25). These are DIRECT writes, like the ticket tools
// and unlike the config ones. The staged-approval gate exists for INSTANCE
// CONFIGURATION — categories, holidays, service pricing, UDF list items — where
// one change silently alters how every future record behaves. Everything below
// touches exactly one operational record by id, is visible in the Autotask UI
// immediately, and is corrigible there by the same technician. Putting a task
// status behind a human approval would make the connector useless for the work
// it is meant to do, and would devalue the gate for the changes that need it.
//
// The one exception is company CREATE, which carries a duplicate-name refusal:
// entityInformation reports Companies.canDelete FALSE, so a company created by
// mistake can never be removed, only deactivated. That asymmetry earns a guard
// the other creates do not need.
//
// Every function here is impersonated, and every caller verifies by read-back.

/**
 * Fields a PROJECT can be created with.
 *
 * companyID is absent BY CONSTRUCTION: entityInformation reports
 * Projects.companyID isRequired true AND isReadOnly true, i.e. the value is
 * supplied by the parent path (Companies/{id}/Projects) rather than the body.
 * It is passed to createProject separately, for the URL.
 */
export interface ProjectCreateFields {
  projectName: string
  projectType: number
  status: number
  startDateTime: string
  endDateTime: string
  description?: string
  projectLeadResourceID?: number
  contractID?: number
  department?: number
  extProjectNumber?: string
  purchaseOrderNumber?: string
  statusDetail?: string
  estimatedSalesCost?: number
  laborEstimatedCosts?: number
  laborEstimatedRevenue?: number
  originalEstimatedRevenue?: number
  projectCostsBudget?: number
  projectCostsRevenue?: number
  opportunityID?: number
}

/** Fields a PROJECT can be updated with. companyID is immutable — see above. */
export interface ProjectUpdateFields {
  projectName?: string
  projectType?: number
  status?: number
  startDateTime?: string
  endDateTime?: string
  completedDateTime?: string
  description?: string
  projectLeadResourceID?: number | null
  contractID?: number | null
  department?: number
  extProjectNumber?: string
  purchaseOrderNumber?: string
  statusDetail?: string
  estimatedSalesCost?: number
  laborEstimatedCosts?: number
  laborEstimatedRevenue?: number
  originalEstimatedRevenue?: number
  projectCostsBudget?: number
  projectCostsRevenue?: number
}

export async function createProject(
  companyID: number,
  fields: ProjectCreateFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      // Parent-scoped first: companyID is read-only in the body, so this is the
      // form the metadata points at.
      { path: `Companies/${companyID}/Projects`, body: fields },
      // Root fallback carries companyID explicitly — if the root path turns out
      // to accept the create, it has no other way to learn the company.
      { path: 'Projects', body: { ...fields, companyID } },
    ],
    imp,
  )
}

export async function updateProject(
  projectID: number,
  fields: ProjectUpdateFields,
  companyID?: number,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  const body = { id: projectID, ...fields }
  const candidates: WriteCandidate[] = [{ path: 'Projects', body }]
  // != null, not truthiness: Autotask company id 0 is REAL (it is TCT's own
  // record), and a falsy check would silently drop the fallback candidate.
  if (companyID != null) candidates.push({ path: `Companies/${companyID}/Projects`, body })
  return writeAtFirstWorkingPath('PATCH', candidates, imp)
}

/**
 * Fields a project TASK can be created with.
 *
 * Unlike Projects.companyID, Tasks.projectID is isRequired true and isReadOnly
 * FALSE, so it is legal in the body — it is sent on both candidate paths.
 */
export interface TaskCreateFields {
  title: string
  status: number
  taskType: number
  phaseID?: number
  description?: string
  startDateTime?: string
  endDateTime?: string
  estimatedHours?: number
  remainingHours?: number
  assignedResourceID?: number
  assignedResourceRoleID?: number
  priorityLabel?: number
  departmentID?: number
  taskCategoryID?: number
  billingCodeID?: number
  companyLocationID?: number
  purchaseOrderNumber?: string
  externalID?: string
  isVisibleInClientPortal?: boolean
  canClientPortalUserCompleteTask?: boolean
}

export interface TaskUpdateFields {
  title?: string
  status?: number
  taskType?: number
  phaseID?: number | null
  description?: string
  startDateTime?: string
  endDateTime?: string
  estimatedHours?: number
  remainingHours?: number
  assignedResourceID?: number | null
  assignedResourceRoleID?: number | null
  priorityLabel?: number
  departmentID?: number
  taskCategoryID?: number
  billingCodeID?: number
  companyLocationID?: number
  purchaseOrderNumber?: string
  externalID?: string
  isVisibleInClientPortal?: boolean
  canClientPortalUserCompleteTask?: boolean
}

/**
 * Create a project task.
 *
 * applyAssignedResourceRole is reused verbatim from the ticket path: Tasks
 * carries the same assignedResourceID + assignedResourceRoleID pair, and
 * enforcing it in the WRITER rather than the tool is what stops a future caller
 * reintroducing a lone resource id.
 */
export async function createTask(
  projectID: number,
  fields: TaskCreateFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body = applyAssignedResourceRole({ ...fields, projectID })
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: `Projects/${projectID}/Tasks`, body },
      { path: 'Tasks', body },
    ],
    imp,
  )
}

/**
 * Update a project task.
 *
 * projectID is required for the parent-scoped URL, which is why every caller
 * reads the task first — that read also proves the task exists and yields the
 * before-values the verification compares against.
 */
export async function updateTask(
  taskID: number,
  projectID: number,
  fields: TaskUpdateFields,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  const body = applyAssignedResourceRole({ id: taskID, ...fields })
  return writeAtFirstWorkingPath(
    'PATCH',
    [
      { path: `Projects/${projectID}/Tasks`, body },
      { path: 'Tasks', body },
    ],
    imp,
  )
}

// --- Task notes -------------------------------------------------------------
//
// Root TaskNotes is tried FIRST here, unlike Tasks: AutotaskClient.createTaskNote
// has been POSTing to the root entity in production for as long as the sync has
// existed, so it is the known-good path and deserves the first round trip.

export interface TaskNoteFields {
  title: string
  description: string
  /** Live picklist: 1 Task Summary · 2 Task Detail · 3 Task Notes. */
  noteType?: number
  /** Live picklist: 1 All Autotask Users (CUSTOMER-VISIBLE) · 2 Internal Project Team · 4 Internal & Co-Managed. There is no 3. */
  publish?: number
}

export async function createTaskNote(
  taskID: number,
  data: TaskNoteFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body = {
    taskID,
    title: data.title,
    description: data.description,
    noteType: data.noteType ?? 3,
    publish: data.publish ?? 2,
  }
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: 'TaskNotes', body },
      { path: `Tasks/${taskID}/Notes`, body },
    ],
    imp,
  )
}

/** Partial edit of an existing task note. Only the supplied fields are sent — never a GET-and-merge. */
export interface TaskNoteEdit {
  description?: string
  title?: string
  publish?: number
  noteType?: number
}

export async function updateTaskNote(
  taskID: number,
  noteID: number,
  fields: TaskNoteEdit,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  const body = { id: noteID, ...fields }
  return writeAtFirstWorkingPath(
    'PATCH',
    [
      { path: 'TaskNotes', body },
      { path: `Tasks/${taskID}/Notes`, body },
    ],
    imp,
  )
}

// --- Project notes ----------------------------------------------------------

export interface ProjectNoteFields {
  title: string
  description: string
  noteType?: number
  publish?: number
  /** isRequired true on ProjectNotes — defaulted false rather than omitted. */
  isAnnouncement?: boolean
}

export async function createProjectNote(
  projectID: number,
  data: ProjectNoteFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body = {
    projectID,
    title: data.title,
    description: data.description,
    noteType: data.noteType ?? 3,
    publish: data.publish ?? 2,
    isAnnouncement: data.isAnnouncement ?? false,
  }
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: 'ProjectNotes', body },
      { path: `Projects/${projectID}/Notes`, body },
    ],
    imp,
  )
}

// --- Phases -----------------------------------------------------------------
//
// Phases.projectID is isRequired true AND isReadOnly true — the same shape as
// Projects.companyID — so the parent path supplies it and the body must not.

export interface PhaseFields {
  title: string
  description?: string
  startDate?: string
  dueDate?: string
  externalID?: string
  parentPhaseID?: number
}

export async function createProjectPhase(
  projectID: number,
  fields: PhaseFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: `Projects/${projectID}/Phases`, body: fields },
      { path: 'Phases', body: { ...fields, projectID } },
    ],
    imp,
  )
}

export async function updateProjectPhase(
  phaseID: number,
  projectID: number,
  fields: Partial<PhaseFields>,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  const body = { id: phaseID, ...fields }
  return writeAtFirstWorkingPath(
    'PATCH',
    [
      { path: `Projects/${projectID}/Phases`, body },
      { path: 'Phases', body },
    ],
    imp,
  )
}

// --- Task time entries ------------------------------------------------------

/**
 * Log time against a project TASK (not a ticket).
 *
 * Separate from createTicketTimeEntry deliberately: that function's
 * service-ticket branch requires a start AND stop time, a Tickets rule that
 * does not apply here, and merging the two would import a constraint tasks do
 * not have. Both post to the same root TimeEntries entity.
 */
export async function createTaskTimeEntry(
  data: {
    taskID: number
    resourceID: number
    roleID?: number
    hoursWorked?: number
    dateWorked?: string
    startDateTime?: string
    stopDateTime?: string
    summaryNotes?: string
    internalNotes?: string
    billingCodeID?: number
    isNonBillable?: boolean
    showOnInvoice?: boolean
  },
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body: Record<string, unknown> = {
    taskID: data.taskID,
    resourceID: data.resourceID,
    summaryNotes: data.summaryNotes ?? '',
    internalNotes: data.internalNotes ?? '',
  }
  if (data.roleID != null) body.roleID = data.roleID
  if (data.startDateTime && data.stopDateTime) {
    body.startDateTime = data.startDateTime
    body.endDateTime = data.stopDateTime
    body.dateWorked = data.dateWorked ?? data.startDateTime.slice(0, 10)
    const derived = (new Date(data.stopDateTime).getTime() - new Date(data.startDateTime).getTime()) / 3_600_000
    body.hoursWorked = data.hoursWorked ?? Math.round(derived * 100) / 100
  } else {
    body.dateWorked = data.dateWorked ?? new Date().toISOString().slice(0, 10)
    if (data.hoursWorked != null) body.hoursWorked = data.hoursWorked
  }
  if (data.billingCodeID != null) body.billingCodeID = data.billingCodeID
  if (data.isNonBillable != null) body.isNonBillable = data.isNonBillable
  if (data.showOnInvoice != null) body.showOnInvoice = data.showOnInvoice
  return writeAtFirstWorkingPath<{ itemId?: number }>('POST', [{ path: 'TimeEntries', body }], imp)
}

export interface TimeEntryEdit {
  summaryNotes?: string
  internalNotes?: string
  hoursWorked?: number
  dateWorked?: string
  startDateTime?: string
  endDateTime?: string
  roleID?: number
  billingCodeID?: number
  isNonBillable?: boolean
  showOnInvoice?: boolean
}

export async function updateTimeEntry(
  timeEntryID: number,
  fields: TimeEntryEdit,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  return writeAtFirstWorkingPath('PATCH', [{ path: 'TimeEntries', body: { id: timeEntryID, ...fields } }], imp)
}

// --- Task secondary resources ----------------------------------------------
//
// entityInformation: canCreate true, canDelete true, canUpdate FALSE — so this
// is add/remove only, and resourceID + roleID are BOTH isRequired, another pair
// that must travel together.

export async function addTaskSecondaryResource(
  taskID: number,
  resourceID: number,
  roleID: number,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body = { taskID, resourceID, roleID }
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: 'TaskSecondaryResources', body },
      { path: `Tasks/${taskID}/SecondaryResources`, body },
    ],
    imp,
  )
}

export async function removeTaskSecondaryResource(
  taskID: number,
  secondaryResourceRowID: number,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  return writeAtFirstWorkingPath(
    'DELETE',
    [
      { path: `TaskSecondaryResources/${secondaryResourceRowID}` },
      { path: `Tasks/${taskID}/SecondaryResources/${secondaryResourceRowID}` },
    ],
    imp,
  )
}

// --- Task predecessors ------------------------------------------------------
//
// Both task ids are isReadOnly true, so the LINK is create/delete only; lagDays
// is the single mutable field.

export async function addTaskPredecessor(
  successorTaskID: number,
  predecessorTaskID: number,
  lagDays: number | undefined,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  const body: Record<string, unknown> = { successorTaskID, predecessorTaskID }
  if (lagDays != null) body.lagDays = lagDays
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: 'TaskPredecessors', body },
      { path: `Tasks/${successorTaskID}/Predecessors`, body },
    ],
    imp,
  )
}

export async function removeTaskPredecessor(
  successorTaskID: number,
  predecessorRowID: number,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  return writeAtFirstWorkingPath(
    'DELETE',
    [
      { path: `TaskPredecessors/${predecessorRowID}` },
      { path: `Tasks/${successorTaskID}/Predecessors/${predecessorRowID}` },
    ],
    imp,
  )
}

// --- Companies --------------------------------------------------------------

export interface CompanyCreateFields {
  companyName: string
  companyType: number
  ownerResourceID: number
  phone: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  countryID?: number
  webAddress?: string
  fax?: string
  alternatePhone1?: string
  companyNumber?: string
  parentCompanyID?: number
  classification?: number
  companyCategoryID?: number
  marketSegmentID?: number
  territoryID?: number
  taxID?: string
  taxRegionID?: number
  isTaxExempt?: boolean
  isActive?: boolean
  isEnabledForComanaged?: boolean
  invoiceMethod?: number
  currencyID?: number
}

export type CompanyUpdateFields = Partial<CompanyCreateFields>

export async function createCompany(
  fields: CompanyCreateFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  return writeAtFirstWorkingPath<{ itemId?: number }>('POST', [{ path: 'Companies', body: fields }], imp)
}

export async function updateCompany(
  companyID: number,
  fields: CompanyUpdateFields,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  return writeAtFirstWorkingPath('PATCH', [{ path: 'Companies', body: { id: companyID, ...fields } }], imp)
}

// --- Contacts ---------------------------------------------------------------
//
// Contacts.companyID is isRequired true AND isReadOnly true — the Projects
// pattern again — so the parent path supplies it on create and a contact can
// never be moved between companies afterwards.

export interface ContactCreateFields {
  firstName: string
  lastName: string
  /** isRequired true. Autotask types this as an INTEGER, not a boolean: 1 active, 0 inactive. */
  isActive: number
  title?: string
  emailAddress?: string
  emailAddress2?: string
  emailAddress3?: string
  phone?: string
  mobilePhone?: string
  alternatePhone?: string
  extension?: string
  faxNumber?: string
  addressLine?: string
  addressLine1?: string
  city?: string
  state?: string
  zipCode?: string
  countryID?: number
  companyLocationID?: number
  namePrefix?: number
  middleInitial?: string
  note?: string
  primaryContact?: boolean
  billingContact?: boolean
  receivesEmailNotifications?: boolean
  externalID?: string
  roomNumber?: string
}

export type ContactUpdateFields = Partial<ContactCreateFields>

export async function createContact(
  companyID: number,
  fields: ContactCreateFields,
  imp?: number,
): Promise<PathResolvedWrite<{ itemId?: number }>> {
  return writeAtFirstWorkingPath<{ itemId?: number }>(
    'POST',
    [
      { path: `Companies/${companyID}/Contacts`, body: fields },
      { path: 'Contacts', body: { ...fields, companyID } },
    ],
    imp,
  )
}

export async function updateContact(
  contactID: number,
  fields: ContactUpdateFields,
  companyID?: number,
  imp?: number,
): Promise<PathResolvedWrite<unknown>> {
  const body = { id: contactID, ...fields }
  const candidates: WriteCandidate[] = [{ path: 'Contacts', body }]
  // != null — company id 0 is a real Autotask company (TCT's own).
  if (companyID != null) candidates.push({ path: `Companies/${companyID}/Contacts`, body })
  return writeAtFirstWorkingPath('PATCH', candidates, imp)
}
