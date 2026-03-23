import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// Migration SQL — idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)
// ---------------------------------------------------------------------------

const MIGRATION_SQL = `
-- Form schemas (global templates)
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_schemas_type_version ON form_schemas(type, version);
CREATE INDEX IF NOT EXISTS idx_form_schemas_type_status ON form_schemas(type, status);

-- Form sections
CREATE TABLE IF NOT EXISTS form_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_sections_schema_key ON form_sections(schema_id, key);
CREATE INDEX IF NOT EXISTS idx_form_sections_schema ON form_sections(schema_id, sort_order);

-- Form questions
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_questions_schema_key ON form_questions(schema_id, key);
CREATE INDEX IF NOT EXISTS idx_form_questions_section ON form_questions(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_questions_schema ON form_questions(schema_id);

-- Customer form configs
CREATE TABLE IF NOT EXISTS customer_form_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  type            TEXT NOT NULL,
  base_schema_id  UUID NOT NULL REFERENCES form_schemas(id),
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  section_overrides JSONB DEFAULT '[]',
  question_overrides JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_form_configs_company_type ON customer_form_configs(company_id, type);

-- Customer custom questions
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_custom_questions_company_key ON customer_custom_questions(company_id, key);
CREATE INDEX IF NOT EXISTS idx_customer_custom_questions_config ON customer_custom_questions(config_id);

-- Customer custom sections
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_custom_sections_company_key ON customer_custom_sections(company_id, key);

-- Automation mappings
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

-- Form links
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

// ---------------------------------------------------------------------------
// Seed SQL — default onboarding + offboarding schemas
// ---------------------------------------------------------------------------

const SEED_SQL = `
-- ============================================================
-- Default Onboarding Schema v1
-- ============================================================
INSERT INTO form_schemas (id, type, version, status, name, description, published_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'onboarding', 1, 'published', 'Default Onboarding v1',
  'Standard employee onboarding form', NOW()
) ON CONFLICT DO NOTHING;

-- Sections for onboarding (5 steps: Employee Details → Account Setup → Groups & Access → Computer Setup → Additional Notes)
INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8000-000000000001', 'employee_details', 'Employee Details', 'Basic information about the new employee', 0),
  ('00000000-0000-4000-8001-000000000002', '00000000-0000-4000-8000-000000000001', 'account_setup', 'Account Setup', NULL, 1),
  ('00000000-0000-4000-8001-000000000004', '00000000-0000-4000-8000-000000000001', 'access_permissions', 'Groups & Access', 'Select the groups and teams this employee should be added to', 2),
  ('00000000-0000-4000-8001-000000000006', '00000000-0000-4000-8000-000000000001', 'device_setup', 'Computer & Device Setup', 'What computer will the new employee use?', 3),
  ('00000000-0000-4000-8001-000000000005', '00000000-0000-4000-8000-000000000001', 'special_instructions', 'Additional Notes', NULL, 4)
ON CONFLICT DO NOTHING;

-- Questions for onboarding employee_details
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, placeholder, is_required, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'first_name', 'text', 'First Name', NULL, NULL, true, 0),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'last_name', 'text', 'Last Name', NULL, NULL, true, 1),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'start_date', 'date', 'Start Date', 'When should the employee''s account be ready?', NULL, true, 2),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'job_title', 'text', 'Job Title', NULL, NULL, false, 3),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'department', 'text', 'Department', NULL, NULL, false, 4),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'work_location', 'text', 'Work Location', NULL, 'e.g. Binghamton, NY / Remote', false, 5),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'personal_email', 'email', 'Personal Email', 'We''ll send onboarding instructions here', NULL, false, 6),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000001', 'phone', 'phone', 'Phone Number', NULL, NULL, false, 7)
ON CONFLICT DO NOTHING;

-- Questions for onboarding account_setup
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000002', 'clone_permissions', 'radio', 'Should this employee have the same access as an existing team member?', 'If yes, we''ll copy their email groups, Teams, and permissions', false, 0,
   '[{"value":"yes","label":"Yes — set them up like someone else"},{"value":"no","label":"No — I''ll pick their access below"}]')
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, data_source, visibility_rules) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000002', 'clone_from_user', 'select', 'Which team member?', 1,
   '{"endpoint":"users","valueField":"userPrincipalName","labelField":"displayName","labelSuffix":"({userPrincipalName})","cacheTtl":300}',
   '{"operator":"and","conditions":[{"field":"clone_permissions","op":"eq","value":"yes"}]}')
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, is_required, sort_order, data_source) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000002', 'license_type', 'select', 'Email & Apps Plan', true, 2,
   '{"endpoint":"licenses","valueField":"skuPartNumber","labelField":"displayName","labelSuffix":"({available} available)","cacheTtl":300}')
ON CONFLICT DO NOTHING;

-- Questions for onboarding access_permissions (dynamic from M365 tenant)
INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, data_source) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000004', 'security_groups', 'multi_select', 'Security Groups', 0,
   '{"endpoint":"securityGroups","valueField":"id","labelField":"displayName","cacheTtl":300}'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000004', 'distribution_lists', 'multi_select', 'Distribution Lists', 1,
   '{"endpoint":"distributionLists","valueField":"id","labelField":"displayName","cacheTtl":300}'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000004', 'teams_groups', 'multi_select', 'Microsoft Teams', 2,
   '{"endpoint":"m365Groups","valueField":"id","labelField":"displayName","cacheTtl":300}'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000004', 'sharepoint_sites', 'multi_select', 'SharePoint Sites', 3,
   '{"endpoint":"sharepointSites","valueField":"id","labelField":"displayName","cacheTtl":300}')
ON CONFLICT DO NOTHING;

-- Questions for onboarding device_setup (branching logic)
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000006', 'computer_situation', 'radio', 'What computer will this employee use?', NULL, true, 0,
   '[{"value":"existing_company","label":"An existing company computer"},{"value":"new_computer","label":"They need a new computer"},{"value":"personal_byod","label":"They''ll use their own computer (BYOD / work from home)"}]')
ON CONFLICT DO NOTHING;

-- If existing company computer: pick from M365 tenant devices
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, data_source, visibility_rules) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000006', 'existing_device', 'select', 'Which computer?', 'Select from your organization''s enrolled Windows devices', 1,
   '{"endpoint":"devices","valueField":"deviceName","labelField":"deviceName","labelSuffix":"({model})","cacheTtl":300}',
   '{"operator":"and","conditions":[{"field":"computer_situation","op":"eq","value":"existing_company"}]}')
ON CONFLICT DO NOTHING;

-- If new computer: standard config or custom quote?
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, static_options, visibility_rules) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000006', 'new_computer_type', 'radio', 'What kind of setup?', NULL, 2,
   '[{"value":"standard","label":"Standard setup — choose a computer type below"},{"value":"custom_quote","label":"Custom — have our sales team create a quote"}]',
   '{"operator":"and","conditions":[{"field":"computer_situation","op":"eq","value":"new_computer"}]}')
ON CONFLICT DO NOTHING;

-- If standard setup: pick computer type (multi-select so they can add a second display)
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, static_options, visibility_rules) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000006', 'computer_spec', 'multi_select', 'Select equipment needed', 'You can select multiple items', 3,
   '[{"value":"standard_laptop","label":"Standard Laptop"},{"value":"premium_laptop","label":"Premium Laptop"},{"value":"standard_workstation","label":"Standard Workstation"},{"value":"premium_workstation","label":"Premium Workstation"},{"value":"second_display","label":"Second Display"}]',
   '{"operator":"and","conditions":[{"field":"new_computer_type","op":"eq","value":"standard"}]}')
ON CONFLICT DO NOTHING;

-- Questions for onboarding special_instructions
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8001-000000000005', 'additional_notes', 'textarea', 'Anything else we should know?', NULL, 'e.g. They need access to a specific shared drive, software, or VPN...', 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Default Offboarding Schema v1
-- ============================================================
INSERT INTO form_schemas (id, type, version, status, name, description, published_at)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'offboarding', 1, 'published', 'Default Offboarding v1',
  'Standard employee offboarding form', NOW()
) ON CONFLICT DO NOTHING;

-- Sections for offboarding
INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('00000000-0000-4000-8002-000000000001', '00000000-0000-4000-8000-000000000002', 'employee_details', 'Employee Details', 'Identify the employee being offboarded', 0),
  ('00000000-0000-4000-8002-000000000002', '00000000-0000-4000-8000-000000000002', 'urgency', 'Urgency & Timeline', 'How quickly should this be processed?', 1),
  ('00000000-0000-4000-8002-000000000003', '00000000-0000-4000-8000-000000000002', 'data_handling', 'Data & Email Handling', 'What should happen to the employee''s data and email?', 2),
  ('00000000-0000-4000-8002-000000000004', '00000000-0000-4000-8000-000000000002', 'access_transfer', 'Access Transfer', 'Transfer access to another user if needed', 3),
  ('00000000-0000-4000-8002-000000000005', '00000000-0000-4000-8000-000000000002', 'device_handling', 'Device Handling', 'What should happen to company devices?', 4),
  ('00000000-0000-4000-8002-000000000006', '00000000-0000-4000-8000-000000000002', 'special_instructions', 'Special Instructions', NULL, 5)
ON CONFLICT DO NOTHING;

-- Questions for offboarding employee_details
INSERT INTO form_questions (schema_id, section_id, key, type, label, is_required, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000001', 'first_name', 'text', 'First Name', true, 0),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000001', 'last_name', 'text', 'Last Name', true, 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000001', 'work_email', 'email', 'Work Email', true, 2),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000001', 'last_day', 'date', 'Last Working Day', true, 3)
ON CONFLICT DO NOTHING;

-- Questions for offboarding urgency
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options, automation_key) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000002', 'urgency_type', 'radio', 'Urgency Level', 'Immediate termination will trigger session revocation right away', true, 0,
   '[{"value":"immediate_termination","label":"Immediate Termination — block access now"},{"value":"standard","label":"Standard — process on last day"},{"value":"planned_departure","label":"Planned Departure — employee is aware, process on schedule"}]',
   'urgency_type')
ON CONFLICT DO NOTHING;

-- Questions for offboarding data_handling
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options, automation_key) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000003', 'data_handling', 'radio', 'Email & Data Handling', 'Choose how to handle the departing employee''s mailbox and files', true, 0,
   '[{"value":"keep_accessible","label":"Convert to shared mailbox — keep accessible"},{"value":"forward_to_manager","label":"Forward email to their manager"},{"value":"forward_to_specific","label":"Forward email to a specific person"},{"value":"delete_after_30","label":"Delete account after 30-day hold"}]',
   'data_handling')
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, data_source, visibility_rules) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000003', 'forward_email_to', 'select', 'Forward email to', 1,
   '{"endpoint":"users","valueField":"userPrincipalName","labelField":"displayName","cacheTtl":300}',
   '{"operator":"or","conditions":[{"field":"data_handling","op":"eq","value":"forward_to_manager"},{"field":"data_handling","op":"eq","value":"forward_to_specific"}]}')
ON CONFLICT DO NOTHING;

-- Questions for offboarding access_transfer
INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, data_source) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000004', 'delegate_access_to', 'select', 'Delegate mailbox access to', 0,
   '{"endpoint":"users","valueField":"userPrincipalName","labelField":"displayName","cacheTtl":300}'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000004', 'transfer_onedrive_to', 'select', 'Transfer OneDrive files to', 1,
   '{"endpoint":"users","valueField":"userPrincipalName","labelField":"displayName","cacheTtl":300}')
ON CONFLICT DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, static_options) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000004', 'remove_from_groups', 'radio', 'Remove from all groups and distribution lists?', 2,
   '[{"value":"yes","label":"Yes — remove from all groups immediately"},{"value":"no","label":"No — keep group memberships for now"}]')
ON CONFLICT DO NOTHING;

-- Questions for offboarding device_handling
INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, static_options, automation_key) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000005', 'device_handling', 'radio', 'Device Handling', 0,
   '[{"value":"wipe","label":"Remote wipe all managed devices"},{"value":"return","label":"Employee will return devices — no remote action"},{"value":"keep","label":"Employee keeps devices — just remove company data"}]',
   'device_handling')
ON CONFLICT DO NOTHING;

-- Questions for offboarding special_instructions
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000006', 'additional_notes', 'textarea', 'Additional Notes', 'Any special instructions for this offboarding?', 'e.g. Legal hold on mailbox, specific access to preserve...', 0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Default Automation Mappings
-- ============================================================

-- Offboarding mappings
INSERT INTO automation_mappings (type, trigger_key, trigger_value, action_type, action_config, priority) VALUES
  ('offboarding', 'urgency_type', 'immediate_termination', 'revoke_sessions', '{"graph_method":"revokeSignInSessions","target":"{{answers.work_email}}","notify_admin":true}', 0),
  ('offboarding', 'urgency_type', 'immediate_termination', 'disable_account', '{"graph_method":"disableAccount","target":"{{answers.work_email}}"}', 1),
  ('offboarding', 'urgency_type', 'standard', 'disable_account', '{"graph_method":"disableAccount","target":"{{answers.work_email}}","schedule":"last_day"}', 2),
  ('offboarding', 'data_handling', 'keep_accessible', 'convert_to_shared', '{"graph_method":"convertToSharedMailbox","target":"{{answers.work_email}}"}', 10),
  ('offboarding', 'data_handling', 'forward_to_manager', 'forward_email', '{"graph_method":"setMailForwarding","target":"{{answers.work_email}}","forwardTo":"{{answers.forward_email_to}}"}', 10),
  ('offboarding', 'data_handling', 'forward_to_specific', 'forward_email', '{"graph_method":"setMailForwarding","target":"{{answers.work_email}}","forwardTo":"{{answers.forward_email_to}}"}', 10),
  ('offboarding', 'remove_from_groups', 'yes', 'remove_groups', '{"graph_method":"removeFromAllGroups","target":"{{answers.work_email}}"}', 20),
  ('offboarding', 'device_handling', 'wipe', 'wipe_devices', '{"graph_method":"remoteWipe","target":"{{answers.work_email}}"}', 30)
ON CONFLICT DO NOTHING;

-- Onboarding mappings
INSERT INTO automation_mappings (type, trigger_key, trigger_value, action_type, action_config, priority) VALUES
  ('onboarding', 'license_type', NULL, 'assign_license', '{"graph_method":"assignLicense","skuPartNumber":"{{answers.license_type}}"}', 10),
  ('onboarding', 'clone_permissions', 'yes', 'clone_permissions', '{"graph_method":"cloneUserGroups","source":"{{answers.clone_from_user}}"}', 20)
ON CONFLICT DO NOTHING;
`

// ---------------------------------------------------------------------------
// Update SQL — restructures onboarding from 5 steps to 3 steps
// Runs after seed to update existing data that ON CONFLICT DO NOTHING skipped
// ---------------------------------------------------------------------------

const UPDATE_SQL = `
-- ============================================================
-- Onboarding: restructure from 5 steps to 4 steps
-- ============================================================

-- Remove old m365_license section (license picker moved into account_setup)
DELETE FROM form_questions WHERE section_id = '00000000-0000-4000-8001-000000000003';
DELETE FROM form_sections WHERE id = '00000000-0000-4000-8001-000000000003';

-- Update section 2 from 'Role & Access Profile' to 'Account Setup'
UPDATE form_sections
SET key = 'account_setup',
    title = 'Account Setup',
    description = NULL,
    sort_order = 1
WHERE id = '00000000-0000-4000-8001-000000000002';

-- Update section 4 (access_permissions) to sort_order 2
UPDATE form_sections
SET title = 'Groups & Access',
    description = 'Select the groups and teams this employee should be added to',
    sort_order = 2
WHERE id = '00000000-0000-4000-8001-000000000004';

-- Create device_setup section (sort_order 3)
INSERT INTO form_sections (id, schema_id, key, title, description, sort_order)
VALUES (
  '00000000-0000-4000-8001-000000000006',
  '00000000-0000-4000-8000-000000000001',
  'device_setup', 'Computer & Device Setup',
  'What computer will the new employee use?', 3
) ON CONFLICT (id) DO UPDATE SET sort_order = 3;

-- Update section 5 (special_instructions) to sort_order 4
UPDATE form_sections
SET title = 'Additional Notes',
    sort_order = 4
WHERE id = '00000000-0000-4000-8001-000000000005';

-- Remove old access_profile question from section 2 (replaced by clone + license)
DELETE FROM form_questions
WHERE section_id = '00000000-0000-4000-8001-000000000002'
  AND key = 'access_profile';

-- Insert account_setup questions (idempotent)
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000002',
  'clone_permissions', 'radio',
  'Should this employee have the same access as an existing team member?',
  'If yes, we''ll copy their email groups, Teams, and permissions',
  false, 0,
  '[{"value":"yes","label":"Yes — set them up like someone else"},{"value":"no","label":"No — I''ll pick their access below"}]'
) ON CONFLICT DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, sort_order, data_source, visibility_rules)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000002',
  'clone_from_user', 'select',
  'Which team member?', 1,
  '{"endpoint":"users","valueField":"userPrincipalName","labelField":"displayName","labelSuffix":"({userPrincipalName})","cacheTtl":300}',
  '{"operator":"and","conditions":[{"field":"clone_permissions","op":"eq","value":"yes"}]}'
) ON CONFLICT DO NOTHING;

-- Move license_type to account_setup section if it was in m365_license section
UPDATE form_questions
SET section_id = '00000000-0000-4000-8001-000000000002',
    label = 'Email & Apps Plan',
    sort_order = 2
WHERE schema_id = '00000000-0000-4000-8000-000000000001'
  AND key = 'license_type';

-- Ensure license_type exists in account_setup
INSERT INTO form_questions (schema_id, section_id, key, type, label, is_required, sort_order, data_source)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000002',
  'license_type', 'select', 'Email & Apps Plan', true, 2,
  '{"endpoint":"licenses","valueField":"skuPartNumber","labelField":"displayName","labelSuffix":"({available} available)","cacheTtl":300}'
) ON CONFLICT DO NOTHING;

-- Update special instructions question text
UPDATE form_questions
SET label = 'Anything else we should know?',
    help_text = NULL,
    placeholder = 'e.g. They need access to a specific shared drive, software, or VPN...'
WHERE section_id = '00000000-0000-4000-8001-000000000005'
  AND key = 'additional_notes';

-- ============================================================
-- Onboarding: add Computer & Device Setup questions
-- ============================================================

-- Q1: Computer situation (radio — always visible)
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, is_required, sort_order, static_options)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000006',
  'computer_situation', 'radio',
  'What computer will this employee use?',
  NULL, true, 0,
  '[{"value":"existing_company","label":"An existing company computer"},{"value":"new_computer","label":"They need a new computer"},{"value":"personal_byod","label":"They''ll use their own computer (BYOD / work from home)"}]'
) ON CONFLICT DO NOTHING;

-- Q2a: If existing computer — pick from M365 tenant devices
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, data_source, visibility_rules)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000006',
  'existing_device', 'select',
  'Which computer?',
  'Select from your organization''s enrolled Windows devices', 1,
  '{"endpoint":"devices","valueField":"deviceName","labelField":"deviceName","labelSuffix":"({model})","cacheTtl":300}',
  '{"operator":"and","conditions":[{"field":"computer_situation","op":"eq","value":"existing_company"}]}'
) ON CONFLICT DO NOTHING;

-- Q2b: If new computer — standard config or custom quote?
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, static_options, visibility_rules)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000006',
  'new_computer_type', 'radio',
  'What kind of setup?',
  NULL, 2,
  '[{"value":"standard","label":"Standard setup — choose a computer type below"},{"value":"custom_quote","label":"Custom — have our sales team create a quote"}]',
  '{"operator":"and","conditions":[{"field":"computer_situation","op":"eq","value":"new_computer"}]}'
) ON CONFLICT DO NOTHING;

-- Q3: If standard — pick computer specs (multi_select for adding second display)
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, static_options, visibility_rules)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8001-000000000006',
  'computer_spec', 'multi_select',
  'Select equipment needed',
  'You can select multiple items', 3,
  '[{"value":"standard_laptop","label":"Standard Laptop"},{"value":"premium_laptop","label":"Premium Laptop"},{"value":"standard_workstation","label":"Standard Workstation"},{"value":"premium_workstation","label":"Premium Workstation"},{"value":"second_display","label":"Second Display"}]',
  '{"operator":"and","conditions":[{"field":"new_computer_type","op":"eq","value":"standard"}]}'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- Offboarding: add OneDrive handling options
-- ============================================================

-- Update transfer_onedrive_to question to add help text
UPDATE form_questions
SET help_text = 'This person will be notified by email with instructions to access the files'
WHERE schema_id = '00000000-0000-4000-8000-000000000002'
  AND key = 'transfer_onedrive_to';

-- Add OneDrive archive option
INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, sort_order, static_options)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8002-000000000004',
  'onedrive_archive', 'radio',
  'Archive OneDrive files for long-term retention?',
  'Files will be copied to an HR SharePoint site for safekeeping',
  3,
  '[{"value":"yes","label":"Yes — move files to HR SharePoint archive"},{"value":"no","label":"No — no additional archiving needed"}]'
) ON CONFLICT DO NOTHING;
`

// ---------------------------------------------------------------------------
// GET /api/migrations/question-engine?secret=XXX
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.MIGRATION_SECRET ?? process.env.INTERNAL_SECRET ?? ''

  if (!expectedSecret) {
    return NextResponse.json({ error: 'No MIGRATION_SECRET configured' }, { status: 500 })
  }

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const client = await pool.connect()
  try {
    // Run migration
    await client.query(MIGRATION_SQL)

    // Run seed
    await client.query(SEED_SQL)

    // Run updates (restructure onboarding form)
    await client.query(UPDATE_SQL)

    return NextResponse.json({
      success: true,
      message: 'Question engine migration and seed completed successfully',
      tables: [
        'form_schemas',
        'form_sections',
        'form_questions',
        'customer_form_configs',
        'customer_custom_questions',
        'customer_custom_sections',
        'automation_mappings',
        'form_links',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[migration/question-engine] Error:', message)
    return NextResponse.json({ error: 'Migration failed', details: message }, { status: 500 })
  } finally {
    client.release()
  }
}
