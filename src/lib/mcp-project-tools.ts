// src/lib/mcp-project-tools.ts
//
// Autotask PROJECT, TASK and CRM write tools for the MCP connector.
//
// Companion to mcp-write-tools.ts (tickets), sharing its identity path, its
// failure envelope and its non-negotiable rule: an accepted write is not a
// done write until a read-back says so.
//
// WHY THIS IS A SEPARATE FILE: mcp-write-tools.ts is the ticket surface and is
// already long. These tools are a different Autotask domain with their own
// addressing problem (child entities under Projects/Companies) and their own
// verification shape. They are NOT a parallel implementation — identity
// resolution, the writer, the client and the envelope are all imported from the
// existing modules, and nothing here duplicates a ticket tool.
//
// EVERY WRITE HERE:
//   · is attributed to the signed-in technician via ImpersonationResourceId
//   · goes through writeAtFirstWorkingPath(), which never swallows a rejection
//   · is verified by re-reading the record and comparing EVERY requested field
//   · returns PRECONDITION_FAILED, not success, when a value did not stick
//   · reports pathUsed, so how Autotask addresses an entity is observed, never
//     assumed and never hardcoded

import { z } from 'zod'
import {
  AutotaskClient,
  getAutotaskProjectUrl,
  getAutotaskTaskUrl,
  type AutotaskTask,
} from '@/lib/autotask'
import * as write from '@/lib/autotask-write'
import { resolveResourceId } from '@/lib/mcp-write-tools'
import { computeActivityGap, newestTimestamp } from '@/lib/autotask-activity'
import { failureResult, toolFailure, type McpToolResult } from '@/lib/connector/failure-envelope'

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): McpToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function fail(err: unknown, tool: string): McpToolResult {
  return toolFailure(err, { surface: 'autotask', tool })
}

// ---------------------------------------------------------------------------
// Field verification (pure — exported for the regression test)
// ---------------------------------------------------------------------------

export interface FieldMismatch {
  field: string
  requested: unknown
  actual: unknown
}

export interface VerifyResult {
  mismatches: FieldMismatch[]
  changedFields: string[]
  unchangedFields: string[]
}

/**
 * Normalize line endings before comparing text.
 *
 * A TRANSPORT equivalence only. Text sent with \n can come back \r\n, and
 * failing an edit that landed perfectly is worse than not checking at all,
 * because it teaches the reader to ignore the verification flag. Nothing else
 * is normalized — trailing whitespace, casing and interior spacing still have
 * to match exactly, so a real truncation still fails.
 */
function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Are these the same Autotask datetime?
 *
 * Autotask accepts `2026-09-01T00:00:00Z` and returns `2026-09-01T00:00:00`
 * (no zone) or with a different offset. Comparing those as strings would report
 * PRECONDITION_FAILED on every single date write — the same class of false
 * negative that made hr_er_log_update compare a date against its Excel serial
 * rather than flagging every date patch as unverified.
 *
 * Returns null when either side is not a date, so the caller falls back to a
 * string compare instead of silently treating two non-dates as equal.
 */
export function datesMatch(a: string, b: string): boolean | null {
  const isoish = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/
  if (!isoish.test(a.trim()) || !isoish.test(b.trim())) return null

  const parse = (v: string): number | null => {
    const t = v.trim()
    // A bare date, or a datetime with no zone, is read as UTC on both sides so
    // the comparison cannot be thrown off by the runtime's local timezone.
    const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(t)
      ? t.replace(' ', 'T')
      : `${t.replace(' ', 'T')}${t.includes('T') || t.includes(' ') ? '' : 'T00:00:00'}Z`
    const ms = Date.parse(normalized)
    return Number.isNaN(ms) ? null : ms
  }

  const [ta, tb] = [parse(a), parse(b)]
  if (ta === null || tb === null) return null

  // A caller who supplies a date-only value is asking for that DAY; Autotask
  // stamps a time onto it. Treat same-day as a match in that direction only.
  const dateOnly = (v: string) => !/[T ]\d{2}:/.test(v.trim())
  if (dateOnly(a) || dateOnly(b)) {
    return new Date(ta).toISOString().slice(0, 10) === new Date(tb).toISOString().slice(0, 10)
  }
  return ta === tb
}

/** Does the stored value match what was asked for? */
export function valueMatches(requested: unknown, actual: unknown): boolean {
  // Clearing a field: Autotask may store null, undefined or an empty string.
  if (requested === null) return actual === null || actual === undefined || actual === ''
  if (requested === undefined) return true

  if (typeof requested === 'number') {
    const n = typeof actual === 'number' ? actual : Number(actual)
    if (Number.isNaN(n)) return false
    // Decimal hours/costs round-trip through Autotask's own precision.
    return Math.abs(n - requested) < 1e-6
  }

  if (typeof requested === 'boolean') {
    if (typeof actual === 'boolean') return actual === requested
    // Autotask types some flags as integer (Contacts.isActive) and some as bool.
    if (typeof actual === 'number') return (actual !== 0) === requested
    return false
  }

  if (typeof requested === 'string') {
    if (typeof actual !== 'string') {
      // A numeric field addressed with a string still counts if it is the same number.
      return typeof actual === 'number' && String(actual) === requested.trim()
    }
    const asDates = datesMatch(requested, actual)
    if (asDates !== null) return asDates
    return normalizeText(actual) === normalizeText(requested)
  }

  return actual === requested
}

/**
 * Compare EVERY requested field against what the record now says.
 *
 * Deliberately requested-vs-live rather than before-vs-after: the caller's goal
 * is an end state. Re-sending a value the record already had changes nothing and
 * is still a success — reported in unchangedFields so a response never implies
 * an edit that did not happen — while a value that did not stick is a hard
 * failure whatever HTTP status Autotask returned.
 *
 * FAIL-CLOSED: a field the read-back did not return at all counts as not
 * landed, never as "probably fine".
 */
export function verifyWrittenFields(
  requested: Record<string, unknown>,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): VerifyResult {
  const mismatches: FieldMismatch[] = []
  const changedFields: string[] = []
  const unchangedFields: string[] = []

  for (const [field, want] of Object.entries(requested)) {
    if (want === undefined) continue
    const got = after[field]
    if (!valueMatches(want, got)) {
      mismatches.push({ field, requested: want, actual: got ?? null })
      continue
    }
    const wasAlready = before !== null && valueMatches(want, before[field])
    ;(wasAlready ? unchangedFields : changedFields).push(field)
  }

  return { mismatches, changedFields, unchangedFields }
}

/**
 * Drop undefined keys so a partial write carries ONLY what the caller supplied.
 *
 * Autotask PATCH updates just the properties named and leaves omitted fields
 * untouched, so there is no GET-and-merge anywhere in this file and an
 * unsupplied field can never be blanked.
 */
export function definedFields<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
}

// ---------------------------------------------------------------------------
// Shared failure shapes
// ---------------------------------------------------------------------------

const PATH_EVIDENCE =
  'Autotask child entities are addressed beneath their parent, and which form a given entity accepts for a given method is not derivable from entityInformation. The write tries each candidate URL and stops on the FIRST non-404 — a 404 means the path is wrong, anything else means the path was right and the payload was refused. pathAttempts lists every URL tried with its status.'

function noSuchRecord(kind: string, id: number, tool: string, hint: string): McpToolResult {
  return failureResult({
    reasonCode: 'INVALID_INPUT',
    message: `No Autotask ${kind} has id ${id}, so there is nothing to act on. Nothing was written.`,
    evidence: `A query filtered on id ${id} succeeded and returned no rows. A failed lookup raises a different error, so this is a genuine absence, not a broken query.`,
    remediation: hint,
    surface: 'autotask',
    tool,
    details: { [`${kind}Id`]: id },
  })
}

function emptyEdit(kind: string, id: number, tool: string, fields: string): McpToolResult {
  return failureResult({
    reasonCode: 'INVALID_INPUT',
    message: `No change was requested for ${kind} ${id}: supply at least one field to update. Nothing was written.`,
    evidence: 'The tool refuses an empty edit before contacting Autotask — a PATCH carrying only an id is a pointless write it could not meaningfully verify.',
    remediation: `Call again with the field(s) you want to change. Settable fields: ${fields}.`,
    surface: 'autotask',
    tool,
    details: { id },
  })
}

function notVerified(opts: {
  kind: string
  id: number
  tool: string
  mismatches: FieldMismatch[]
  changedFields: string[]
  pathUsed: string
  attempts: write.WriteAttempt[]
  url?: string
}): McpToolResult {
  const { kind, id, tool, mismatches, changedFields, pathUsed, attempts, url } = opts
  return failureResult({
    reasonCode: 'PRECONDITION_FAILED',
    message:
      `Autotask accepted the write to ${kind} ${id} at ${pathUsed}, but the read-back does not show ` +
      mismatches
        .map((m) => `${m.field} (asked for ${JSON.stringify(m.requested)}, the record now reports ${JSON.stringify(m.actual)})`)
        .join('; ') +
      `. Do NOT report this ${kind} as updated.` +
      (changedFields.length ? ` Note that ${changedFields.join(' and ')} DID change, so it is now partially updated.` : ''),
    evidence:
      'Verified by re-reading the record by id after the write and comparing every requested field against the stored value, rather than trusting the HTTP status. Line endings and datetime formatting are the only differences tolerated. ' +
      PATH_EVIDENCE,
    remediation:
      `Read the record as it now stands and check it in Autotask before retrying${url ? `: ${url}` : ''}. Retrying the identical call is unlikely to behave differently — a field Autotask silently drops needs a different approach, not another attempt. A read-only picklist value or a field governed by another setting is the usual cause.`,
    surface: 'autotask',
    tool,
    details: { id, mismatches, changedFields, pathUsed, pathAttempts: attempts },
  })
}

function readBackFailed(kind: string, id: number, tool: string, pathUsed: string, url?: string): McpToolResult {
  return failureResult({
    reasonCode: 'PRECONDITION_FAILED',
    message:
      `Autotask accepted the write to ${kind} ${id} at ${pathUsed}, but the record could not be read back afterwards, so nothing about the write is confirmed. Do NOT report it as done.`,
    evidence: 'The post-write query returned no row for a record that existed moments earlier, so the stored values could not be compared against what was requested.',
    remediation: `Check the record in Autotask before doing anything else${url ? `: ${url}` : ''}. Do not retry blindly — the write may already have applied.`,
    surface: 'autotask',
    tool,
    details: { id, pathUsed },
  })
}

// ---------------------------------------------------------------------------
// Live-verified picklist values
// ---------------------------------------------------------------------------
//
// Named in tool descriptions because an unresolvable id is the single most
// common cause of a rejected write, and because these ids are PER-INSTANCE:
// Autotask's default Tasks.status has 4 = In Progress, this instance has no 4
// at all and uses 8. Read from the live picklist on 2026-08-25; anything not
// listed here is deliberately pointed at autotask_entity_picklist rather than
// written down, and nothing in this file branches on a hardcoded id.

const TASK_STATUS_HELP =
  'Task status picklist ids on THIS instance (live 2026-08-25): 1 New, 8 In Progress, 10 Scheduled, 5 Complete, 52 Complete - No Notify, 7 Waiting Customer, 9 Waiting Materials, 12 Waiting Vendor, 22 Re-open, 35 Escalated to Level 2, 11 Escalated to Level 3. NOTE there is NO id 4 here — Autotask\'s default picklist uses 4 for In Progress and this instance does not. Resolve any other value with autotask_entity_picklist({entity:"Tasks", field:"status"}).'

const PROJECT_STATUS_HELP =
  'Project status picklist ids on THIS instance (live 2026-08-25): 1 New, 2 In Progress, 3 On Hold, 4 Change Order, 6 Waiting Parts, 7 Waiting Customer, 5 Complete, 0 Inactive. Note 4 is Change Order, NOT an active state.'

const PROJECT_TYPE_HELP =
  'Project type picklist ids (live 2026-08-25): 5 Client, 4 Internal, 2 Proposal, 3 Template, 8 Baseline. There is no id 1.'

const NOTE_PUBLISH_HELP =
  'publish controls WHO CAN SEE IT. Live picklist: 1 = "All Autotask Users" — which despite the label is the CUSTOMER-VISIBLE state (Internal-cleared, readable in the Client Portal) — 2 = "Internal Project Team", 4 = "Internal & Co-Managed". There is NO id 3. Defaults to 2 (internal) so a note is never accidentally exposed to the customer.'

const TASK_NOTE_TYPE_HELP =
  'noteType picklist (live 2026-08-25): 1 Task Summary, 2 Task Detail, 3 Task Notes. Defaults to 3.'

const ROLE_HELP =
  'Role ids in this instance: Engineer 29683355 (the general-purpose delivery role), Help Desk 29683464, Network Engineer 29683460 — resolve others with autotask_list_roles. Do NOT use Low/High Voltage Technician (29683465) for delivery work; it is a cabling role with the wrong rate.'

const PATH_NOTE =
  'The response reports pathUsed (the URL Autotask accepted) and pathAttempts (every URL tried, with its status) — surface these if anything looks wrong, they are the record of how this entity is actually addressed.'

const VERIFY_NOTE =
  'READ-BACK VERIFIED: the record is re-read after the write and every requested field compared against what Autotask actually stored. A value that did not stick returns PRECONDITION_FAILED — an accepted write is never reported as success on its HTTP status alone. Re-sending a value the record already had succeeds but is listed in unchangedFields, so the response never implies a change that did not happen.'

/**
 * Does this read account for the task's last activity?
 *
 * Reuses computeActivityGap (the ticket implementation, pure and already
 * tested) and adds task-specific wording. Passing null for items means "this
 * read returned no activity rows at all", which is what a field-only read like
 * autotask_get_task is — it can never account for a note or a time entry, so it
 * always warns when the task has any activity stamp.
 *
 * No tolerance window, for the same reason the ticket version has none: a
 * spurious "go check the timeline" costs one tool call, a missed gap costs
 * someone a false accusation about work they did.
 */
function computeTaskGap(task: AutotaskTask, items: Array<{ at: string }> | null) {
  const raw = task as unknown as Record<string, unknown>
  const lastActivityDate = (raw.lastActivityDateTime as string) ?? (raw.lastActivityDate as string) ?? null
  const gap = computeActivityGap({
    lastActivityDate,
    newestRetrievedActivityAt: items === null ? null : newestTimestamp(items.filter((i) => i.at)),
  })

  const warning =
    gap.activityGap !== true
      ? null
      : items === null
      ? `THIS READ RETURNED NO ACTIVITY ROWS. Task ${task.id} reports lastActivityDateTime ${gap.lastActivityDate}; this tool returns task FIELDS only and structurally excludes notes and time entries. Call autotask_task_activity({ taskId: ${task.id} }) before stating that work was not done on this task.`
      : gap.reason === 'no_items_retrieved'
      ? `UNRETRIEVED ACTIVITY: task ${task.id} reports lastActivityDateTime ${gap.lastActivityDate} and this read returned no notes or time entries. Something changed on this task that you have not seen — open it in Autotask.`
      : `UNRETRIEVED ACTIVITY: task ${task.id} reports lastActivityDateTime ${gap.lastActivityDate}, which is newer than the most recent note or time entry returned here (${gap.newestRetrievedActivityAt}). The remaining change is a task FIELD edit — status, assignment, dates — not a note or time entry. Open the task in Autotask rather than reporting it unchanged.`

  return { ...gap, activityWarning: warning }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerProjectTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email
  const client = () => new AutotaskClient()

  // =========================================================================
  // READS
  // =========================================================================

  server.registerTool(
    'autotask_get_task',
    {
      title: 'Autotask: get project task',
      description:
        'Read ONE Autotask project task by its numeric id: title, description, status, dates, estimated/remaining hours, assigned resource and role, phase, and lastActivityDateTime. ' +
        'Use this to resolve a task before writing to it, and to check a write afterwards. ' +
        'Carries activityGap — true means the task has activity NEWER than anything this read returned, in which case call autotask_task_activity before saying nothing has happened on it.',
      inputSchema: { taskId: z.number().int().describe('Autotask task id (Tasks.id) — NOT the task number') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ taskId }: any) => {
      try {
        const task = await client().getTaskById(taskId)
        if (!task) {
          return noSuchRecord('task', taskId, 'autotask_get_task', 'Check the id. List a project\'s tasks with autotask_project_detail({ projectId }).')
        }
        const gap = computeTaskGap(task, null)
        return ok({ task, taskUrl: getAutotaskTaskUrl(String(taskId)), ...gap })
      } catch (e) { return fail(e, 'autotask_get_task') }
    }
  )

  server.registerTool(
    'autotask_project_detail',
    {
      title: 'Autotask: project detail (phases + tasks)',
      description:
        'Full structure of ONE Autotask project: the project record, its phases, and its tasks (each tagged with the phase it belongs to, or none). ' +
        'This is the read that resolves project / phase / task ids before any write, and the only connector read that lists project tasks at all. ' +
        'Reads Tasks and Phases at their root entities with NO silent fallback — a failed query raises rather than returning an empty list, so "this project has no tasks" can never be a broken query in disguise.',
      inputSchema: {
        projectId: z.number().int().describe('Autotask project id'),
        includeNotes: z.boolean().optional().describe('Also return the project notes (default false)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ projectId, includeNotes }: any) => {
      try {
        const c = client()
        const project = await c.getProjectById(projectId)
        if (!project) {
          return noSuchRecord('project', projectId, 'autotask_project_detail', 'Check the id. Find a company\'s projects with autotask_company_projects({ companyId }), or all active ones with autotask_active_projects.')
        }
        const [phases, tasks, notes] = await Promise.all([
          c.getProjectPhases(projectId),
          c.getTasksByProjectId(projectId),
          includeNotes ? c.getProjectNotes(projectId) : Promise.resolve([]),
        ])
        const phaseName = new Map(phases.map((p) => [p.id, p.title]))
        return ok({
          project,
          projectUrl: getAutotaskProjectUrl(String(projectId)),
          phaseCount: phases.length,
          taskCount: tasks.length,
          phases,
          tasks: tasks.map((t) => ({
            ...t,
            phaseTitle: t.phaseID ? phaseName.get(t.phaseID) ?? null : null,
            taskUrl: getAutotaskTaskUrl(String(t.id)),
          })),
          ...(includeNotes ? { notes } : {}),
        })
      } catch (e) { return fail(e, 'autotask_project_detail') }
    }
  )

  server.registerTool(
    'autotask_task_activity',
    {
      title: 'Autotask: task activity timeline',
      description:
        'THE read that should ground any statement about whether work was done on a project TASK. Merges TaskNotes and TimeEntries into one chronological timeline with author, timestamp and internal-vs-customer-visible scope. ' +
        'autotask_get_task and a notes-only read both structurally EXCLUDE time entries, so a technician\'s logged hours are invisible to them — the exact shape of defect that once had a completed 2.67-hour build reported as "no update showing the work finished" on a ticket. Do not claim a task is untouched without calling this. ' +
        'Also reports activityGap: true means the task\'s own lastActivityDateTime is newer than anything returned here, so the remaining change is a task FIELD edit (status, assignment, dates) rather than a note or time entry — open the task in Autotask. ' +
        'sourcesUnavailable names any source whose query failed, so a broken query never reads as an empty result.',
      inputSchema: { taskId: z.number().int().describe('Autotask task id') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ taskId }: any) => {
      try {
        const c = client()
        const task = await c.getTaskById(taskId)
        if (!task) {
          return noSuchRecord('task', taskId, 'autotask_task_activity', 'Check the id. List a project\'s tasks with autotask_project_detail({ projectId }).')
        }

        const sourcesUnavailable: Array<{ source: string; error: string }> = []
        const [notes, times] = await Promise.all([
          c.getTaskNotesByTaskId(taskId).catch((e: unknown) => {
            sourcesUnavailable.push({ source: 'TaskNotes', error: e instanceof Error ? e.message : String(e) })
            return []
          }),
          c.getTaskTimeEntries(taskId).catch((e: unknown) => {
            sourcesUnavailable.push({ source: 'TimeEntries', error: e instanceof Error ? e.message : String(e) })
            return []
          }),
        ])

        const items = [
          ...notes.map((n) => ({
            sourceEntity: 'TaskNotes' as const,
            id: n.id,
            at: n.createDateTime ?? n.lastActivityDate ?? '',
            atField: n.createDateTime ? 'createDateTime' : 'lastActivityDate',
            title: n.title ?? null,
            body: n.description ?? null,
            authorResourceId: n.creatorResourceID ?? null,
            publish: n.publish ?? null,
            // publish 1 is the customer-visible state on this instance, despite
            // its "All Autotask Users" label. Never infer this from the number.
            customerVisible: n.publish == null ? null : n.publish === 1,
            work: null,
          })),
          ...times.map((t) => {
            const raw = t as unknown as Record<string, unknown>
            return {
              sourceEntity: 'TimeEntries' as const,
              id: t.id,
              at: (raw.dateWorked as string) ?? (raw.createDateTime as string) ?? '',
              atField: raw.dateWorked ? 'dateWorked' : 'createDateTime',
              title: null,
              body: (raw.summaryNotes as string) ?? null,
              authorResourceId: (raw.resourceID as number) ?? null,
              publish: null,
              // TimeEntries has no publish field in the REST API. Reported as
              // unknown with the reason rather than guessed at.
              customerVisible: null as boolean | null,
              work: {
                dateWorked: (raw.dateWorked as string) ?? null,
                hoursWorked: (raw.hoursWorked as number) ?? null,
                startDateTime: (raw.startDateTime as string) ?? null,
                endDateTime: (raw.endDateTime as string) ?? null,
              },
            }
          }),
        ].sort((a, b) => {
          const ta = Date.parse(a.at); const tb = Date.parse(b.at)
          if (Number.isNaN(ta) && Number.isNaN(tb)) return a.id - b.id
          if (Number.isNaN(ta)) return 1
          if (Number.isNaN(tb)) return -1
          return ta - tb
        })

        const gap = computeTaskGap(task, items)
        return ok({
          taskId,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          taskTitle: task.title,
          itemCount: items.length,
          items,
          sourcesUnavailable,
          visibilityNote:
            'TimeEntries carries no publish field in the Autotask REST API, so customerVisible is null for every time entry — that is "not exposed", not "internal". TaskNotes publish 1 IS the customer-visible state on this instance.',
          ...gap,
        })
      } catch (e) { return fail(e, 'autotask_task_activity') }
    }
  )

  // =========================================================================
  // PROJECT WRITES
  // =========================================================================

  server.registerTool(
    'autotask_create_project',
    {
      title: 'Autotask: create project',
      description:
        'WRITE. Create a NEW Autotask project for a company, attributed to the signed-in technician. ' +
        'REQUIRED: companyId, projectName, projectType, status, startDateTime, endDateTime — Autotask marks all six required and the create is rejected without them. ' +
        PROJECT_TYPE_HELP + ' ' + PROJECT_STATUS_HELP + ' ' +
        'THE COMPANY IS PERMANENT: entityInformation reports Projects.companyID isReadOnly true, so the company is supplied by the URL at create time and a project can NEVER be moved to another company afterwards. Confirm the company with the user before calling. ' +
        'There is also no delete — Projects.canDelete is false — so a project created by mistake can only be set to status 0 (Inactive). ' +
        VERIFY_NOTE + ' ' + PATH_NOTE + ' ' +
        'Confirm the details with the user before calling.',
      inputSchema: {
        companyId: z.number().int().describe('Autotask company id (from autotask_search_companies). PERMANENT — a project cannot be reassigned to another company.'),
        projectName: z.string().describe('Project name (required)'),
        projectType: z.number().int().describe('Project type picklist id (required) — 5 Client, 4 Internal, 2 Proposal, 3 Template, 8 Baseline'),
        status: z.number().int().describe('Project status picklist id (required) — e.g. 1 New, 2 In Progress'),
        startDateTime: z.string().describe('Project start, ISO 8601 (required)'),
        endDateTime: z.string().describe('Project end, ISO 8601 (required)'),
        description: z.string().optional().describe('Project description'),
        projectLeadResourceID: z.number().int().optional().describe('Resource id of the project lead (from autotask_find_resource)'),
        contractID: z.number().int().optional().describe('Contract id to bill against (from autotask_list_contracts)'),
        department: z.number().int().optional().describe('Department picklist id'),
        extProjectNumber: z.string().optional().describe('External project number'),
        purchaseOrderNumber: z.string().optional().describe('Customer PO number'),
        statusDetail: z.string().optional().describe('Free-text status detail'),
        estimatedSalesCost: z.number().optional().describe('Estimated sales cost'),
        laborEstimatedCosts: z.number().optional().describe('Estimated labor cost'),
        laborEstimatedRevenue: z.number().optional().describe('Estimated labor revenue'),
        originalEstimatedRevenue: z.number().optional().describe('Original estimated revenue'),
        projectCostsBudget: z.number().optional().describe('Project costs budget'),
        projectCostsRevenue: z.number().optional().describe('Project costs revenue'),
        opportunityID: z.number().int().optional().describe('Originating opportunity id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_create_project'
      try {
        const { companyId, ...rest } = args
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()

        // Prove the company exists BEFORE writing: Projects.companyID comes
        // from the URL, and a bad parent id would otherwise surface as an
        // uninformative path 404 from every candidate.
        const company = await c.getCompanyById(companyId)
        if (!company) {
          return noSuchRecord('company', companyId, TOOL, 'Resolve the company first with autotask_search_companies({ query }).')
        }

        const fields = definedFields(rest) as unknown as write.ProjectCreateFields
        const res = await write.createProject(companyId, fields, rid)
        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the project create at ${res.pathUsed} but returned no itemId, so the new project cannot be identified or verified. Do NOT report a project as created until you have checked Autotask.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `Check the company's projects in Autotask before retrying — retrying blind risks a duplicate project, and Projects.canDelete is false so a duplicate cannot be removed. List them with autotask_company_projects({ companyId: ${companyId} }).`,
            surface: 'autotask', tool: TOOL,
            details: { companyId, pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getProjectById(newId)
        if (!after) return readBackFailed('project', newId, TOOL, res.pathUsed, getAutotaskProjectUrl(String(newId)))

        const { mismatches } = verifyWrittenFields({ ...fields, companyID: companyId }, null, after as unknown as Record<string, unknown>)
        if (mismatches.length) {
          return notVerified({ kind: 'project', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskProjectUrl(String(newId)) })
        }

        return ok({
          created: true, projectId: newId, projectUrl: getAutotaskProjectUrl(String(newId)),
          companyId, companyName: company.companyName ?? null,
          project: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The project was re-read by id after the create and every supplied field matched the stored value, including the company the URL supplied.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_project',
    {
      title: 'Autotask: update project',
      description:
        'WRITE. Update an EXISTING Autotask project in place, attributed to the signed-in technician. Supply projectId plus AT LEAST ONE field; a call supplying none is rejected as INVALID_INPUT. ' +
        'ONLY the fields you pass are written — Autotask PATCH updates just the properties named and leaves every omitted field untouched, so there is no GET-and-merge here and an unsupplied field can never be blanked. ' +
        'companyID is deliberately NOT a parameter: entityInformation reports it read-only, so a project cannot be moved between companies by anyone, through any route. ' +
        PROJECT_STATUS_HELP + ' ' + VERIFY_NOTE + ' ' + PATH_NOTE + ' Confirm the change with the user before calling.',
      inputSchema: {
        projectId: z.number().int().describe('Autotask project id'),
        projectName: z.string().optional().describe('Replacement project name'),
        projectType: z.number().int().optional().describe('Project type picklist id'),
        status: z.number().int().optional().describe('Project status picklist id — e.g. 2 In Progress, 5 Complete, 0 Inactive'),
        startDateTime: z.string().optional().describe('Project start, ISO 8601'),
        endDateTime: z.string().optional().describe('Project end, ISO 8601'),
        completedDateTime: z.string().optional().describe('Completion datetime, ISO 8601'),
        description: z.string().optional().describe('Replacement description — replaces the existing text entirely'),
        projectLeadResourceID: z.number().int().nullable().optional().describe('Project lead resource id; null clears it'),
        contractID: z.number().int().nullable().optional().describe('Contract id; null clears it'),
        department: z.number().int().optional().describe('Department picklist id'),
        extProjectNumber: z.string().optional().describe('External project number'),
        purchaseOrderNumber: z.string().optional().describe('Customer PO number'),
        statusDetail: z.string().optional().describe('Free-text status detail'),
        estimatedSalesCost: z.number().optional().describe('Estimated sales cost'),
        laborEstimatedCosts: z.number().optional().describe('Estimated labor cost'),
        laborEstimatedRevenue: z.number().optional().describe('Estimated labor revenue'),
        originalEstimatedRevenue: z.number().optional().describe('Original estimated revenue'),
        projectCostsBudget: z.number().optional().describe('Project costs budget'),
        projectCostsRevenue: z.number().optional().describe('Project costs revenue'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_update_project'
      try {
        const { projectId, ...rest } = args
        const requested = definedFields(rest)
        if (Object.keys(requested).length === 0) {
          return emptyEdit('project', projectId, TOOL, 'projectName, projectType, status, startDateTime, endDateTime, completedDateTime, description, projectLeadResourceID, contractID, department, extProjectNumber, purchaseOrderNumber, statusDetail, and the estimate/budget fields')
        }

        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getProjectById(projectId)
        if (!before) return noSuchRecord('project', projectId, TOOL, 'Check the id with autotask_company_projects({ companyId }) or autotask_active_projects.')

        const res = await write.updateProject(projectId, requested as write.ProjectUpdateFields, before.companyID, rid)
        const after = await c.getProjectById(projectId)
        if (!after) return readBackFailed('project', projectId, TOOL, res.pathUsed, getAutotaskProjectUrl(String(projectId)))

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'project', id: projectId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskProjectUrl(String(projectId)) })
        }

        return ok({
          projectId, projectUrl: getAutotaskProjectUrl(String(projectId)),
          writeVerified: true, requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(unchangedFields.length ? { unchangedNote: `${unchangedFields.join(' and ')} already held the requested value, so ${unchangedFields.length === 1 ? 'that field' : 'those fields'} did not actually change. Do not describe ${unchangedFields.length === 1 ? 'it' : 'them'} as edited.` } : {}),
          project: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The project was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_add_project_note',
    {
      title: 'Autotask: add project note',
      description:
        'WRITE. Add a note to an Autotask PROJECT (not a task, not a ticket), attributed to the signed-in technician. ' +
        NOTE_PUBLISH_HELP + ' ' +
        'isAnnouncement is required by Autotask and defaults to false; setting it true pins the note as a project announcement. ' +
        'THIS TOOL DOES NOT NOTIFY ANYONE. As with ticket notes, the REST note entities carry no notification field of any kind — recipients are chosen in Autotask\'s UI-only Notification panel and delivery depends on an Event an admin configured. Never tell the user a note reached someone. ' +
        'The response reports the note READ BACK with its stored publish id, so its actual visibility is observed rather than assumed. ' + PATH_NOTE,
      inputSchema: {
        projectId: z.number().int().describe('Autotask project id'),
        title: z.string().describe('Note title'),
        description: z.string().describe('Note body'),
        publish: z.number().int().optional().describe('1 = customer-visible ("All Autotask Users"), 2 = Internal Project Team (DEFAULT), 4 = Internal & Co-Managed. There is no 3.'),
        noteType: z.number().int().optional().describe('Note type picklist id; defaults to 3'),
        isAnnouncement: z.boolean().optional().describe('Pin as a project announcement (default false)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ projectId, title, description, publish, noteType, isAnnouncement }: any, extra: any) => {
      const TOOL = 'autotask_add_project_note'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const project = await c.getProjectById(projectId)
        if (!project) return noSuchRecord('project', projectId, TOOL, 'Check the id with autotask_company_projects({ companyId }).')

        const res = await write.createProjectNote(projectId, { title, description, publish, noteType, isAnnouncement }, rid)
        const noteId = res.result?.itemId
        const after = noteId ? await c.getProjectNoteByNoteId(noteId).catch(() => null) : null

        return ok({
          created: true, noteId: noteId ?? null, projectId,
          projectUrl: getAutotaskProjectUrl(String(projectId)),
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          noteReadBack: !!after,
          note: after,
          storedPublish: after?.publish ?? null,
          visibility: after?.publish == null ? 'unknown' : after.publish === 1 ? 'customer_visible' : 'internal',
          readBackNote: after
            ? null
            : 'The note was created but could not be read back, so its stored visibility is unconfirmed. Check the project in Autotask before describing who can see it.',
          notificationNote:
            'This tool did not notify anyone and cannot: the REST project-note entity has no notification field. Posting a note is not the same as contacting a person.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  // =========================================================================
  // PHASE WRITES
  // =========================================================================

  server.registerTool(
    'autotask_create_project_phase',
    {
      title: 'Autotask: create project phase',
      description:
        'WRITE. Create a phase inside an Autotask project, attributed to the signed-in technician. Only title is required. ' +
        'Phases are OPTIONAL for tasks — Tasks.phaseID is not required — so create a phase only when the project is genuinely being structured, not as a prerequisite for adding tasks. ' +
        'THE PROJECT IS PERMANENT: entityInformation reports Phases.projectID isReadOnly true, so the project comes from the URL and a phase can never be moved to another project. Phases.canDelete is false — there is no delete. ' +
        'parentPhaseID nests this phase under another one in the same project. ' + VERIFY_NOTE + ' ' + PATH_NOTE,
      inputSchema: {
        projectId: z.number().int().describe('Autotask project id — PERMANENT, a phase cannot be moved between projects'),
        title: z.string().describe('Phase title (required)'),
        description: z.string().optional().describe('Phase description'),
        startDate: z.string().optional().describe('Phase start, ISO 8601'),
        dueDate: z.string().optional().describe('Phase due date, ISO 8601'),
        parentPhaseID: z.number().int().optional().describe('Parent phase id, to nest this phase (must be in the same project)'),
        externalID: z.string().optional().describe('External id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ projectId, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_create_project_phase'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const project = await c.getProjectById(projectId)
        if (!project) return noSuchRecord('project', projectId, TOOL, 'Check the id with autotask_company_projects({ companyId }).')

        const fields = definedFields(rest) as unknown as write.PhaseFields
        const res = await write.createProjectPhase(projectId, fields, rid)
        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the phase create at ${res.pathUsed} but returned no itemId, so the new phase cannot be verified.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `List the project's phases with autotask_project_detail({ projectId: ${projectId} }) to see whether it was created before retrying — Phases.canDelete is false, so a duplicate cannot be removed.`,
            surface: 'autotask', tool: TOOL,
            details: { projectId, pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getPhaseById(newId)
        if (!after) return readBackFailed('phase', newId, TOOL, res.pathUsed, getAutotaskProjectUrl(String(projectId)))

        const { mismatches } = verifyWrittenFields({ ...fields, projectID: projectId }, null, after as unknown as Record<string, unknown>)
        if (mismatches.length) {
          return notVerified({ kind: 'phase', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskProjectUrl(String(projectId)) })
        }

        return ok({
          created: true, phaseId: newId, projectId, phase: after, writeVerified: true,
          projectUrl: getAutotaskProjectUrl(String(projectId)),
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The phase was re-read by id after the create and every supplied field matched, including the project the URL supplied.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_project_phase',
    {
      title: 'Autotask: update project phase',
      description:
        'WRITE. Update an existing project phase in place, attributed to the signed-in technician. Supply phaseId plus at least one field. ' +
        'The phase\'s project cannot be changed (Phases.projectID is read-only) and a phase cannot be deleted (Phases.canDelete false). ' +
        VERIFY_NOTE + ' ' + PATH_NOTE,
      inputSchema: {
        phaseId: z.number().int().describe('Autotask phase id (from autotask_project_detail)'),
        title: z.string().optional().describe('Replacement phase title'),
        description: z.string().optional().describe('Replacement description'),
        startDate: z.string().optional().describe('Phase start, ISO 8601'),
        dueDate: z.string().optional().describe('Phase due date, ISO 8601'),
        parentPhaseID: z.number().int().optional().describe('Parent phase id'),
        externalID: z.string().optional().describe('External id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ phaseId, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_update_project_phase'
      try {
        const requested = definedFields(rest)
        if (Object.keys(requested).length === 0) {
          return emptyEdit('phase', phaseId, TOOL, 'title, description, startDate, dueDate, parentPhaseID, externalID')
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getPhaseById(phaseId)
        if (!before) return noSuchRecord('phase', phaseId, TOOL, 'List the project\'s phases with autotask_project_detail({ projectId }).')

        const res = await write.updateProjectPhase(phaseId, before.projectID, requested, rid)
        const after = await c.getPhaseById(phaseId)
        if (!after) return readBackFailed('phase', phaseId, TOOL, res.pathUsed)

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'phase', id: phaseId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskProjectUrl(String(before.projectID)) })
        }
        return ok({
          phaseId, projectId: before.projectID, writeVerified: true,
          requestedFields: Object.keys(requested), changedFields, unchangedFields,
          phase: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          projectUrl: getAutotaskProjectUrl(String(before.projectID)),
          verifiedBy: 'The phase was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  // =========================================================================
  // TASK WRITES
  // =========================================================================

  server.registerTool(
    'autotask_create_task',
    {
      title: 'Autotask: create project task',
      description:
        'WRITE. Create a NEW task inside an Autotask project, attributed to the signed-in technician. ' +
        'REQUIRED: projectId, title, status, taskType. ' + TASK_STATUS_HELP + ' ' +
        'taskType picklist (live 2026-08-25): 1 FixedWork, 2 FixedDuration — there are only these two. ' +
        'ASSIGNMENT: Autotask rejects a resource without a role ("Data violation: you must assign both a assignedResourceID and assignedResourceRoleID"), so passing assignedResourceID alone DEFAULTS the role to Engineer (29683355) rather than failing. ' + ROLE_HELP + ' ' +
        'phaseID is OPTIONAL — a task does not need a phase. If you pass one it must belong to the same project, which this tool checks before writing. ' +
        'Tasks.canDelete is false: a task created by mistake cannot be deleted, only completed or retitled. ' +
        VERIFY_NOTE + ' ' + PATH_NOTE + ' Confirm the details with the user before calling.',
      inputSchema: {
        projectId: z.number().int().describe('Autotask project id the task belongs to (required)'),
        title: z.string().describe('Task title (required)'),
        status: z.number().int().describe('Task status picklist id (required) — 1 New, 8 In Progress, 5 Complete. There is NO id 4 on this instance.'),
        taskType: z.number().int().describe('Task type (required) — 1 FixedWork or 2 FixedDuration'),
        phaseID: z.number().int().optional().describe('Phase id within the SAME project (optional — tasks do not require a phase)'),
        description: z.string().optional().describe('Task description'),
        startDateTime: z.string().optional().describe('Task start, ISO 8601'),
        endDateTime: z.string().optional().describe('Task end / due, ISO 8601'),
        estimatedHours: z.number().optional().describe('Estimated hours'),
        remainingHours: z.number().optional().describe('Remaining hours'),
        assignedResourceID: z.number().int().optional().describe('Primary assigned resource id (from autotask_find_resource)'),
        assignedResourceRoleID: z.number().int().optional().describe('Role for that resource — REQUIRED BY AUTOTASK whenever assignedResourceID is set; defaults to Engineer 29683355 if omitted'),
        priorityLabel: z.number().int().optional().describe('Priority picklist id — resolve with autotask_entity_picklist({entity:"Tasks", field:"priorityLabel"})'),
        departmentID: z.number().int().optional().describe('Department picklist id'),
        taskCategoryID: z.number().int().optional().describe('Task category picklist id'),
        billingCodeID: z.number().int().optional().describe('Billing code / work type id (from autotask_list_billing_codes)'),
        companyLocationID: z.number().int().optional().describe('Company location id'),
        purchaseOrderNumber: z.string().optional().describe('Customer PO number'),
        externalID: z.string().optional().describe('External id'),
        isVisibleInClientPortal: z.boolean().optional().describe('Show this task to the customer in the Client Portal'),
        canClientPortalUserCompleteTask: z.boolean().optional().describe('Let a Client Portal user mark this task complete'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_create_task'
      try {
        const { projectId, ...rest } = args
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()

        const project = await c.getProjectById(projectId)
        if (!project) return noSuchRecord('project', projectId, TOOL, 'Check the id with autotask_company_projects({ companyId }) or autotask_active_projects.')

        // A phase from a DIFFERENT project is the one cross-record mistake this
        // create can make, and Autotask's own error for it names neither id.
        if (rest.phaseID != null) {
          const phase = await c.getPhaseById(rest.phaseID)
          if (!phase) return noSuchRecord('phase', rest.phaseID, TOOL, `List this project's phases with autotask_project_detail({ projectId: ${projectId} }).`)
          if (phase.projectID !== projectId) {
            return failureResult({
              reasonCode: 'INVALID_INPUT',
              message: `Phase ${rest.phaseID} belongs to project ${phase.projectID}, not project ${projectId}, so the task was NOT created. A task's phase must be in its own project.`,
              evidence: `Read Phases.projectID for phase ${rest.phaseID} before writing and compared it against the requested project.`,
              remediation: `Either use a phase from project ${projectId} (autotask_project_detail({ projectId: ${projectId} })) or drop phaseID — tasks do not require a phase.`,
              surface: 'autotask', tool: TOOL,
              details: { projectId, phaseId: rest.phaseID, phaseBelongsToProjectId: phase.projectID },
            })
          }
        }

        const fields = definedFields(rest) as unknown as write.TaskCreateFields
        const roleDefaulted = rest.assignedResourceID != null && rest.assignedResourceRoleID == null
        const res = await write.createTask(projectId, fields, rid)
        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the task create at ${res.pathUsed} but returned no itemId, so the new task cannot be identified or verified. Do NOT report a task as created.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `List the project's tasks with autotask_project_detail({ projectId: ${projectId} }) before retrying — Tasks.canDelete is false, so a duplicate cannot be removed.`,
            surface: 'autotask', tool: TOOL,
            details: { projectId, pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getTaskById(newId)
        if (!after) return readBackFailed('task', newId, TOOL, res.pathUsed, getAutotaskTaskUrl(String(newId)))

        const expected: Record<string, unknown> = { ...fields, projectID: projectId }
        if (roleDefaulted) expected.assignedResourceRoleID = write.DEFAULT_ASSIGNED_RESOURCE_ROLE_ID
        const { mismatches } = verifyWrittenFields(expected, null, after as unknown as Record<string, unknown>)
        if (mismatches.length) {
          return notVerified({ kind: 'task', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskTaskUrl(String(newId)) })
        }

        return ok({
          created: true, taskId: newId, projectId,
          taskUrl: getAutotaskTaskUrl(String(newId)), projectUrl: getAutotaskProjectUrl(String(projectId)),
          task: after, writeVerified: true,
          ...(roleDefaulted ? { roleDefaulted: true, roleDefaultedNote: `assignedResourceRoleID was not supplied and defaulted to Engineer (${write.DEFAULT_ASSIGNED_RESOURCE_ROLE_ID}); Autotask rejects a resource without a role.` } : {}),
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The task was re-read by id after the create and every supplied field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_task',
    {
      title: 'Autotask: update project task',
      description:
        'WRITE. Update an EXISTING Autotask project task in place — status, title, description, dates, hours, assignment, phase — attributed to the signed-in technician. Supply taskId plus AT LEAST ONE field. ' +
        'THIS WORKS. A previous connector note recorded task update as BLOCKED on a 404; that was wrong. Live entityInformation reports Tasks.canUpdate true, and the old failure came from a fallback chain that tried ProjectTasks — an entity which does not exist on this instance — and reported its 404 in place of the real error from the correct path. ' +
        TASK_STATUS_HELP + ' ' +
        'ASSIGNMENT: setting assignedResourceID without assignedResourceRoleID defaults the role to Engineer (29683355), because Autotask rejects the resource on its own. ' + ROLE_HELP + ' Passing assignedResourceID: null clears the assignment and deliberately does NOT acquire a role. ' +
        'ONLY the fields you pass are written; omitted fields are untouched. ' + VERIFY_NOTE + ' ' + PATH_NOTE + ' Confirm the change with the user before calling.',
      inputSchema: {
        taskId: z.number().int().describe('Autotask task id (Tasks.id)'),
        title: z.string().optional().describe('Replacement task title'),
        status: z.number().int().optional().describe('Task status picklist id — 1 New, 8 In Progress, 5 Complete, 52 Complete - No Notify. There is NO id 4 on this instance.'),
        taskType: z.number().int().optional().describe('1 FixedWork or 2 FixedDuration'),
        phaseID: z.number().int().nullable().optional().describe('Move the task to this phase (must be in the same project); null removes it from its phase'),
        description: z.string().optional().describe('Replacement description — replaces the existing text entirely'),
        startDateTime: z.string().optional().describe('Task start, ISO 8601'),
        endDateTime: z.string().optional().describe('Task end / due, ISO 8601'),
        estimatedHours: z.number().optional().describe('Estimated hours'),
        remainingHours: z.number().optional().describe('Remaining hours'),
        assignedResourceID: z.number().int().nullable().optional().describe('Assigned resource id; null clears the assignment'),
        assignedResourceRoleID: z.number().int().nullable().optional().describe('Role for that resource — required by Autotask alongside it; defaults to Engineer 29683355'),
        priorityLabel: z.number().int().optional().describe('Priority picklist id'),
        departmentID: z.number().int().optional().describe('Department picklist id'),
        taskCategoryID: z.number().int().optional().describe('Task category picklist id'),
        billingCodeID: z.number().int().optional().describe('Billing code / work type id'),
        companyLocationID: z.number().int().optional().describe('Company location id'),
        purchaseOrderNumber: z.string().optional().describe('Customer PO number'),
        externalID: z.string().optional().describe('External id'),
        isVisibleInClientPortal: z.boolean().optional().describe('Show this task to the customer in the Client Portal'),
        canClientPortalUserCompleteTask: z.boolean().optional().describe('Let a Client Portal user mark this task complete'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_update_task'
      try {
        const { taskId, ...rest } = args
        const requested = definedFields(rest)
        if (Object.keys(requested).length === 0) {
          return emptyEdit('task', taskId, TOOL, 'title, status, taskType, phaseID, description, startDateTime, endDateTime, estimatedHours, remainingHours, assignedResourceID (+ assignedResourceRoleID), priorityLabel, departmentID, taskCategoryID, billingCodeID, companyLocationID, purchaseOrderNumber, externalID, isVisibleInClientPortal, canClientPortalUserCompleteTask')
        }

        const rid = await resolveResourceId(emailOf(extra))
        const c = client()

        // The pre-read proves the task exists, supplies projectID for the
        // parent-scoped URL, and captures the before-values the verification
        // compares against. All three, from one query.
        const before = await c.getTaskById(taskId)
        if (!before) return noSuchRecord('task', taskId, TOOL, 'Check the id with autotask_project_detail({ projectId }) — a PROJECT id passed here will not match a task.')

        if (rest.phaseID != null) {
          const phase = await c.getPhaseById(rest.phaseID)
          if (!phase) return noSuchRecord('phase', rest.phaseID, TOOL, `List this project's phases with autotask_project_detail({ projectId: ${before.projectID} }).`)
          if (phase.projectID !== before.projectID) {
            return failureResult({
              reasonCode: 'INVALID_INPUT',
              message: `Phase ${rest.phaseID} belongs to project ${phase.projectID}, but task ${taskId} is in project ${before.projectID}. Nothing was written — a task cannot be moved into another project's phase.`,
              evidence: `Read Phases.projectID for phase ${rest.phaseID} and Tasks.projectID for task ${taskId} before writing, and compared them.`,
              remediation: `Use a phase from project ${before.projectID} (autotask_project_detail({ projectId: ${before.projectID} })), or pass phaseID: null to remove the task from its phase.`,
              surface: 'autotask', tool: TOOL,
              details: { taskId, taskProjectId: before.projectID, phaseId: rest.phaseID, phaseProjectId: phase.projectID },
            })
          }
        }

        const roleDefaulted = typeof rest.assignedResourceID === 'number' && rest.assignedResourceID > 0 && rest.assignedResourceRoleID == null
        const res = await write.updateTask(taskId, before.projectID, requested as write.TaskUpdateFields, rid)

        const after = await c.getTaskById(taskId)
        if (!after) return readBackFailed('task', taskId, TOOL, res.pathUsed, getAutotaskTaskUrl(String(taskId)))

        const expected: Record<string, unknown> = { ...requested }
        if (roleDefaulted) expected.assignedResourceRoleID = write.DEFAULT_ASSIGNED_RESOURCE_ROLE_ID
        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          expected, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'task', id: taskId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskTaskUrl(String(taskId)) })
        }

        return ok({
          taskId, projectId: before.projectID,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          writeVerified: true, requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(unchangedFields.length ? { unchangedNote: `${unchangedFields.join(' and ')} already held the requested value, so ${unchangedFields.length === 1 ? 'that field' : 'those fields'} did not actually change. Do not describe ${unchangedFields.length === 1 ? 'it' : 'them'} as edited.` } : {}),
          ...(roleDefaulted ? { roleDefaulted: true } : {}),
          task: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The task was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_add_task_note',
    {
      title: 'Autotask: add task note',
      description:
        'WRITE. Add a note to an Autotask project TASK, attributed to the signed-in technician. ' +
        NOTE_PUBLISH_HELP + ' ' + TASK_NOTE_TYPE_HELP + ' ' +
        'THIS TOOL DOES NOT NOTIFY ANYONE AND CANNOT. The REST note entities carry no notification field of any kind; recipients are chosen in Autotask\'s UI-only Notification panel and delivery depends on an Event an admin configured. Never report anyone as contacted because a note was posted. ' +
        'The response reports the note READ BACK with its stored publish id, so its visibility is observed rather than assumed — a POST\'s itemId proves a row exists, never that anyone can see it. ' +
        'There is no delete: TaskNotes.canDelete is false. Use autotask_update_task_note to correct a note instead of stacking a second one. ' + PATH_NOTE,
      inputSchema: {
        taskId: z.number().int().describe('Autotask task id'),
        title: z.string().describe('Note title'),
        description: z.string().describe('Note body'),
        publish: z.number().int().optional().describe('1 = customer-visible ("All Autotask Users"), 2 = Internal Project Team (DEFAULT), 4 = Internal & Co-Managed. There is no 3.'),
        noteType: z.number().int().optional().describe('1 Task Summary, 2 Task Detail, 3 Task Notes (default 3)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ taskId, title, description, publish, noteType }: any, extra: any) => {
      const TOOL = 'autotask_add_task_note'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const task = await c.getTaskById(taskId)
        if (!task) return noSuchRecord('task', taskId, TOOL, 'Check the id with autotask_project_detail({ projectId }).')

        const res = await write.createTaskNote(taskId, { title, description, publish, noteType }, rid)
        const noteId = res.result?.itemId
        const after = noteId ? await c.getTaskNoteByNoteId(noteId).catch(() => null) : null

        return ok({
          created: true, noteId: noteId ?? null, taskId, projectId: task.projectID,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          noteReadBack: !!after,
          note: after,
          storedPublish: after?.publish ?? null,
          visibility: after?.publish == null ? 'unknown' : after.publish === 1 ? 'customer_visible' : 'internal',
          readBackNote: after
            ? null
            : noteId
            ? 'The note was created but could not be read back, so its stored visibility is unconfirmed. Check the task in Autotask before describing who can see it.'
            : 'Autotask returned no itemId for the note, so nothing could be read back. Check the task before reporting the note as posted.',
          notificationNote:
            'This tool did not notify anyone and cannot: the REST TaskNotes entity has no notification field. Posting a note is not the same as contacting a person.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_task_note',
    {
      title: 'Autotask: edit an existing task note',
      description:
        'WRITE. Edit an EXISTING task note IN PLACE — use this to correct a note rather than posting a follow-up, because stacked corrections make a task unreadable for whoever has to follow it. ' +
        'Takes noteId (the NOTE\'s own id, from autotask_task_activity — not the task id) plus at least one of description, title, publish, noteType. ' +
        'VISIBILITY TRAP: changing publish can move a note from internal to customer-visible or the reverse. Whenever publish changes the response says so explicitly with both ids — remember 1 "All Autotask Users" is the CUSTOMER-VISIBLE state here, not an internal one. Editing the text of an already customer-visible note also changes what the customer can read. ' +
        'There is NO delete — TaskNotes.canDelete is false — so a note can be corrected but never removed; do not offer to delete one. ' +
        VERIFY_NOTE + ' ' + PATH_NOTE,
      inputSchema: {
        noteId: z.number().int().describe('The task NOTE id (TaskNotes.id) — from autotask_task_activity. NOT the task id.'),
        description: z.string().optional().describe('Replacement note body — replaces the text entirely, so pass the full corrected note'),
        title: z.string().optional().describe('Replacement note title'),
        publish: z.number().int().optional().describe('1 = customer-visible, 2 = Internal Project Team, 4 = Internal & Co-Managed. Changing this changes who can read the note.'),
        noteType: z.number().int().optional().describe('1 Task Summary, 2 Task Detail, 3 Task Notes'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ noteId, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_update_task_note'
      try {
        const requested = definedFields(rest)
        if (Object.keys(requested).length === 0) {
          return emptyEdit('task note', noteId, TOOL, 'description, title, publish, noteType')
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getTaskNoteByNoteId(noteId)
        if (!before) return noSuchRecord('task note', noteId, TOOL, 'A TASK id passed here will not match a note. List a task\'s notes with autotask_task_activity({ taskId }) and use the id of the note you mean.')

        const res = await write.updateTaskNote(before.taskID, noteId, requested, rid)
        const after = await c.getTaskNoteByNoteId(noteId)
        if (!after) return readBackFailed('task note', noteId, TOOL, res.pathUsed, getAutotaskTaskUrl(String(before.taskID)))

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'task note', id: noteId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskTaskUrl(String(before.taskID)) })
        }

        const publishChanged = (before.publish ?? null) !== (after.publish ?? null)
        const scopeOf = (p: number | null | undefined) => (p == null ? 'unknown' : p === 1 ? 'customer_visible' : 'internal')
        return ok({
          noteId, taskId: before.taskID, taskUrl: getAutotaskTaskUrl(String(before.taskID)),
          editVerified: true, requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(unchangedFields.length ? { unchangedNote: `${unchangedFields.join(' and ')} already held the requested value.` } : {}),
          note: after,
          publishChanged,
          publishBefore: { publish: before.publish ?? null, visibility: scopeOf(before.publish) },
          publishAfter: { publish: after.publish ?? null, visibility: scopeOf(after.publish) },
          publishChangeNote: !publishChanged
            ? `The note's publish level was NOT changed — it remains ${before.publish ?? 'unset'} (${scopeOf(before.publish)}).`
            : scopeOf(after.publish) === 'customer_visible'
            ? `VISIBILITY CHANGED: this note moved from publish ${before.publish ?? 'unset'} to ${after.publish ?? 'unset'}. TELL THE USER THIS NOTE IS NOW CUSTOMER-VISIBLE — customers with Client Portal access to the project can now read it.`
            : `VISIBILITY CHANGED: this note moved from publish ${before.publish ?? 'unset'} to ${after.publish ?? 'unset'}. TELL THE USER THIS NOTE IS NO LONGER CUSTOMER-VISIBLE.`,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The note was re-read by id after the write and every requested field matched. Autotask records the editing technician in impersonatorUpdaterResourceID.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  // =========================================================================
  // TIME ENTRIES
  // =========================================================================

  server.registerTool(
    'autotask_create_task_time_entry',
    {
      title: 'Autotask: log time on a project task',
      description:
        'WRITE, BILLABLE. Log time against a project TASK (use autotask_create_time_entry for a ticket instead), attributed to the signed-in technician as the resource. ' +
        'Pass EITHER hoursWorked OR startDateTime + stopDateTime — with both times, hoursWorked is derived from the interval. Unlike Service TICKETS, tasks do not require a start/stop pair. ' +
        'roleId is optional at the entity level here but Autotask commonly requires it for billable work; pass it when you know it. ' + ROLE_HELP + ' ' +
        'summaryNotes follows TCT format: Actions Taken; Root Cause/Findings; Resolution; Next Steps/Escalation; Status — prose, no bullets, do not restate the issue. ' +
        'READ-BACK VERIFIED: the time entry is re-read and its hours, date and task checked, so an accepted POST that did not store what you asked for returns PRECONDITION_FAILED rather than success. ' + PATH_NOTE + ' ' +
        'Only call after the user approves the hours and the text.',
      inputSchema: {
        taskId: z.number().int().describe('Autotask task id to log against'),
        summaryNotes: z.string().describe('Work summary in TCT format (customer-visible on the task)'),
        hoursWorked: z.number().positive().optional().describe('Hours worked; optional if start+stop are given'),
        startDateTime: z.string().optional().describe('Work start, ISO 8601'),
        stopDateTime: z.string().optional().describe('Work stop, ISO 8601'),
        dateWorked: z.string().optional().describe('YYYY-MM-DD; defaults to the start date or today'),
        roleId: z.number().int().optional().describe('Autotask role id for the work (from autotask_list_roles)'),
        internalNotes: z.string().optional().describe('Internal-only notes'),
        billingCodeId: z.number().int().optional().describe('Billing code / work type id (from autotask_list_billing_codes)'),
        isNonBillable: z.boolean().optional().describe('Mark this time non-billable'),
        showOnInvoice: z.boolean().optional().describe('Show this entry on the customer invoice'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_create_task_time_entry'
      try {
        const { taskId, hoursWorked, startDateTime, stopDateTime } = args
        if (hoursWorked == null && !(startDateTime && stopDateTime)) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: 'No duration was supplied, so nothing was written. Pass hoursWorked, or both startDateTime and stopDateTime.',
            evidence: 'The tool refuses a durationless time entry before contacting Autotask — an entry with no hours is not a record of work and would have to be corrected by hand.',
            remediation: 'Call again with hoursWorked (e.g. 1.5), or with startDateTime and stopDateTime, from which the hours are derived.',
            surface: 'autotask', tool: TOOL, details: { taskId },
          })
        }

        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const task = await c.getTaskById(taskId)
        if (!task) return noSuchRecord('task', taskId, TOOL, 'Check the id with autotask_project_detail({ projectId }).')

        const res = await write.createTaskTimeEntry({
          taskID: taskId,
          resourceID: rid,
          roleID: args.roleId,
          hoursWorked, dateWorked: args.dateWorked, startDateTime, stopDateTime,
          summaryNotes: args.summaryNotes, internalNotes: args.internalNotes,
          billingCodeID: args.billingCodeId,
          isNonBillable: args.isNonBillable, showOnInvoice: args.showOnInvoice,
        }, rid)

        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the time entry at ${res.pathUsed} but returned no itemId, so it cannot be verified. Do NOT report the time as logged.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `Check the task's time in Autotask with autotask_task_activity({ taskId: ${taskId} }) before retrying — retrying blind risks double-billing the customer.`,
            surface: 'autotask', tool: TOOL, details: { taskId, pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getTimeEntryById(newId)
        if (!after) return readBackFailed('time entry', newId, TOOL, res.pathUsed, getAutotaskTaskUrl(String(taskId)))

        const stored = after as unknown as Record<string, unknown>
        const { mismatches } = verifyWrittenFields(
          definedFields({ taskID: taskId, resourceID: rid, summaryNotes: args.summaryNotes, hoursWorked }),
          null, stored,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'time entry', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts, url: getAutotaskTaskUrl(String(taskId)) })
        }

        return ok({
          created: true, timeEntryId: newId, taskId, projectId: task.projectID,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          hoursWorked: stored.hoursWorked ?? null, dateWorked: stored.dateWorked ?? null,
          timeEntry: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The time entry was re-read by id after the create; the task, resource, hours and summary all matched what was requested.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_time_entry',
    {
      title: 'Autotask: edit a time entry',
      description:
        'WRITE, BILLABLE. Correct an EXISTING time entry in place — its summary, hours, date, role or billing code — on a task OR a ticket, attributed to the signed-in technician. Supply timeEntryId plus at least one field. ' +
        'Use this to fix a summary or an hours figure rather than logging a second entry, which would double-count the work against the customer. ' +
        'This tool does NOT delete time. Autotask reports TimeEntries.canDelete true, but deleting billable time is not exposed here deliberately — see knownLimits. ' +
        'CHANGING hoursWorked CHANGES WHAT THE CUSTOMER IS BILLED if the entry is billable and not yet invoiced. Confirm the new figure with the user before calling. ' +
        VERIFY_NOTE,
      inputSchema: {
        timeEntryId: z.number().int().describe('Autotask time entry id (from autotask_task_activity or autotask_ticket_time_entries)'),
        summaryNotes: z.string().optional().describe('Replacement work summary — replaces the text entirely'),
        internalNotes: z.string().optional().describe('Replacement internal notes'),
        hoursWorked: z.number().positive().optional().describe('Replacement hours — CHANGES BILLING if the entry is billable and uninvoiced'),
        dateWorked: z.string().optional().describe('YYYY-MM-DD the work was done'),
        startDateTime: z.string().optional().describe('Work start, ISO 8601'),
        endDateTime: z.string().optional().describe('Work stop, ISO 8601'),
        roleId: z.number().int().optional().describe('Autotask role id'),
        billingCodeId: z.number().int().optional().describe('Billing code / work type id'),
        isNonBillable: z.boolean().optional().describe('Mark the entry non-billable'),
        showOnInvoice: z.boolean().optional().describe('Show the entry on the customer invoice'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_update_time_entry'
      try {
        const { timeEntryId, roleId, billingCodeId, ...rest } = args
        const requested = definedFields({ ...rest, roleID: roleId, billingCodeID: billingCodeId })
        if (Object.keys(requested).length === 0) {
          return emptyEdit('time entry', timeEntryId, TOOL, 'summaryNotes, internalNotes, hoursWorked, dateWorked, startDateTime, endDateTime, roleId, billingCodeId, isNonBillable, showOnInvoice')
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getTimeEntryById(timeEntryId)
        if (!before) return noSuchRecord('time entry', timeEntryId, TOOL, 'Find the entry with autotask_task_activity({ taskId }) or autotask_ticket_time_entries({ ticketId }).')

        const res = await write.updateTimeEntry(timeEntryId, requested as write.TimeEntryEdit, rid)
        const after = await c.getTimeEntryById(timeEntryId)
        if (!after) return readBackFailed('time entry', timeEntryId, TOOL, res.pathUsed)

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'time entry', id: timeEntryId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts })
        }

        const beforeHours = (before as unknown as Record<string, unknown>).hoursWorked
        const afterHours = (after as unknown as Record<string, unknown>).hoursWorked
        return ok({
          timeEntryId, writeVerified: true,
          requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(changedFields.includes('hoursWorked')
            ? { billingNote: `HOURS CHANGED from ${String(beforeHours)} to ${String(afterHours)}. If this entry is billable and not yet invoiced, what the customer is billed has changed — say so.` }
            : {}),
          timeEntry: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The time entry was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  // =========================================================================
  // TASK SECONDARY RESOURCES AND PREDECESSORS
  // =========================================================================

  server.registerTool(
    'autotask_add_task_secondary_resource',
    {
      title: 'Autotask: add a secondary resource to a task',
      description:
        'WRITE. Add an ADDITIONAL technician to a project task, alongside its primary assigned resource (which is set with autotask_update_task). ' +
        'resourceId AND roleId are BOTH REQUIRED — entityInformation marks both isRequired on TaskSecondaryResources, so this is another Autotask field pair that must travel together; the tool takes both rather than defaulting one. ' + ROLE_HELP + ' ' +
        'These rows CANNOT be edited: entityInformation reports canUpdate FALSE. To change a secondary resource\'s role, remove the row and add a new one. ' +
        'The write is verified by re-listing the task\'s secondary resources and finding the new row. ' + PATH_NOTE,
      inputSchema: {
        taskId: z.number().int().describe('Autotask task id'),
        resourceId: z.number().int().describe('Resource id to add (from autotask_find_resource) — REQUIRED'),
        roleId: z.number().int().describe('Role id that resource works in — REQUIRED by Autotask alongside the resource'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ taskId, resourceId, roleId }: any, extra: any) => {
      const TOOL = 'autotask_add_task_secondary_resource'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const task = await c.getTaskById(taskId)
        if (!task) return noSuchRecord('task', taskId, TOOL, 'Check the id with autotask_project_detail({ projectId }).')

        const existing = await c.getTaskSecondaryResources(taskId)
        const duplicate = existing.find((r) => r.resourceID === resourceId && r.roleID === roleId)
        if (duplicate) {
          return ok({
            created: false, alreadyPresent: true, taskId,
            secondaryResourceRowId: duplicate.id, resourceId, roleId,
            note: `Resource ${resourceId} is already a secondary resource on task ${taskId} in role ${roleId} (row ${duplicate.id}). Nothing was written — do not describe this as a new assignment.`,
            secondaryResources: existing,
          })
        }

        const res = await write.addTaskSecondaryResource(taskId, resourceId, roleId, rid)
        const after = await c.getTaskSecondaryResources(taskId)
        const created = after.find((r) => r.resourceID === resourceId && r.roleID === roleId)
        if (!created) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the write at ${res.pathUsed} but re-listing task ${taskId}'s secondary resources does not show resource ${resourceId} in role ${roleId}. Do NOT report this person as assigned.`,
            evidence: 'Verified by re-reading TaskSecondaryResources for the task after the write, not by trusting the HTTP status.',
            remediation: `Check the task in Autotask: ${getAutotaskTaskUrl(String(taskId))}. The resource may not hold that role, or may not be permitted on this project.`,
            surface: 'autotask', tool: TOOL,
            details: { taskId, resourceId, roleId, pathUsed: res.pathUsed, pathAttempts: res.attempts, currentSecondaryResources: after },
          })
        }
        return ok({
          created: true, taskId, secondaryResourceRowId: created.id, resourceId, roleId,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          secondaryResources: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The task\'s secondary resources were re-listed after the write and the new row was found.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_remove_task_secondary_resource',
    {
      title: 'Autotask: remove a secondary resource from a task',
      description:
        'WRITE, DESTRUCTIVE (removes a row). Remove an additional technician from a project task. Takes the ROW id from autotask_add_task_secondary_resource or the secondaryResources list on that tool\'s response — NOT the resource id. ' +
        'This is how a secondary resource\'s ROLE is changed, since these rows cannot be updated (canUpdate false): remove, then add with the new role. ' +
        'Verified by re-listing the task\'s secondary resources and confirming the row is gone. ' + PATH_NOTE,
      inputSchema: {
        taskId: z.number().int().describe('Autotask task id'),
        secondaryResourceRowId: z.number().int().describe('The TaskSecondaryResources ROW id to remove — not the resource id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ taskId, secondaryResourceRowId }: any, extra: any) => {
      const TOOL = 'autotask_remove_task_secondary_resource'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const existing = await c.getTaskSecondaryResources(taskId)
        const row = existing.find((r) => r.id === secondaryResourceRowId)
        if (!row) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `Task ${taskId} has no secondary-resource row with id ${secondaryResourceRowId}, so nothing was removed.`,
            evidence: `Listed TaskSecondaryResources for task ${taskId} before writing; the rows present are ${existing.map((r) => `${r.id} (resource ${r.resourceID}, role ${r.roleID})`).join(', ') || 'none'}.`,
            remediation: 'Pass the ROW id, not the resource id. The rows above name both.',
            surface: 'autotask', tool: TOOL, details: { taskId, secondaryResourceRowId, currentRows: existing },
          })
        }

        const res = await write.removeTaskSecondaryResource(taskId, secondaryResourceRowId, rid)
        const after = await c.getTaskSecondaryResources(taskId)
        if (after.some((r) => r.id === secondaryResourceRowId)) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the delete at ${res.pathUsed} but row ${secondaryResourceRowId} is still on task ${taskId}. Do NOT report the resource as removed.`,
            evidence: 'Verified by re-listing TaskSecondaryResources for the task after the delete.',
            remediation: `Check the task in Autotask: ${getAutotaskTaskUrl(String(taskId))}.`,
            surface: 'autotask', tool: TOOL, details: { taskId, secondaryResourceRowId, pathUsed: res.pathUsed, currentRows: after },
          })
        }
        return ok({
          removed: true, taskId, secondaryResourceRowId,
          removedResourceId: row.resourceID, removedRoleId: row.roleID,
          taskUrl: getAutotaskTaskUrl(String(taskId)),
          secondaryResources: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The task\'s secondary resources were re-listed after the delete and the row is gone.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_add_task_predecessor',
    {
      title: 'Autotask: make one task depend on another',
      description:
        'WRITE. Create a predecessor dependency: the SUCCESSOR task cannot start until the PREDECESSOR finishes, optionally with a lag in days. Both tasks must be in the same project. ' +
        'The two task ids are FIXED once created — entityInformation reports predecessorTaskID and successorTaskID both isReadOnly, so only lagDays can be changed afterwards; to re-point a dependency, remove it and add a new one. ' +
        'Verified by re-listing the successor\'s predecessors and finding the link. ' + PATH_NOTE,
      inputSchema: {
        successorTaskId: z.number().int().describe('The task that WAITS (cannot start until the predecessor finishes)'),
        predecessorTaskId: z.number().int().describe('The task that must FINISH FIRST'),
        lagDays: z.number().int().optional().describe('Days of lag between predecessor finish and successor start'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ successorTaskId, predecessorTaskId, lagDays }: any, extra: any) => {
      const TOOL = 'autotask_add_task_predecessor'
      try {
        if (successorTaskId === predecessorTaskId) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `A task cannot depend on itself (both ids are ${successorTaskId}). Nothing was written.`,
            evidence: 'Checked before contacting Autotask — a self-dependency is never a valid schedule.',
            remediation: 'Pass two different task ids: successorTaskId waits, predecessorTaskId finishes first.',
            surface: 'autotask', tool: TOOL, details: { successorTaskId, predecessorTaskId },
          })
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const [successor, predecessor] = await Promise.all([c.getTaskById(successorTaskId), c.getTaskById(predecessorTaskId)])
        if (!successor) return noSuchRecord('task', successorTaskId, TOOL, 'Check the successor id with autotask_project_detail({ projectId }).')
        if (!predecessor) return noSuchRecord('task', predecessorTaskId, TOOL, 'Check the predecessor id with autotask_project_detail({ projectId }).')
        if (successor.projectID !== predecessor.projectID) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `These tasks are in different projects — task ${successorTaskId} is in project ${successor.projectID}, task ${predecessorTaskId} is in project ${predecessor.projectID}. Nothing was written.`,
            evidence: 'Read Tasks.projectID for both tasks before writing and compared them.',
            remediation: 'A dependency can only link tasks within one project. Pick both tasks from the same project.',
            surface: 'autotask', tool: TOOL,
            details: { successorTaskId, successorProjectId: successor.projectID, predecessorTaskId, predecessorProjectId: predecessor.projectID },
          })
        }

        const res = await write.addTaskPredecessor(successorTaskId, predecessorTaskId, lagDays, rid)
        const after = await c.getTaskPredecessors(successorTaskId)
        const created = after.find((p) => p.predecessorTaskID === predecessorTaskId)
        if (!created) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the write at ${res.pathUsed} but re-listing task ${successorTaskId}'s predecessors does not show task ${predecessorTaskId}. Do NOT report the dependency as created.`,
            evidence: 'Verified by re-reading TaskPredecessors for the successor after the write.',
            remediation: `Check the project schedule in Autotask: ${getAutotaskProjectUrl(String(successor.projectID))}. A dependency that would create a cycle is the usual cause.`,
            surface: 'autotask', tool: TOOL,
            details: { successorTaskId, predecessorTaskId, pathUsed: res.pathUsed, pathAttempts: res.attempts, currentPredecessors: after },
          })
        }
        return ok({
          created: true, predecessorRowId: created.id,
          successorTaskId, predecessorTaskId, lagDays: created.lagDays ?? null,
          projectId: successor.projectID,
          predecessors: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The successor task\'s predecessors were re-listed after the write and the link was found.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_remove_task_predecessor',
    {
      title: 'Autotask: remove a task dependency',
      description:
        'WRITE, DESTRUCTIVE (removes a row). Remove a predecessor dependency from a task. Takes the ROW id returned by autotask_add_task_predecessor (or listed in its response), NOT a task id. ' +
        'This is also how a dependency is RE-POINTED, since both task ids on the row are read-only: remove it and add the new one. ' +
        'Verified by re-listing the successor\'s predecessors and confirming the row is gone.',
      inputSchema: {
        successorTaskId: z.number().int().describe('The task that currently waits (the successor)'),
        predecessorRowId: z.number().int().describe('The TaskPredecessors ROW id to remove — not a task id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ successorTaskId, predecessorRowId }: any, extra: any) => {
      const TOOL = 'autotask_remove_task_predecessor'
      try {
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const existing = await c.getTaskPredecessors(successorTaskId)
        const row = existing.find((p) => p.id === predecessorRowId)
        if (!row) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `Task ${successorTaskId} has no predecessor row with id ${predecessorRowId}, so nothing was removed.`,
            evidence: `Listed TaskPredecessors for task ${successorTaskId} before writing; the rows present are ${existing.map((p) => `${p.id} (predecessor task ${p.predecessorTaskID})`).join(', ') || 'none'}.`,
            remediation: 'Pass the ROW id, not a task id. The rows above name both.',
            surface: 'autotask', tool: TOOL, details: { successorTaskId, predecessorRowId, currentRows: existing },
          })
        }
        const res = await write.removeTaskPredecessor(successorTaskId, predecessorRowId, rid)
        const after = await c.getTaskPredecessors(successorTaskId)
        if (after.some((p) => p.id === predecessorRowId)) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the delete at ${res.pathUsed} but row ${predecessorRowId} is still on task ${successorTaskId}. Do NOT report the dependency as removed.`,
            evidence: 'Verified by re-listing TaskPredecessors for the successor after the delete.',
            remediation: `Check the project schedule in Autotask: ${getAutotaskTaskUrl(String(successorTaskId))}.`,
            surface: 'autotask', tool: TOOL, details: { successorTaskId, predecessorRowId, pathUsed: res.pathUsed, currentRows: after },
          })
        }
        return ok({
          removed: true, successorTaskId, predecessorRowId,
          removedPredecessorTaskId: row.predecessorTaskID,
          predecessors: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The successor task\'s predecessors were re-listed after the delete and the row is gone.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  // =========================================================================
  // CRM: COMPANIES AND CONTACTS
  // =========================================================================

  server.registerTool(
    'autotask_create_company',
    {
      title: 'Autotask: create company',
      description:
        'WRITE, PERMANENT. Create a NEW company (customer, lead, prospect, vendor or partner) in Autotask, attributed to the signed-in technician. ' +
        'REQUIRED by Autotask: companyName, companyType, ownerResourceID, phone — all four are marked isRequired and the create fails without them. ' +
        'companyType picklist (live 2026-08-25): 1 Customer, 2 Lead, 3 Prospect, 4 Dead, 6 Cancellation, 7 Vendor, 8 Partner. There is no id 5. ' +
        'THERE IS NO DELETE. entityInformation reports Companies.canDelete FALSE — a company created by mistake can never be removed from Autotask, only set isActive false. Because of that, this tool REFUSES a create when a company with the same name already exists, and returns the existing id; pass allowDuplicateName: true only when a genuine second record is intended. ' +
        'Confirm the name, type and owner with the user before calling — this is CRM data other systems key off. ' +
        VERIFY_NOTE,
      inputSchema: {
        companyName: z.string().describe('Company name (required) — checked against existing companies before writing'),
        companyType: z.number().int().describe('Company type (required) — 1 Customer, 2 Lead, 3 Prospect, 7 Vendor, 8 Partner'),
        ownerResourceID: z.number().int().describe('Owning resource id (required) — the account owner, from autotask_find_resource or autotask_list_resources'),
        phone: z.string().describe('Main phone number (required by Autotask)'),
        allowDuplicateName: z.boolean().optional().describe('Create even though a company of this name exists. Default false — and remember a company can never be deleted.'),
        address1: z.string().optional().describe('Street address line 1'),
        address2: z.string().optional().describe('Street address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State / province'),
        postalCode: z.string().optional().describe('Postal / ZIP code'),
        countryID: z.number().int().optional().describe('Country id'),
        webAddress: z.string().optional().describe('Website URL'),
        fax: z.string().optional().describe('Fax number'),
        alternatePhone1: z.string().optional().describe('Alternate phone'),
        companyNumber: z.string().optional().describe('Your own reference number for this company'),
        parentCompanyID: z.number().int().optional().describe('Parent company id, for a subsidiary'),
        classification: z.number().int().optional().describe('Classification picklist id'),
        companyCategoryID: z.number().int().optional().describe('Company category id'),
        marketSegmentID: z.number().int().optional().describe('Market segment picklist id'),
        territoryID: z.number().int().optional().describe('Territory picklist id'),
        taxID: z.string().optional().describe('Tax id'),
        taxRegionID: z.number().int().optional().describe('Tax region id'),
        isTaxExempt: z.boolean().optional().describe('Tax exempt'),
        isActive: z.boolean().optional().describe('Active (defaults to active in Autotask)'),
        isEnabledForComanaged: z.boolean().optional().describe('Enable co-managed access'),
        invoiceMethod: z.number().int().optional().describe('Invoice method picklist id'),
        currencyID: z.number().int().optional().describe('Currency id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_create_company'
      try {
        const { allowDuplicateName, ...rest } = args
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()

        // Companies.canDelete is FALSE. A duplicate created here is permanent,
        // so the check is a refusal by default rather than a warning.
        if (!allowDuplicateName) {
          const clashes = await c.findCompaniesByExactName(rest.companyName)
          if (clashes.length) {
            return failureResult({
              reasonCode: 'PRECONDITION_FAILED',
              message:
                `A company named "${rest.companyName}" already exists in Autotask (id ${clashes.map((x) => x.id).join(', ')}). NOTHING was created. ` +
                'Autotask cannot delete companies, so a duplicate would be permanent — use the existing id, or call again with allowDuplicateName: true if a second record is genuinely intended.',
              evidence: `Queried Companies for an exact companyName match before writing and found ${clashes.length} row(s): ${clashes.map((x) => `${x.id} "${x.companyName}"`).join('; ')}. entityInformation reports Companies.canDelete false.`,
              remediation: `If this is the same organisation, use company id ${clashes[0].id} and update it with autotask_update_company instead. If it is genuinely a different organisation with the same name, re-call with allowDuplicateName: true.`,
              surface: 'autotask', tool: TOOL,
              details: { companyName: rest.companyName, existing: clashes.map((x) => ({ id: x.id, companyName: x.companyName })) },
            })
          }
        }

        const fields = definedFields(rest) as unknown as write.CompanyCreateFields
        const res = await write.createCompany(fields, rid)
        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the company create at ${res.pathUsed} but returned no itemId, so the new company cannot be identified or verified. Do NOT report a company as created.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `Search for it with autotask_search_companies({ query: ${JSON.stringify(rest.companyName)} }) before retrying — companies cannot be deleted, so a duplicate is permanent.`,
            surface: 'autotask', tool: TOOL, details: { pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getCompanyById(newId)
        if (!after) return readBackFailed('company', newId, TOOL, res.pathUsed)

        const { mismatches } = verifyWrittenFields(fields as unknown as Record<string, unknown>, null, after as unknown as Record<string, unknown>)
        if (mismatches.length) {
          return notVerified({ kind: 'company', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts })
        }
        return ok({
          created: true, companyId: newId, company: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          permanenceNote: 'Autotask cannot delete companies (canDelete false). If this was a mistake, the only remedy is autotask_update_company with isActive: false.',
          verifiedBy: 'The company was re-read by id after the create and every supplied field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_company',
    {
      title: 'Autotask: update company',
      description:
        'WRITE. Update an EXISTING Autotask company in place, attributed to the signed-in technician. Supply companyId plus at least one field. ' +
        'Setting isActive: false is the ONLY way to retire a company — Companies.canDelete is false, so there is no delete and none is faked here. ' +
        'Several Companies fields are read-only in the API and are deliberately not parameters: the billTo* address block (derived from the billing location), invoiceTemplateID, quoteTemplateID and apiVendorID. ' +
        'ONLY the fields you pass are written; omitted fields are untouched. ' + VERIFY_NOTE + ' Confirm the change with the user before calling — this is CRM data other systems key off.',
      inputSchema: {
        companyId: z.number().int().describe('Autotask company id'),
        companyName: z.string().optional().describe('Replacement company name'),
        companyType: z.number().int().optional().describe('Company type picklist id'),
        ownerResourceID: z.number().int().optional().describe('Owning resource id'),
        phone: z.string().optional().describe('Main phone number'),
        address1: z.string().optional().describe('Street address line 1'),
        address2: z.string().optional().describe('Street address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State / province'),
        postalCode: z.string().optional().describe('Postal / ZIP code'),
        countryID: z.number().int().optional().describe('Country id'),
        webAddress: z.string().optional().describe('Website URL'),
        fax: z.string().optional().describe('Fax number'),
        alternatePhone1: z.string().optional().describe('Alternate phone'),
        companyNumber: z.string().optional().describe('Your own reference number'),
        parentCompanyID: z.number().int().optional().describe('Parent company id'),
        classification: z.number().int().optional().describe('Classification picklist id'),
        companyCategoryID: z.number().int().optional().describe('Company category id'),
        marketSegmentID: z.number().int().optional().describe('Market segment picklist id'),
        territoryID: z.number().int().optional().describe('Territory picklist id'),
        taxID: z.string().optional().describe('Tax id'),
        taxRegionID: z.number().int().optional().describe('Tax region id'),
        isTaxExempt: z.boolean().optional().describe('Tax exempt'),
        isActive: z.boolean().optional().describe('false RETIRES the company — the only alternative to a delete Autotask does not offer'),
        isEnabledForComanaged: z.boolean().optional().describe('Enable co-managed access'),
        invoiceMethod: z.number().int().optional().describe('Invoice method picklist id'),
        currencyID: z.number().int().optional().describe('Currency id'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ companyId, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_update_company'
      try {
        const requested = definedFields(rest)
        if (Object.keys(requested).length === 0) {
          return emptyEdit('company', companyId, TOOL, 'companyName, companyType, ownerResourceID, phone, the address fields, webAddress, parentCompanyID, classification, companyCategoryID, marketSegmentID, territoryID, tax fields, isActive, isEnabledForComanaged, invoiceMethod, currencyID')
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getCompanyById(companyId)
        if (!before) return noSuchRecord('company', companyId, TOOL, 'Resolve the company with autotask_search_companies({ query }).')

        const res = await write.updateCompany(companyId, requested as write.CompanyUpdateFields, rid)
        const after = await c.getCompanyById(companyId)
        if (!after) return readBackFailed('company', companyId, TOOL, res.pathUsed)

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'company', id: companyId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts })
        }
        return ok({
          companyId, writeVerified: true,
          requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(unchangedFields.length ? { unchangedNote: `${unchangedFields.join(' and ')} already held the requested value.` } : {}),
          ...(changedFields.includes('isActive') && rest.isActive === false
            ? { retiredNote: `Company ${companyId} is now INACTIVE. It has not been deleted — Autotask cannot delete companies — so it still exists and can be reactivated.` }
            : {}),
          company: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The company was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_create_contact',
    {
      title: 'Autotask: create contact',
      description:
        'WRITE. Create a NEW contact under an Autotask company, attributed to the signed-in technician. ' +
        'REQUIRED: companyId, firstName, lastName. isActive defaults to active. ' +
        'THE COMPANY IS PERMANENT: entityInformation reports Contacts.companyID isReadOnly true, so the company is supplied by the URL and a contact can NEVER be moved to another company — a contact created under the wrong company must be deactivated and recreated. Confirm the company before calling. ' +
        'primaryContact and receivesEmailNotifications affect who Autotask emails about tickets, so set them deliberately rather than by default. ' +
        VERIFY_NOTE + ' ' + PATH_NOTE,
      inputSchema: {
        companyId: z.number().int().describe('Autotask company id (from autotask_search_companies) — PERMANENT, a contact cannot be reassigned'),
        firstName: z.string().describe('First name (required)'),
        lastName: z.string().describe('Last name (required)'),
        emailAddress: z.string().optional().describe('Primary email address'),
        title: z.string().optional().describe('Job title'),
        phone: z.string().optional().describe('Direct phone'),
        mobilePhone: z.string().optional().describe('Mobile phone'),
        alternatePhone: z.string().optional().describe('Alternate phone'),
        extension: z.string().optional().describe('Phone extension'),
        emailAddress2: z.string().optional().describe('Second email address'),
        emailAddress3: z.string().optional().describe('Third email address'),
        faxNumber: z.string().optional().describe('Fax number'),
        addressLine: z.string().optional().describe('Address line 1'),
        addressLine1: z.string().optional().describe('Address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State / province'),
        zipCode: z.string().optional().describe('Postal / ZIP code'),
        countryID: z.number().int().optional().describe('Country id'),
        companyLocationID: z.number().int().optional().describe('Company location id'),
        namePrefix: z.number().int().optional().describe('Name prefix picklist id'),
        middleInitial: z.string().optional().describe('Middle initial'),
        roomNumber: z.string().optional().describe('Room number'),
        note: z.string().optional().describe('Free-text note on the contact'),
        primaryContact: z.boolean().optional().describe('Make this the company\'s primary contact — affects who Autotask emails'),
        billingContact: z.boolean().optional().describe('Mark as the billing contact'),
        receivesEmailNotifications: z.boolean().optional().describe('Send this contact ticket notification emails'),
        externalID: z.string().optional().describe('External id'),
        isActive: z.boolean().optional().describe('Active (default true)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'autotask_create_contact'
      try {
        const { companyId, isActive, ...rest } = args
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const company = await c.getCompanyById(companyId)
        if (!company) return noSuchRecord('company', companyId, TOOL, 'Resolve the company first with autotask_search_companies({ query }).')

        // Autotask types Contacts.isActive as an INTEGER, not a boolean. The
        // tool takes a boolean because that is what a caller means, and the
        // conversion happens here rather than being pushed onto the caller.
        const fields = {
          ...definedFields(rest),
          isActive: isActive === false ? 0 : 1,
        } as unknown as write.ContactCreateFields

        const res = await write.createContact(companyId, fields, rid)
        const newId = res.result?.itemId
        if (!newId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the contact create at ${res.pathUsed} but returned no itemId, so the new contact cannot be identified or verified. Do NOT report a contact as created.`,
            evidence: 'A create is only confirmed by the id it returns; without one there is nothing to read back.',
            remediation: `List the company's contacts with autotask_company_contacts({ companyId: ${companyId} }) before retrying, to avoid a duplicate.`,
            surface: 'autotask', tool: TOOL, details: { companyId, pathUsed: res.pathUsed, pathAttempts: res.attempts },
          })
        }

        const after = await c.getContactById(newId)
        if (!after) return readBackFailed('contact', newId, TOOL, res.pathUsed)

        const { mismatches } = verifyWrittenFields(
          { ...(fields as unknown as Record<string, unknown>), companyID: companyId },
          null, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'contact', id: newId, tool: TOOL, mismatches, changedFields: [], pathUsed: res.pathUsed, attempts: res.attempts })
        }
        return ok({
          created: true, contactId: newId, companyId, companyName: company.companyName ?? null,
          contact: after, writeVerified: true,
          pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The contact was re-read by id after the create and every supplied field matched, including the company the URL supplied.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )

  server.registerTool(
    'autotask_update_contact',
    {
      title: 'Autotask: update contact',
      description:
        'WRITE. Update an EXISTING Autotask contact in place, attributed to the signed-in technician. Supply contactId plus at least one field. ' +
        'A contact\'s COMPANY cannot be changed — Contacts.companyID is read-only, so there is no parameter for it. ' +
        'Set isActive: false to retire someone who has left. Autotask DOES permit contact deletion (canDelete true), but this connector does not expose it: a deleted contact takes its ticket history association with it and cannot be recovered, whereas deactivation preserves the record. See knownLimits. ' +
        'Changing primaryContact or receivesEmailNotifications changes who Autotask emails about this company\'s tickets — say so when you do it. ' +
        'ONLY the fields you pass are written. ' + VERIFY_NOTE,
      inputSchema: {
        contactId: z.number().int().describe('Autotask contact id (from autotask_company_contacts or autotask_get_contact)'),
        firstName: z.string().optional().describe('First name'),
        lastName: z.string().optional().describe('Last name'),
        emailAddress: z.string().optional().describe('Primary email address'),
        title: z.string().optional().describe('Job title'),
        phone: z.string().optional().describe('Direct phone'),
        mobilePhone: z.string().optional().describe('Mobile phone'),
        alternatePhone: z.string().optional().describe('Alternate phone'),
        extension: z.string().optional().describe('Phone extension'),
        emailAddress2: z.string().optional().describe('Second email address'),
        emailAddress3: z.string().optional().describe('Third email address'),
        faxNumber: z.string().optional().describe('Fax number'),
        addressLine: z.string().optional().describe('Address line 1'),
        addressLine1: z.string().optional().describe('Address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State / province'),
        zipCode: z.string().optional().describe('Postal / ZIP code'),
        countryID: z.number().int().optional().describe('Country id'),
        companyLocationID: z.number().int().optional().describe('Company location id'),
        namePrefix: z.number().int().optional().describe('Name prefix picklist id'),
        middleInitial: z.string().optional().describe('Middle initial'),
        roomNumber: z.string().optional().describe('Room number'),
        note: z.string().optional().describe('Free-text note — replaces the existing note entirely'),
        primaryContact: z.boolean().optional().describe('Make this the company\'s primary contact — changes who Autotask emails'),
        billingContact: z.boolean().optional().describe('Mark as the billing contact'),
        receivesEmailNotifications: z.boolean().optional().describe('Send this contact ticket notification emails'),
        externalID: z.string().optional().describe('External id'),
        isActive: z.boolean().optional().describe('false RETIRES the contact — preferred over deletion, which this connector does not expose'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ contactId, isActive, ...rest }: any, extra: any) => {
      const TOOL = 'autotask_update_contact'
      try {
        const requested = definedFields({ ...rest, ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }) })
        if (Object.keys(requested).length === 0) {
          return emptyEdit('contact', contactId, TOOL, 'firstName, lastName, emailAddress, title, the phone fields, the address fields, note, primaryContact, billingContact, receivesEmailNotifications, isActive')
        }
        const rid = await resolveResourceId(emailOf(extra))
        const c = client()
        const before = await c.getContactById(contactId)
        if (!before) return noSuchRecord('contact', contactId, TOOL, 'List the company\'s contacts with autotask_company_contacts({ companyId }).')

        const beforeRow = before as unknown as Record<string, unknown>
        const res = await write.updateContact(contactId, requested as write.ContactUpdateFields, beforeRow.companyID as number | undefined, rid)
        const after = await c.getContactById(contactId)
        if (!after) return readBackFailed('contact', contactId, TOOL, res.pathUsed)

        const { mismatches, changedFields, unchangedFields } = verifyWrittenFields(
          requested, beforeRow, after as unknown as Record<string, unknown>,
        )
        if (mismatches.length) {
          return notVerified({ kind: 'contact', id: contactId, tool: TOOL, mismatches, changedFields, pathUsed: res.pathUsed, attempts: res.attempts })
        }
        const notifyChanged = changedFields.filter((f) => f === 'primaryContact' || f === 'receivesEmailNotifications')
        return ok({
          contactId, companyId: beforeRow.companyID ?? null, writeVerified: true,
          requestedFields: Object.keys(requested), changedFields, unchangedFields,
          ...(unchangedFields.length ? { unchangedNote: `${unchangedFields.join(' and ')} already held the requested value.` } : {}),
          ...(notifyChanged.length ? { notificationImpactNote: `${notifyChanged.join(' and ')} changed — who Autotask emails about this company's tickets is now different. Tell the user.` } : {}),
          ...(changedFields.includes('isActive') && isActive === false
            ? { retiredNote: `Contact ${contactId} is now INACTIVE. The record and its ticket history are preserved; it was not deleted.` }
            : {}),
          contact: after, pathUsed: res.pathUsed, pathAttempts: res.attempts,
          verifiedBy: 'The contact was re-read by id after the write and every requested field matched the stored value.',
        })
      } catch (e) { return fail(e, TOOL) }
    }
  )
}
