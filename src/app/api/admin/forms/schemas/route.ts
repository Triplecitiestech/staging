import { NextRequest, NextResponse } from 'next/server'
import { Pool, PoolClient } from 'pg'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// Auto-migration: create question engine tables + seed data if missing
// ---------------------------------------------------------------------------

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS form_schemas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft',
  name            TEXT NOT NULL,
  description     TEXT,
  sections        JSONB NOT NULL DEFAULT '[]',
  created_by      TEXT,
  published_at    TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, version)
);
CREATE INDEX IF NOT EXISTS idx_form_schemas_type_status ON form_schemas(type, status);

CREATE TABLE IF NOT EXISTS form_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schema_id, key)
);
CREATE INDEX IF NOT EXISTS idx_form_sections_schema ON form_sections(schema_id, sort_order);

CREATE TABLE IF NOT EXISTS form_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL REFERENCES form_sections(id) ON DELETE CASCADE,
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  help_text       TEXT,
  placeholder     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  default_value   TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  validation      JSONB,
  static_options  JSONB,
  data_source     JSONB,
  visibility_rules JSONB,
  automation_key  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schema_id, key)
);
CREATE INDEX IF NOT EXISTS idx_form_questions_section ON form_questions(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_questions_schema ON form_questions(schema_id);

CREATE TABLE IF NOT EXISTS customer_form_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  type            TEXT NOT NULL,
  base_schema_id  UUID NOT NULL REFERENCES form_schemas(id),
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  section_overrides JSONB DEFAULT '[]',
  question_overrides JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, type)
);

CREATE TABLE IF NOT EXISTS customer_custom_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  config_id       UUID NOT NULL REFERENCES customer_form_configs(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,
  key             TEXT NOT NULL,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  help_text       TEXT,
  placeholder     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  default_value   TEXT,
  sort_order      INT NOT NULL DEFAULT 100,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  validation      JSONB,
  static_options  JSONB,
  data_source     JSONB,
  visibility_rules JSONB,
  automation_key  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, key)
);
CREATE INDEX IF NOT EXISTS idx_customer_custom_questions_config ON customer_custom_questions(config_id);

CREATE TABLE IF NOT EXISTS customer_custom_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  config_id       UUID NOT NULL REFERENCES customer_form_configs(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 100,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, key)
);

CREATE TABLE IF NOT EXISTS automation_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,
  company_id      UUID,
  trigger_key     TEXT NOT NULL,
  trigger_value   TEXT,
  action_type     TEXT NOT NULL,
  action_config   JSONB NOT NULL,
  priority        INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_mappings_type ON automation_mappings(type, company_id);

CREATE TABLE IF NOT EXISTS form_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  type            TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  pre_fill        JSONB,
  created_by      TEXT,
  source          TEXT DEFAULT 'manual',
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  request_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_links_token ON form_links(token);
CREATE INDEX IF NOT EXISTS idx_form_links_company ON form_links(company_id, type);
`

const SEED_SQL = `
INSERT INTO form_schemas (id, type, version, status, name, description, sections, created_by, published_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'onboarding', 1, 'published', 'Default Onboarding v1',
  'Standard employee onboarding form with M365 provisioning',
  '[]'::jsonb, 'system', NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'employee_details', 'Employee Details', 'Basic information about the new employee', 0),
  ('a0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 'access_profile', 'Role & Access Profile', 'What kind of access does this employee need?', 1),
  ('a0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 'm365_license', 'Microsoft 365 License', NULL, 2),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'access_permissions', 'Access & Permissions', 'Select the groups, teams, and sites this employee needs access to', 3),
  ('a0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 'special_instructions', 'Special Instructions', NULL, 4)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, is_required, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'first_name', 'text', 'First Name', NULL, NULL, true, 0),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'last_name', 'text', 'Last Name', NULL, NULL, true, 1),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'start_date', 'date', 'Start Date', 'When should the employee''s account be ready?', NULL, true, 2),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'job_title', 'text', 'Job Title', NULL, NULL, false, 3),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'department', 'text', 'Department', NULL, NULL, false, 4),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'work_location', 'text', 'Work Location', NULL, 'e.g. Binghamton, NY / Remote', false, 5),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'personal_email', 'email', 'Personal Email', 'We''ll send onboarding instructions here', NULL, false, 6),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'phone', 'phone', 'Phone Number', NULL, NULL, false, 7)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('a0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 'access_profile', 'radio', 'Access Profile', 'This determines the default set of groups and permissions', true, 0,
   '[{"value": "standard_office", "label": "Standard Office Worker (Email, Teams, SharePoint)"},
     {"value": "power_user", "label": "Power User (Full M365 suite)"},
     {"value": "field_worker", "label": "Field Worker (Mobile-only, limited access)"},
     {"value": "executive", "label": "Executive (Full access + additional security)"},
     {"value": "custom", "label": "Custom (I''ll specify below)"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order, data_source) VALUES
  ('a0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 'license_type', 'select', 'License Type', true, 0,
   '{"endpoint": "licenses", "valueField": "skuPartNumber", "labelField": "displayName", "labelSuffix": "({available} available)", "cacheTtl": 300}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, data_source) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'security_groups', 'multi_select', 'Security Groups', 0,
   '{"endpoint": "securityGroups", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'distribution_lists', 'multi_select', 'Distribution Lists', 1,
   '{"endpoint": "distributionLists", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'teams_groups', 'multi_select', 'Microsoft Teams', 2,
   '{"endpoint": "m365Groups", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'sharepoint_sites', 'multi_select', 'SharePoint Sites', 3,
   '{"endpoint": "sharepointSites", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, static_options) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'clone_permissions', 'radio', 'Clone permissions from an existing user?', 4,
   '[{"value": "yes", "label": "Yes — clone another user''s groups and permissions"},
     {"value": "no", "label": "No — set up fresh"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, data_source, visibility_rules) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'clone_from_user', 'select', 'Clone from user', 5,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "labelSuffix": "({userPrincipalName})", "cacheTtl": 300}'::jsonb,
   '{"operator": "and", "conditions": [{"field": "clone_permissions", "op": "eq", "value": "yes"}]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 'additional_notes', 'textarea', 'Additional Notes', 'Anything else we should know about this onboarding?', 'e.g. Special software needs, VPN access, building access badge...', 0)
ON CONFLICT DO NOTHING;

INSERT INTO form_schemas (id, type, version, status, name, description, sections, created_by, published_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'offboarding', 1, 'published', 'Default Offboarding v1',
  'Standard employee offboarding form with data handling and device options',
  '[]'::jsonb, 'system', NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'employee_details', 'Information about the departing employee', 'Information about the departing employee', 0),
  ('b0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440001', 'urgency_type', 'Urgency & Timeline', 'How urgent is this offboarding?', 1),
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'data_handling', 'Data & Email Handling', 'What should happen with the employee''s data and email?', 2),
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'device_handling', 'Device Handling', 'What should happen with the employee''s devices?', 3),
  ('b0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440001', 'special_instructions', 'Special Instructions', NULL, 4)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, data_source) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'employee_to_offboard', 'user_select', 'Select Employee', 'Search for the employee being offboarded', true, 0,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "labelSuffix": "({userPrincipalName})", "cacheTtl": 300, "autoFill": {"first_name": "givenName", "last_name": "surname", "work_email": "userPrincipalName"}}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'last_day', 'date', 'Last Working Day', true, 1)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440001', 'urgency_type', 'radio', 'Urgency Type', 'This determines how quickly access will be revoked', true, 0,
   '[{"value": "standard", "label": "Standard (process on last day)"},
     {"value": "planned_departure", "label": "Planned Departure (gradual access reduction)"},
     {"value": "immediate_termination", "label": "Immediate Termination (revoke all access now)"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'data_handling', 'radio', 'Data Handling', 'What should happen with the employee''s mailbox and OneDrive?', true, 0,
   '[{"value": "keep_accessible", "label": "Keep accessible (convert to shared mailbox)"},
     {"value": "forward_to_manager", "label": "Forward email to manager"},
     {"value": "transfer_to_manager", "label": "Transfer all data to manager"},
     {"value": "delete_after_30_days", "label": "Delete after 30-day retention"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, data_source, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'forward_email_to', 'select', 'Forward email to', 'Who should receive this employee''s email going forward?', 1,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "cacheTtl": 300}'::jsonb,
   '{"operator": "or", "conditions": [{"field": "data_handling", "op": "eq", "value": "forward_to_manager"}, {"field": "data_handling", "op": "eq", "value": "transfer_to_manager"}]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, data_source, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'delegate_access_to', 'select', 'Delegate access to', 'Who should get access to the shared mailbox?', 2,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "cacheTtl": 300}'::jsonb,
   '{"operator": "and", "conditions": [{"field": "data_handling", "op": "eq", "value": "keep_accessible"}]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'device_handling', 'radio', 'Device Handling', true, 0,
   '[{"value": "return_to_office", "label": "Employee will return device to office"},
     {"value": "remote_wipe", "label": "Remote wipe the device"},
     {"value": "keep_device", "label": "Employee keeps the device (wipe company data only)"}]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, static_options, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'wipe_confirmation', 'checkbox', 'I confirm that the remote wipe will erase ALL data on the device', 'This action cannot be undone. The device will be factory reset remotely.', 1,
   NULL,
   '{"operator": "and", "conditions": [{"field": "device_handling", "op": "eq", "value": "remote_wipe"}]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440001', 'additional_notes', 'textarea', 'Additional Notes', 'Anything else we should know about this offboarding?', 'e.g. Legal hold on data, specific apps to revoke, forwarding rules...', 0)
ON CONFLICT DO NOTHING;
`

async function ensureTablesExist(client: PoolClient): Promise<void> {
  await client.query(MIGRATION_SQL)
  await client.query(SEED_SQL)
  await migrateOffboardingUserSelect(client)
}

/** Idempotent migration: replace first_name/last_name/work_email with user_select in offboarding */
async function migrateOffboardingUserSelect(client: PoolClient): Promise<void> {
  const OFFBOARDING_SCHEMA_ID = '550e8400-e29b-41d4-a716-446655440001'

  // Check if employee_to_offboard already exists
  const existing = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'employee_to_offboard' LIMIT 1`,
    [OFFBOARDING_SCHEMA_ID]
  )
  if (existing.rows.length > 0) return // already migrated

  // Get the employee_details section ID
  const sectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'employee_details' LIMIT 1`,
    [OFFBOARDING_SCHEMA_ID]
  )
  if (sectionRes.rows.length === 0) return
  const sectionId = sectionRes.rows[0].id

  // Delete old first_name, last_name, work_email questions
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key IN ('first_name', 'last_name', 'work_email')`,
    [OFFBOARDING_SCHEMA_ID]
  )

  // Insert new employee_to_offboard user_select question
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, data_source)
     VALUES ($1, $2, 'employee_to_offboard', 'user_select', 'Select Employee', 'Search for the employee being offboarded', true, 0,
       $3::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      sectionId,
      OFFBOARDING_SCHEMA_ID,
      JSON.stringify({
        endpoint: 'users',
        valueField: 'userPrincipalName',
        labelField: 'displayName',
        labelSuffix: '({userPrincipalName})',
        cacheTtl: 300,
        autoFill: {
          first_name: 'givenName',
          last_name: 'surname',
          work_email: 'userPrincipalName',
        },
      }),
    ]
  )

  // Update last_day sort_order to 1 (after employee_to_offboard)
  await client.query(
    `UPDATE form_questions SET sort_order = 1 WHERE schema_id = $1 AND key = 'last_day'`,
    [OFFBOARDING_SCHEMA_ID]
  )
}

/** Idempotent migration: add credential_delivery and work_country/work_location_detail to onboarding */
async function migrateOnboardingQuestions(client: PoolClient): Promise<void> {
  const ONBOARDING_SCHEMA_ID = '550e8400-e29b-41d4-a716-446655440000'

  // Check if work_country already exists — if yes, already migrated
  const existing = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'work_country' LIMIT 1`,
    [ONBOARDING_SCHEMA_ID]
  )
  if (existing.rows.length > 0) return

  // Get the employee_details section ID
  const empSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'employee_details' LIMIT 1`,
    [ONBOARDING_SCHEMA_ID]
  )
  if (empSectionRes.rows.length === 0) return
  const empSectionId = empSectionRes.rows[0].id

  // Delete old work_location question
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'work_location'`,
    [ONBOARDING_SCHEMA_ID]
  )

  // Insert work_country select at sort_order 5
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
     VALUES ($1, $2, 'work_country', 'select', 'Work Country',
       'Select the country where this employee will primarily work. This affects compliance settings and SaaS Alerts geolocation whitelisting.',
       true, 5, $3::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      empSectionId,
      ONBOARDING_SCHEMA_ID,
      JSON.stringify([
        { value: 'US', label: 'United States' },
        { value: 'BR', label: 'Brazil' },
        { value: 'CA', label: 'Canada' },
        { value: 'GB', label: 'United Kingdom' },
        { value: 'DE', label: 'Germany' },
        { value: 'FR', label: 'France' },
        { value: 'AU', label: 'Australia' },
        { value: 'IN', label: 'India' },
        { value: 'MX', label: 'Mexico' },
        { value: 'JP', label: 'Japan' },
        { value: 'PH', label: 'Philippines' },
        { value: 'CO', label: 'Colombia' },
        { value: 'AR', label: 'Argentina' },
        { value: 'CL', label: 'Chile' },
        { value: 'OTHER', label: 'Other (specify below)' },
      ]),
    ]
  )

  // Insert work_location_detail text at sort_order 6
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, placeholder, sort_order)
     VALUES ($1, $2, 'work_location_detail', 'text', 'City / State / Office Location',
       'e.g. Binghamton, NY / São Paulo / Remote', 6)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [empSectionId, ONBOARDING_SCHEMA_ID]
  )

  // Shift personal_email to sort_order 7, phone to sort_order 8
  await client.query(
    `UPDATE form_questions SET sort_order = 7 WHERE schema_id = $1 AND key = 'personal_email'`,
    [ONBOARDING_SCHEMA_ID]
  )
  await client.query(
    `UPDATE form_questions SET sort_order = 8 WHERE schema_id = $1 AND key = 'phone'`,
    [ONBOARDING_SCHEMA_ID]
  )

  // Get the special_instructions section ID
  const specialSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'special_instructions' LIMIT 1`,
    [ONBOARDING_SCHEMA_ID]
  )
  if (specialSectionRes.rows.length === 0) return
  const specialSectionId = specialSectionRes.rows[0].id

  // Insert credential_delivery radio at sort_order 0 (if not exists)
  const credExisting = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'credential_delivery' LIMIT 1`,
    [ONBOARDING_SCHEMA_ID]
  )
  if (credExisting.rows.length === 0) {
    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
       VALUES ($1, $2, 'credential_delivery', 'radio',
         'Where should we send the new account login information?',
         'The new employee''s username, temporary password, and setup instructions will be sent to the selected recipient.',
         true, 0, $3::jsonb)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [
        specialSectionId,
        ONBOARDING_SCHEMA_ID,
        JSON.stringify([
          { value: 'submitter', label: "Send to me (I'll share with the employee)" },
          { value: 'personal_email', label: "Send directly to the employee's personal email" },
        ]),
      ]
    )

    // Shift additional_notes to sort_order 1
    await client.query(
      `UPDATE form_questions SET sort_order = 1 WHERE schema_id = $1 AND key = 'additional_notes' AND section_id = $2`,
      [ONBOARDING_SCHEMA_ID, specialSectionId]
    )
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/forms/schemas?type=onboarding
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const type = request.nextUrl.searchParams.get('type')

  const client = await pool.connect()
  try {
    let query = `SELECT id, type, version, status, name, description, created_by, published_at, archived_at, created_at, updated_at
                 FROM form_schemas`
    const params: string[] = []

    if (type) {
      query += ` WHERE type = $1`
      params.push(type)
    }

    query += ` ORDER BY type, version DESC`

    try {
      const result = await client.query(query, params)
      // Run idempotent migrations on every request
      await migrateOffboardingUserSelect(client)
      await migrateOnboardingQuestions(client)
      return NextResponse.json({ schemas: result.rows })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('does not exist')) {
        await ensureTablesExist(client)
        const result = await client.query(query, params)
        return NextResponse.json({ schemas: result.rows })
      }
      throw err
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/forms/schemas
// Body: { type, name, cloneFromId? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { type, name, cloneFromId } = body as { type: string; name: string; cloneFromId?: string }

  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // Get next version number
    const versionRes = await client.query<{ max: number }>(
      `SELECT COALESCE(MAX(version), 0) as max FROM form_schemas WHERE type = $1`,
      [type]
    )
    const nextVersion = versionRes.rows[0].max + 1

    // Create the new schema
    const schemaRes = await client.query<{ id: string }>(
      `INSERT INTO form_schemas (type, version, status, name, created_by)
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING id`,
      [type, nextVersion, name, session.user?.email ?? null]
    )
    const schemaId = schemaRes.rows[0].id

    // Clone from existing schema if requested
    if (cloneFromId) {
      // Clone sections
      const sectionsRes = await client.query(
        `SELECT key, title, description, sort_order, is_enabled FROM form_sections WHERE schema_id = $1`,
        [cloneFromId]
      )

      for (const s of sectionsRes.rows) {
        const newSectionRes = await client.query<{ id: string }>(
          `INSERT INTO form_sections (schema_id, key, title, description, sort_order, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [schemaId, s.key, s.title, s.description, s.sort_order, s.is_enabled]
        )
        const newSectionId = newSectionRes.rows[0].id

        // Clone questions for this section
        const oldSectionRes = await client.query<{ id: string }>(
          `SELECT id FROM form_sections WHERE schema_id = $1 AND key = $2`,
          [cloneFromId, s.key]
        )
        if (oldSectionRes.rows.length > 0) {
          const oldSectionId = oldSectionRes.rows[0].id
          await client.query(
            `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key)
             SELECT $1, $2, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key
             FROM form_questions WHERE section_id = $3 AND schema_id = $4`,
            [newSectionId, schemaId, oldSectionId, cloneFromId]
          )
        }
      }
    }

    return NextResponse.json({ id: schemaId, version: nextVersion }, { status: 201 })
  } finally {
    client.release()
  }
}
