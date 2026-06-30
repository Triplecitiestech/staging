// src/app/.well-known/oauth-protected-resource/route.ts
//
// OAuth 2.0 Protected Resource Metadata (RFC 9728).
// When Claude hits the MCP endpoint and gets a 401, it reads this document to
// discover which authorization server to send the user to (WorkOS AuthKit).
//
// 'resource' MUST equal MCP_RESOURCE_URL and the WorkOS "Resource Indicator",
// and match the audience the token route verifies. Keep all three identical.
//
// Your middleware.ts matcher excludes /api but DOES run on this path — it only
// sets security headers and passes through, so no login wall. No changes needed.

export const runtime = 'nodejs'

const AUTHKIT_DOMAIN = process.env.AUTHKIT_DOMAIN
const MCP_RESOURCE_URL = process.env.MCP_RESOURCE_URL

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function GET() {
  return Response.json(
    {
      resource: MCP_RESOURCE_URL,
      authorization_servers: [AUTHKIT_DOMAIN],
      bearer_methods_supported: ['header'],
    },
    { headers: CORS_HEADERS }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
