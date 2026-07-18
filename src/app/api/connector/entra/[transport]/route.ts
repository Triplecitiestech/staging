// src/app/api/connector/[transport]/route.ts
//
// Remote MCP connector for Claude (Streamable HTTP) — OAuth-protected.
// Reads are read-only; writes are attributed to the signed-in technician via
// Autotask resource impersonation (see src/lib/mcp-write-tools.ts).
//
//   MCP endpoint:        https://<your-domain>/api/connector/entra/mcp
//   Resource metadata:   https://<your-domain>/.well-known/oauth-protected-resource
//   Authorization server: selected by CONNECTOR_AUTH_PROVIDER (Entra or WorkOS)
//
// NOTE: this path moved from /api/connector/mcp to /api/connector/entra/mcp on
// 2026-07-16 to force Claude clients to re-run OAuth discovery — the old URL had
// a cached WorkOS authorization server that survived remove/re-add, so the
// client kept sending WorkOS tokens after the cutover to Entra. A fresh URL has
// no cached AS, so the client discovers Entra from /.well-known cleanly.
// MCP_RESOURCE_URL must equal this endpoint URL.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import * as unifi from '@/lib/ubiquiti'
import { registerWriteTools } from '@/lib/mcp-write-tools'
import { registerItGlueTools } from '@/lib/mcp-itglue-tools'
import { registerConfigReadTools } from '@/lib/mcp-config-read-tools'
import { registerConfigWriteTools } from '@/lib/mcp-config-write-tools'
import { registerUnifiSiteTools } from '@/lib/mcp-unifi-site-tools'
import { registerHrTools } from '@/lib/mcp-hr-tools'
import { registerDattoRmmTools } from '@/lib/mcp-datto-rmm-tools'
import { verifyConnectorToken } from '@/lib/connector/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

let _autotask: AutotaskClient | null = null
function autotask(): AutotaskClient {
  if (!_autotask) _autotask = new AutotaskClient()
  return _autotask
}

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }
function fail(err: unknown) { const msg = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true } }

const handler = createMcpHandler(
  (server) => {
    // ── UniFi (Site Manager cloud, read-only) ──────────────────────────────
    server.registerTool('unifi_list_sites', { title: 'UniFi: list sites', description: 'List all UniFi sites visible to the Site Manager API key.', inputSchema: {} }, async () => { try { return ok(await unifi.listSites()) } catch (e) { return fail(e) } })
    server.registerTool('unifi_list_hosts', { title: 'UniFi: list hosts', description: 'List UniFi hosts (consoles/controllers) with device counts.', inputSchema: {} }, async () => { try { return ok(await unifi.listHosts()) } catch (e) { return fail(e) } })
    server.registerTool('unifi_list_devices', { title: 'UniFi: list devices', description: 'List all UniFi devices across sites, each with its owning host name.', inputSchema: {} }, async () => { try { return ok(await unifi.listDevices()) } catch (e) { return fail(e) } })
    server.registerTool('unifi_summary', { title: 'UniFi: fleet summary', description: 'Aggregated summary across all UniFi sites and devices.', inputSchema: {} }, async () => { try { return ok(await unifi.buildSummary()) } catch (e) { return fail(e) } })
    server.registerTool('unifi_site_networks', { title: 'UniFi: site networks', description: 'Network/VLAN configuration for one UniFi site. Provide siteId (from unifi_list_sites). Pass siteName for a labelled summary.', inputSchema: { siteId: z.string().describe('UniFi site id (from unifi_list_sites)'), siteName: z.string().optional().describe('Optional site label for a summarised view') } }, async ({ siteId, siteName }) => { try { return ok(siteName ? await unifi.buildSiteNetworkSummary(siteId, siteName) : await unifi.getSiteNetworks(siteId)) } catch (e) { return fail(e) } })

    // ── Autotask PSA (read-only) ───────────────────────────────────────────
    server.registerTool('autotask_search_companies', { title: 'Autotask: search companies', description: 'Fuzzy search Autotask companies by name.', inputSchema: { query: z.string().describe('Company name or partial name') } }, async ({ query }) => { try { return ok(await autotask().searchCompanies(query)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_get_company', { title: 'Autotask: get company', description: 'Get a single Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getCompany(companyId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_company_projects', { title: 'Autotask: company projects', description: 'List projects for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getProjectsByCompany(companyId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_company_tickets', { title: 'Autotask: company tickets', description: 'List recent tickets for an Autotask company. days defaults to 30. Set openOnly=true to return only not-completed (open) tickets via a server-side filter.', inputSchema: { companyId: z.number().int().describe('Autotask company ID'), days: z.number().int().min(1).max(365).optional().describe('Look-back window in days (default 30)'), openOnly: z.boolean().optional().describe('Only tickets with no completed date (open); default false') } }, async ({ companyId, days, openOnly }) => { try { return ok(await autotask().getCompanyTickets(companyId, days ?? 30, openOnly ?? false)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_get_ticket', { title: 'Autotask: get ticket', description: 'Get a single Autotask ticket by numeric ID.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { const t = await autotask().getTicket(ticketId); return ok(t ? { ...t, ticketUrl: getAutotaskTicketUrl(String(ticketId)) } : null) } catch (e) { return fail(e) } })
    server.registerTool('autotask_get_ticket_by_number', { title: 'Autotask: get ticket by number', description: 'Get an Autotask ticket by its ticket number (e.g. T20240101.0001).', inputSchema: { ticketNumber: z.string().describe('Autotask ticket number') } }, async ({ ticketNumber }) => { try { const t = await autotask().getTicketByNumber(ticketNumber); return ok(t ? { ...t, ticketUrl: getAutotaskTicketUrl(String(t.id)) } : null) } catch (e) { return fail(e) } })
    server.registerTool('autotask_ticket_notes', { title: 'Autotask: ticket notes', description: 'List notes on an Autotask ticket by numeric ID.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { return ok(await autotask().getTicketNotes(ticketId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_ticket_time_entries', { title: 'Autotask: ticket time entries', description: 'Read all TIME ENTRIES logged on a ticket: hours worked, billable hours (hoursToBill), billable vs non-billable (isNonBillable/billable), who logged each (resource name + email), start/stop, billing code, role, and the entry summary + internal notes. Read-only. No internal cost/rate data is exposed (Autotask time entries carry none).', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { return ok(await autotask().getTicketTimeEntriesDetailed(ticketId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_time_entries_search', { title: 'Autotask: search time entries', description: 'List every time entry a technician logged within a dateWorked range, across all tickets — each result includes the ticket id + number and company id, plus hours and billable status. Resolve a name/email to resourceId with autotask_find_resource first. Dates are YYYY-MM-DD (inclusive). Read-only.', inputSchema: { resourceId: z.number().int().describe('Autotask resource id (from autotask_find_resource)'), from: z.string().describe('Start of dateWorked range, YYYY-MM-DD'), to: z.string().describe('End of dateWorked range, YYYY-MM-DD') } }, async ({ resourceId, from, to }) => { try { return ok(await autotask().searchTimeEntriesByResource(resourceId, new Date(from), new Date(to))) } catch (e) { return fail(e) } })
    server.registerTool('autotask_active_projects', { title: 'Autotask: active projects', description: 'List all active Autotask projects.', inputSchema: {} }, async () => { try { return ok(await autotask().getActiveProjects()) } catch (e) { return fail(e) } })

    // ── Autotask lookups (map names/ids for time entries, statuses, contacts) ─
    // autotask_ticket_statuses / autotask_list_queues / autotask_list_billing_codes
    // moved to mcp-config-read-tools.ts (upgraded to full config metadata).
    server.registerTool('autotask_list_roles', { title: 'Autotask: list roles', description: 'List active Autotask roles. Use to map a name like "Network Engineer" to its roleId for a time entry.', inputSchema: {} }, async () => { try { return ok(await autotask().getRoles()) } catch (e) { return fail(e) } })
    server.registerTool('autotask_company_contacts', { title: 'Autotask: company contacts', description: 'List active contacts for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getContactsByCompany(companyId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_get_contact', { title: 'Autotask: get contact', description: 'Resolve an Autotask contact ID to name, email, title, and phone.', inputSchema: { contactId: z.number().int().describe('Autotask contact ID') } }, async ({ contactId }) => { try { return ok(await autotask().getContactById(contactId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_priorities', { title: 'Autotask: list priorities', description: 'List this instance\'s active ticket priorities (label + numeric id) for the priority field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('priority')) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_ticket_types', { title: 'Autotask: list ticket types', description: 'List this instance\'s active ticket types (label + numeric id) for the optional ticketType field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('ticketType')) } catch (e) { return fail(e) } })

    // ── Autotask Service-Delivery reporting (read-only, business-wide) ──────
    server.registerTool('autotask_search_tickets', { title: 'Autotask: search tickets (business-wide)', description: 'Search tickets across ALL companies (or one, via companyId) with server-side filters — status ids (from autotask_ticket_statuses), priority, queueId, assignedResourceId, openOnly, and a date window on createDate / lastActivityDate / completedDate. Returns reporting fields PLUS every SLA field (serviceLevelAgreementID + name via autotask_list_slas, serviceLevelAgreementHasBeenMet, first-response/resolution-plan/resolved actual + due datetimes) so you can compute "did we meet SLA" and "about to breach" (breach = dueDateTime − now). Auto-paginates by splitting the date window; returns { count, truncated, tickets[] }. If truncated=true, narrow the filters or window. Read-only.', inputSchema: { companyId: z.number().int().optional().describe('Limit to one Autotask company id (omit for ALL companies)'), status: z.array(z.number().int()).optional().describe('One or more status ids'), priority: z.number().int().optional().describe('Priority id'), queueId: z.number().int().optional().describe('Queue id'), assignedResourceId: z.number().int().optional().describe('One technician (from autotask_find_resource / autotask_list_resources)'), openOnly: z.boolean().optional().describe('Only not-completed tickets'), dateField: z.enum(['createDate', 'lastActivityDate', 'completedDate']).optional().describe('Which date the from/to window filters (default createDate)'), from: z.string().optional().describe('Window start YYYY-MM-DD (default 90 days ago)'), to: z.string().optional().describe('Window end YYYY-MM-DD (default now)'), max: z.number().int().optional().describe('Max rows (default 2000, hard cap 5000)') } }, async ({ companyId, status, priority, queueId, assignedResourceId, openOnly, dateField, from, to, max }) => { try { return ok(await autotask().searchTickets({ companyId, status, priority, queueId, assignedResourceId, openOnly, dateField, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, max })) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_slas', { title: 'Autotask: list SLAs', description: 'List this instance\'s Service Level Agreements (numeric id + name/tier), resolved from the ticket serviceLevelAgreementID picklist. Autotask exposes no standalone SLA entity in REST — this is the id→name map for ticket SLA ids. Read-only.', inputSchema: {} }, async () => { try { return ok(await autotask().getSlaList()) } catch (e) { return fail(e) } })
    server.registerTool('autotask_ticket_sla_results', { title: 'Autotask: ticket SLA results', description: 'Per-ticket SLA met/elapsed detail from ServiceLevelAgreementResults: SLA name, and first-response / resolution-plan / resolution elapsed hours + met flags. Authoritative answer to "did we meet SLA" for one ticket. Read-only.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } }, async ({ ticketId }) => { try { return ok(await autotask().getTicketSlaResults(ticketId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_companies', { title: 'Autotask: list companies', description: 'List active managed companies with id, name, and resolved classification + organization-type labels (e.g. a "Platinum Managed Service" classification). Set activeOnly=false to include inactive. Use to give business-wide reports their company set and to segment by tier. Read-only.', inputSchema: { activeOnly: z.boolean().optional().describe('Default true') } }, async ({ activeOnly }) => { try { return ok(await autotask().getManagedCompanies(activeOnly ?? true)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_contracts', { title: 'Autotask: list contracts', description: 'List contracts across companies (or one, via companyId) with resolved category / type / status labels and the contract SLA name — the likely home of a named service tier like "Platinum Managed Service". activeOnly (default true) keeps contracts with no end date or an end date in the future. Read-only.', inputSchema: { companyId: z.number().int().optional().describe('Limit to one company id'), activeOnly: z.boolean().optional().describe('Default true') } }, async ({ companyId, activeOnly }) => { try { return ok(await autotask().listContracts({ companyId, activeOnly })) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_resources', { title: 'Autotask: list resources', description: 'List active Autotask resources (technicians): id, name, email, resourceType. Maps assignedResourceId values from autotask_search_tickets to people for team-workload reporting. Read-only.', inputSchema: { activeOnly: z.boolean().optional().describe('Default true') } }, async ({ activeOnly }) => { try { return ok(await autotask().getResourcesList(activeOnly ?? true)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_search_time_entries', { title: 'Autotask: search time entries (labor/billing)', description: 'Labor read over a dateWorked range, filterable by resourceId and/or companyId (company is matched via each entry\'s ticket). Returns hours worked, billable hours (hoursToBill), billable vs non-billable, billing code, role, contract, the resource, ticket id/number + company, and a billingStatus of invoiced / approved_not_invoiced / unposted / non_billable — derived from BillingItems.invoiceID because Autotask has NO billed flag on time entries. Use billingStatus to flag billable work not yet invoiced. NO cost/rate data is exposed. Broader companion to autotask_time_entries_search. Read-only.', inputSchema: { resourceId: z.number().int().optional().describe('One technician (from autotask_find_resource)'), companyId: z.number().int().optional().describe('One company (matched via the ticket)'), from: z.string().describe('dateWorked start YYYY-MM-DD (inclusive)'), to: z.string().describe('dateWorked end YYYY-MM-DD (inclusive)'), withBillingStatus: z.boolean().optional().describe('Resolve invoiced/unbilled via BillingItems (default true)') } }, async ({ resourceId, companyId, from, to, withBillingStatus }) => { try { return ok(await autotask().searchTimeEntries({ resourceId, companyId, from: new Date(from), to: new Date(to), withBillingStatus })) } catch (e) { return fail(e) } })
    server.registerTool('autotask_survey_results', { title: 'Autotask: survey results (CSAT)', description: 'Native Autotask customer-satisfaction survey responses (SurveyResults): numeric ratings (surveyRating / companyRating / contactRating / resourceRating), ticket/company/contact ids, and send/complete dates. Filter by completeDate window and/or companyId. IMPORTANT: Autotask\'s native survey carries NO free-text comment field, and only NATIVE Autotask surveys populate this — a custom completion-email survey will NOT appear here (returns empty). Read-only.', inputSchema: { from: z.string().optional().describe('completeDate start YYYY-MM-DD'), to: z.string().optional().describe('completeDate end YYYY-MM-DD'), companyId: z.number().int().optional().describe('Limit to one company id'), completedOnly: z.boolean().optional().describe('Only completed responses (default true)') } }, async ({ from, to, companyId, completedOnly }) => { try { return ok(await autotask().getSurveyResults({ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, companyId, completedOnly })) } catch (e) { return fail(e) } })

    // ── Autotask instance configuration (live reads; verified API boundaries) ─
    registerConfigReadTools(server)

    // ── Autotask writes (impersonated as the signed-in tech) ───────────────
    registerWriteTools(server)

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
  },
  {},
  { basePath: '/api/connector/entra', maxDuration: 60, verboseLogs: false }
)

// ── Token verification ───────────────────────────────────────────────────────
// Auth provider (WorkOS AuthKit by default, or Microsoft Entra) is selected by
// CONNECTOR_AUTH_PROVIDER and lives in src/lib/connector/auth.ts. The verifier
// resolves the signed-in user's email so writes stay attributed to the person.
const authHandler = withMcpAuth(
  handler,
  (_req: Request, bearerToken?: string) => verifyConnectorToken(bearerToken),
  { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource' }
)

export { authHandler as GET, authHandler as POST }
