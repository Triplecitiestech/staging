import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sales-agents/migrate — idempotently creates sales agent portal tables.
 * GET — returns presence/missing report.
 *
 * Auth: Bearer MIGRATION_SECRET or ?secret=
 */
function authorize(request: Request): boolean {
  const auth = request.headers.get('authorization')
  const url = new URL(request.url)
  const q = url.searchParams.get('secret')
  const expected = process.env.MIGRATION_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}` || q === expected
}

const EXPECTED_TABLES = [
  'agent_agreements',
  'sales_agents',
  'sales_referral_status_history',
  'sales_referrals',
]

export async function POST(request: Request) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const applied: string[] = []
  try {
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
    applied.push('enum: ReferralStatus')

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
    applied.push('table: sales_agents')

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "agent_agreements" (
        "id"                   TEXT NOT NULL DEFAULT gen_random_uuid(),
        "agentId"              TEXT NOT NULL,
        "contentText"          TEXT,
        "fileData"             BYTEA,
        "originalFilename"     TEXT,
        "mimeType"             TEXT,
        "fileSize"             INTEGER,
        "signedName"           TEXT,
        "signedAt"             TIMESTAMP(3),
        "signedIp"             TEXT,
        "signedUserAgent"      TEXT,
        "uploadedByAdminEmail" TEXT NOT NULL,
        "uploadedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "agent_agreements_pkey" PRIMARY KEY ("id")
      )
    `)
    // Idempotent column + nullability patches for pre-existing deployments
    for (const sql of [
      `ALTER TABLE "agent_agreements" ALTER COLUMN "fileData" DROP NOT NULL`,
      `ALTER TABLE "agent_agreements" ALTER COLUMN "originalFilename" DROP NOT NULL`,
      `ALTER TABLE "agent_agreements" ALTER COLUMN "mimeType" DROP NOT NULL`,
      `ALTER TABLE "agent_agreements" ALTER COLUMN "fileSize" DROP NOT NULL`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "contentText" TEXT`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedName" TEXT`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3)`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedIp" TEXT`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedUserAgent" TEXT`,
      `ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    ]) {
      try { await prisma.$executeRawUnsafe(sql) } catch { /* idempotent — ignore */ }
    }
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
    applied.push('table: agent_agreements')

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
    applied.push('table: sales_referrals')

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
    applied.push('table: sales_referral_status_history')

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${EXPECTED_TABLES})
      ORDER BY table_name
    `
    const present = tables.map((t) => t.table_name)
    return NextResponse.json({
      ok: true,
      applied,
      tablesPresent: present,
      missing: EXPECTED_TABLES.filter((n) => !present.includes(n)),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, applied, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${EXPECTED_TABLES})
      ORDER BY table_name
    `
    const present = tables.map((t) => t.table_name)

    // Also report whether the ReferralStatus enum exists
    const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname FROM pg_type WHERE typname = 'ReferralStatus'
    `

    return NextResponse.json({
      present,
      missing: EXPECTED_TABLES.filter((n) => !present.includes(n)),
      ready: EXPECTED_TABLES.every((n) => present.includes(n)),
      referralStatusEnum: enums.length > 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
