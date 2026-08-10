// src/app/.well-known/oauth-protected-resource/api/connector/tct/mcp/route.ts
//
// RFC 9728 protected-resource metadata for the /api/connector/tct/mcp mount.
//
// Path-suffixed on purpose. The bare /.well-known/oauth-protected-resource
// document still describes the OLD Entra mount, which stays live and untouched
// during the migration, so the two mounts need two documents. RFC 9728 defines
// this path-insertion form for exactly that, and the 401 challenge from the
// tct mount points its resource_metadata parameter straight here — Anthropic's
// docs call that the most reliable discovery path, with origin probing only a
// fallback.

import { protectedResourceMetadata } from '@/lib/connector/oauth/metadata'

export const runtime = 'nodejs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function GET() {
  return Response.json(protectedResourceMetadata(), { headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
