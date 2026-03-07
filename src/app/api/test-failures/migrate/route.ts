import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/test-failures/migrate — Create test_failures table
 * Auth via MIGRATION_SECRET bearer token.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.MIGRATION_SECRET

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    // Check if table exists
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'test_failures'
    `

    if (tables.length > 0) {
      return NextResponse.json({ message: 'test_failures table already exists', status: 'ok' })
    }

    // Create the table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE test_failures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "testName" TEXT NOT NULL,
        "testFile" TEXT NOT NULL,
        url TEXT,
        environment TEXT NOT NULL DEFAULT 'local',
        "errorMessage" TEXT NOT NULL,
        "errorStack" TEXT,
        "consoleErrors" JSONB,
        "networkErrors" JSONB,
        "screenshotPath" TEXT,
        "tracePath" TEXT,
        "commitSha" TEXT,
        "branchName" TEXT,
        summary TEXT,
        "rootCauseHypothesis" TEXT,
        "suggestedFix" TEXT,
        "impactedFiles" JSONB,
        confidence TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        "resolvedAt" TIMESTAMPTZ,
        "resolvedBy" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Create indexes for common queries
    await prisma.$executeRawUnsafe(`CREATE INDEX idx_test_failures_status ON test_failures (status)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX idx_test_failures_created ON test_failures ("createdAt" DESC)`)

    return NextResponse.json({ message: 'test_failures table created successfully', status: 'created' })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
