-- Add isVisibleToCustomer column to projects so admins can hide
-- projects that should not appear on the customer portal.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true;
