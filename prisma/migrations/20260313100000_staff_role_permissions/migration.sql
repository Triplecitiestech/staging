-- Staff Role Permissions Update
-- Adds SUPER_ADMIN, BILLING_ADMIN, TECHNICIAN roles
-- Migrates existing ADMIN -> SUPER_ADMIN, MANAGER -> ADMIN, VIEWER -> TECHNICIAN

-- Add new enum values to StaffRole
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'BILLING_ADMIN';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'TECHNICIAN';

-- Migrate existing roles:
-- ADMIN -> SUPER_ADMIN (existing admins get highest privilege)
-- MANAGER -> ADMIN (managers become admins)
-- VIEWER -> TECHNICIAN (viewers become technicians)
UPDATE "staff_users" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
UPDATE "staff_users" SET "role" = 'ADMIN' WHERE "role" = 'MANAGER';
UPDATE "staff_users" SET "role" = 'TECHNICIAN' WHERE "role" = 'VIEWER';

-- Update default
ALTER TABLE "staff_users" ALTER COLUMN "role" SET DEFAULT 'TECHNICIAN';
