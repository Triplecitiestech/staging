// src/lib/connector/capability-registry.ts
//
// LIVE capability registry for the MCP connector.
//
// WHY THIS EXISTS: Claude on every surface (chat, Claude Code, Cowork) discovers
// tools by keyword search. A thin search result used to make it assert a hard
// limitation ("the connector cannot publish IT Glue documents") when the tool
// existed and had been used minutes earlier. There was no authoritative place to
// ask "what can this connector actually do?", so beliefs went stale and the
// owner burned sessions rediscovering shipped features.
//
// HOW IT STAYS HONEST: the tool list is RECORDED AS IT IS REGISTERED, by
// wrapping the MCP server in a recording proxy (`recordingServer`). Nothing is
// hand-maintained and nothing is derived from a written list — a tool that is
// not registered cannot appear here, and a tool that is registered cannot be
// omitted. This matters concretely: 9 UniFi tools are created by a shared
// helper (`listRead` in mcp-unifi-site-tools.ts) rather than written out, so a
// hand-count of the source undercounts the real surface by 9.
//
// The one thing that CANNOT come from the registry is what we deliberately do
// NOT do — absence of code is not self-describing. That lives in
// ./known-limits.ts as reviewed data with a reason code per row, and in
// TOOL_FACTS below (risk class / gating / constraints per tool). Both are
// completeness-enforced by capability-registry.test.ts: add a tool without
// classifying it and the unit test fails, so the metadata cannot silently drift
// away from the registry the way a written tool list would.

import { KNOWN_LIMITS, type KnownLimit } from './known-limits'
import { instrumentToolHandler, type ToolTelemetryFacts } from './telemetry'
import { FIXABLE_BY, REASON_CODE_MEANING } from './failure-envelope'

// ---------------------------------------------------------------------------
// Recorded registry
// ---------------------------------------------------------------------------

export interface RecordedParam {
  name: string
  required: boolean
  type: string
  description?: string
  enumValues?: string[]
}

export interface RecordedTool {
  name: string
  title?: string
  description: string
  params: RecordedParam[]
}

/**
 * Minimal shape we rely on from the MCP server. Kept structural (not an import
 * of the SDK type) so the recorder works against whatever `createMcpHandler`
 * hands us without coupling to an SDK version.
 */
export interface ToolRegisteringServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool: (name: string, config: any, handler: any) => any
}

/**
 * Wrap a server so every registerTool call is recorded, then forwarded
 * unchanged. Registration behavior is untouched — this only observes.
 *
 * It also wraps each tool's HANDLER with usage telemetry (see ./telemetry.ts).
 * This is the single hook for both concerns and the reason it lives here: the
 * proxy already sees every registration, so a tool cannot be added without
 * being recorded AND measured. Per-tool logging calls across 126 tools would
 * drift the first time someone added the 127th.
 *
 * Returns the wrapper plus the array it fills. The array is populated
 * synchronously during the createMcpHandler callback, so it is complete by the
 * time any tool handler can run.
 */
export function recordingServer<T extends ToolRegisteringServer>(
  server: T
): { server: T; recorded: RecordedTool[] } {
  const recorded: RecordedTool[] = []

  const wrapper = new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'registerTool') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (name: string, config: any, handler: any) => {
          // Announce the failure envelope on EVERY tool, here, once. Appending
          // the note per tool file would drift the first time someone added a
          // tool and forgot — and a tool whose description never mentions the
          // envelope is a tool whose reasonCode gets flattened to "that didn't
          // work", which is the whole failure this contract removes. Appended
          // at the END so purposeOf()'s first-sentence extraction is unaffected.
          config = annotateDescription(name, config)
          try {
            recorded.push({
              name,
              title: typeof config?.title === 'string' ? config.title : undefined,
              description: typeof config?.description === 'string' ? config.description : '',
              params: describeInputSchema(config?.inputSchema),
            })
          } catch {
            // Recording must never break registration. A tool that fails to
            // introspect is still registered; it shows up with no params
            // rather than taking the whole connector down.
            recorded.push({ name, description: '', params: [] })
          }
          let instrumented = handler
          try {
            instrumented = instrumentToolHandler(name, telemetryFactsFor(name), handler)
          } catch {
            // Instrumentation is observability, not function. If it cannot be
            // applied, register the ORIGINAL handler — the tool keeps working
            // and only its telemetry is lost.
            instrumented = handler
          }
          return target.registerTool(name, config, instrumented)
        }
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  }) as T

  return { server: wrapper, recorded }
}

// ---------------------------------------------------------------------------
// Failure-envelope announcement
// ---------------------------------------------------------------------------

/**
 * Short form of the envelope note, appended to every tool description.
 *
 * Kept terse on purpose: this is paid for ~130 times in the client's tool list,
 * so it says the minimum that changes behaviour — the envelope exists, and the
 * three fields worth repeating to the user. The full taxonomy lives in
 * FAILURE_ENVELOPE_TOOL_NOTE, on the tools where it earns its length
 * (tct_connector_capabilities, autotask_capability_check, the staged-write
 * tools).
 */
const ENVELOPE_NOTE_SHORT =
  ' [On failure returns {failure:{reasonCode,message,evidence,remediation,fixableBy}} — ' +
  'report reasonCode, remediation and fixableBy to the user rather than just saying it did not work. ' +
  'Call tct_connector_capabilities for the full taxonomy.]'

/**
 * Surfaces already migrated to the envelope. Others keep plain-text failures.
 *
 * `kqm_` was built on the envelope from its first commit rather than retrofitted
 * — the taxonomy is vendor-neutral precisely so a new surface can adopt it
 * directly, and a new surface has no legacy plain-text callers to break.
 */
const ENVELOPE_TOOL_PREFIXES = ['autotask_', 'tct_', 'kqm_']

function toolHasEnvelope(name: string): boolean {
  return ENVELOPE_TOOL_PREFIXES.some((p) => name.startsWith(p))
}

/**
 * Append the envelope note to a tool's description, without mutating the
 * caller's object (the config literals are defined inline at each call site,
 * but a shared/reused config object must not be edited under it).
 *
 * Idempotent, and a no-op for tools whose surface has not been retrofitted yet
 * — promising an envelope that a tool does not return would be worse than
 * saying nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function annotateDescription(name: string, config: any): any {
  try {
    if (!toolHasEnvelope(name)) return config
    const desc = typeof config?.description === 'string' ? config.description : ''
    if (!desc || desc.includes('{failure:{reasonCode')) return config
    return { ...config, description: desc + ENVELOPE_NOTE_SHORT }
  } catch {
    // Annotation is documentation. If anything about this config is unusual,
    // register it exactly as given rather than risk breaking the tool.
    return config
  }
}

// ---------------------------------------------------------------------------
// Zod introspection
// ---------------------------------------------------------------------------

// inputSchema is a plain record of zod validators, e.g. { siteId: z.string() }.
// We read only the public-ish surface (isOptional/description) plus _def.typeName
// for the type label, and degrade to 'unknown' rather than throwing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeInputSchema(inputSchema: any): RecordedParam[] {
  if (!inputSchema || typeof inputSchema !== 'object') return []
  return Object.entries(inputSchema).map(([name, schema]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = schema as any
    let required = true
    try {
      required = typeof s?.isOptional === 'function' ? !s.isOptional() : true
    } catch { /* keep required=true */ }
    return {
      name,
      required,
      type: zodTypeLabel(s),
      description: typeof s?.description === 'string' ? s.description : undefined,
      enumValues: zodEnumValues(s),
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(s: any): any {
  // Peel optional/default/nullable wrappers to reach the inner type.
  let cur = s
  for (let i = 0; i < 10 && cur?._def?.innerType; i++) cur = cur._def.innerType
  return cur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodTypeLabel(s: any): string {
  const inner = unwrap(s)
  const tn: string | undefined = inner?._def?.typeName
  if (!tn) return 'unknown'
  const map: Record<string, string> = {
    ZodString: 'string',
    ZodNumber: 'number',
    ZodBoolean: 'boolean',
    ZodArray: 'array',
    ZodObject: 'object',
    ZodRecord: 'object',
    ZodEnum: 'enum',
    ZodNativeEnum: 'enum',
    ZodUnknown: 'unknown',
    ZodAny: 'any',
  }
  if (tn === 'ZodArray') {
    const el = zodTypeLabel(inner?._def?.type)
    return `array<${el}>`
  }
  return map[tn] ?? tn.replace(/^Zod/, '').toLowerCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodEnumValues(s: any): string[] | undefined {
  const inner = unwrap(s)
  const vals = inner?._def?.values
  if (Array.isArray(vals) && vals.every((v) => typeof v === 'string')) {
    // Long allowlists (e.g. the 44 Autotask config entities) are truncated so
    // one tool can't dominate the response; the full list is in the tool's own
    // description, which the client already has.
    return vals.length > 25 ? [...vals.slice(0, 25), `…and ${vals.length - 25} more`] : vals
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Vendor classification (derived from the tool-name prefix convention)
// ---------------------------------------------------------------------------

export const VENDORS = {
  autotask: 'Autotask PSA (Kaseya)',
  itglue: 'IT Glue',
  datto_rmm: 'Datto RMM',
  unifi: 'UniFi / Ubiquiti',
  hr: 'Microsoft Graph — TCT HumanResources SharePoint',
  sales: 'TCT Sales Calculator (our own pricing)',
  kqm: 'Kaseya Quote Manager (Datto Commerce)',
  tct: 'TCT connector (meta)',
} as const

/** Lowercase and strip non-alphanumerics so "IT Glue" and "itglue" compare equal. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function vendorOf(toolName: string): string {
  if (toolName.startsWith('datto_rmm_')) return VENDORS.datto_rmm
  const prefix = toolName.split('_')[0] as keyof typeof VENDORS
  return VENDORS[prefix] ?? 'unclassified'
}

// ---------------------------------------------------------------------------
// Per-tool facts that code cannot tell us
// ---------------------------------------------------------------------------

export type Access = 'read' | 'write'
export type RiskClass = 'read' | 'low-risk write' | 'destructive'

export interface ToolFacts {
  access: Access
  risk: RiskClass
  /** Subject to the stage → human-approval → execute gate. */
  staged: boolean
  /** Env var that disables the tool entirely, if any. */
  killSwitch?: string
  /** Known constraints a caller should be told up front. */
  constraints?: string[]
}

const R: ToolFacts = { access: 'read', risk: 'read', staged: false }
const r = (...constraints: string[]): ToolFacts => ({ ...R, constraints })

/**
 * Kaseya Quote Manager reads. Every one carries the two constraints that apply
 * to the whole surface, so a caller is never left to infer them per tool.
 */
const KQM_SHARED = [
  'Kaseya Quote Manager API is read-only by construction — all 39 documented operations are GET',
  'Paging is 1-INDEXED, and responses carry NO total count, so a page-capped sweep reports truncated: true rather than implying completeness',
] as const
const KQM: ToolFacts = { ...R, constraints: [...KQM_SHARED] }
const kqm = (...constraints: string[]): ToolFacts => ({ ...R, constraints: [...KQM_SHARED, ...constraints] })

const AT_WRITE: Omit<ToolFacts, 'constraints'> = { access: 'write', risk: 'low-risk write', staged: false }
const atWrite = (...constraints: string[]): ToolFacts => ({
  ...AT_WRITE,
  constraints: ['Attributed to the signed-in technician via Autotask resource impersonation', ...constraints],
})

const IG_WRITE: Omit<ToolFacts, 'constraints'> = { access: 'write', risk: 'low-risk write', staged: false }
const igWrite = (...constraints: string[]): ToolFacts => ({
  ...IG_WRITE,
  constraints: ['IT Glue has no per-user impersonation — recorded under the API key identity, not the individual tech', ...constraints],
})

/**
 * Explicit classification for every registered tool.
 *
 * This is deliberately data, not inference: "is this destructive?" is a
 * judgement that must be reviewable in a diff, not a regex over a description
 * string that silently reclassifies a firewall delete the day someone rewords
 * it. Completeness is enforced by the unit test, so this cannot fall behind the
 * live registry.
 */
export const TOOL_FACTS: Record<string, ToolFacts> = {
  // ── Meta ─────────────────────────────────────────────────────────────────
  tct_connector_capabilities: r('Generated from the live tool registry at request time'),

  // ── UniFi: Site Manager aggregates (cloud, read-only) ────────────────────
  unifi_list_sites: R,
  unifi_list_hosts: R,
  unifi_list_devices: R,
  unifi_summary: R,
  unifi_site_networks: R,

  // ── Autotask: operational reads ──────────────────────────────────────────
  autotask_search_companies: R,
  autotask_get_company: R,
  autotask_company_projects: R,
  autotask_company_tickets: R,
  autotask_get_ticket: R,
  autotask_get_ticket_by_number: R,
  autotask_ticket_notes: r(
    'TicketNotes ONLY — time entries and attachments are excluded by construction',
    'NEVER the basis for a claim that work was not done or a ticket was not updated — autotask_ticket_activity is',
    'Carries activityGap: true means activity exists that this read did not return',
  ),
  autotask_ticket_time_entries: r('No internal cost/rate data — Autotask time entries carry none', 'TimeEntries only — carries activityGap for what it did not return'),
  autotask_ticket_activity: r(
    'The ONLY read that should ground a statement about whether work was done — merges TicketNotes + TimeEntries + TicketAttachments',
    'TimeEntries has no publish field in the REST API, so time-entry visibility reports scope "unknown" with the reason rather than a guess',
    'sourcesUnavailable names any source whose query failed, so a broken query never reads as an empty result',
  ),
  autotask_time_entries_search: R,
  autotask_active_projects: R,
  autotask_list_roles: R,
  autotask_company_contacts: R,
  autotask_get_contact: R,
  autotask_list_priorities: R,
  autotask_list_ticket_types: R,
  autotask_search_tickets: r('Auto-paginates by splitting the date window; returns truncated=true when capped — narrow the filters'),
  autotask_list_slas: r('Derived from the ticket serviceLevelAgreementID picklist — Autotask exposes no standalone SLA entity'),
  autotask_ticket_sla_results: R,
  autotask_list_companies: R,
  autotask_list_contracts: R,
  autotask_list_resources: R,
  autotask_search_time_entries: r('billingStatus is derived from BillingItems.invoiceID — Autotask has no billed flag on time entries', 'No cost/rate data exposed'),
  autotask_survey_results: r('NATIVE Autotask surveys only — a custom completion-email survey returns empty', 'Autotask native surveys carry no free-text comment field'),

  // ── Autotask: configuration reads ────────────────────────────────────────
  autotask_ticket_statuses: r('status→SLA-event mapping is NOT in the REST API; served from an owner-maintained overlay, labelled manual_overlay — never treat it as API data'),
  autotask_entity_picklist: R,
  autotask_list_ticket_categories: r('Category UI layout beyond field defaults is not exposed by the API'),
  autotask_list_queues: r('Queue routing, inbound-email processing and queue notification settings are UI-only'),
  autotask_list_billing_codes: r('BillingCodes are READ-ONLY in the Autotask REST API', 'WorkTypeModifiers carry no billing-code link field, so they are listed unjoined'),
  autotask_list_products: r('One API page (≤500) with hasMore — narrow with search'),
  autotask_list_services: R,
  autotask_list_udf_definitions: R,
  autotask_business_hours_holidays: r('SLA definitions themselves (per-event targets) are NOT exposed by the REST API'),
  autotask_notification_history: r('What actually FIRED, not rule/template definitions — those have no REST surface at all'),
  autotask_config_query: r('Allowlisted config entities only', 'One API page (≤500) with hasMore'),
  autotask_entity_capabilities: R,
  autotask_capability_check: r(
    'Ask this BEFORE attempting an action instead of interpreting a failure afterwards',
    'Vendor limitations are derived LIVE from entityInformation, never hardcoded — a failed lookup returns TRANSIENT, not a false "unsupported"',
  ),
  autotask_surface_drift_report: r(
    'Diffs the connector\'s implemented Autotask surface against live entityInformation',
    'A full sweep is one metadata lookup per entity (cached) — scope it with entities[] when you only care about a few',
    'unchecked[] means the lookup failed — never read that as "no gaps"',
  ),

  // ── Autotask: ticket-scoped writes (impersonated) ────────────────────────
  autotask_create_ticket: atWrite('Autotask requires dueDateTime unless the category supplies a default', 'assignedResourceID REQUIRES assignedResourceRoleID — the role defaults to Engineer (29683355) rather than failing the create', 'Assignment is read-back VERIFIED: assignmentVerified false means the resource did not stick'),
  autotask_add_internal_note: atWrite('Internal (publish=2)', 'Publish level is read back off the created note, not assumed'),
  autotask_add_customer_note: {
    ...atWrite(
      'CUSTOMER-VISIBLE (publish=1 "All Autotask Users" — the Internal-cleared state)',
      'DOES NOT NOTIFY ANYONE AND CANNOT: the REST TicketNotes entity has no notification field (12 fields, verified live) — recipients are chosen in the UI-only Notification panel, and delivery depends on an Autotask Event an admin configures',
      'customerNotified is an OBSERVATION from Tickets.lastCustomerNotificationDateTime before vs after the write; false means the contact has NOT been emailed',
    ),
    risk: 'destructive',
  },
  autotask_update_ticket_note: atWrite(
    'Edits an EXISTING note in place — the alternative to stacking correction notes on a ticket',
    'Addressed by NOTE id (TicketNotes.id), not ticket id; one note per call',
    'PATCHes ONLY the fields supplied — Autotask PATCH leaves omitted fields untouched, so there is no GET-merge and an unsupplied field cannot be blanked',
    'Read-back VERIFIED per field: a value that did not stick returns PRECONDITION_FAILED, never success. Re-sending an identical value succeeds but is reported in unchangedFields',
    'Changing publish can move a note between internal and CUSTOMER-VISIBLE in either direction — the response reports the before/after ids with their live labels and scope',
    'Does NOT notify anyone and cannot — the REST TicketNotes entity has no notification field',
    'No delete exists: entityInformation reports TicketNotes.canDelete false',
  ),
  autotask_create_time_entry: atWrite('BILLABLE', 'roleId is required', 'Service tickets require start+stop times', 'summaryNotes does NOT populate the ticket Resolution field unless appendSummaryToResolution=true'),
  autotask_set_ticket_resolution: atWrite('Resolution drives the customer completion email', 'append=true by default; false OVERWRITES'),
  autotask_assign_ticket: atWrite('Resource AND role together — Autotask rejects a lone assignedResourceID; the role defaults to Engineer (29683355)', 'Read-back VERIFIED — an accepted PATCH that did not stick returns PRECONDITION_FAILED, not success'),
  autotask_set_ticket_status: atWrite(),
  autotask_find_resource: R,

  // ── Autotask: project / task / CRM reads ─────────────────────────────────
  autotask_get_task: r(
    'Task FIELDS only — structurally excludes notes and time entries, so it can never ground a claim that work was not done',
    'Carries activityGap: true means activity exists this read did not return — call autotask_task_activity',
  ),
  autotask_project_detail: r(
    'The only connector read that lists a project\'s TASKS',
    'Reads Tasks and Phases at their root entities with NO silent fallback — a failed query raises rather than returning an empty list',
  ),
  autotask_task_activity: r(
    'The ONLY read that should ground a statement about whether work was done on a task — merges TaskNotes + TimeEntries',
    'TimeEntries has no publish field in the REST API, so time-entry visibility is reported null (not exposed), never guessed',
    'sourcesUnavailable names any source whose query failed, so a broken query never reads as an empty result',
  ),

  // ── Autotask: project / task writes (impersonated, DIRECT) ───────────────
  // Direct rather than staged because these are operational records — one row,
  // by id, visible and correctable in the Autotask UI immediately. The staged
  // gate is for instance CONFIGURATION, which changes how every future record
  // behaves. Every one of these is read-back verified.
  autotask_create_project: atWrite(
    'REQUIRED: companyId, projectName, projectType, status, startDateTime, endDateTime — Autotask marks all six required',
    'The company is PERMANENT: Projects.companyID is isReadOnly true, supplied by the URL, and can never be changed',
    'No delete exists: entityInformation reports Projects.canDelete false — a mistake can only be set to status 0 (Inactive)',
    'Read-back VERIFIED per field: a value that did not stick returns PRECONDITION_FAILED, never success',
  ),
  autotask_update_project: atWrite(
    'PATCHes ONLY the fields supplied — omitted fields are untouched, so nothing can be blanked by accident',
    'companyID is not a parameter: Autotask reports it read-only, so a project cannot be moved between companies by any route',
    'Read-back VERIFIED per field',
  ),
  autotask_add_project_note: atWrite(
    'Defaults to publish 2 (Internal Project Team) so a note is never accidentally customer-visible',
    'DOES NOT NOTIFY ANYONE AND CANNOT — the REST note entities carry no notification field',
    'The stored publish level is read back off the created note, not assumed',
  ),
  autotask_create_project_phase: atWrite(
    'Phases are OPTIONAL for tasks — Tasks.phaseID is not required, so do not create one just to add a task',
    'The project is PERMANENT: Phases.projectID is isReadOnly true',
    'No delete exists: entityInformation reports Phases.canDelete false',
  ),
  autotask_update_project_phase: atWrite('PATCHes ONLY the fields supplied', 'A phase cannot be moved between projects', 'Read-back VERIFIED per field'),
  autotask_create_task: atWrite(
    'REQUIRED: projectId, title, status, taskType',
    'Task status ids are PER-INSTANCE — this instance has NO id 4; In Progress is 8',
    'assignedResourceID REQUIRES assignedResourceRoleID — the role defaults to Engineer (29683355) rather than failing the create',
    'A phaseID from a different project is refused BEFORE writing, with both project ids named',
    'No delete exists: entityInformation reports Tasks.canDelete false',
    'Read-back VERIFIED per field',
  ),
  autotask_update_task: atWrite(
    'This WORKS — the previous "task PATCH is BLOCKED on a 404" claim was a fallback chain reporting the 404 of ProjectTasks, an entity that does not exist here, in place of the real error. Live entityInformation reports Tasks.canUpdate true',
    'PATCHes ONLY the fields supplied',
    'assignedResourceID + assignedResourceRoleID travel together; null clears the assignment and does NOT acquire a role',
    'Read-back VERIFIED per field: a value that did not stick returns PRECONDITION_FAILED, never success',
  ),
  autotask_add_task_note: atWrite(
    'Defaults to publish 2 (Internal Project Team); publish 1 "All Autotask Users" is the CUSTOMER-VISIBLE state on this instance and there is no id 3',
    'DOES NOT NOTIFY ANYONE AND CANNOT — the REST TaskNotes entity has no notification field',
    'No delete exists: entityInformation reports TaskNotes.canDelete false — correct a note with autotask_update_task_note instead',
  ),
  autotask_update_task_note: atWrite(
    'Edits an EXISTING task note in place — the alternative to stacking correction notes',
    'Addressed by NOTE id (TaskNotes.id), not task id',
    'Changing publish can move a note between internal and CUSTOMER-VISIBLE in either direction — the response reports both ids and the resulting scope',
    'Read-back VERIFIED per field',
  ),
  autotask_create_task_time_entry: atWrite(
    'BILLABLE',
    'Requires hoursWorked OR startDateTime + stopDateTime — unlike Service TICKETS, tasks do not require a start/stop pair',
    'Read-back VERIFIED: task, resource, hours and summary are re-read, so an accepted POST that stored something else returns PRECONDITION_FAILED',
  ),
  autotask_update_time_entry: {
    ...atWrite(
      'BILLABLE — changing hoursWorked changes what the customer is billed if the entry is billable and uninvoiced; the response says so explicitly',
      'Works on task AND ticket time entries',
      'Does NOT delete time. Autotask reports TimeEntries.canDelete true; deletion is deliberately not exposed — see knownLimits',
      'Read-back VERIFIED per field',
    ),
    risk: 'destructive',
  },
  autotask_add_task_secondary_resource: atWrite(
    'resourceId AND roleId are BOTH required — entityInformation marks both isRequired on TaskSecondaryResources',
    'These rows cannot be edited (canUpdate false) — change a role by removing the row and adding a new one',
    'An identical existing row is reported as alreadyPresent rather than duplicated',
    'Verified by re-listing the task\'s secondary resources after the write',
  ),
  autotask_remove_task_secondary_resource: {
    ...atWrite(
      'Removes a row — takes the ROW id, not the resource id, and names the rows present when the id does not match',
      'Verified by re-listing the task\'s secondary resources after the delete',
    ),
    risk: 'destructive',
  },
  autotask_add_task_predecessor: atWrite(
    'Both task ids are FIXED once created (predecessorTaskID and successorTaskID are isReadOnly) — only lagDays can change afterwards',
    'Both tasks must be in the same project; a cross-project or self-dependency is refused BEFORE writing',
    'Verified by re-listing the successor\'s predecessors after the write',
  ),
  autotask_remove_task_predecessor: {
    ...atWrite(
      'Removes a row — takes the ROW id, not a task id',
      'This is also how a dependency is re-pointed, since both task ids on the row are read-only',
      'Verified by re-listing the successor\'s predecessors after the delete',
    ),
    risk: 'destructive',
  },

  // ── Autotask: CRM writes (impersonated, DIRECT) ──────────────────────────
  autotask_create_company: {
    ...atWrite(
      'REQUIRED: companyName, companyType, ownerResourceID, phone — Autotask marks all four required',
      'PERMANENT: entityInformation reports Companies.canDelete FALSE, so a company created by mistake can never be removed, only set isActive false',
      'Because of that, a company whose name already exists is REFUSED with the existing id — override with allowDuplicateName: true',
      'Read-back VERIFIED per field',
    ),
    risk: 'destructive',
  },
  autotask_update_company: atWrite(
    'PATCHes ONLY the fields supplied',
    'isActive: false is the ONLY way to retire a company — Autotask offers no delete and none is faked',
    'Read-only Companies fields (the billTo* block, invoiceTemplateID, quoteTemplateID, apiVendorID) are deliberately not parameters',
    'Read-back VERIFIED per field',
  ),
  autotask_create_contact: atWrite(
    'REQUIRED: companyId, firstName, lastName',
    'The company is PERMANENT: Contacts.companyID is isReadOnly true — a contact created under the wrong company must be deactivated and recreated',
    'primaryContact and receivesEmailNotifications change who Autotask emails about this company\'s tickets',
    'Read-back VERIFIED per field',
  ),
  autotask_update_contact: atWrite(
    'PATCHes ONLY the fields supplied',
    'A contact\'s company cannot be changed — Contacts.companyID is read-only, so there is no parameter for it',
    'isActive: false retires a contact. Autotask DOES permit contact deletion (canDelete true) but this connector does not expose it — deletion loses the ticket-history association irrecoverably; see knownLimits',
    'Changing primaryContact or receivesEmailNotifications is flagged in the response as a notification-impact change',
    'Read-back VERIFIED per field',
  ),

  // ── Autotask: config writes (staged gate) ────────────────────────────────
  autotask_stage_config_write: {
    access: 'write',
    risk: 'low-risk write',
    staged: true,
    killSwitch: 'CONNECTOR_CONFIG_WRITES_ENABLED',
    constraints: [
      'WRITES NOTHING — snapshots current values, computes a diff, stores a pending row, returns an approval URL',
      'Allowlisted areas and fields only; a field not on the allowlist cannot be staged',
    ],
  },
  autotask_list_staged_writes: r('Scoped to Autotask + overlay rows; UniFi rows have their own tool'),
  autotask_execute_staged_write: {
    access: 'write',
    risk: 'destructive',
    staged: true,
    killSwitch: 'CONNECTOR_CONFIG_WRITES_ENABLED',
    constraints: [
      'Refuses anything not in approved state — being told to get approval first is expected, not an error to work around',
      'Single-use',
      'Re-reads the live record and ABORTS as drifted if it changed since staging',
    ],
  },
  autotask_cancel_staged_write: {
    access: 'write',
    risk: 'low-risk write',
    staged: false,
    constraints: ['Cancels a pending/approved row; writes nothing to Autotask'],
  },

  // ── TCT sales pricing: reads (our own config + DB, no vendor API) ────────
  sales_pricing_catalog: r(
    'Our OWN pricing, not a vendor API: pricing.json defaults + the latest sales_calc_pricing_overrides row',
    'No write surface exists in the connector — pricing is edited only at /admin/sales-calculator/pricing by staff with system_settings',
    'INTERNAL: includes vendor costs and margins — never paste raw figures into customer-facing material',
    'Degrades to shipped defaults with a visible overridesUnavailable notice if the overrides table cannot be read',
  ),
  sales_pricing_quote: r(
    'Runs the same calc engine as /admin/sales-calculator against live pricing — stateless, nothing is saved',
    'Industry, contract term, compliance and total seat count are NOT price inputs (no volume/term/vertical modifiers exist)',
    'INTERNAL: includes vendor costs and margins',
  ),

  // ── Kaseya Quote Manager (Datto Commerce): reads ─────────────────────────
  // The vendor API has NO write surface at all — all 39 documented operations in
  // the captured spec are GET — so there is nothing to gate and no write tool to
  // classify. Listed one per line rather than generated from KQM_RESOURCES on
  // purpose: deriving these from the same table that registers the tools would
  // mean a newly added resource mints its own "reviewed" facts entry with nobody
  // reviewing it, which is exactly the drift the completeness test exists to
  // catch.
  kqm_brands: KQM,
  kqm_categories: kqm('The API offers this resource NO paging and no filters — it returns the full set'),
  kqm_contacts: kqm('Filterable by customerID only'),
  kqm_customers: KQM,
  kqm_customer_addresses: kqm('Filterable by customerID only'),
  kqm_employees: kqm('modifiedAfter is NOT supported for this resource, so no delta sync'),
  kqm_products: kqm('Filterable by manufacturerPartNumber (exact match) only — no name/description search exists'),
  kqm_product_images: kqm('The API has NO get-by-id for this resource — list with productID', 'modifiedAfter is NOT supported'),
  kqm_product_suppliers: kqm('Filterable by productID only'),
  kqm_purchase_orders: kqm('Filterable by orderNumber (exact match) only'),
  kqm_purchase_order_costs: kqm('Filterable by purchaseOrderID only'),
  kqm_purchase_order_lines: kqm('Filterable by purchaseOrderID only'),
  kqm_quotes: kqm('Filterable by quoteNumber (exact match) only — no customer or date-range filter exists'),
  kqm_quote_lines: kqm('Filterable by quoteSectionID — NOT by quote id; resolve sections via kqm_quote_sections first', 'modifiedAfter is NOT supported'),
  kqm_quote_sections: kqm('Filterable by quoteID only', 'modifiedAfter is NOT supported'),
  kqm_sales_orders: kqm('Filterable by orderNumber (exact match) only'),
  kqm_sales_order_lines: kqm('Filterable by salesOrderID only'),
  kqm_sales_order_payments: kqm('Filterable by salesOrderID only'),
  kqm_suppliers: KQM,
  kqm_warehouses: KQM,
  kqm_probe_connection: r(
    'DIAGNOSTIC: settles the spec-vs-help-page contradiction over whether the API key goes in a header or a query parameter',
    'Tries each mechanism in isolation — never both at once — and never returns or logs the key',
  ),

  // ── IT Glue: reads ───────────────────────────────────────────────────────
  itglue_search_orgs: R,
  itglue_org_configurations: R,
  itglue_flexible_asset_types: R,
  itglue_flexible_asset_type_fields: R,
  itglue_org_flexible_assets: R,
  itglue_get_flexible_asset: R,
  itglue_org_documents: r('Archived documents EXCLUDED by default (includeArchived)', 'meta counts come from IT Glue and include archived docs'),
  itglue_list_document_folders: r('Default returns ALL folders — the opposite of the documents index default', 'Folder names repeat across branches — disambiguate by parentId/ancestorIds'),
  itglue_search_documents: r('Postgres full-text over name+content when the org is indexed; falls back to name-only (source: live-name)', 'Archived documents EXCLUDED by default'),
  itglue_global_search: r('IT Glue has no account-wide search endpoint — scoped to the TCT SOP org plus one passed org', 'Archived documents EXCLUDED by default'),
  itglue_get_quick_notes: R,
  itglue_document_sections: R,

  // ── IT Glue: writes ──────────────────────────────────────────────────────
  itglue_create_document: igWrite('Defaults to DRAFT unless publish=true', 'Omitting documentFolderId drops the document at the org ROOT — and create is the ONLY time the API accepts a folder, so root placement is then permanent without a UI move'),
  itglue_create_document_folder: igWrite('Folder DELETE is deliberately not exposed — do it in the UI'),
  itglue_move_document: igWrite('DOES NOT WORK — IT Glue rejects document_folder_id on PATCH (create-time placement only). Writes nothing and returns UPSTREAM_UNSUPPORTED; a human moves the document in the UI', 'Registered only so the reason is discoverable — do not retry it'),
  itglue_add_document_section: igWrite('Lands on the DRAFT revision only — techs see nothing until itglue_publish_document'),
  itglue_update_document_section: igWrite('Lands on the DRAFT revision only — techs see nothing until itglue_publish_document'),
  itglue_publish_document: {
    ...igWrite('Read-back VERIFIED — published:false means it silently no-opped', 'Pushes the ENTIRE current draft live, including earlier unpublished edits by others'),
    risk: 'destructive',
  },
  itglue_rename_document: igWrite('Title metadata applies immediately, outside the draft/publish cycle', 'Read-back VERIFIED', 'Rename ONLY — a documentFolderId argument fails the call before writing (it used to be silently ignored)'),
  itglue_relate_items: igWrite('ONE pair per call', 'One call links BOTH panes — the inverse returns 422, do not call twice'),
  itglue_upload_attachment: igWrite('ONE file per call', 'Hard 10 MB cap (IT Glue limit)'),
  itglue_create_flexible_asset: igWrite('Resolve trait keys with itglue_flexible_asset_type_fields first'),
  itglue_update_flexible_asset: igWrite('GET-merges before PATCH because IT Glue PATCH is otherwise destructive — pass only changed traits'),

  // ── Datto RMM: reads (GET-only by construction) ──────────────────────────
  datto_rmm_account: r('GET-only by construction — DattoRmmClient.getV2() cannot issue any other method'),
  datto_rmm_list_sites: r('Pagination is 0-INDEXED — page=1 skips the first rows'),
  datto_rmm_get_site: R,
  datto_rmm_site_devices: r('Per-site is authoritative; account-level device search filters by LIKE'),
  datto_rmm_search_devices: r('Account-level LIKE filter — per-site is authoritative'),
  datto_rmm_get_device: r('Console deep links come from the API\'s own portalUrl/webRemoteUrl — never a guessed pattern'),
  datto_rmm_device_audit: r('Class-aware — the audit shape differs by device class'),
  datto_rmm_device_software: R,
  datto_rmm_site_network_interfaces: R,
  datto_rmm_alerts: r('Pagination is 0-INDEXED'),
  datto_rmm_get_alert: R,
  datto_rmm_activity_logs: R,
  datto_rmm_job_status: R,
  datto_rmm_list_components: R,
  datto_rmm_list_filters: R,
  datto_rmm_list_users: R,
  datto_rmm_variables: r('Masked variables are forced to [MASKED]', 'Proxy passwords redacted'),

  // ── UniFi: per-site reads (Cloud Connector Proxy) ────────────────────────
  unifi_resolve_site: r('NEVER guesses — returns candidates when a name is ambiguous'),
  unifi_console_capabilities: R,
  unifi_probe_consoles: r('Fleet-wide reachability probe; the only UniFi tool that is not single-console'),
  unifi_site_devices: R,
  unifi_site_clients: R,
  unifi_site_networks_config: R,
  unifi_site_wlans: r('WLAN passphrases and RADIUS secrets are REDACTED'),
  unifi_site_firewall_policies: R,
  unifi_site_firewall_zones: R,
  unifi_site_acl_rules: R,
  unifi_site_dns_policies: R,
  unifi_site_traffic_matching_lists: R,
  unifi_site_vouchers: R,
  unifi_device_details: R,
  unifi_device_statistics: R,
  unifi_pending_devices: R,
  unifi_client_details: R,
  unifi_network_references: R,
  unifi_firewall_policy_details: R,
  unifi_firewall_policy_ordering: R,
  unifi_site_wan_vpn_radius: r('Secrets REDACTED'),

  // ── UniFi: tier-1 immediate actions ──────────────────────────────────────
  unifi_restart_device: {
    access: 'write',
    risk: 'destructive',
    staged: false,
    killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED',
    constraints: ['ONE console / ONE site / ONE device by schema — no arrays, no wildcards', 'Interrupts service on that device'],
  },
  unifi_power_cycle_port: {
    access: 'write',
    risk: 'destructive',
    staged: false,
    killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED',
    constraints: ['ONE console / ONE site / ONE port by schema', 'Interrupts service on whatever is attached to that port'],
  },
  unifi_authorize_guest: { access: 'write', risk: 'low-risk write', staged: false, killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED', constraints: ['ONE client by schema'] },
  unifi_unauthorize_guest: { access: 'write', risk: 'low-risk write', staged: false, killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED', constraints: ['ONE client by schema'] },
  unifi_create_hotspot_voucher: { access: 'write', risk: 'low-risk write', staged: false, killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED', constraints: ['ONE site by schema'] },
  unifi_delete_hotspot_voucher: { access: 'write', risk: 'low-risk write', staged: false, killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED', constraints: ['ONE voucher by schema'] },

  // ── UniFi: tier-2 staged config writes ───────────────────────────────────
  unifi_stage_config_write: {
    access: 'write',
    risk: 'low-risk write',
    staged: true,
    killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED',
    constraints: [
      'WRITES NOTHING — stages a diff for human approval',
      'ONE console / ONE site / ONE target by schema',
      'Allowlisted areas and fields only',
    ],
  },
  unifi_execute_staged_write: {
    access: 'write',
    risk: 'destructive',
    staged: true,
    killSwitch: 'CONNECTOR_UNIFI_WRITES_ENABLED',
    constraints: [
      'Refuses anything not in approved state',
      'Single-use',
      'Drift-checked with key-order-insensitive comparison; ABORTS as drifted if the live record changed',
    ],
  },
  unifi_list_staged_writes: r('Scoped to UniFi rows'),
  unifi_cancel_staged_write: { access: 'write', risk: 'low-risk write', staged: false, constraints: ['Writes nothing to UniFi'] },

  // ── HR: direct writes to TCT's own SharePoint ────────────────────────────
  hr_er_log_append: {
    access: 'write',
    risk: 'low-risk write',
    staged: false,
    killSwitch: 'CONNECTOR_HR_WRITES_ENABLED',
    constraints: [
      'APPEND-ONLY by design — never overwrites an existing row',
      'Entry ID is computed automatically as the next ER-NNNN read from the sheet — never pass it, and never infer it from the ER-DOC document numbering',
      'Row width and column order come from the table\'s LIVE header row on every call; a column no parameter fills is appended blank and reported in unmappedColumns',
      'Read-back verified',
      'TCT\'s OWN HumanResources site only, via a dedicated Sites.Selected app',
    ],
  },
  hr_er_log_update: {
    access: 'write',
    risk: 'low-risk write',
    staged: false,
    killSwitch: 'CONNECTOR_HR_WRITES_ENABLED',
    constraints: [
      'Patches ONE existing row located by Entry ID — never creates a row, and refuses rather than guessing when an Entry ID appears twice',
      'Entry ID and Date Logged can never be written: there is no parameter for either',
      'Only the columns named in the call are written; cells are patched individually in place, never a row or table rewrite',
      'Cell positions come from the table\'s LIVE header row on every call',
      'Every written cell is read-back verified against the row\'s Entry ID, not against a row position',
      'TCT\'s OWN HumanResources site only, via a dedicated Sites.Selected app',
    ],
  },
  hr_er_log_columns: {
    access: 'read',
    risk: 'read',
    staged: false,
    killSwitch: 'CONNECTOR_HR_WRITES_ENABLED',
    constraints: [
      'Writes nothing — reports the live header row and how hr_er_log_append / hr_er_log_update map onto it',
      'Gated by the same HR kill switch as the writes: one switch covers the whole HR surface',
    ],
  },
  hr_file_document: {
    access: 'write',
    risk: 'low-risk write',
    staged: false,
    killSwitch: 'CONNECTOR_HR_WRITES_ENABLED',
    constraints: [
      'Uploads ONE .docx to TWO locations (central + subject folder)',
      'Filename is generated — ER-DOC-NNNN_[LastName]_[date]_[Type].docx',
      'Both uploads read-back verified',
    ],
  },
}

/**
 * Classification handed to the telemetry layer for one tool.
 *
 * Derived from TOOL_FACTS / vendorOf — the SAME reviewed data the capability
 * report uses, so there is exactly one classification table. An unclassified
 * tool falls back to the same conservative default the report shows
 * (read/read); the TOOL_FACTS completeness test in capability-registry.test.ts
 * keeps that case from lasting.
 */
function telemetryFactsFor(toolName: string): ToolTelemetryFacts {
  const facts = TOOL_FACTS[toolName]
  return {
    vendor: vendorOf(toolName),
    access: facts?.access ?? 'read',
    risk: facts?.risk ?? 'read',
    staged: facts?.staged ?? false,
  }
}

// ---------------------------------------------------------------------------
// Build identity
// ---------------------------------------------------------------------------

/**
 * Build/deploy identity so a caller can tell whether its beliefs predate the
 * running code. Vercel injects these at build time; locally they are absent and
 * reported as 'unknown' rather than faked.
 */
export function buildIdentity() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return {
    commit: sha ? sha.slice(0, 12) : 'unknown',
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? 'local',
    // Vercel sets no deploy-timestamp var; VERCEL_DEPLOYMENT_ID is the stable
    // per-deploy identifier, so it is reported instead of inventing a date.
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    endpoint: process.env.MCP_RESOURCE_URL ?? null,
    authProvider: process.env.CONNECTOR_AUTH_PROVIDER === 'entra' ? 'entra' : 'workos',
  }
}

function killSwitchState() {
  const flags: Record<string, boolean> = {
    CONNECTOR_CONFIG_WRITES_ENABLED: process.env.CONNECTOR_CONFIG_WRITES_ENABLED === 'true',
    CONNECTOR_UNIFI_WRITES_ENABLED: process.env.CONNECTOR_UNIFI_WRITES_ENABLED === 'true',
    CONNECTOR_HR_WRITES_ENABLED: process.env.CONNECTOR_HR_WRITES_ENABLED === 'true',
  }
  return flags
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface CapabilityToolRow {
  name: string
  vendor: string
  purpose: string
  access: Access
  risk: RiskClass
  stagedApprovalRequired: boolean
  enabled: boolean
  killSwitch?: string
  requiredParams: RecordedParam[]
  optionalParams: RecordedParam[]
  constraints?: string[]
  unclassified?: true
}

export interface CapabilityReport {
  build: ReturnType<typeof buildIdentity>
  generatedAt: string
  generatedFrom: string
  summary: {
    totalTools: number
    byVendor: Record<string, number>
    reads: number
    writes: number
    stagedApprovalRequired: number
    disabledByKillSwitch: number
  }
  writeGuardrails: {
    model: string
    approvalUrl: string
    killSwitches: Record<string, boolean>
  }
  tools: CapabilityToolRow[]
  knownLimits: Record<string, KnownLimit[]>
  knownLimitsNote?: string
  reasonCodes: Record<string, string>
  failureEnvelope: {
    note: string
    reasonCodes: Record<string, string>
    fixableBy: Record<string, string>
    surfacesMigrated: string[]
    surfacesPending: string[]
    pendingNote: string
  }
  usageNote: string
}

/** One-line purpose: the tool's title if it has one, else its first sentence. */
function purposeOf(t: RecordedTool): string {
  if (t.title) return t.title
  const first = t.description.split(/(?<=\.)\s/)[0] ?? t.description
  return first.length > 160 ? `${first.slice(0, 157)}…` : first
}

export function buildCapabilityReport(
  recorded: RecordedTool[],
  opts: { vendor?: string; includeParams?: boolean } = {}
): CapabilityReport {
  const flags = killSwitchState()

  let rows: CapabilityToolRow[] = recorded.map((t) => {
    const facts = TOOL_FACTS[t.name]
    const enabled = facts?.killSwitch ? flags[facts.killSwitch] === true : true
    return {
      name: t.name,
      vendor: vendorOf(t.name),
      purpose: purposeOf(t),
      access: facts?.access ?? 'read',
      risk: facts?.risk ?? 'read',
      stagedApprovalRequired: facts?.staged ?? false,
      enabled,
      killSwitch: facts?.killSwitch,
      requiredParams: t.params.filter((p) => p.required),
      optionalParams: t.params.filter((p) => !p.required),
      constraints: facts?.constraints,
      // Surfaced rather than hidden: an unclassified tool means TOOL_FACTS fell
      // behind the registry, and the caller deserves to know the risk label is
      // a default and not a reviewed judgement.
      ...(facts ? {} : { unclassified: true as const }),
    }
  })

  if (opts.vendor) {
    const want = squash(opts.vendor)
    rows = rows.filter(
      (r) => squash(r.vendor).includes(want) || squash(r.name).startsWith(want)
    )
  }
  if (opts.includeParams === false) {
    rows = rows.map((r) => ({ ...r, requiredParams: [], optionalParams: [] }))
  }

  const byVendor: Record<string, number> = {}
  for (const r of rows) byVendor[r.vendor] = (byVendor[r.vendor] ?? 0) + 1

  const limits: Record<string, KnownLimit[]> = {}
  for (const [vendor, list] of Object.entries(KNOWN_LIMITS)) {
    // squash() so a caller passing the tool-name prefix ("itglue", "datto")
    // still matches the human vendor label ("IT Glue", "Datto RMM"). Without
    // it, a vendor-filtered call silently returned an EMPTY limits section —
    // i.e. "no known limitations" — which is the exact false-confidence failure
    // this tool exists to prevent.
    if (opts.vendor && !squash(vendor).includes(squash(opts.vendor))) continue
    limits[vendor] = list
  }
  // A vendor filter that matches tools but no limits section is reported
  // explicitly rather than as an empty object.
  const limitsNote =
    opts.vendor && Object.keys(limits).length === 0
      ? `No KNOWN LIMITS section matched vendor "${opts.vendor}". This is NOT the same as "no limitations" — call again without the vendor filter to see all of them.`
      : undefined

  return {
    build: buildIdentity(),
    generatedAt: new Date().toISOString(),
    generatedFrom:
      'The LIVE MCP tool registry, recorded as each tool was registered on this running instance. Not a hand-maintained list. If a tool is absent here, it is not registered on this build.',
    summary: {
      totalTools: rows.length,
      byVendor,
      reads: rows.filter((r) => r.access === 'read').length,
      writes: rows.filter((r) => r.access === 'write').length,
      stagedApprovalRequired: rows.filter((r) => r.stagedApprovalRequired).length,
      disabledByKillSwitch: rows.filter((r) => !r.enabled).length,
    },
    writeGuardrails: {
      model:
        'Destructive and multi-target config changes are STAGED, not applied: stage → a human approves on the admin page behind staff login the connector token cannot reach → single-use, drift-checked execute. Tools flagged stagedApprovalRequired cannot bypass this. Being told to get approval is the gate working, not an error to route around.',
      approvalUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.triplecitiestech.com'}/admin/connector/staged-writes`,
      killSwitches: flags,
    },
    tools: rows,
    knownLimits: limits,
    ...(limitsNote ? { knownLimitsNote: limitsNote } : {}),
    reasonCodes: {
      NOT_BUILT: 'The vendor API supports this; we have not implemented it yet.',
      VENDOR_NO_API: "The vendor's API genuinely does not expose this.",
      BLOCKED: 'Implemented but non-functional — see failureMode.',
      POLICY_GATED: 'Deliberately restricted by our own guardrails.',
    },
    // The taxonomy above describes STATIC known limitations. The one below is
    // returned by an actual failing CALL. They answer different questions
    // ("what can't this connector do?" vs "why did that just fail?") and are
    // reported side by side so a caller does not conflate them.
    failureEnvelope: {
      note:
        'When a tool CALL fails it returns {failure:{reasonCode, message, evidence, remediation, fixableBy}}. Surface reasonCode, remediation and fixableBy to the user — who fixes it differs completely per code. Never flatten a failure to "that did not work".',
      reasonCodes: REASON_CODE_MEANING,
      fixableBy: FIXABLE_BY,
      surfacesMigrated: ['Autotask PSA (Kaseya)', 'TCT connector (meta)'],
      surfacesPending: ['IT Glue', 'UniFi / Ubiquiti', 'Datto RMM', 'Microsoft Graph — TCT HumanResources SharePoint'],
      pendingNote:
        'Tools on a pending surface still return plain-text errors, and their descriptions do not claim otherwise. Absence of an envelope there is not absence of a reason — ask tct_connector_capabilities or the vendor-specific capability tool.',
    },
    usageNote:
      'Call this tool BEFORE asserting that the connector cannot do something. A keyword tool-search returning few or no results is NOT evidence of a missing capability — it is evidence the search was too narrow. If a capability is not listed in tools[] and not listed in knownLimits, treat it as UNKNOWN and say so, rather than reporting it as impossible.',
  }
}
