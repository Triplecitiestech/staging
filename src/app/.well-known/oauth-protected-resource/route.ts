// src/app/.well-known/oauth-protected-resource/route.ts
//
// OAuth 2.0 Protected Resource Metadata (RFC 9728).
// When Claude hits the MCP endpoint and gets a 401, it reads this document to
// discover which authorization server to send the user to. The body is built by
// getProtectedResourceMetadata() and depends on CONNECTOR_AUTH_PROVIDER
// (WorkOS AuthKit or Microsoft Entra). See src/lib/connector/auth.ts and
// docs/runbooks/CONNECTOR_AUTH_ENTRA.md.
//
// 'resource' is MCP_RESOURCE_URL and is what Claude sends as the RFC 8707
// `resource` indicator. NOTE: with Entra, the token `aud` the route validates is
// the app's CLIENT ID, not this resource URL — those are intentionally different.
//
// Your middleware.ts matcher excludes /api but DOES run on this path — it only
// sets security headers and passes through, so no login wall. No changes needed.

import { getProtectedResourceMetadata } from '@/lib/connector/auth'

export const runtime = 'nodejs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function GET() {
  // Body depends on CONNECTOR_AUTH_PROVIDER (WorkOS AuthKit or Microsoft Entra).
  return Response.json(getProtectedResourceMetadata(), { headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
