/**
 * Gusto connection persistence layer.
 *
 * We keep a single active connection in `gusto_connections`. This module
 * handles loading, refreshing, and saving tokens. Refresh tokens are
 * single-use, so we persist atomically after every refresh.
 */

import { prisma } from '@/lib/prisma'
import { refreshAccessToken, type GustoTokenResponse } from './oauth'
import { getGustoEnvironment, type GustoEnvironment } from './config'

export interface ActiveConnection {
  id: string
  environment: GustoEnvironment
  companyUuid: string | null
  companyName: string | null
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
  scope: string | null
}

/** Fetch the active (isActive=true) Gusto connection */
export async function getActiveConnection(): Promise<ActiveConnection | null> {
  const row = await prisma.gustoConnection.findFirst({
    where: { isActive: true },
    orderBy: { connectedAt: 'desc' },
  })
  if (!row) return null
  return {
    id: row.id,
    environment: (row.environment as GustoEnvironment) || 'demo',
    companyUuid: row.companyUuid,
    companyName: row.companyName,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    tokenExpiresAt: row.tokenExpiresAt,
    scope: row.scope,
  }
}

/** Save a new connection (deactivating any prior active ones) */
export async function saveNewConnection(params: {
  env: GustoEnvironment
  tokens: GustoTokenResponse
  connectedByEmail: string
}): Promise<ActiveConnection> {
  const { env, tokens, connectedByEmail } = params
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000)

  return await prisma.$transaction(async (tx) => {
    await tx.gustoConnection.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })
    const row = await tx.gustoConnection.create({
      data: {
        environment: env,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        scope: tokens.scope ?? null,
        connectedByEmail,
        isActive: true,
      },
    })
    return {
      id: row.id,
      environment: env,
      companyUuid: row.companyUuid,
      companyName: row.companyName,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenExpiresAt: row.tokenExpiresAt,
      scope: row.scope,
    }
  })
}

/** Persist rotated tokens atomically after a refresh */
async function persistRefresh(id: string, tokens: GustoTokenResponse): Promise<ActiveConnection> {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000)
  const row = await prisma.gustoConnection.update({
    where: { id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      scope: tokens.scope ?? undefined,
      lastRefreshedAt: new Date(),
    },
  })
  return {
    id: row.id,
    environment: (row.environment as GustoEnvironment) || 'demo',
    companyUuid: row.companyUuid,
    companyName: row.companyName,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    tokenExpiresAt: row.tokenExpiresAt,
    scope: row.scope,
  }
}

/** Return a valid (non-expired) access token, refreshing if needed */
export async function getValidAccessToken(): Promise<ActiveConnection> {
  const conn = await getActiveConnection()
  if (!conn) throw new Error('Gusto is not connected. Visit /admin/settings/integrations/gusto to connect.')

  // If token expires within 60s, refresh proactively
  if (conn.tokenExpiresAt.getTime() - Date.now() > 60_000) {
    return conn
  }
  return refreshConnection(conn)
}

export async function refreshConnection(conn: ActiveConnection): Promise<ActiveConnection> {
  const tokens = await refreshAccessToken(conn.refreshToken, conn.environment)
  return persistRefresh(conn.id, tokens)
}

export async function updateCompanyInfo(id: string, companyUuid: string, companyName: string): Promise<void> {
  await prisma.gustoConnection.update({
    where: { id },
    data: { companyUuid, companyName },
  })
}

export async function recordSyncResult(id: string, ok: boolean, error?: string): Promise<void> {
  await prisma.gustoConnection.update({
    where: { id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: ok ? 'ok' : 'error',
      lastSyncError: ok ? null : error ?? 'Unknown error',
    },
  })
}

export async function deactivateConnection(id: string): Promise<void> {
  await prisma.gustoConnection.update({
    where: { id },
    data: { isActive: false },
  })
}

export function isConnectedEnv(): GustoEnvironment {
  return getGustoEnvironment()
}
