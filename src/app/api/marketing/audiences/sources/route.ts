import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marketing/audiences/sources — List audience sources
 * POST /api/marketing/audiences/sources — Initialize default sources
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const sources = await prisma.audienceSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Failed to fetch audience sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audience sources' },
      { status: 500 }
    );
  }
}

/**
 * POST — Ensure default Autotask source exists (idempotent setup)
 */
export async function POST(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();
    const { action } = body;

    if (action === 'init-defaults') {
      // Ensure audience_sources table exists (may not be migrated yet)
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "audience_sources" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "name" TEXT NOT NULL,
            "providerType" TEXT NOT NULL DEFAULT 'AUTOTASK',
            "config" JSONB NOT NULL DEFAULT '{}',
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "audience_sources_pkey" PRIMARY KEY ("id")
          )
        `);
      } catch {
        // Table may already exist or raw SQL not supported — proceed anyway
      }

      // Also ensure audiences table exists
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "audiences" (
            "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
            "name" TEXT NOT NULL,
            "description" TEXT,
            "sourceId" TEXT NOT NULL,
            "providerType" TEXT NOT NULL DEFAULT 'AUTOTASK',
            "filterCriteria" JSONB NOT NULL DEFAULT '{}',
            "recipientCount" INTEGER NOT NULL DEFAULT 0,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdBy" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "audiences_pkey" PRIMARY KEY ("id"),
            CONSTRAINT "audiences_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "audience_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE
          )
        `);
      } catch {
        // Table may already exist — proceed anyway
      }

      // Create default Autotask source if it doesn't exist
      const existing = await prisma.audienceSource.findFirst({
        where: { providerType: 'AUTOTASK' },
      });

      if (!existing) {
        await prisma.audienceSource.create({
          data: {
            name: 'Autotask PSA',
            providerType: 'AUTOTASK',
            config: {},
            isActive: true,
          },
        });
      }

      const sources = await prisma.audienceSource.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({ sources, initialized: !existing });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to manage audience sources:', error);
    return NextResponse.json(
      { error: 'Failed to manage audience sources' },
      { status: 500 }
    );
  }
}
