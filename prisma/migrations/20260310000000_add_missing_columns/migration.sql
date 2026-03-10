-- Add missing columns/enums that are in the Prisma schema but not in any migration.
-- Uses IF NOT EXISTS / exception handling so this is safe to re-run.

-- =============================================
-- 1. COMPANIES TABLE
-- =============================================
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "companyClassification" TEXT;

-- =============================================
-- 2. COMPANY_CONTACTS — Customer portal columns
-- =============================================

-- Create CustomerRole enum type (if not exists)
DO $$ BEGIN
  CREATE TYPE "CustomerRole" AS ENUM ('CLIENT_MANAGER', 'CLIENT_USER', 'CLIENT_VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create InviteStatus enum type (if not exists)
DO $$ BEGIN
  CREATE TYPE "InviteStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACCEPTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- customerRole: add with enum type; skip if column already exists (may be TEXT from runtime)
DO $$ BEGIN
  ALTER TABLE "company_contacts" ADD COLUMN "customerRole" "CustomerRole" NOT NULL DEFAULT 'CLIENT_USER';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- inviteStatus: add with enum type; skip if column already exists
DO $$ BEGIN
  ALTER TABLE "company_contacts" ADD COLUMN "inviteStatus" "InviteStatus" NOT NULL DEFAULT 'NOT_INVITED';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Nullable timestamp columns
ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" TIMESTAMP(3);
ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "lastPortalLogin" TIMESTAMP(3);

-- =============================================
-- 3. BLOG_POSTS — visibility & access token
-- =============================================

-- Create ContentVisibility enum type (if not exists)
DO $$ BEGIN
  CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'CUSTOMER', 'INTERNAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create DeliveryMode enum type (if not exists)
DO $$ BEGIN
  CREATE TYPE "DeliveryMode" AS ENUM ('BLOG_AND_EMAIL', 'EMAIL_ONLY', 'BLOG_ONLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "blog_posts" ADD COLUMN "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;

-- Create unique index on accessToken if not exists
DO $$ BEGIN
  CREATE UNIQUE INDEX "blog_posts_accessToken_key" ON "blog_posts"("accessToken");
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

-- =============================================
-- 4. COMMUNICATION_CAMPAIGNS — visibility & delivery mode
-- =============================================

DO $$ BEGIN
  ALTER TABLE "communication_campaigns" ADD COLUMN "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "communication_campaigns" ADD COLUMN "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'BLOG_AND_EMAIL';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- =============================================
-- 5. TICKET_LIFECYCLE — missing SLA column
-- =============================================
ALTER TABLE "ticket_lifecycle" ADD COLUMN IF NOT EXISTS "slaResolutionPlanMet" BOOLEAN;

-- =============================================
-- 6. BLOG_STATUS — add missing REJECTED value
-- =============================================
DO $$ BEGIN
  ALTER TYPE "BlogStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 7. SAFETY NET — core enums that predate migration system
--    These should already exist from initial DB setup.
--    Creating with IF NOT EXISTS as a safety net for fresh installs.
-- =============================================
DO $$ BEGIN
  CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectType" AS ENUM ('ONBOARDING', 'M365_MIGRATION', 'FORTRESS', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PhaseStatus" AS ENUM ('NOT_STARTED', 'SCHEDULED', 'WAITING_ON_CUSTOMER', 'IN_PROGRESS', 'REQUIRES_CUSTOMER_COORDINATION', 'DISCUSSED', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT', 'COMMENT', 'STATUS_CHANGE', 'MENTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'DELETED', 'AI_GENERATED', 'TEMPLATE_APPLIED', 'PASSWORD_CHANGED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
