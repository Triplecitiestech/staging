-- ============================================================
-- M365 Tenant Credentials Migration
-- Triple Cities Tech Customer Portal
-- Adds per-company Microsoft 365 app registration credentials
-- so TCT can call Graph API on behalf of each customer tenant.
-- ============================================================

-- Add M365 tenant credential columns to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS m365_tenant_id     TEXT,
  ADD COLUMN IF NOT EXISTS m365_client_id     TEXT,
  ADD COLUMN IF NOT EXISTS m365_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS m365_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS m365_setup_status  TEXT DEFAULT 'not_configured'
    CHECK (m365_setup_status IN ('not_configured', 'credentials_saved', 'verified', 'error'));

-- Index for quick lookup of companies with M365 configured
CREATE INDEX IF NOT EXISTS idx_companies_m365_status
  ON companies(m365_setup_status)
  WHERE m365_setup_status != 'not_configured';

-- Add onboarding_completed_at so techs can track which companies
-- have been fully onboarded into the portal
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
