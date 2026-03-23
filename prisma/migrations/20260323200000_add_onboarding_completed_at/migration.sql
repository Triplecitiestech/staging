-- Add missing onboarding_completed_at column to companies table
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3);

-- Ensure Kurtis is SUPER_ADMIN (re-run in case prior migration didn't apply)
UPDATE staff_users
SET role = 'SUPER_ADMIN',
    "updatedAt" = NOW()
WHERE email = 'kurtis@triplecitiestech.com'
  AND role != 'SUPER_ADMIN';
