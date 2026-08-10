// src/app/api/connector/entra/[transport]/route.ts
//
// Remote MCP connector for Claude (Streamable HTTP), authorized by an EXTERNAL
// authorization server (Microsoft Entra, or WorkOS) via CONNECTOR_AUTH_PROVIDER.
//
//   MCP endpoint:        https://<your-domain>/api/connector/entra/mcp
//   Resource metadata:   https://<your-domain>/.well-known/oauth-protected-resource
//
// NOTE: this path moved from /api/connector/mcp to /api/connector/entra/mcp on
// 2026-07-16 to force Claude clients to re-run OAuth discovery — the old URL had
// a cached WorkOS authorization server that survived remove/re-add, so the
// client kept sending WorkOS tokens after the cutover to Entra. A fresh URL has
// no cached AS, so the client discovers Entra from /.well-known cleanly.
// MCP_RESOURCE_URL must equal this endpoint URL.
//
// ── SUPERSEDED, still live ──────────────────────────────────────────────────
// This mount drops roughly every 60-90 minutes and cannot be fixed from here.
// claude.ai's custom-connector proxy never refreshes OAuth tokens
// (anthropics/claude-ai-mcp#228) and specifically ignores the token endpoint of
// EXTERNAL identity providers — Entra, Okta, Auth0 — so the access token's
// lifetime is the reconnect interval, and Entra caps that at 24 hours.
//
// /api/connector/tct/mcp is the replacement: same tools, our own authorization
// server, so the token lifetime is ours to set and there is no external IdP for
// the proxy to mishandle. Both run side by side deliberately — this one keeps
// working while the new one is proven. See docs/runbooks/CONNECTOR_AUTH_TCT.md.

import { withMcpAuth } from 'mcp-handler'
import { buildConnectorHandler } from '@/lib/connector/build-mcp-handler'
import { verifyConnectorToken } from '@/lib/connector/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Identical tool surface to the tct mount — one implementation, two mounts.
const handler = buildConnectorHandler('/api/connector/entra')

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
