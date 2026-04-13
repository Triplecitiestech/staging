-- PTO two-stage workflow: HR intake (Rio) → Final approval (Kurtis)
-- Adds PENDING_INTAKE and PENDING_APPROVAL enum values, intake fields,
-- gusto-recorded confirmation, and relaxes the Gusto-linked columns to
-- be optional so requests don't require a Gusto mapping.

-- 1. Extend status enum with the new stages
DO $$ BEGIN
  ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_INTAKE';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Migrate any existing PENDING rows to PENDING_INTAKE
UPDATE "time_off_requests"
SET "status" = 'PENDING_INTAKE'
WHERE "status" = 'PENDING';

-- 3. Relax Gusto-tied columns (mappingId, gustoEmployeeUuid) so new rows
--    can be created without a Gusto mapping.
ALTER TABLE "time_off_requests" ALTER COLUMN "mappingId" DROP NOT NULL;
ALTER TABLE "time_off_requests" ALTER COLUMN "gustoEmployeeUuid" DROP NOT NULL;

-- Replace cascade FK with SET NULL so losing a mapping doesn't delete requests
ALTER TABLE "time_off_requests" DROP CONSTRAINT IF EXISTS "time_off_requests_mappingId_fkey";
ALTER TABLE "time_off_requests"
  ADD CONSTRAINT "time_off_requests_mappingId_fkey"
  FOREIGN KEY ("mappingId") REFERENCES "pto_employee_mappings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Intake (stage 1) fields
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeByStaffId" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeByName" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeAt" TIMESTAMP(3);
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeLastTimeOffNotes" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeBalanceNotes" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeCoverageConfirmed" BOOLEAN;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeCoverageNotes" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeAdditionalNotes" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeNotifiedAt" TIMESTAMP(3);

-- 5. Post-approval manual Gusto entry confirmation
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedAt" TIMESTAMP(3);
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByStaffId" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByName" TEXT;
