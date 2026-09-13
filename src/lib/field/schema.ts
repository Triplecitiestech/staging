// src/lib/field/schema.ts
//
// Contractor Portal ("/field") schema — the field_* tables.
//
// Applied by POST /api/migrations/run (the repo's migration source of truth;
// Prisma's migration runner has never applied to production — see CLAUDE.md
// → Database). Every statement is idempotent (IF NOT EXISTS / ENABLE RLS is a
// no-op when already enabled), so the block can run on every POST and on an
// empty database.
//
// Access model: contractors NEVER talk to the database. Every query runs from
// server code on the app's own connection (the table owner). Row Level
// Security is enabled with NO policies, so any role that is not the owner —
// e.g. a future anon/authenticated API role — sees nothing. The owner bypasses
// RLS unless FORCE is set, which is deliberately not set.
//
// Phase map (docs: src/app/field/ARCHITECTURE.md):
//   phase 1 — field_contractors, field_login_codes, field_sessions, field_audit_log
//   phase 2 — field_jobs           (created now, no UI, zero rows)
//   phase 3 — field_job_notes      (created now, no UI, zero rows)

export const FIELD_TABLES = [
  'field_contractors',
  'field_login_codes',
  'field_sessions',
  'field_jobs',
  'field_job_notes',
  'field_audit_log',
] as const

export type FieldTable = (typeof FIELD_TABLES)[number]

export const FIELD_SCHEMA_STATEMENTS: readonly string[] = [
  // Who may log in. email is stored lowercased by the writer and the unique
  // index is on lower(email) so a differently-cased duplicate is still refused.
  `CREATE TABLE IF NOT EXISTS field_contractors (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS field_contractors_email_key ON field_contractors (lower(email))`,

  // One-time login codes. code_hash is SHA-256 of the 6-digit code and is what
  // verification compares against. code_ciphertext is the same code encrypted
  // with the app's AES-256-GCM master key (src/lib/crypto.ts) so STAFF can read
  // it back on /field/admin and text it to a contractor whose email did not
  // arrive; it is NULL when no encryption key is configured. There is
  // deliberately no plaintext column.
  `CREATE TABLE IF NOT EXISTS field_login_codes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contractor_id TEXT NOT NULL REFERENCES field_contractors(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    code_ciphertext TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS field_login_codes_contractor_open_idx ON field_login_codes (contractor_id, created_at DESC) WHERE consumed_at IS NULL`,

  // Browser sessions. token_hash is SHA-256 of the random 32-byte cookie value;
  // the value itself is never stored.
  `CREATE TABLE IF NOT EXISTS field_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contractor_id TEXT NOT NULL REFERENCES field_contractors(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS field_sessions_token_hash_key ON field_sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS field_sessions_contractor_idx ON field_sessions (contractor_id, created_at DESC)`,

  // Phase 2 — job packets. Created now so phase 2 is additive; no UI in phase 1.
  `CREATE TABLE IF NOT EXISTS field_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contractor_id TEXT REFERENCES field_contractors(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    autotask_company_id INTEGER,
    autotask_ticket_id INTEGER,
    point_of_contact TEXT,
    poc_phone TEXT,
    scope TEXT,
    scheduled_for DATE,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS field_jobs_contractor_idx ON field_jobs (contractor_id, scheduled_for)`,

  // Phase 3 — contractor notes that post to Autotask tickets. No UI in phase 1.
  `CREATE TABLE IF NOT EXISTS field_job_notes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    job_id TEXT NOT NULL REFERENCES field_jobs(id) ON DELETE CASCADE,
    contractor_id TEXT NOT NULL REFERENCES field_contractors(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    posted_to_autotask_at TIMESTAMPTZ,
    autotask_note_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS field_job_notes_job_idx ON field_job_notes (job_id, created_at)`,

  // Append-only audit trail. actor_type is 'staff' | 'contractor' | 'system';
  // actor_id is the staff email, the contractor id, or NULL. meta never holds
  // a code or a session token — hashes and outcomes only.
  `CREATE TABLE IF NOT EXISTS field_audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'contractor', 'system')),
    actor_id TEXT,
    event TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS field_audit_log_event_idx ON field_audit_log (event, created_at DESC)`,
  // Per-IP code-request rate limit reads this: event + meta->>'ip' + created_at.
  `CREATE INDEX IF NOT EXISTS field_audit_log_ip_idx ON field_audit_log ((meta->>'ip'), created_at DESC)`,

  // RLS on with no policies: only the owning role (server code) can read or write.
  ...FIELD_TABLES.map((table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
]
