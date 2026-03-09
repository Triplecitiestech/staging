import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_THRESHOLDS } from '@/lib/threshold-alerter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/platform-monitor/migrate
 *
 * Creates the api_usage_logs and platform_thresholds tables,
 * and seeds default threshold values.
 * Requires Bearer MIGRATION_SECRET.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.MIGRATION_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    // Create api_usage_logs table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        provider TEXT NOT NULL,
        feature TEXT NOT NULL,
        model TEXT,
        "inputTokens" INTEGER NOT NULL DEFAULT 0,
        "outputTokens" INTEGER NOT NULL DEFAULT 0,
        "totalTokens" INTEGER NOT NULL DEFAULT 0,
        "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "durationMs" INTEGER,
        "statusCode" INTEGER,
        error TEXT,
        metadata JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_api_usage_provider_created ON api_usage_logs (provider, "createdAt")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_api_usage_feature_created ON api_usage_logs (feature, "createdAt")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_logs ("createdAt")`)

    // Create platform_thresholds table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS platform_thresholds (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "metricKey" TEXT UNIQUE NOT NULL,
        "displayName" TEXT NOT NULL,
        "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "limitValue" DOUBLE PRECISION NOT NULL,
        unit TEXT NOT NULL,
        provider TEXT NOT NULL,
        "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastAlertedAt" TIMESTAMP(3),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Seed default thresholds (upsert)
    let seeded = 0
    for (const t of DEFAULT_THRESHOLDS) {
      const result = await prisma.$executeRawUnsafe(
        `INSERT INTO platform_thresholds (id, "metricKey", "displayName", "limitValue", unit, provider, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
         ON CONFLICT ("metricKey") DO UPDATE SET "displayName" = $2, "updatedAt" = NOW()`,
        t.metricKey, t.displayName, t.limitValue, t.unit, t.provider
      )
      if (result) seeded++
    }

    return NextResponse.json({
      success: true,
      message: 'Platform monitoring tables created and seeded',
      tablesCreated: ['api_usage_logs', 'platform_thresholds'],
      thresholdsSeeded: seeded,
    })
  } catch (error) {
    console.error('[platform-monitor/migrate] Error:', error)
    return NextResponse.json({
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
