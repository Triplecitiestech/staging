-- ============================================================
-- Question Engine Tables — Phase 1
-- Run manually via raw SQL (not Prisma-managed)
-- All columns use snake_case to match hr_requests convention
-- ============================================================

-- ============================================================
-- FORM SCHEMA VERSIONS (global templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS form_schemas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,               -- 'onboarding' | 'offboarding'
  version         INT NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'archived'
  name            TEXT NOT NULL,               -- e.g. "Default Onboarding v3"
  description     TEXT,
  sections        JSONB NOT NULL DEFAULT '[]', -- array of section definitions
  created_by      TEXT,                        -- staff email
  published_at    TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(type, version)
);

CREATE INDEX IF NOT EXISTS idx_form_schemas_type_status ON form_schemas(type, status);

-- ============================================================
-- FORM SECTIONS (within a schema)
-- ============================================================
CREATE TABLE IF NOT EXISTS form_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,               -- e.g. 'employee_details', 'access_profile'
  title           TEXT NOT NULL,               -- display title
  description     TEXT,                        -- section help text
  sort_order      INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(schema_id, key)
);

CREATE INDEX IF NOT EXISTS idx_form_sections_schema ON form_sections(schema_id, sort_order);

-- ============================================================
-- FORM QUESTIONS (within a section)
-- ============================================================
CREATE TABLE IF NOT EXISTS form_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL REFERENCES form_sections(id) ON DELETE CASCADE,
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,               -- unique answer key: 'first_name', 'license_type'
  type            TEXT NOT NULL,               -- text, textarea, email, phone, date, select, multi_select, radio, checkbox, heading, info
  label           TEXT NOT NULL,               -- display label
  help_text       TEXT,                        -- optional help/description below field
  placeholder     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  default_value   TEXT,                        -- string representation of default
  sort_order      INT NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,

  -- Validation rules (JSON)
  validation      JSONB,                       -- { minLength, maxLength, pattern, min, max }

  -- Options for select/radio/checkbox types
  static_options  JSONB,                       -- [{ value, label }] for static options

  -- Dynamic data source binding (for M365 data)
  data_source     JSONB,                       -- { endpoint, valueField, labelField, cacheTtl, filters }

  -- Conditional visibility rules
  visibility_rules JSONB,                      -- { conditions: [...], operator: 'and'|'or' }

  -- Automation mapping
  automation_key  TEXT,                         -- maps to automation action key

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(schema_id, key)
);

CREATE INDEX IF NOT EXISTS idx_form_questions_section ON form_questions(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_form_questions_schema ON form_questions(schema_id);

-- ============================================================
-- CUSTOMER FORM OVERRIDES
-- Sparse override layer — only stores what differs per customer
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_form_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,               -- references companies.id
  type            TEXT NOT NULL,               -- 'onboarding' | 'offboarding'
  base_schema_id  UUID NOT NULL REFERENCES form_schemas(id),
  is_enabled      BOOLEAN NOT NULL DEFAULT true,

  -- Section overrides: hide/reorder global sections
  section_overrides JSONB DEFAULT '[]',        -- [{ sectionKey, hidden, sortOrder, titleOverride }]

  -- Question overrides: hide/modify global questions
  question_overrides JSONB DEFAULT '[]',       -- [{ questionKey, hidden, labelOverride, helpTextOverride, requiredOverride, defaultOverride }]

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(company_id, type)
);

-- ============================================================
-- CUSTOMER CUSTOM QUESTIONS
-- Per-customer questions added on top of the global schema
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_custom_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  config_id       UUID NOT NULL REFERENCES customer_form_configs(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,               -- which section to attach to (can reference global or custom section)
  key             TEXT NOT NULL,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  help_text       TEXT,
  placeholder     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  default_value   TEXT,
  sort_order      INT NOT NULL DEFAULT 100,    -- high default so custom Qs appear after global Qs
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

-- ============================================================
-- CUSTOMER CUSTOM SECTIONS
-- Per-customer sections added to the form
-- ============================================================
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

-- ============================================================
-- AUTOMATION ACTION MAPPINGS
-- Maps answer values to backend automation actions
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,               -- 'onboarding' | 'offboarding'
  company_id      UUID,                        -- NULL = global default
  trigger_key     TEXT NOT NULL,               -- question key or composite key
  trigger_value   TEXT,                        -- answer value that activates this (NULL = any non-empty)
  action_type     TEXT NOT NULL,               -- see Automation Action Types
  action_config   JSONB NOT NULL,             -- action-specific configuration
  priority        INT NOT NULL DEFAULT 0,      -- execution order
  is_enabled      BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_mappings_type ON automation_mappings(type, company_id);

-- ============================================================
-- FORM LINKS (for Thread integration / secure sharing)
-- ============================================================
CREATE TABLE IF NOT EXISTS form_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  type            TEXT NOT NULL,               -- 'onboarding' | 'offboarding'
  token           TEXT NOT NULL UNIQUE,        -- secure random token
  pre_fill        JSONB,                       -- pre-filled answer values
  created_by      TEXT,                        -- staff email or 'thread'
  source          TEXT DEFAULT 'manual',       -- 'manual' | 'thread' | 'api'
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,                 -- set when form is submitted
  request_id      UUID,                        -- linked to hr_requests after submission

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_links_token ON form_links(token);
CREATE INDEX IF NOT EXISTS idx_form_links_company ON form_links(company_id, type);
