-- Remove foreign key constraints that reference StaffUser table
-- These are blocking project creation when StaffUser records don't exist

-- Drop foreign keys from projects table
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_createdBy_fkey";
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_lastModifiedBy_fkey";

-- Drop foreign keys from project_templates table
ALTER TABLE "project_templates" DROP CONSTRAINT IF EXISTS "project_templates_createdBy_fkey";

-- Drop foreign keys from audit_logs table
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_staffEmail_fkey";
