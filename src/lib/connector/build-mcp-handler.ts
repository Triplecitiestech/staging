// src/lib/connector/build-mcp-handler.ts
//
// THE tool surface for the MCP connector, and the only place it is built.
//
// Extracted from the /api/connector/entra route on 2026-08-10 so a SECOND mount
// (/api/connector/tct, backed by our own authorization server) can serve the
// identical toolset. Two routes registering their own copies would drift the
// first time somebody added a tool to one of them — and "no parallel
// implementations" is a repo rule, not a preference.
//
// Only the basePath differs between mounts; it must equal the route's own path
// or mcp-handler cannot resolve the transport segment. Auth is deliberately NOT
// here: each route wraps this with its own verifier, which is what lets the
// Entra mount and the tct mount run side by side during the migration.

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import {
  activityGapWarning,
  computeActivityGap,
  newestTimestamp,
  TICKET_NOTES_EXCLUSIONS,
} from '@/lib/autotask-activity'
import * as unifi from '@/lib/ubiquiti'
import { registerWriteTools } from '@/lib/mcp-write-tools'
import { registerProjectTools } from '@/lib/mcp-project-tools'
import { registerItGlueTools } from '@/lib/mcp-itglue-tools'
import { registerConfigReadTools } from '@/lib/mcp-config-read-tools'
import { registerConfigWriteTools } from '@/lib/mcp-config-write-tools'
import { registerUnifiSiteTools } from '@/lib/mcp-unifi-site-tools'
import { registerHrTools } from '@/lib/mcp-hr-tools'
import { registerDattoRmmTools } from '@/lib/mcp-datto-rmm-tools'
import { registerSalesPricingTools } from '@/lib/mcp-sales-pricing-tools'
import { registerKaseyaQuoteManagerTools } from '@/lib/mcp-kaseya-quote-manager-tools'
import { recordingServer, buildCapabilityReport } from '@/lib/connector/capability-registry'
import { toolFailure } from '@/lib/connector/failure-envelope'

let _autotask: AutotaskClient | null = null
function autotask(): AutotaskClient {
  if (!_autotask) _autotask = new AutotaskClient()
  return _autotask
}

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }

// Legacy plain-text failure. Still used by the five UniFi Site Manager reads
// registered in this file — those move to the envelope with the rest of the
// UniFi surface in the follow-up retrofit, so they are deliberately unchanged
// here rather than half-migrated.
function fail(err: unknown) { const msg = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true } }

// Structured failure envelopes (see src/lib/connector/failure-envelope.ts):
// every failure says whether it is a vendor limit, a connector gap, a guardrail,
// a permissions problem or a transient blip — and who fixes it. Success
// responses are byte-identical to before.
function failAt(err: unknown) { return toolFailure(err, { surface: 'autotask' }) }
function failConnector(err: unknown) { return toolFailure(err, { surface: 'connector' }) }

// ---------------------------------------------------------------------------
// Activity-gap decoration for ticket reads
// ---------------------------------------------------------------------------
//
// 2026-07-30, ticket 34648: a technician's completed 2.67-hour build existed
// only as time entry 13188. autotask_ticket_notes cannot see time entries, so
// the assistant told the owner there was no update showing the work finished.
// The ticket already carried the contradiction (lastActivityDate 14:48:47 vs
// newest returned note 12:08:22) and nothing compared them.
//
// Every ticket read now publishes lastActivityDate plus activityGap, so a read
// that cannot account for the ticket's own last activity says so instead of
// reading as a complete picture. See src/lib/autotask-activity.ts.

/** A ticket-level read returns no activity rows at all — that IS the gap. */
function ticketWithGap<T extends { id?: number; lastActivityDate?: string | null }>(t: T): T & { activityGap: boolean | null } {
  const gap = computeActivityGap({ lastActivityDate: t.lastActivityDate ?? null, newestRetrievedActivityAt: null })
  return { ...t, activityGap: gap.activityGap }
}

/**
 * Advisory for a ticket-level read. One string per RESPONSE rather than per
 * ticket: a 2000-ticket search would otherwise carry 2000 copies of the same
 * sentence, and volume is how a warning gets skimmed past.
 */
function ticketReadAdvisory(count: number): string {
  return `This read returns ticket FIELDS only — no notes, time entries or attachments — so activityGap is true on every ticket that has any activity (${count} ticket(s) returned). It is not evidence about what was or was not done. Call autotask_ticket_activity({ ticketId }) for a ticket's merged timeline before stating that work was not done or that a ticket was not updated.`
}

/** Build the connector handler for one mount. `basePath` MUST match the route path. */
export function buildConnectorHandler(basePath: string) {
  return createMcpHandler(
    (mcpServer) => {
      // Wrap the server so every registerTool call below is RECORDED as it
      // happens. `recorded` is what tct_connector_capabilities reports from, so
      // the capability list can never drift from what is actually registered —
      // no hand-maintained list, no counting tools by eye. Registration behavior
      // is unchanged; the proxy only observes. See capability-registry.ts.
      const { server, recorded } = recordingServer(mcpServer)

      // ── UniFi (Site Manager cloud, read-only) ──────────────────────────────
      server.registerTool('unifi_list_sites', { title: 'UniFi: list sites', description: 'List all UniFi sites visible to the Site Manager API key.', inputSchema: {} }, async () => { try { return ok(await unifi.listSites()) } catch (e) { return fail(e) } })
      server.registerTool('unifi_list_hosts', { title: 'UniFi: list hosts', description: 'List UniFi hosts (consoles/controllers) with device counts.', inputSchema: {} }, async () => { try { return ok(await unifi.listHosts()) } catch (e) { return fail(e) } })
      server.registerTool('unifi_list_devices', { title: 'UniFi: list devices', description: 'List all UniFi devices across sites, each with its owning host name.', inputSchema: {} }, async () => { try { return ok(await unifi.listDevices()) } catch (e) { return fail(e) } })
      server.registerTool('unifi_summary', { title: 'UniFi: fleet summary', description: 'Aggregated summary across all UniFi sites and devices.', inputSchema: {} }, async () => { try { return ok(await unifi.buildSummary()) } catch (e) { return fail(e) } })
      server.registerTool('unifi_site_networks', { title: 'UniFi: site networks', description: 'Network/VLAN configuration for one UniFi site. Provide siteId (from unifi_list_sites). Pass siteName for a labelled summary.', inputSchema: { siteId: z.string().describe('UniFi site id (from unifi_list_sites)'), siteName: z.string().optional().describe('Optional site label for a summarised view') } }, async ({ siteId, siteName }) => { try { return ok(siteName ? await unifi.buildSiteNetworkSummary(siteId, siteName) : await unifi.getSiteNetworks(siteId)) } catch (e) { return fail(e) } })

      // ── Autotask PSA (read-only) ───────────────────────────────────────────
      server.registerTool('autotask_search_companies', { title: 'Autotask: search companies', description: 'Fuzzy search Autotask companies by name.', inputSchema: { query: z.string().describe('Company name or partial name') } }, async ({ query }) => { try { return ok(await autotask().searchCompanies(query)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_get_company', { title: 'Autotask: get company', description: 'Get a single Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getCompany(companyId)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_company_projects', { title: 'Autotask: company projects', description: 'List projects for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getProjectsByCompany(companyId)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_company_tickets', { title: 'Autotask: company tickets', description: 'List recent tickets for an Autotask company. days defaults to 30. Set openOnly=true to return only not-completed (open) tickets via a server-side filter. Returns { count, activityGapAdvisory, tickets[] }; each ticket carries lastActivityDate + activityGap. Ticket FIELDS only — no notes or time entries, so this read is never evidence that work was not done (use autotask_ticket_activity).', inputSchema: { companyId: z.number().int().describe('Autotask company ID'), days: z.number().int().min(1).max(365).optional().describe('Look-back window in days (default 30)'), openOnly: z.boolean().optional().describe('Only tickets with no completed date (open); default false') } }, async ({ companyId, days, openOnly }) => { try { const rows = await autotask().getCompanyTickets(companyId, days ?? 30, openOnly ?? false); return ok({ count: rows.length, activityGapAdvisory: ticketReadAdvisory(rows.length), tickets: rows.map(ticketWithGap) }) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_get_ticket', { title: 'Autotask: get ticket', description: 'Get a single Autotask ticket by numeric ID. Includes lastActivityDate + activityGap: this read returns ticket FIELDS only, so activityGap is true whenever the ticket has activity — call autotask_ticket_activity for the timeline before making any claim about what was or was not done.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { const t = await autotask().getTicket(ticketId); return ok(t ? { ...ticketWithGap(t), activityGapAdvisory: ticketReadAdvisory(1), ticketUrl: getAutotaskTicketUrl(String(ticketId)) } : null) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_get_ticket_by_number', { title: 'Autotask: get ticket by number', description: 'Get an Autotask ticket by its ticket number (e.g. T20240101.0001). Includes lastActivityDate + activityGap: this read returns ticket FIELDS only, so activityGap is true whenever the ticket has activity — call autotask_ticket_activity for the timeline before making any claim about what was or was not done.', inputSchema: { ticketNumber: z.string().describe('Autotask ticket number') } }, async ({ ticketNumber }) => { try { const t = await autotask().getTicketByNumber(ticketNumber); return ok(t ? { ...ticketWithGap(t), activityGapAdvisory: ticketReadAdvisory(1), ticketUrl: getAutotaskTicketUrl(String(t.id)) } : null) } catch (e) { return failAt(e) } })
      server.registerTool(
        'autotask_ticket_notes',
        {
          title: 'Autotask: ticket notes',
          description:
            'List the Autotask TicketNotes on a ticket. RETURNS TICKET NOTES ONLY. Time entries are EXCLUDED — they are a different entity (TimeEntries) and this tool cannot see them — and attachments are excluded too. ' +
            'DO NOT USE THIS READ AS THE BASIS FOR ANY CLAIM THAT WORK WAS NOT DONE, that a technician did not update a ticket, or that nothing happened in a period. Technicians routinely record completed work as a time entry and nowhere else, so an empty or stale notes list is not evidence of inactivity. autotask_ticket_activity is the tool for that question — it merges notes, time entries and attachments into one timeline. ' +
            'The response also carries the ticket\'s lastActivityDate and activityGap: when activityGap is true, activity exists that this read did not return.',
          inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') },
        },
        async ({ ticketId }) => {
          try {
            const at = autotask()
            const [notes, stamps] = await Promise.all([
              at.getTicketNotes(ticketId),
              at.getTicketActivityStamps(ticketId).catch(() => null),
            ])
            const gap = computeActivityGap({
              lastActivityDate: stamps?.lastActivityDate ?? null,
              newestRetrievedActivityAt: newestTimestamp(notes.map((n) => ({ at: n.createDateTime ?? n.lastActivityDate ?? '' }))),
            })
            return ok({
              ticketId,
              count: notes.length,
              ...gap,
              activityGapWarning: activityGapWarning(ticketId, gap, { retrieved: 'ticket note' }),
              ...TICKET_NOTES_EXCLUSIONS,
              notes,
            })
          } catch (e) { return failAt(e) }
        }
      )
      server.registerTool(
        'autotask_ticket_time_entries',
        {
          title: 'Autotask: ticket time entries',
          description:
            'Read all TIME ENTRIES logged on a ticket: hours worked, billable hours (hoursToBill), billable vs non-billable (isNonBillable/billable), who logged each (resource name + email), start/stop, when the record was saved (createDateTime), billing code, role, and the entry summary + internal notes. Read-only. No internal cost/rate data is exposed (Autotask time entries carry none). ' +
            'Returns TIME ENTRIES ONLY — ticket notes and attachments are excluded; use autotask_ticket_activity for the merged timeline. Also carries the ticket\'s lastActivityDate and activityGap: when activityGap is true, activity exists that this read did not return.',
          inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') },
        },
        async ({ ticketId }) => {
          try {
            const at = autotask()
            const [entries, stamps] = await Promise.all([
              at.getTicketTimeEntriesDetailed(ticketId),
              at.getTicketActivityStamps(ticketId).catch(() => null),
            ])
            const gap = computeActivityGap({
              lastActivityDate: stamps?.lastActivityDate ?? null,
              newestRetrievedActivityAt: newestTimestamp(entries.map((e) => ({ at: e.createDateTime ?? e.startDateTime ?? e.dateWorked ?? '' }))),
            })
            return ok({
              ticketId,
              count: entries.length,
              hoursLogged: entries.reduce((s, e) => s + (typeof e.hoursWorked === 'number' ? e.hoursWorked : 0), 0),
              ...gap,
              activityGapWarning: activityGapWarning(ticketId, gap, { retrieved: 'time entry' }),
              returns: ['TimeEntries'],
              excludes: ['TicketNotes', 'TicketAttachments'],
              timeEntries: entries,
            })
          } catch (e) { return failAt(e) }
        }
      )
      server.registerTool(
        'autotask_ticket_activity',
        {
          title: 'Autotask: ticket activity timeline',
          description:
            'THE COMPLETE ACTIVITY PICTURE for one ticket, and the ONLY read that should ground a statement about whether work was done or a ticket was updated. Merges every activity entity the REST API exposes — TicketNotes + TimeEntries + TicketAttachments — into one chronological timeline, each item tagged with its source entity, author (resource name + email, or the customer contact), timestamp, and customer-visible vs internal. ' +
            'Use this instead of autotask_ticket_notes whenever the question is "did the technician finish / update / do anything", because a completed job is routinely recorded as a time entry and never as a note. ' +
            'Ordering is by RECORD time (a note\'s createDateTime, a time entry\'s createDateTime, an attachment\'s attachDate) so it is comparable with the ticket\'s lastActivityDate; each time entry also carries its work window (dateWorked / start / end / hours). ' +
            'Visibility is honest about vendor limits: notes and attachments are classified from the live publish picklist, while TimeEntries has NO publish field in the REST API, so time entries report scope "unknown" with the reason rather than a guess. ' +
            'Also returns lastActivityDate, lastCustomerVisibleActivityDateTime, lastCustomerNotificationDateTime, hoursLogged, per-source counts, and activityGap — if activityGap is still true here, the remaining activity is a ticket field change rather than a note/time entry/attachment. sourcesUnavailable names any source whose query failed, so a broken query can never read as an empty result. Read-only.',
          inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') },
        },
        async ({ ticketId }) => {
          try {
            const result = await autotask().getTicketActivity(ticketId)
            return ok({
              ...result,
              activityGapWarning: activityGapWarning(ticketId, result, { retrieved: 'note, time entry or attachment', isActivityTool: true }),
              ticketUrl: getAutotaskTicketUrl(String(ticketId)),
            })
          } catch (e) { return failAt(e) }
        }
      )
      server.registerTool('autotask_time_entries_search', { title: 'Autotask: search time entries', description: 'List every time entry a technician logged within a dateWorked range, across all tickets — each result includes the ticket id + number and company id, plus hours and billable status. Resolve a name/email to resourceId with autotask_find_resource first. Dates are YYYY-MM-DD (inclusive). Read-only.', inputSchema: { resourceId: z.number().int().describe('Autotask resource id (from autotask_find_resource)'), from: z.string().describe('Start of dateWorked range, YYYY-MM-DD'), to: z.string().describe('End of dateWorked range, YYYY-MM-DD') } }, async ({ resourceId, from, to }) => { try { return ok(await autotask().searchTimeEntriesByResource(resourceId, new Date(from), new Date(to))) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_active_projects', { title: 'Autotask: active projects', description: 'List all active Autotask projects.', inputSchema: {} }, async () => { try { return ok(await autotask().getActiveProjects()) } catch (e) { return failAt(e) } })

      // ── Autotask lookups (map names/ids for time entries, statuses, contacts) ─
      // autotask_ticket_statuses / autotask_list_queues / autotask_list_billing_codes
      // moved to mcp-config-read-tools.ts (upgraded to full config metadata).
      server.registerTool('autotask_list_roles', { title: 'Autotask: list roles', description: 'List active Autotask roles. Use to map a name like "Network Engineer" to its roleId for a time entry.', inputSchema: {} }, async () => { try { return ok(await autotask().getRoles()) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_company_contacts', { title: 'Autotask: company contacts', description: 'List active contacts for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getContactsByCompany(companyId)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_get_contact', { title: 'Autotask: get contact', description: 'Resolve an Autotask contact ID to name, email, title, and phone.', inputSchema: { contactId: z.number().int().describe('Autotask contact ID') } }, async ({ contactId }) => { try { return ok(await autotask().getContactById(contactId)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_priorities', { title: 'Autotask: list priorities', description: 'List this instance\'s active ticket priorities (label + numeric id) for the priority field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('priority')) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_ticket_types', { title: 'Autotask: list ticket types', description: 'List this instance\'s active ticket types (label + numeric id) for the optional ticketType field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('ticketType')) } catch (e) { return failAt(e) } })

      // ── Autotask Service-Delivery reporting (read-only, business-wide) ──────
      server.registerTool('autotask_search_tickets', { title: 'Autotask: search tickets (business-wide)', description: 'Search tickets across ALL companies (or one, via companyId) with server-side filters — status ids (from autotask_ticket_statuses), priority, queueId, assignedResourceId, openOnly, and a date window on createDate / lastActivityDate / completedDate. Returns reporting fields PLUS every SLA field (serviceLevelAgreementID + name via autotask_list_slas, serviceLevelAgreementHasBeenMet, first-response/resolution-plan/resolved actual + due datetimes) so you can compute "did we meet SLA" and "about to breach" (breach = dueDateTime − now). Auto-paginates by splitting the date window; returns { count, truncated, activityGapAdvisory, tickets[] } and each ticket carries lastActivityDate + activityGap. If truncated=true, narrow the filters or window. Ticket FIELDS only — no notes or time entries — so this read is never evidence that work was not done; use autotask_ticket_activity for that. Read-only.', inputSchema: { companyId: z.number().int().optional().describe('Limit to one Autotask company id (omit for ALL companies)'), status: z.array(z.number().int()).optional().describe('One or more status ids'), priority: z.number().int().optional().describe('Priority id'), queueId: z.number().int().optional().describe('Queue id'), assignedResourceId: z.number().int().optional().describe('One technician (from autotask_find_resource / autotask_list_resources)'), openOnly: z.boolean().optional().describe('Only not-completed tickets'), dateField: z.enum(['createDate', 'lastActivityDate', 'completedDate']).optional().describe('Which date the from/to window filters (default createDate)'), from: z.string().optional().describe('Window start YYYY-MM-DD (default 90 days ago)'), to: z.string().optional().describe('Window end YYYY-MM-DD (default now)'), max: z.number().int().optional().describe('Max rows (default 2000, hard cap 5000)') } }, async ({ companyId, status, priority, queueId, assignedResourceId, openOnly, dateField, from, to, max }) => { try { const res = await autotask().searchTickets({ companyId, status, priority, queueId, assignedResourceId, openOnly, dateField, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, max }); return ok({ ...res, activityGapAdvisory: ticketReadAdvisory(res.tickets.length), tickets: res.tickets.map(ticketWithGap) }) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_slas', { title: 'Autotask: list SLAs', description: 'List this instance\'s Service Level Agreements (numeric id + name/tier), resolved from the ticket serviceLevelAgreementID picklist. Autotask exposes no standalone SLA entity in REST — this is the id→name map for ticket SLA ids. Read-only.', inputSchema: {} }, async () => { try { return ok(await autotask().getSlaList()) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_ticket_sla_results', { title: 'Autotask: ticket SLA results', description: 'Per-ticket SLA met/elapsed detail from ServiceLevelAgreementResults: SLA name, and first-response / resolution-plan / resolution elapsed hours + met flags. Authoritative answer to "did we meet SLA" for one ticket. Read-only.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { return ok(await autotask().getTicketSlaResults(ticketId)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_companies', { title: 'Autotask: list companies', description: 'List active managed companies with id, name, and resolved classification + organization-type labels (e.g. a "Platinum Managed Service" classification). Set activeOnly=false to include inactive. Use to give business-wide reports their company set and to segment by tier. Read-only.', inputSchema: { activeOnly: z.boolean().optional().describe('Default true') } }, async ({ activeOnly }) => { try { return ok(await autotask().getManagedCompanies(activeOnly ?? true)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_contracts', { title: 'Autotask: list contracts', description: 'List contracts across companies (or one, via companyId) with resolved category / type / status labels and the contract SLA name — the likely home of a named service tier like "Platinum Managed Service". activeOnly (default true) keeps contracts with no end date or an end date in the future. Read-only.', inputSchema: { companyId: z.number().int().optional().describe('Limit to one company id'), activeOnly: z.boolean().optional().describe('Default true') } }, async ({ companyId, activeOnly }) => { try { return ok(await autotask().listContracts({ companyId, activeOnly })) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_list_resources', { title: 'Autotask: list resources', description: 'List active Autotask resources (technicians): id, name, email, resourceType. Maps assignedResourceId values from autotask_search_tickets to people for team-workload reporting. Read-only.', inputSchema: { activeOnly: z.boolean().optional().describe('Default true') } }, async ({ activeOnly }) => { try { return ok(await autotask().getResourcesList(activeOnly ?? true)) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_search_time_entries', { title: 'Autotask: search time entries (labor/billing)', description: 'Labor read over a dateWorked range, filterable by resourceId and/or companyId (company is matched via each entry\'s ticket). Returns hours worked, billable hours (hoursToBill), billable vs non-billable, billing code, role, contract, the resource, ticket id/number + company, and a billingStatus of invoiced / approved_not_invoiced / unposted / non_billable — derived from BillingItems.invoiceID because Autotask has NO billed flag on time entries. Use billingStatus to flag billable work not yet invoiced. NO cost/rate data is exposed. Broader companion to autotask_time_entries_search. Read-only.', inputSchema: { resourceId: z.number().int().optional().describe('One technician (from autotask_find_resource)'), companyId: z.number().int().optional().describe('One company (matched via the ticket)'), from: z.string().describe('dateWorked start YYYY-MM-DD (inclusive)'), to: z.string().describe('dateWorked end YYYY-MM-DD (inclusive)'), withBillingStatus: z.boolean().optional().describe('Resolve invoiced/unbilled via BillingItems (default true)') } }, async ({ resourceId, companyId, from, to, withBillingStatus }) => { try { return ok(await autotask().searchTimeEntries({ resourceId, companyId, from: new Date(from), to: new Date(to), withBillingStatus })) } catch (e) { return failAt(e) } })
      server.registerTool('autotask_survey_results', { title: 'Autotask: survey results (CSAT)', description: 'Native Autotask customer-satisfaction survey responses (SurveyResults): numeric ratings (surveyRating / companyRating / contactRating / resourceRating), ticket/company/contact ids, and send/complete dates. Filter by completeDate window and/or companyId. IMPORTANT: Autotask\'s native survey carries NO free-text comment field, and only NATIVE Autotask surveys populate this — a custom completion-email survey will NOT appear here (returns empty). Read-only.', inputSchema: { from: z.string().optional().describe('completeDate start YYYY-MM-DD'), to: z.string().optional().describe('completeDate end YYYY-MM-DD'), companyId: z.number().int().optional().describe('Limit to one company id'), completedOnly: z.boolean().optional().describe('Only completed responses (default true)') } }, async ({ from, to, companyId, completedOnly }) => { try { return ok(await autotask().getSurveyResults({ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, companyId, completedOnly })) } catch (e) { return failAt(e) } })

      // ── Autotask instance configuration (live reads; verified API boundaries) ─
      registerConfigReadTools(server)

      // ── Autotask writes (impersonated as the signed-in tech) ───────────────
      registerWriteTools(server)

      // ── Autotask PROJECTS / TASKS / CRM (impersonated, read-back verified) ─
      // Operational records, so DIRECT writes like the ticket tools above —
      // the staged gate below is for instance CONFIGURATION, not for a task
      // status or a contact's phone number.
      registerProjectTools(server)

      // ── Autotask CONFIG writes (structural human-approval gate) ────────────
      // stage → human approves on /admin/connector/staged-writes → execute.
      registerConfigWriteTools(server)

      // ── IT Glue (docs/CMDB): reads + document & flexible-asset writes ──────
      // Never touches the /passwords resource.
      registerItGlueTools(server)

      // ── UniFi per-site tools (Cloud Connector Proxy → local Integration API) ─
      // Reads unrestricted (secret-redacted, typed errors); tier-1 actions and
      // tier-2 staged config writes gated by CONNECTOR_UNIFI_WRITES_ENABLED.
      // Single console / single site / single target by schema construction.
      registerUnifiSiteTools(server)

      // ── HR Employee-Relations writes (TCT's own HumanResources SharePoint) ──
      // Direct writes (no staging), audit-logged + read-back verified, via a
      // dedicated least-privilege Sites.Selected app. Dormant unless
      // CONNECTOR_HR_WRITES_ENABLED === 'true' and HR_RECORDS_* are set.
      registerHrTools(server)

      // ── Datto RMM (read-only reporting; GET-only by construction) ──────────
      // Reuses the shared DattoRmmClient; every call goes through getV2()
      // which can only issue GETs. Site/device responses carry the console
      // deep links the API itself returns (portalUrl/webRemoteUrl).
      registerDattoRmmTools(server)

      // ── TCT sales pricing (read-only; OUR own pricing, not a vendor API) ────
      // Same engine + live pricing as /admin/sales-calculator. No write surface:
      // pricing is edited only in the admin UI by a staff user with
      // system_settings. Exists because the admin pages are auth-walled and
      // crawler-blocked, so pricing was previously pasted in by hand.
      registerSalesPricingTools(server)

      // ── Kaseya Quote Manager (read-only; GET-only by construction) ──────────
      // The vendor API has no write surface at all: all 39 operations in the
      // captured OpenAPI spec are GET, so there is no staged-write gate here and
      // nothing to kill-switch. Tool surface is generated from KQM_RESOURCES and
      // asserted against the spec by test, so coverage cannot drift silently.
      // Auth mechanism is contradicted between the spec (header) and Kaseya's help
      // page (query param) — header is the default, kqm_probe_connection settles it.
      registerKaseyaQuoteManagerTools(server)

      // ── Self-description (registered LAST so it sees every tool above) ──────
      // The keyword-rich description is deliberate: Claude discovers tools by
      // keyword search, and a thin search result was previously being read as
      // proof a capability did not exist. This tool has to be findable by a
      // narrow search for any of "capabilities/tools/limitations/supported/
      // available/can/cannot" plus any vendor name.
      server.registerTool(
        'tct_connector_capabilities',
        {
          title: 'TCT connector: capabilities, tools and limitations (ground truth)',
          description:
            'AUTHORITATIVE, LIVE list of what the Triple Cities Tech (TCT) MCP connector can and cannot do — every available tool, what is supported, and the known limitations. Covers Autotask (Kaseya PSA), IT Glue, Datto RMM, UniFi / Ubiquiti, and Microsoft Graph / SharePoint for HR records. ' +
            'CALL THIS BEFORE ASSERTING THAT THE CONNECTOR CANNOT DO SOMETHING. A tool search that returns few or no results does NOT mean a capability is missing — it means the search was too narrow. Claude has repeatedly told this user a capability was impossible when the tool existed and had been used minutes earlier; this tool exists to prevent that. ' +
            'Returns, per tool: name, vendor, one-line purpose, read/write classification, required and optional parameters, whether a human staged-approval gate applies, and known constraints. Also returns KNOWN LIMITS per vendor, each tagged NOT_BUILT (vendor supports it, we have not built it), VENDOR_NO_API (the vendor API genuinely lacks it), BLOCKED (built but broken, with the failure mode) or POLICY_GATED (restricted by our own guardrails) — so "cannot" always comes with a reason. ' +
            'Generated from the live tool registry at request time, never from a hand-maintained list, and includes the build commit and deploy id so you can tell whether your beliefs predate this build. ' +
            'If something is neither in tools[] nor in knownLimits, say it is UNKNOWN — do not report it as impossible.',
          inputSchema: {
            vendor: z
              .string()
              .optional()
              .describe('Filter to one vendor, e.g. "itglue", "autotask", "unifi", "datto", "hr". Omit for everything.'),
            includeParams: z
              .boolean()
              .optional()
              .describe('Include per-tool parameter lists (default true). Set false for a compact overview.'),
          },
        },
        async ({ vendor, includeParams }: { vendor?: string; includeParams?: boolean }) => {
          try {
            return ok(buildCapabilityReport(recorded, { vendor, includeParams }))
          } catch (e) { return failConnector(e) }
        }
      )
    },
    {},
    { basePath, maxDuration: 60, verboseLogs: false }
  )
}
