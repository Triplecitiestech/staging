-- Add isVisibleToCustomer column to phases.
-- The Prisma schema (Phase model) has had this field for a while, but no
-- migration ever created the column in the database. On deployments where
-- the DB was initialized after the schema change, default includes like
-- `phases: { include: { tasks: true } }` crash with "column does not exist",
-- which surfaces as a blank admin dashboard error and empty portal project lists.
ALTER TABLE "phases"
  ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true;
