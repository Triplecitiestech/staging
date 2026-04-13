-- Two-stage workflow data columns + status backfill.
-- Runs after 20260414000000_pto_two_stage_workflow committed the new
-- PENDING_INTAKE / PENDING_APPROVAL enum values, so this migration can
-- safely reference them in UPDATE statements.

-- Backfill legacy PENDING rows to PENDING_INTAKE
UPDATE "time_off_requests"
SET "status" = 'PENDING_INTAKE'
WHERE "status" = 'PENDING';

-- Relax Gusto-tied columns so requests can be created without a Gusto mapping
ALTER TABLE "time_off_requests" ALTER COLUMN "mappingId" DROP NOT NULL;
ALTER TABLE "time_off_requests" ALTER COLUMN "gustoEmployeeUuid" DROP NOT NULL;

-- Replace cascade FK with SET NULL so losing a mapping doesn't delete requests
ALTER TABLE "time_off_requests" DROP CONSTRAINT IF EXISTS "time_off_requests_mappingId_fkey";
ALTER TABLE "time_off_requests"
  ADD CONSTRAINT "time_off_requests_mappingId_fkey"
  FOREIGN KEY ("mappingId") REFERENCES "pto_employee_mappings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Intake (stage 1) fields
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

-- Post-approval manual Gusto entry confirmation
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedAt" TIMESTAMP(3);
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByStaffId" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByName" TEXT;
