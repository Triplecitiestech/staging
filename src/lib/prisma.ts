// Prisma Client Singleton
// Prevents multiple instances in development (hot reload)
// Safe for serverless (Vercel) with connection pooling + resilience

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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,  // 10s max to acquire a connection
    idleTimeoutMillis: 20_000,        // Close idle connections after 20s (serverless-friendly)
    max: 5,                           // Lower pool size — each serverless function gets its own
    allowExitOnIdle: true,            // Let the process exit cleanly when idle
    keepAlive: true,                  // TCP keepalive to detect dead connections
    keepAliveInitialDelayMillis: 10_000,
  })

  // Critical: handle pool-level errors so they don't crash the process
  pool.on('error', (err) => {
    console.error('pg Pool background error (connection will be recycled):', err.message)
  })

  return pool
}

// Create Prisma client with adapter
let prismaClient: PrismaClient

// During build time, we need to provide an adapter to avoid the error
if (process.env.DATABASE_URL) {
  // Reuse pool across hot reloads in dev, fresh in production (serverless isolates anyway)
  const pool = globalForPrisma.pgPool ?? createPool()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pgPool = pool
  }

  const adapter = new PrismaPg(pool)

  prismaClient = globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaClient
}

export const prisma = prismaClient
export default prisma
