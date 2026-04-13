-- Add two-stage workflow enum values.
-- NOTE: ALTER TYPE ADD VALUE must commit before any statement can USE the
-- new value, so this migration exclusively adds the enum values. The
-- follow-up migration 20260414000001 runs in a separate transaction and
-- can safely reference PENDING_INTAKE / PENDING_APPROVAL.

-- Prisma wraps migrations in a transaction. Postgres 12+ permits
-- ADD VALUE inside a transaction when the value doesn't yet exist, but
-- using that value in the same transaction is forbidden. Splitting into
-- two files guarantees the ADD VALUE is committed first.

DO $$ BEGIN
  ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_INTAKE';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
EXCEPTION WHEN duplicate_object THEN null; END $$;
