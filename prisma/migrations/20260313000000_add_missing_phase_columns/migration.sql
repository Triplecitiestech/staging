-- Add missing columns to phases table that exist in Prisma schema but have no migration.
-- Uses IF NOT EXISTS so this is safe to re-run.

ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "customerNotes" TEXT;
ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "nextAction" TEXT;
ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "scheduledDate" TIMESTAMP(3);
ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "completedDate" TIMESTAMP(3);

-- owner uses PhaseOwner enum (TCT, CUSTOMER, BOTH) — create if not exists
DO $$ BEGIN
  CREATE TYPE "PhaseOwner" AS ENUM ('TCT', 'CUSTOMER', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "phases" ADD COLUMN "owner" "PhaseOwner";
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

ALTER TABLE "phases" ADD COLUMN IF NOT EXISTS "estimatedDays" INTEGER;
