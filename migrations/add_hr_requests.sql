-- ============================================================
-- HR Request Tables Migration
-- Triple Cities Tech Customer Portal
-- ============================================================

-- HR Request Submissions (onboarding & offboarding)
CREATE TABLE IF NOT EXISTS hr_requests (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_slug          TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('onboarding', 'offboarding')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'requires_review')),
  submitted_by_email    TEXT NOT NULL,
  submitted_by_name     TEXT,
  answers               JSONB NOT NULL DEFAULT '{}',
  resolved_action_plan  JSONB,
  autotask_ticket_id    INTEGER,
  autotask_ticket_number TEXT,
  target_upn            TEXT,
  target_user_id        TEXT,
  idempotency_key       TEXT UNIQUE NOT NULL,
  error_message         TEXT,
  retry_count           INTEGER DEFAULT 0,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Job steps for each request
CREATE TABLE IF NOT EXISTS hr_request_steps (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id      TEXT NOT NULL REFERENCES hr_requests(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,
  step_name       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempt         INTEGER DEFAULT 1,
  input           JSONB,
  output          JSONB,
  error           JSONB,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log for HR requests
CREATE TABLE IF NOT EXISTS hr_audit_logs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id    TEXT NOT NULL,
  request_id    TEXT REFERENCES hr_requests(id),
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource      TEXT,
  details       JSONB,
  severity      TEXT DEFAULT 'info',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hr_requests_company    ON hr_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_requests_type       ON hr_requests(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_request_steps_request ON hr_request_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_hr_audit_company       ON hr_audit_logs(company_id, created_at DESC);

-- Auto-update updated_at on hr_requests
CREATE OR REPLACE FUNCTION update_hr_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_requests_updated_at ON hr_requests;
CREATE TRIGGER trg_hr_requests_updated_at
  BEFORE UPDATE ON hr_requests
  FOR EACH ROW EXECUTE FUNCTION update_hr_requests_updated_at();
