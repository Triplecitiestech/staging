-- Sales Agent Portal: independent referral partners
-- Separate authentication (email + password) from staff M365 SSO.
-- Additive only — no existing tables are modified.

-- CreateEnum (idempotent)
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
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: sales_agents
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
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  "createdByAdminEmail"      TEXT,
  CONSTRAINT "sales_agents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_agents_email_key" ON "sales_agents"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_agents_passwordSetToken_key" ON "sales_agents"("passwordSetToken");

-- CreateTable: agent_agreements
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_agreements_agentId_key" ON "agent_agreements"("agentId");

DO $$ BEGIN
  ALTER TABLE "agent_agreements"
    ADD CONSTRAINT "agent_agreements_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "sales_agents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: sales_referrals
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
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_referrals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sales_referrals_agentId_idx" ON "sales_referrals"("agentId");
CREATE INDEX IF NOT EXISTS "sales_referrals_status_idx" ON "sales_referrals"("status");

DO $$ BEGIN
  ALTER TABLE "sales_referrals"
    ADD CONSTRAINT "sales_referrals_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "sales_agents"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: sales_referral_status_history
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
);
CREATE INDEX IF NOT EXISTS "sales_referral_status_history_referralId_idx" ON "sales_referral_status_history"("referralId");

DO $$ BEGIN
  ALTER TABLE "sales_referral_status_history"
    ADD CONSTRAINT "sales_referral_status_history_referralId_fkey"
    FOREIGN KEY ("referralId") REFERENCES "sales_referrals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
