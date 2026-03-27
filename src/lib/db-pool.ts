/**
 * Shared raw pg Pool for routes that need direct SQL access.
 *
 * Routes under /api/hr/, /api/portal/auth/, /api/forms/, and /lib/graph.ts
 * use raw pg instead of Prisma. This module provides a shared, resilient
 * pool so they don't each create separate connections.
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
 */
export function getPool(): Pool {
  if (globalForPool.rawPool) return globalForPool.rawPool

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
    max: 3,                           // Low limit — most routes only need 1 connection
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

  pool.on('error', (err) => {
    console.error('Raw pg Pool background error (connection will be recycled):', err.message)
  })

  // Only cache in dev (serverless functions are isolated in prod anyway)
  if (process.env.NODE_ENV !== 'production') {
    globalForPool.rawPool = pool
  }

  return pool
}
