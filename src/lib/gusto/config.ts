/**
 * Gusto environment configuration.
 *
 * Flip `GUSTO_ENV` between 'demo' and 'production' to switch environments.
 * Other Gusto env vars:
 *   - GUSTO_CLIENT_ID
 *   - GUSTO_CLIENT_SECRET
 *   - GUSTO_OAUTH_REDIRECT_URI (must exactly match what's registered in Gusto dev portal)
 */

export type GustoEnvironment = 'demo' | 'production'

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

export function getGustoClientCredentials(): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const clientId = process.env.GUSTO_CLIENT_ID
  const clientSecret = process.env.GUSTO_CLIENT_SECRET
  const redirectUri = process.env.GUSTO_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Gusto OAuth configuration. Set GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET, and GUSTO_OAUTH_REDIRECT_URI.'
    )
  }

  return { clientId, clientSecret, redirectUri }
}
