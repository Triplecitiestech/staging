-- ============================================================
-- Seed Default Form Schemas — Onboarding & Offboarding
-- Inserts into normalized tables: form_schemas → form_sections → form_questions
-- Run after add_question_engine_tables.sql migration
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ONBOARDING SCHEMA
-- ============================================================

INSERT INTO form_schemas (id, type, version, status, name, description, sections, created_by, published_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'onboarding',
  1,
  'published',
  'Default Onboarding v1',
  'Standard employee onboarding form with M365 provisioning',
  '[]'::jsonb,
  'system',
  NOW()
);

-- Onboarding sections
INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'employee_details', 'Employee Details', 'Basic information about the new employee', 0),
  ('a0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 'access_profile', 'Role & Access Profile', 'What kind of access does this employee need?', 1),
  ('a0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 'm365_license', 'Microsoft 365 License', NULL, 2),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'access_permissions', 'Access & Permissions', 'Select the groups, teams, and sites this employee needs access to', 3),
  ('a0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 'special_instructions', 'Special Instructions', NULL, 4);

-- Onboarding questions: employee_details
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, is_required, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'first_name', 'text', 'First Name', NULL, NULL, true, 0),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'last_name', 'text', 'Last Name', NULL, NULL, true, 1),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'start_date', 'date', 'Start Date', 'When should the employee''s account be ready?', NULL, true, 2),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'job_title', 'text', 'Job Title', NULL, NULL, false, 3),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'department', 'text', 'Department', NULL, NULL, false, 4),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'work_location', 'text', 'Work Location', NULL, 'e.g. Binghamton, NY / Remote', false, 5),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'personal_email', 'email', 'Personal Email', 'We''ll send onboarding instructions here', NULL, false, 6),
  ('a0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'phone', 'phone', 'Phone Number', NULL, NULL, false, 7);

-- Onboarding questions: access_profile
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('a0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 'access_profile', 'radio', 'Access Profile', 'This determines the default set of groups and permissions', true, 0,
   '[{"value": "standard_office", "label": "Standard Office Worker (Email, Teams, SharePoint)"},
     {"value": "power_user", "label": "Power User (Full M365 suite)"},
     {"value": "field_worker", "label": "Field Worker (Mobile-only, limited access)"},
     {"value": "executive", "label": "Executive (Full access + additional security)"},
     {"value": "custom", "label": "Custom (I''ll specify below)"}]'::jsonb);

-- Onboarding questions: m365_license
INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order, data_source) VALUES
  ('a0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 'license_type', 'select', 'License Type', true, 0,
   '{"endpoint": "licenses", "valueField": "skuPartNumber", "labelField": "displayName", "labelSuffix": "({available} available)", "cacheTtl": 300}'::jsonb);

-- Onboarding questions: access_permissions
INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, data_source) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'security_groups', 'multi_select', 'Security Groups', 0,
   '{"endpoint": "securityGroups", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'distribution_lists', 'multi_select', 'Distribution Lists', 1,
   '{"endpoint": "distributionLists", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'teams_groups', 'multi_select', 'Microsoft Teams', 2,
   '{"endpoint": "m365Groups", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb),
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'sharepoint_sites', 'multi_select', 'SharePoint Sites', 3,
   '{"endpoint": "sharepointSites", "valueField": "id", "labelField": "displayName", "cacheTtl": 300}'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, static_options) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'clone_permissions', 'radio', 'Clone permissions from an existing user?', 4,
   '[{"value": "yes", "label": "Yes — clone another user''s groups and permissions"},
     {"value": "no", "label": "No — set up fresh"}]'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, sort_order, data_source, visibility_rules) VALUES
  ('a0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'clone_from_user', 'select', 'Clone from user', 5,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "labelSuffix": "({userPrincipalName})", "cacheTtl": 300}'::jsonb,
   '{"operator": "and", "conditions": [{"field": "clone_permissions", "op": "eq", "value": "yes"}]}'::jsonb);

-- Onboarding questions: special_instructions
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 'additional_notes', 'textarea', 'Additional Notes', 'Anything else we should know about this onboarding?', 'e.g. Special software needs, VPN access, building access badge...', 0);


-- ============================================================
-- 2. OFFBOARDING SCHEMA
-- ============================================================

INSERT INTO form_schemas (id, type, version, status, name, description, sections, created_by, published_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'offboarding',
  1,
  'published',
  'Default Offboarding v1',
  'Standard employee offboarding form with data handling and device options',
  '[]'::jsonb,
  'system',
  NOW()
);

-- Offboarding sections
INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'employee_details', 'Employee Details', 'Information about the departing employee', 0),
  ('b0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440001', 'urgency_type', 'Urgency & Timeline', 'How urgent is this offboarding?', 1),
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'data_handling', 'Data & Email Handling', 'What should happen with the employee''s data and email?', 2),
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'device_handling', 'Device Handling', 'What should happen with the employee''s devices?', 3),
  ('b0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440001', 'special_instructions', 'Special Instructions', NULL, 4);

-- Offboarding questions: employee_details (user_select + last_day)
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, data_source) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'employee_to_offboard', 'user_select', 'Select Employee', 'Search for the employee being offboarded', true, 0,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "labelSuffix": "({userPrincipalName})", "cacheTtl": 300, "autoFill": {"first_name": "givenName", "last_name": "surname", "work_email": "userPrincipalName"}}'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 'last_day', 'date', 'Last Working Day', true, 1);

-- Offboarding questions: urgency_type
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440001', 'urgency_type', 'radio', 'Urgency Type', 'This determines how quickly access will be revoked', true, 0,
   '[{"value": "standard", "label": "Standard (process on last day)"},
     {"value": "planned_departure", "label": "Planned Departure (gradual access reduction)"},
     {"value": "immediate_termination", "label": "Immediate Termination (revoke all access now)"}]'::jsonb);

-- Offboarding questions: data_handling
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'data_handling', 'radio', 'Data Handling', 'What should happen with the employee''s mailbox and OneDrive?', true, 0,
   '[{"value": "keep_accessible", "label": "Keep accessible (convert to shared mailbox)"},
     {"value": "forward_to_manager", "label": "Forward email to manager"},
     {"value": "transfer_to_manager", "label": "Transfer all data to manager"},
     {"value": "delete_after_30_days", "label": "Delete after 30-day retention"}]'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, data_source, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'forward_email_to', 'select', 'Forward email to', 'Who should receive this employee''s email going forward?', 1,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "cacheTtl": 300}'::jsonb,
   '{"operator": "or", "conditions": [{"field": "data_handling", "op": "eq", "value": "forward_to_manager"}, {"field": "data_handling", "op": "eq", "value": "transfer_to_manager"}]}'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, data_source, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440001', 'delegate_access_to', 'select', 'Delegate access to', 'Who should get access to the shared mailbox?', 2,
   '{"endpoint": "users", "valueField": "userPrincipalName", "labelField": "displayName", "cacheTtl": 300}'::jsonb,
   '{"operator": "and", "conditions": [{"field": "data_handling", "op": "eq", "value": "keep_accessible"}]}'::jsonb);

-- Offboarding questions: device_handling
INSERT INTO form_questions (section_id, schema_id, key, type, label, is_required, sort_order, static_options) VALUES
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'device_handling', 'radio', 'Device Handling', true, 0,
   '[{"value": "return_to_office", "label": "Employee will return device to office"},
     {"value": "remote_wipe", "label": "Remote wipe the device"},
     {"value": "keep_device", "label": "Employee keeps the device (wipe company data only)"}]'::jsonb);

INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, static_options, visibility_rules) VALUES
  ('b0000001-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440001', 'wipe_confirmation', 'checkbox', 'I confirm that the remote wipe will erase ALL data on the device', 'This action cannot be undone. The device will be factory reset remotely.', 1,
   NULL,
   '{"operator": "and", "conditions": [{"field": "device_handling", "op": "eq", "value": "remote_wipe"}]}'::jsonb);

-- Offboarding questions: special_instructions
INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440001', 'additional_notes', 'textarea', 'Additional Notes', 'Anything else we should know about this offboarding?', 'e.g. Legal hold on data, specific apps to revoke, forwarding rules...', 0);

COMMIT;
