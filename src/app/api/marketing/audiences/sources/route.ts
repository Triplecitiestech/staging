import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * Fix column types and ensure tables/data exist.
 * Uses raw pg to avoid Prisma TEXT vs enum mismatch.
 * Returns all active sources via raw SQL.
 */
async function initDefaultsRaw(): Promise<{ id: string; name: string; providerType: string; config: unknown; isActive: boolean; createdAt: Date; updatedAt: Date }[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();

  try {
    // 1. Ensure enum type exists
    try {
      await client.query(`CREATE TYPE "AudienceProviderType" AS ENUM ('AUTOTASK', 'HUBSPOT', 'CSV_IMPORT', 'MANUAL')`);
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== '42710') {
        console.warn('[Audience Init] Enum creation warning:', (e as Error).message);
      }
    }

    // 2. Create audience_sources table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS "audience_sources" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "providerType" TEXT NOT NULL DEFAULT 'AUTOTASK',
        "config" JSONB DEFAULT '{}',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audience_sources_pkey" PRIMARY KEY ("id")
      )
    `);

    // 3. Create audiences table if missing
    await client.query(`
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

    // 4. Fix providerType columns: TEXT → enum (if needed)
    for (const table of ['audience_sources', 'audiences']) {
      try {
        const colCheck = await client.query(`
          SELECT data_type, udt_name FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'providerType'
        `, [table]);

        if (colCheck.rows.length > 0) {
          const { data_type, udt_name } = colCheck.rows[0];
          // Only alter if it's still TEXT (not already the enum)
          if (data_type === 'text' || (data_type === 'USER-DEFINED' && udt_name !== 'AudienceProviderType')) {
            await client.query(`
              ALTER TABLE "${table}"
              ALTER COLUMN "providerType" TYPE "AudienceProviderType"
              USING "providerType"::"AudienceProviderType"
            `);
            console.log(`[Audience Init] Converted ${table}."providerType" from ${data_type} to enum`);
          }
        }
      } catch (e) {
        console.error(`[Audience Init] Failed to alter ${table}."providerType":`, (e as Error).message);
        // If ALTER fails, try a more aggressive approach: add new column, copy, drop old, rename
        try {
          const hasCol = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_name = $1 AND column_name = 'providerType'
          `, [table]);
          if (hasCol.rows.length > 0) {
            await client.query(`
              ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "providerType_new" "AudienceProviderType";
              UPDATE "${table}" SET "providerType_new" = "providerType"::text::"AudienceProviderType" WHERE "providerType_new" IS NULL;
              ALTER TABLE "${table}" DROP COLUMN "providerType";
              ALTER TABLE "${table}" RENAME COLUMN "providerType_new" TO "providerType";
              ALTER TABLE "${table}" ALTER COLUMN "providerType" SET NOT NULL;
              ALTER TABLE "${table}" ALTER COLUMN "providerType" SET DEFAULT 'AUTOTASK'::"AudienceProviderType";
            `);
            console.log(`[Audience Init] Force-converted ${table}."providerType" via column swap`);
          }
        } catch (e2) {
          console.error(`[Audience Init] Column swap also failed for ${table}:`, (e2 as Error).message);
        }
      }
    }

    // 5. Ensure campaign-related enums and tables exist
    //    (the original migration may have failed partway if audience_sources already existed)
    for (const enumDef of [
      { name: 'ContentVisibility', values: "'PUBLIC', 'CUSTOMER', 'INTERNAL'" },
      { name: 'DeliveryMode', values: "'BLOG_AND_EMAIL', 'EMAIL_ONLY', 'BLOG_ONLY'" },
      { name: 'CommunicationContentType', values: "'CYBERSECURITY_ALERT', 'SERVICE_UPDATE', 'MAINTENANCE_NOTICE', 'VENDOR_NOTICE', 'BEST_PRACTICE', 'COMPANY_ANNOUNCEMENT', 'GENERAL_COMMUNICATION'" },
      { name: 'CampaignStatus', values: "'DRAFT', 'GENERATING', 'CONTENT_READY', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'" },
      { name: 'EmailDeliveryStatus', values: "'PENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'BOUNCED'" },
    ]) {
      try {
        await client.query(`CREATE TYPE "${enumDef.name}" AS ENUM (${enumDef.values})`);
      } catch (e: unknown) {
        if ((e as { code?: string }).code !== '42710') {
          console.warn(`[Marketing Init] Enum ${enumDef.name} creation warning:`, (e as Error).message);
        }
      }
    }

    // Campaign tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS "communication_campaigns" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "contentType" "CommunicationContentType" NOT NULL,
        "topic" TEXT NOT NULL,
        "audienceId" TEXT NOT NULL,
        "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
        "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
        "generatedTitle" TEXT,
        "generatedExcerpt" TEXT,
        "generatedContent" TEXT,
        "generatedMetaTitle" TEXT,
        "generatedMetaDescription" TEXT,
        "generatedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "aiModel" TEXT,
        "aiPrompt" TEXT,
        "emailSubject" TEXT,
        "emailPreviewText" TEXT,
        "emailBodyHtml" TEXT,
        "blogPostId" TEXT,
        "publishedAt" TIMESTAMP(3),
        "emailSentAt" TIMESTAMP(3),
        "emailTotalCount" INTEGER NOT NULL DEFAULT 0,
        "emailSuccessCount" INTEGER NOT NULL DEFAULT 0,
        "emailFailureCount" INTEGER NOT NULL DEFAULT 0,
        "approvedAt" TIMESTAMP(3),
        "approvedBy" TEXT,
        "rejectionReason" TEXT,
        "createdBy" TEXT NOT NULL,
        "lastModifiedBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "communication_campaigns_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "communication_campaigns_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audiences"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "campaign_recipients" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
        "campaignId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "companyName" TEXT,
        "companyId" TEXT,
        "emailStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
        "sentAt" TIMESTAMP(3),
        "deliveredAt" TIMESTAMP(3),
        "openedAt" TIMESTAMP(3),
        "failureReason" TEXT,
        "sourceContactId" TEXT,
        "sourceType" "AudienceProviderType",
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "communication_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "campaign_audit_logs" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
        "campaignId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "staffEmail" TEXT NOT NULL,
        "staffName" TEXT,
        "details" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "campaign_audit_logs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "campaign_audit_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "communication_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // Create indexes (IF NOT EXISTS isn't available for indexes, so use try/catch)
    const indexes = [
      'CREATE INDEX "communication_campaigns_status_idx" ON "communication_campaigns"("status")',
      'CREATE INDEX "communication_campaigns_createdAt_idx" ON "communication_campaigns"("createdAt")',
      'CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId")',
      'CREATE INDEX "campaign_recipients_email_idx" ON "campaign_recipients"("email")',
      'CREATE INDEX "campaign_audit_logs_campaignId_idx" ON "campaign_audit_logs"("campaignId")',
    ];
    for (const idx of indexes) {
      try { await client.query(idx); } catch { /* index already exists */ }
    }

    // Fix TEXT columns on campaign tables too
    const campaignEnumFixes: Array<{ table: string; column: string; enumName: string }> = [
      { table: 'communication_campaigns', column: 'contentType', enumName: 'CommunicationContentType' },
      { table: 'communication_campaigns', column: 'status', enumName: 'CampaignStatus' },
      { table: 'communication_campaigns', column: 'visibility', enumName: 'ContentVisibility' },
      { table: 'communication_campaigns', column: 'deliveryMode', enumName: 'DeliveryMode' },
      { table: 'campaign_recipients', column: 'emailStatus', enumName: 'EmailDeliveryStatus' },
      { table: 'campaign_recipients', column: 'sourceType', enumName: 'AudienceProviderType' },
    ];
    for (const fix of campaignEnumFixes) {
      try {
        const colCheck = await client.query(`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2
        `, [fix.table, fix.column]);
        if (colCheck.rows.length > 0 && colCheck.rows[0].data_type === 'text') {
          await client.query(`
            ALTER TABLE "${fix.table}"
            ALTER COLUMN "${fix.column}" TYPE "${fix.enumName}"
            USING "${fix.column}"::"${fix.enumName}"
          `);
          console.log(`[Marketing Init] Converted ${fix.table}."${fix.column}" to ${fix.enumName}`);
        }
      } catch (e) {
        console.warn(`[Marketing Init] Column fix warning ${fix.table}.${fix.column}:`, (e as Error).message);
      }
    }

    // Add new columns to existing tables (if missing)
    for (const alter of [
      `ALTER TABLE "communication_campaigns" ADD COLUMN IF NOT EXISTS "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC'`,
      `ALTER TABLE "communication_campaigns" ADD COLUMN IF NOT EXISTS "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'BLOG_AND_EMAIL'`,
      `ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC'`,
      `ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "accessToken" TEXT`,
    ]) {
      try { await client.query(alter); } catch { /* column already exists or table missing */ }
    }
    // Unique index on accessToken
    try { await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_accessToken_key" ON "blog_posts"("accessToken") WHERE "accessToken" IS NOT NULL`); } catch { /* already exists */ }

    // 7. Ensure default MANUAL source exists alongside Autotask
    const existingManual = await client.query(
      `SELECT "id" FROM "audience_sources" WHERE "providerType"::text = 'MANUAL' AND "isActive" = true LIMIT 1`
    );
    if (existingManual.rows.length === 0) {
      await client.query(`
        INSERT INTO "audience_sources" ("id", "name", "providerType", "config", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), 'Manual List', 'MANUAL'::"AudienceProviderType", '{}', true, NOW(), NOW())
      `);
      console.log('[Marketing Init] Created default Manual source');
    }

    // 8. Ensure default Autotask source exists (raw SQL to avoid TEXT/enum comparison)
    const existing = await client.query(
      `SELECT "id" FROM "audience_sources" WHERE "providerType"::text = 'AUTOTASK' AND "isActive" = true LIMIT 1`
    );

    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO "audience_sources" ("id", "name", "providerType", "config", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), 'Autotask PSA', 'AUTOTASK'::"AudienceProviderType", '{}', true, NOW(), NOW())
      `);
      console.log('[Marketing Init] Created default Autotask source');
    }

    // 9. Return all active sources
    const result = await client.query(
      `SELECT "id", "name", "providerType"::text as "providerType", "config", "isActive", "createdAt", "updatedAt"
       FROM "audience_sources" WHERE "isActive" = true ORDER BY "name" ASC`
    );

    return result.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * GET /api/marketing/audiences/sources — List audience sources
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
 * POST — Initialize default sources and fix schema issues.
 * Uses raw SQL entirely to avoid Prisma TEXT/enum comparison issues.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'init-defaults') {
      const sources = await initDefaultsRaw();
      return NextResponse.json({ sources, initialized: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to manage audience sources:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to initialize audience source: ${message}` },
      { status: 500 }
    );
  }
}
