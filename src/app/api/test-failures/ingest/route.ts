import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/test-failures/ingest — Ingest test failure from Playwright reporter
 * Auth via MIGRATION_SECRET header (not session-based, since reporter runs in CI).
 * Uses raw SQL to avoid Prisma client generation dependency on the TestFailure model.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.MIGRATION_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const data = await request.json()

    // Deduplicate: find existing open failure with same test+error
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM test_failures
       WHERE "testName" = $1 AND "testFile" = $2
         AND LEFT("errorMessage", 200) = LEFT($3, 200)
         AND status IN ('open', 'investigating')
       ORDER BY "createdAt" DESC LIMIT 1`,
      data.testName,
      data.testFile,
      data.errorMessage || ''
    )

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE test_failures SET
          "consoleErrors" = COALESCE($2, "consoleErrors"),
          "networkErrors" = COALESCE($3, "networkErrors"),
          "screenshotPath" = COALESCE($4, "screenshotPath"),
          "tracePath" = COALESCE($5, "tracePath"),
          "commitSha" = $6,
          "branchName" = $7,
          environment = COALESCE($8, environment),
          summary = COALESCE($9, summary),
          "rootCauseHypothesis" = COALESCE($10, "rootCauseHypothesis"),
          "suggestedFix" = COALESCE($11, "suggestedFix"),
          "impactedFiles" = COALESCE($12, "impactedFiles"),
          confidence = COALESCE($13, confidence),
          "updatedAt" = now()
        WHERE id = $1::uuid`,
        existing[0].id,
        data.consoleErrors ? JSON.stringify(data.consoleErrors) : null,
        data.networkErrors ? JSON.stringify(data.networkErrors) : null,
        data.screenshotPath || null,
        data.tracePath || null,
        data.commitSha || null,
        data.branchName || null,
        data.environment || null,
        data.summary || null,
        data.rootCauseHypothesis || null,
        data.suggestedFix || null,
        data.impactedFiles ? JSON.stringify(data.impactedFiles) : null,
        data.confidence || null
      )
      return NextResponse.json({ id: existing[0].id, deduplicated: true })
    }

    // Create new failure
    const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO test_failures (
        "testName", "testFile", url, environment, "errorMessage", "errorStack",
        "consoleErrors", "networkErrors", "screenshotPath", "tracePath",
        "commitSha", "branchName", summary, "rootCauseHypothesis", "suggestedFix",
        "impactedFiles", confidence, status, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        'open', now(), now()
      ) RETURNING id`,
      data.testName,
      data.testFile,
      data.url || null,
      data.environment || 'local',
      data.errorMessage,
      data.errorStack || null,
      data.consoleErrors ? JSON.stringify(data.consoleErrors) : null,
      data.networkErrors ? JSON.stringify(data.networkErrors) : null,
      data.screenshotPath || null,
      data.tracePath || null,
      data.commitSha || null,
      data.branchName || null,
      data.summary || null,
      data.rootCauseHypothesis || null,
      data.suggestedFix || null,
      data.impactedFiles ? JSON.stringify(data.impactedFiles) : null,
      data.confidence || null
    )

    return NextResponse.json({ id: inserted[0].id, deduplicated: false })
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      return NextResponse.json({ error: 'test_failures table not migrated yet' }, { status: 503 })
    }
    console.error('Error ingesting test failure:', error)
    return NextResponse.json({ error: 'Failed to ingest failure' }, { status: 500 })
  }
}
