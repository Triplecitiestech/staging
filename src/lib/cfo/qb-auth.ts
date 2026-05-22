/**
 * QuickBooks Online OAuth 2.0 — authorization, token exchange, refresh, storage.
 * Ported from the standalone tool's qb-auth.mjs.
 *
 * Token storage moved from a local file to the cfo_settings table, with the
 * access + refresh tokens encrypted at rest (AES-256-GCM via src/lib/crypto.ts).
 * Nothing else in the app touches the stored tokens directly.
 */

import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { getSetting, setSetting } from './store'

// Fallback endpoints, used only if the Intuit discovery document is unreachable.
const FALLBACK_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const FALLBACK_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
// Intuit OpenID discovery documents — the authoritative source for the current
// OAuth2.0 endpoints.
const DISCOVERY_URL = {
  production: 'https://developer.api.intuit.com/.well-known/openid_configuration',
  sandbox: 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration',
}
const SCOPE = 'com.intuit.quickbooks.accounting'
const TOKEN_KEY = 'qb_tokens'
const TOKEN_TIMEOUT_MS = 15_000
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000

interface OidcConfig { authorization_endpoint?: string; token_endpoint?: string }
let endpointCache: { authUrl: string; tokenUrl: string; fetchedAt: number } | null = null

/**
 * Resolve the OAuth endpoints from Intuit's discovery document (cached 24h),
 * falling back to the published constants if discovery is unreachable.
 */
async function getEndpoints(): Promise<{ authUrl: string; tokenUrl: string }> {
  if (endpointCache && Date.now() - endpointCache.fetchedAt < DISCOVERY_TTL_MS) {
    return { authUrl: endpointCache.authUrl, tokenUrl: endpointCache.tokenUrl }
  }
  const url = cfg().env === 'sandbox' ? DISCOVERY_URL.sandbox : DISCOVERY_URL.production
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`discovery ${res.status}`)
    const doc = (await res.json()) as OidcConfig
    const authUrl = doc.authorization_endpoint || FALLBACK_AUTH_URL
    const tokenUrl = doc.token_endpoint || FALLBACK_TOKEN_URL
    endpointCache = { authUrl, tokenUrl, fetchedAt: Date.now() }
    return { authUrl, tokenUrl }
  } catch (err) {
    console.warn('[cfo/qb] discovery document fetch failed, using fallback endpoints:', err instanceof Error ? err.message : String(err))
    return { authUrl: FALLBACK_AUTH_URL, tokenUrl: FALLBACK_TOKEN_URL }
  }
}

interface StoredTokens {
  accessTokenEnc: string
  refreshTokenEnc: string
  realmId: string
  env: string
  expiresAt: number
  connectedAt: string
}

export interface QbTokens {
  accessToken: string
  refreshToken: string
  realmId: string
  env: string
  expiresAt: number
  connectedAt: string
}

function cfg() {
  return {
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    redirectUri: process.env.QB_REDIRECT_URI
      || `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'}/api/admin/cfo/qb/callback`,
    env: process.env.QB_ENV || 'production',
  }
}

export function isConfigured(): boolean {
  const c = cfg()
  return !!(c.clientId && c.clientSecret)
}

async function loadTokens(): Promise<QbTokens | null> {
  const stored = await getSetting<StoredTokens | Record<string, never>>(TOKEN_KEY)
  if (!stored || !('refreshTokenEnc' in stored) || !stored.refreshTokenEnc) return null
  try {
    return {
      accessToken: stored.accessTokenEnc ? decryptSecret(stored.accessTokenEnc) : '',
      refreshToken: decryptSecret(stored.refreshTokenEnc),
      realmId: stored.realmId,
      env: stored.env,
      expiresAt: stored.expiresAt,
      connectedAt: stored.connectedAt,
    }
  } catch (err) {
    console.error('[cfo/qb] failed to decrypt stored tokens:', err instanceof Error ? err.message : String(err))
    return null
  }
}

async function saveTokens(t: QbTokens): Promise<void> {
  const stored: StoredTokens = {
    accessTokenEnc: t.accessToken ? encryptSecret(t.accessToken) : '',
    refreshTokenEnc: encryptSecret(t.refreshToken),
    realmId: t.realmId,
    env: t.env,
    expiresAt: t.expiresAt,
    connectedAt: t.connectedAt,
  }
  await setSetting(TOKEN_KEY, stored)
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null
}

export async function connectionInfo() {
  const t = await loadTokens()
  if (!t) return { connected: false as const }
  return {
    connected: true as const,
    realmId: t.realmId,
    env: t.env,
    connectedAt: t.connectedAt,
    accessTokenValid: Date.now() < t.expiresAt,
  }
}

export async function getAuthUrl(state: string): Promise<string> {
  const c = cfg()
  if (!c.clientId) throw new Error('QB_CLIENT_ID not set')
  const { authUrl } = await getEndpoints()
  const params = new URLSearchParams({
    client_id: c.clientId,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: c.redirectUri,
    state,
  })
  return `${authUrl}?${params.toString()}`
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const c = cfg()
  const { tokenUrl } = await getEndpoints()
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`QB token request failed ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

export async function exchangeCode(code: string, realmId: string): Promise<QbTokens> {
  const c = cfg()
  const data = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: c.redirectUri,
  })
  const tokens: QbTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token!,
    realmId,
    env: c.env,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    connectedAt: new Date().toISOString(),
  }
  await saveTokens(tokens)
  return tokens
}

/** Returns a valid access token, refreshing (and rotating the refresh token) if expired. */
export async function getAccessToken(): Promise<{ accessToken: string; realmId: string; env: string }> {
  let t = await loadTokens()
  if (!t) throw new Error('QuickBooks not connected — visit /api/admin/cfo/qb/connect')
  if (t.accessToken && Date.now() < t.expiresAt) {
    return { accessToken: t.accessToken, realmId: t.realmId, env: t.env }
  }
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken })
  t = {
    ...t,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || t.refreshToken, // Intuit rotates refresh tokens
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  await saveTokens(t)
  return { accessToken: t.accessToken, realmId: t.realmId, env: t.env }
}

export async function disconnect(): Promise<void> {
  await setSetting(TOKEN_KEY, {})
}
