// src/app/api/connector/[transport]/route.ts
//
// Remote MCP connector for Claude (Streamable HTTP) — READ-ONLY, OAuth-protected.
//
// Works in Claude.ai chat, Claude Desktop, and Cowork (they share one connector
// + auth stack). Auth is OAuth 2.0 via WorkOS AuthKit, which Claude reaches with
// Dynamic Client Registration. This route is the OAuth *resource server*: it only
// verifies the access tokens AuthKit issues. AuthKit is the *authorization server*.
//
//   MCP endpoint:        https://<your-domain>/api/connector/mcp
//   Resource metadata:   https://<your-domain>/.well-known/oauth-protected-resource
//   Authorization server: ${AUTHKIT_DOMAIN}
//
// Exposes the EXISTING clients in src/lib/autotask.ts (AutotaskClient) and
// src/lib/ubiquiti.ts (UniFi Site Manager) as read-only MCP tools.
//
// LEAST PRIVILEGE: only read methods are wrapped. Back this with a read-scoped
// Autotask API user and a read-only UniFi Site Manager key — the credentials are
// the real enforcement boundary, not this code.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { AutotaskClient } from '@/lib/autotask'
import * as unifi from '@/lib/ubiquiti'

// pg/fetch libs need the Node runtime; external calls can take a few seconds.
export const runtime = 'nodejs'
export const maxDuration = 60

// ── OAuth config (WorkOS AuthKit) ───────────────────────────────────────────
// AUTHKIT_DOMAIN     e.g. https://your-app.authkit.app   (the issuer)
// MCP_RESOURCE_URL   the public MCP endpoint, used as the token audience AND as
//                    the "resource" advertised in the well-known metadata.
//                    MUST be added as a Resource Indicator in the WorkOS dashboard
//                    so AuthKit stamps it into the token's `aud` claim.
const AUTHKIT_DOMAIN = process.env.AUTHKIT_DOMAIN
const MCP_RESOURCE_URL = process.env.MCP_RESOURCE_URL

const JWKS = AUTHKIT_DOMAIN
  ? createRemoteJWKSet(new URL(`${AUTHKIT_DOMAIN}/oauth2/jwks`))
  : null

// ── Lazy Autotask client (constructor throws if creds are missing) ──────────
let _autotask: AutotaskClient | null = null
function autotask(): AutotaskClient {
  if (!_autotask) _autotask = new AutotaskClient()
  return _autotask
}

// ── Response helpers ────────────────────────────────────────────────────────
function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true }
}

const handler = createMcpHandler(
  (server) => {
    // ════════════════════════════════════════════════════════════════════════
    // UniFi — Site Manager cloud API (read-only)
    // ════════════════════════════════════════════════════════════════════════
    server.registerTool(
      'unifi_list_sites',
      { title: 'UniFi: list sites', description: 'List all UniFi sites visible to the Site Manager API key.', inputSchema: {} },
      async () => { try { return ok(await unifi.listSites()) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'unifi_list_hosts',
      { title: 'UniFi: list hosts', description: 'List UniFi hosts (consoles/controllers) with device counts.', inputSchema: {} },
      async () => { try { return ok(await unifi.listHosts()) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'unifi_list_devices',
      { title: 'UniFi: list devices', description: 'List all UniFi devices across sites, each with its owning host name.', inputSchema: {} },
      async () => { try { return ok(await unifi.listDevices()) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'unifi_summary',
      { title: 'UniFi: fleet summary', description: 'Aggregated summary across all UniFi sites and devices.', inputSchema: {} },
      async () => { try { return ok(await unifi.buildSummary()) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'unifi_site_networks',
      {
        title: 'UniFi: site networks',
        description: 'Network/VLAN configuration for one UniFi site. Provide siteId (from unifi_list_sites). Pass siteName for a labelled summary.',
        inputSchema: {
          siteId: z.string().describe('UniFi site id (from unifi_list_sites)'),
          siteName: z.string().optional().describe('Optional site label for a summarised view'),
        },
      },
      async ({ siteId, siteName }) => {
        try {
          return ok(siteName ? await unifi.buildSiteNetworkSummary(siteId, siteName) : await unifi.getSiteNetworks(siteId))
        } catch (e) { return fail(e) }
      }
    )

    // ════════════════════════════════════════════════════════════════════════
    // Autotask PSA (read-only)
    // ════════════════════════════════════════════════════════════════════════
    server.registerTool(
      'autotask_search_companies',
      { title: 'Autotask: search companies', description: 'Fuzzy search Autotask companies by name.', inputSchema: { query: z.string().describe('Company name or partial name') } },
      async ({ query }) => { try { return ok(await autotask().searchCompanies(query)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_get_company',
      { title: 'Autotask: get company', description: 'Get a single Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } },
      async ({ companyId }) => { try { return ok(await autotask().getCompany(companyId)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_company_projects',
      { title: 'Autotask: company projects', description: 'List projects for an Autotask company by numeric ID.', inputSchema: { companyId: z.number().int().describe('Autotask company ID') } },
      async ({ companyId }) => { try { return ok(await autotask().getProjectsByCompany(companyId)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_company_tickets',
      {
        title: 'Autotask: company tickets',
        description: 'List recent tickets for an Autotask company. days defaults to 30.',
        inputSchema: {
          companyId: z.number().int().describe('Autotask company ID'),
          days: z.number().int().min(1).max(365).optional().describe('Look-back window in days (default 30)'),
        },
      },
      async ({ companyId, days }) => { try { return ok(await autotask().getCompanyTickets(companyId, days ?? 30)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_get_ticket',
      { title: 'Autotask: get ticket', description: 'Get a single Autotask ticket by numeric ID.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } },
      async ({ ticketId }) => { try { return ok(await autotask().getTicket(ticketId)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_get_ticket_by_number',
      { title: 'Autotask: get ticket by number', description: 'Get an Autotask ticket by its ticket number (e.g. T20240101.0001).', inputSchema: { ticketNumber: z.string().describe('Autotask ticket number') } },
      async ({ ticketNumber }) => { try { return ok(await autotask().getTicketByNumber(ticketNumber)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_ticket_notes',
      { title: 'Autotask: ticket notes', description: 'List notes on an Autotask ticket by numeric ID.', inputSchema: { ticketId: z.number().int().describe('Autotask ticket ID') } },
      async ({ ticketId }) => { try { return ok(await autotask().getTicketNotes(ticketId)) } catch (e) { return fail(e) } }
    )

    server.registerTool(
      'autotask_active_projects',
      { title: 'Autotask: active projects', description: 'List all active Autotask projects.', inputSchema: {} },
      async () => { try { return ok(await autotask().getActiveProjects()) } catch (e) { return fail(e) } }
    )
  },
  {},
  {
    basePath: '/api/connector', // must match the dir containing the [transport] segment
    maxDuration: 60,
    verboseLogs: false,
  }
)

// ── Token verification (WorkOS AuthKit JWT via JWKS) ─────────────────────────
// Verifies the access token's signature, issuer, audience, and expiry. No WorkOS
// SDK or per-request API call needed — pure JWKS verification.
const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken || !JWKS || !AUTHKIT_DOMAIN || !MCP_RESOURCE_URL) return undefined
  try {
    const { payload } = await jwtVerify(bearerToken, JWKS, {
      issuer: AUTHKIT_DOMAIN,
      audience: MCP_RESOURCE_URL,
    })
    return {
      token: bearerToken,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      clientId: (payload.client_id as string) ?? (payload.sub as string) ?? 'unknown',
      extra: { sub: payload.sub },
    }
  } catch {
    return undefined // -> mcp-handler returns 401 with the resource_metadata challenge
  }
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true, // every tool call requires a valid AuthKit token
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
})

export { authHandler as GET, authHandler as POST }
