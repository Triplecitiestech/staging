-- Add per-user permission overrides to staff_users
-- JSON format: { "granted": ["perm1", "perm2"], "revoked": ["perm3"] }
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "permissionOverrides" jsonb;
