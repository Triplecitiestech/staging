// src/app/api/connector/[transport]/route.ts
//
// Remote MCP connector for Claude (Streamable HTTP) — OAuth-protected.
// Reads are read-only; writes are attributed to the signed-in technician via
// Autotask resource impersonation (see src/lib/mcp-write-tools.ts).
//
//   MCP endpoint:        https://<your-domain>/api/connector/mcp
//   Resource metadata:   https://<your-domain>/.well-known/oauth-protected-resource
//   Authorization server: ${AUTHKIT_DOMAIN}

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { AutotaskClient, getAutotaskTicketUrl } from '@/lib/autotask'
import * as unifi from '@/lib/ubiquiti'
import { registerWriteTools, resolveUserEmail } from '@/lib/mcp-write-tools'
import { registerItGlueTools } from '@/lib/mcp-itglue-tools'
import { getTicketStatusPicklist } from '@/lib/tickets/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

const AUTHKIT_DOMAIN = process.env.AUTHKIT_DOMAIN
const MCP_RESOURCE_URL = process.env.MCP_RESOURCE_URL

const JWKS = AUTHKIT_DOMAIN ? createRemoteJWKSet(new URL(`${AUTHKIT_DOMAIN}/oauth2/jwks`)) : null

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
    server.registerTool('autotask_active_projects', { title: 'Autotask: active projects', description: 'List all active Autotask projects.', inputSchema: {} }, async () => { try { return ok(await autotask().getActiveProjects()) } catch (e) { return fail(e) } })

    // ── Autotask lookups (map names/ids for time entries, statuses, contacts) ─
    server.registerTool('autotask_list_billing_codes', { title: 'Autotask: list billing codes', description: 'List active work-type (labor) billing codes. Use to map a name like "Help Desk" to its billingCodeId for a time entry.', inputSchema: {} }, async () => { try { return ok(await autotask().getBillingCodes()) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_roles', { title: 'Autotask: list roles', description: 'List active Autotask roles. Use to map a name like "Network Engineer" to its roleId for a time entry.', inputSchema: {} }, async () => { try { return ok(await autotask().getRoles()) } catch (e) { return fail(e) } })
    server.registerTool('autotask_ticket_statuses', { title: 'Autotask: ticket statuses', description: 'List this Autotask instance\'s active ticket status values (label + numeric id) for use with autotask_set_ticket_status.', inputSchema: {} }, async () => { try { const m = await getTicketStatusPicklist(); return ok(m ? Object.entries(m).map(([id, label]) => ({ id: Number(id), label })) : []) } catch (e) { return fail(e) } })
    server.registerTool('autotask_company_contacts', { title: 'Autotask: company contacts', description: 'List active contacts for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } }, async ({ companyId }) => { try { return ok(await autotask().getContactsByCompany(companyId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_get_contact', { title: 'Autotask: get contact', description: 'Resolve an Autotask contact ID to name, email, title, and phone.', inputSchema: { contactId: z.number().int().describe('Autotask contact ID') } }, async ({ contactId }) => { try { return ok(await autotask().getContactById(contactId)) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_queues', { title: 'Autotask: list queues', description: 'List this instance\'s active ticket queues (label + numeric id) — resolve a queue name to the queueID required by autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('queueID')) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_priorities', { title: 'Autotask: list priorities', description: 'List this instance\'s active ticket priorities (label + numeric id) for the priority field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('priority')) } catch (e) { return fail(e) } })
    server.registerTool('autotask_list_ticket_types', { title: 'Autotask: list ticket types', description: 'List this instance\'s active ticket types (label + numeric id) for the optional ticketType field on autotask_create_ticket.', inputSchema: {} }, async () => { try { return ok(await autotask().getTicketPicklist('ticketType')) } catch (e) { return fail(e) } })

    // ── Autotask writes (impersonated as the signed-in tech) ───────────────
    registerWriteTools(server)

    // ── IT Glue (docs/CMDB): reads + document & flexible-asset writes ──────
    // Never touches the /passwords resource.
    registerItGlueTools(server)
  },
  {},
  { basePath: '/api/connector', maxDuration: 60, verboseLogs: false }
)

// ── Token verification (WorkOS AuthKit JWT via JWKS) ─────────────────────────
// Also resolves the signed-in user's email so writes can be impersonated.
const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken || !JWKS || !AUTHKIT_DOMAIN || !MCP_RESOURCE_URL) return undefined
  try {
    const { payload } = await jwtVerify(bearerToken, JWKS, { issuer: AUTHKIT_DOMAIN, audience: MCP_RESOURCE_URL })
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined
    const email = await resolveUserEmail(sub, (payload as Record<string, unknown>).email)
    return {
      token: bearerToken,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      clientId: (payload.client_id as string) ?? sub ?? 'unknown',
      extra: { sub, email },
    }
  } catch {
    return undefined
  }
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource' })

export { authHandler as GET, authHandler as POST }
