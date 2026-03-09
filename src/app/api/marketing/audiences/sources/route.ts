import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * Run migration SQL directly via pg Pool (bypasses PrismaPg adapter
 * limitations with PL/pgSQL DO blocks and enum types).
 * Only called as a fallback if tables don't exist yet.
 */
async function ensureTablesExist() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    // Step 1: Create enum type if it doesn't exist
    try {
      await client.query(`CREATE TYPE "AudienceProviderType" AS ENUM ('AUTOTASK', 'HUBSPOT', 'CSV_IMPORT', 'MANUAL')`);
    } catch (e: unknown) {
      // 42710 = duplicate_object (enum already exists) — safe to ignore
      if ((e as { code?: string }).code !== '42710') {
        console.warn('[Audience Init] Enum creation warning:', (e as Error).message);
      }
    }

    // Step 2: If audience_sources table exists with TEXT providerType, alter to enum
    try {
      const colCheck = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'audience_sources' AND column_name = 'providerType'
      `);
      if (colCheck.rows.length > 0 && colCheck.rows[0].data_type === 'text') {
        await client.query(`ALTER TABLE "audience_sources" ALTER COLUMN "providerType" TYPE "AudienceProviderType" USING "providerType"::"AudienceProviderType"`);
      }
    } catch (e) {
      console.warn('[Audience Init] Column alter warning:', (e as Error).message);
    }

    // Step 3: Create audience_sources table if it doesn't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "audience_sources" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
          "name" TEXT NOT NULL,
          "providerType" "AudienceProviderType" NOT NULL DEFAULT 'AUTOTASK'::"AudienceProviderType",
          "config" JSONB DEFAULT '{}',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "audience_sources_pkey" PRIMARY KEY ("id")
        )
      `);
    } catch (e) {
      console.warn('[Audience Init] audience_sources table warning:', (e as Error).message);
    }

    // Step 4: Same for audiences table
    try {
      const colCheck = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'audiences' AND column_name = 'providerType'
      `);
      if (colCheck.rows.length > 0 && colCheck.rows[0].data_type === 'text') {
        await client.query(`ALTER TABLE "audiences" ALTER COLUMN "providerType" TYPE "AudienceProviderType" USING "providerType"::"AudienceProviderType"`);
      }
    } catch (e) {
      console.warn('[Audience Init] audiences column alter warning:', (e as Error).message);
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "audiences" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
          "name" TEXT NOT NULL,
          "description" TEXT,
          "sourceId" TEXT NOT NULL,
          "providerType" "AudienceProviderType" NOT NULL DEFAULT 'AUTOTASK'::"AudienceProviderType",
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
    } catch (e) {
      console.warn('[Audience Init] audiences table warning:', (e as Error).message);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch audience sources: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST — Ensure default Autotask source exists (idempotent setup)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'init-defaults') {
      const { prisma } = await import('@/lib/prisma');

      // Try Prisma first — if migration already ran, tables exist
      let needsRawInit = false;
      try {
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
      } catch (prismaError) {
        // Table likely doesn't exist — fall back to raw SQL init
        console.warn('[Audience Init] Prisma query failed, running raw table init:',
          prismaError instanceof Error ? prismaError.message : prismaError);
        needsRawInit = true;
      }

      // Only run raw SQL table creation if Prisma couldn't find the tables
      if (needsRawInit) {
        await ensureTablesExist();

        // Retry creating the default source via Prisma
        try {
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
        } catch (retryError) {
          console.error('[Audience Init] Failed even after raw init:', retryError);
          const message = retryError instanceof Error ? retryError.message : 'Unknown error';
          return NextResponse.json(
            { error: `Failed to initialize audience source: ${message}` },
            { status: 500 }
          );
        }
      }

      const sources = await prisma.audienceSource.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({ sources, initialized: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to manage audience sources:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to manage audience sources: ${message}` },
      { status: 500 }
    );
  }
}
