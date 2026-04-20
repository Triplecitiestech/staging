/**
 * Auto-creates sales agent portal tables if they don't exist.
 * Called before any Prisma query against these tables so that the
 * feature keeps working even if `prisma migrate deploy` did not apply
 * the migration during deploy (matches the `ensureReportingTables`
 * pattern used by the reporting subsystem).
 */

import { prisma } from '@/lib/prisma'

const REQUIRED_TABLES = [
  'agent_agreements',
  'sales_agents',
  'sales_referral_status_history',
  'sales_referrals',
]

// Cache: once verified in this isolate, skip re-checking
let tablesVerified = false

export async function ensureSalesAgentTables(): Promise<void> {
  if (tablesVerified) return

  try {
    const existing = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('agent_agreements', 'sales_agents', 'sales_referral_status_history', 'sales_referrals')
    `
    const existingNames = existing.map((r) => r.tablename)
    const missing = REQUIRED_TABLES.filter((t) => !existingNames.includes(t))

    if (missing.length === 0) {
      tablesVerified = true
      return
    }

    // Create enum first (tables reference it)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ReferralStatus" AS ENUM (
          'SUBMITTED',
          'CONTACTED',
          'PROPOSAL_SENT',
          'SIGNED',
          'MONTH_1_PAID',
          'MONTH_2_PAID',
          'COMMISSION_DUE',
          'COMMISSION_PAID',
          'LOST',
          'NOT_A_FIT'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sales_agents" (
        "id"                       TEXT NOT NULL DEFAULT gen_random_uuid(),
        "email"                    TEXT NOT NULL,
        "passwordHash"             TEXT,
        "firstName"                TEXT NOT NULL,
        "lastName"                 TEXT NOT NULL,
        "phone"                    TEXT,
        "isActive"                 BOOLEAN NOT NULL DEFAULT true,
        "passwordSetToken"         TEXT,
        "passwordSetTokenExpires"  TIMESTAMP(3),
        "lastLoginAt"              TIMESTAMP(3),
        "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdByAdminEmail"      TEXT,
        CONSTRAINT "sales_agents_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sales_agents_email_key" ON "sales_agents"("email")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sales_agents_passwordSetToken_key" ON "sales_agents"("passwordSetToken")`
    )

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "agent_agreements" (
        "id"                   TEXT NOT NULL DEFAULT gen_random_uuid(),
        "agentId"              TEXT NOT NULL,
        "fileData"             BYTEA NOT NULL,
        "originalFilename"     TEXT NOT NULL,
        "mimeType"             TEXT NOT NULL,
        "fileSize"             INTEGER NOT NULL,
        "uploadedByAdminEmail" TEXT NOT NULL,
        "uploadedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "agent_agreements_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "agent_agreements_agentId_key" ON "agent_agreements"("agentId")`
    )
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "agent_agreements"
          ADD CONSTRAINT "agent_agreements_agentId_fkey"
          FOREIGN KEY ("agentId") REFERENCES "sales_agents"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sales_referrals" (
        "id"                      TEXT NOT NULL DEFAULT gen_random_uuid(),
        "agentId"                 TEXT NOT NULL,
        "businessName"            TEXT NOT NULL,
        "contactName"             TEXT NOT NULL,
        "contactEmail"            TEXT NOT NULL,
        "contactPhone"            TEXT,
        "addressLine1"            TEXT,
        "city"                    TEXT,
        "state"                   TEXT,
        "zip"                     TEXT,
        "employeeCountRange"      TEXT,
        "industry"                TEXT,
        "notes"                   TEXT,
        "initialConversationDate" TIMESTAMP(3),
        "status"                  "ReferralStatus" NOT NULL DEFAULT 'SUBMITTED',
        "contractMonthlyValue"    DECIMAL(10, 2),
        "commissionDueDate"       TIMESTAMP(3),
        "commissionPaidDate"      TIMESTAMP(3),
        "internalAdminNotes"      TEXT,
        "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sales_referrals_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sales_referrals_agentId_idx" ON "sales_referrals"("agentId")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sales_referrals_status_idx" ON "sales_referrals"("status")`
    )
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "sales_referrals"
          ADD CONSTRAINT "sales_referrals_agentId_fkey"
          FOREIGN KEY ("agentId") REFERENCES "sales_agents"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sales_referral_status_history" (
        "id"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
        "referralId"          TEXT NOT NULL,
        "oldStatus"           "ReferralStatus",
        "newStatus"           "ReferralStatus" NOT NULL,
        "changedByType"       TEXT NOT NULL,
        "changedByIdentifier" TEXT NOT NULL,
        "note"                TEXT,
        "changedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sales_referral_status_history_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sales_referral_status_history_referralId_idx" ON "sales_referral_status_history"("referralId")`
    )
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "sales_referral_status_history"
          ADD CONSTRAINT "sales_referral_status_history_referralId_fkey"
          FOREIGN KEY ("referralId") REFERENCES "sales_referrals"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)

    tablesVerified = true
    console.log('[sales-agents] ensureSalesAgentTables: created missing tables', missing)
  } catch (err) {
    console.error('[sales-agents] ensureSalesAgentTables failed:', err instanceof Error ? err.message : err)
    // Don't rethrow — let the caller's own Prisma query throw a clear error if still broken
  }
}
