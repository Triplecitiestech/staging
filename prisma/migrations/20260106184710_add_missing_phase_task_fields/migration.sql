-- CreateEnum (if not exists)
DO $$ BEGIN
  CREATE TYPE "TaskStatus" AS ENUM (
    'NOT_STARTED',
    'ASSIGNED',
    'WORK_IN_PROGRESS',
    'WAITING_ON_VENDOR',
    'WAITING_ON_CLIENT',
    'NEEDS_REVIEW',
    'STUCK',
    'INFORMATION_RECEIVED',
    'REVIEWED_AND_DONE',
    'ITG_DOCUMENTED',
    'NOT_APPLICABLE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PhaseOwner" AS ENUM ('TCT', 'CUSTOMER', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Add missing columns to phase_tasks
ALTER TABLE "phase_tasks"
  ADD COLUMN IF NOT EXISTS "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "assignedTo" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToName" TEXT,
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "responsibleParty" "PhaseOwner";
