-- AlterTable
ALTER TABLE "phase_tasks" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invited_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invite_count" INTEGER DEFAULT 0;
