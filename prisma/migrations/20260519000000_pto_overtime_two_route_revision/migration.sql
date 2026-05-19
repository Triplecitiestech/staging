-- PTO + Overtime: split each system into APPROVAL and NOTIFICATION flows.
-- The approval flow is unchanged (HR intake → CEO sign-off). The notification
-- flow is for things that already happened (sick days, reactive overtime) — HR
-- records and the CEO sees an FYI.
--
-- NOTE: this DB has never had `prisma migrate deploy` actually run. The same
-- DDL is also applied via /api/migrations/run for production. This file
-- exists so local Prisma dev environments stay in sync.

-- ---------------------------------------------------------------------------
-- PTO
-- ---------------------------------------------------------------------------

ALTER TYPE "TimeOffRequestKind" ADD VALUE IF NOT EXISTS 'FAMILY_EMERGENCY';
ALTER TYPE "TimeOffRequestKind" ADD VALUE IF NOT EXISTS 'SAME_DAY_MEDICAL';

ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'RECORDED_PAID';
ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'RECORDED_UNPAID';
ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'FLAGGED_FOR_REVIEW';

DO $$ BEGIN
  CREATE TYPE "TimeOffFlowType" AS ENUM ('APPROVAL', 'NOTIFICATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "time_off_requests"
  ADD COLUMN IF NOT EXISTS "flow_type" "TimeOffFlowType" NOT NULL DEFAULT 'APPROVAL',
  ADD COLUMN IF NOT EXISTS "override_short_notice" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "override_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_or_unpaid" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "gusto_logged_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "flag_for_ceo_review" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "flag_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ceo_acknowledged_at" TIMESTAMP;

-- ---------------------------------------------------------------------------
-- Overtime
-- ---------------------------------------------------------------------------

ALTER TYPE "OvertimeRequestStatus" ADD VALUE IF NOT EXISTS 'RECORDED';
ALTER TYPE "OvertimeRequestStatus" ADD VALUE IF NOT EXISTS 'FLAGGED_FOR_REVIEW';

DO $$ BEGIN
  CREATE TYPE "OvertimeFlowType" AS ENUM ('APPROVAL', 'NOTIFICATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "overtime_requests"
  ADD COLUMN IF NOT EXISTS "flow_type" "OvertimeFlowType" NOT NULL DEFAULT 'APPROVAL',
  ADD COLUMN IF NOT EXISTS "ot_category" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "reactive_reason" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "incident_context" TEXT,
  ADD COLUMN IF NOT EXISTS "end_time" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "actual_start_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "actual_end_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "late_submission" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "late_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "flag_for_ceo_review" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "flag_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ceo_acknowledged_at" TIMESTAMP;
