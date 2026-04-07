/**
 * Prisma Client Singleton
 *
 * Hardened for serverless (Vercel) with:
 * - Connection pooling via pg Pool with keepalive
 * - Global instance caching (prevents pool churn within the same isolate)
 * - Generous connection timeout for cold starts
 * - Background error handling to prevent process crashes
 * - SSL configuration for production managed databases
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: Pool | undefined
}

// ---------------------------------------------------------------------------
// pg Pool — shared, resilient, with keepalive + error recovery
// ---------------------------------------------------------------------------

function createPool(): Pool {
  // Append statement_timeout to connection string to prevent queries from hanging
  // indefinitely on a stale connection. 30s is generous — most queries complete in <1s.
  const connString = process.env.DATABASE_URL || ''
  const separator = connString.includes('?') ? '&' : '?'
  const connWithTimeout = connString.includes('statement_timeout')
    ? connString
    : `${connString}${separator}statement_timeout=30000`

  const pool = new Pool({
    connectionString: connWithTimeout,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // 15s connection timeout — generous for cold starts where the DB may
    // need to wake up (Neon/Supabase serverless databases have cold starts too)
    connectionTimeoutMillis: 15_000,
    // Close idle connections after 20s. Vercel Postgres / Neon can drop idle
    // connections server-side after ~30s, causing "Connection terminated due to
    // connection timeout" when the pool hands out a dead connection. Closing
    // client-side first (20s < 30s) prevents stale connection reuse.
    idleTimeoutMillis: 20_000,
    // Max 5 connections per isolate. Vercel serverless functions share isolates
    // across invocations, so this limits total connections per function instance.
    max: 5,
    // Let the process exit when all connections are idle (serverless-friendly)
    allowExitOnIdle: true,
    // TCP keepalive detects broken connections (e.g., DB failover, network blip)
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

  // Critical: handle pool-level errors so they don't crash the process.
  // The pool will automatically remove the failed connection and create a new one.
  pool.on('error', (err) => {
    console.error('pg Pool background error (connection will be recycled):', err.message)
  })

  return pool
}

// Create Prisma client with adapter
let prismaClient: PrismaClient

// During build time, we need to provide an adapter to avoid the error
if (process.env.DATABASE_URL) {
  // IMPORTANT: Cache pool and client globally. In serverless, the same isolate
  // handles multiple invocations. Without caching, each invocation creates a
  // new pool → connection churn → pool exhaustion under load.
  // In dev, this also prevents hot-reload duplication.
  const pool = globalForPrisma.pgPool ?? createPool()
  globalForPrisma.pgPool = pool

  const adapter = new PrismaPg(pool)

  prismaClient = globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
  globalForPrisma.prisma = prismaClient
} else {
  // Fallback for build time when DATABASE_URL might not be set
  const mockPool = new Pool({
    connectionString: 'postgresql://localhost:5432/dummy'
  })
  const adapter = new PrismaPg(mockPool)

  prismaClient = new PrismaClient({
    adapter,
    log: ['error'],
  })
}

export const prisma = prismaClient
export default prisma
