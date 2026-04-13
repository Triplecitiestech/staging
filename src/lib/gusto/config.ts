/**
 * Gusto environment configuration.
 *
 * Flip `GUSTO_ENV` between 'demo' and 'production' to switch environments.
 * Other Gusto env vars:
 *   - GUSTO_CLIENT_ID
 *   - GUSTO_CLIENT_SECRET
 *   - GUSTO_OAUTH_REDIRECT_URI (optional — falls back to NEXT_PUBLIC_BASE_URL + canonical path)
 */

export type GustoEnvironment = 'demo' | 'production'

export const GUSTO_CALLBACK_PATH = '/api/admin/integrations/gusto/callback'

export function getGustoEnvironment(): GustoEnvironment {
  const env = (process.env.GUSTO_ENV || 'demo').toLowerCase()
  return env === 'production' ? 'production' : 'demo'
}

export function getGustoApiBase(env: GustoEnvironment = getGustoEnvironment()): string {
  return env === 'production' ? 'https://api.gusto.com' : 'https://api.gusto-demo.com'
}

/**
 * OAuth host. Gusto uses the same host as the API for OAuth.
 */
export function getGustoOAuthBase(env: GustoEnvironment = getGustoEnvironment()): string {
  return getGustoApiBase(env)
}

/**
 * Resolve the OAuth redirect URI. Order of precedence:
 *   1. GUSTO_OAUTH_REDIRECT_URI (canonical)
 *   2. GUSTO_OAUTH_REDIRECT (common variant; accepted as alias)
 *   3. NEXT_PUBLIC_BASE_URL + /api/admin/integrations/gusto/callback
 *   4. https://www.triplecitiestech.com + /api/admin/integrations/gusto/callback
 *
 * This MUST exactly match a redirect URI configured in the Gusto dev portal.
 */
export function getGustoRedirectUri(): string {
  const explicit =
    process.env.GUSTO_OAUTH_REDIRECT_URI ?? process.env.GUSTO_OAUTH_REDIRECT
  if (explicit && explicit.trim()) return explicit.trim()

  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com').replace(
    /\/$/,
    ''
  )
  return `${base}${GUSTO_CALLBACK_PATH}`
}

export function getGustoClientCredentials(): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const clientId = process.env.GUSTO_CLIENT_ID
  const clientSecret = process.env.GUSTO_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Gusto OAuth configuration. Set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET.'
    )
  }

  return { clientId, clientSecret, redirectUri: getGustoRedirectUri() }
}
