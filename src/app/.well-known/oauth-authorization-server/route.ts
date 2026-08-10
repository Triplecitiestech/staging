// src/app/.well-known/oauth-authorization-server/route.ts
//
// RFC 8414 authorization server metadata for the connector's OWN OAuth server.
//
// This is the document Claude reads to find /authorize, /token and /register,
// and — critically — the one whose scopes_supported drives whether Claude asks
// for offline_access (and therefore whether a refresh token is ever issued).
//
// The issuer is this site's origin, so RFC 8414 puts the document at exactly
// this path. middleware.ts runs here (its matcher only excludes /api) but just
// sets security headers and passes through — no login wall.

import { authorizationServerMetadata } from '@/lib/connector/oauth/metadata'

export const runtime = 'nodejs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function GET() {
  return Response.json(authorizationServerMetadata(), { headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
