/**
 * Shared raw pg Pool for routes that need direct SQL access.
 *
 * Routes under /api/hr/, /api/portal/auth/, /api/forms/, and /lib/graph.ts
 * use raw pg instead of Prisma. This module provides a shared, resilient
 * pool so they don't each create separate connections.
 *
 * Hardened for serverless with:
 * - Global caching (reuses pool across invocations in the same isolate)
 * - Generous connection timeout for cold starts
 * - Background error handling
 * - SSL for production
 *
 * Usage:
 *   import { getPool } from '@/lib/db-pool'
 *   const pool = getPool()
 *   const { rows } = await pool.query('SELECT ...')
 */

import { Pool } from 'pg'

const globalForPool = globalThis as unknown as {
  rawPool: Pool | undefined
}

/**
 * Get (or create) the shared raw pg Pool.
 * Safe to call multiple times — returns the same instance.
 * Cached globally in ALL environments (dev and prod) to prevent
 * connection pool churn in serverless isolates.
 */
export function getPool(): Pool {
  if (globalForPool.rawPool) return globalForPool.rawPool

  // Append statement_timeout to prevent queries hanging on stale connections
  const connString = process.env.DATABASE_URL || ''
  const separator = connString.includes('?') ? '&' : '?'
  const connWithTimeout = connString.includes('statement_timeout')
    ? connString
    : `${connString}${separator}statement_timeout=30000`

  const pool = new Pool({
    connectionString: connWithTimeout,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15_000,  // 15s — generous for cold starts
    idleTimeoutMillis: 20_000,        // 20s — close before DB drops (Neon ~30s)
    max: 5,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

  pool.on('error', (err) => {
    console.error('Raw pg Pool background error (connection will be recycled):', err.message)
  })

  // Cache globally — serverless isolates reuse the same module scope across
  // invocations, so caching prevents creating a new pool per request.
  globalForPool.rawPool = pool

  return pool
}
