// Prisma Client Singleton
// Prevents multiple instances in development (hot reload)
// Safe for serverless (Vercel) with Prisma Accelerate connection pooling

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  accelerateUrl: process.env.PRISMA_DATABASE_URL,
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
