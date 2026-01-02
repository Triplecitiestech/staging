// Prisma Client Singleton
// Prevents multiple instances in development (hot reload)
// Safe for serverless (Vercel) with connection pooling

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with adapter
let prismaClient: PrismaClient

// During build time, we need to provide an adapter to avoid the error
if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)

  prismaClient = globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
} else {
  // Fallback for build time when DATABASE_URL might not be set
  // Create a mock pool that won't actually connect
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
