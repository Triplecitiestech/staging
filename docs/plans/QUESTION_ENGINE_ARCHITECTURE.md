# Question Engine Architecture — Triple Cities Tech

> Version: 1.0 | Date: 2026-03-20
> Status: Architecture Design — Ready for Implementation

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Question Engine Design](#2-question-engine-design)
3. [Admin Model — Global Defaults + Per-Customer Overrides](#3-admin-model)
4. [API Structure](#4-api-structure)
5. [Thread Integration](#5-thread-integration)
6. [Automation Mapping Layer](#6-automation-mapping-layer)
7. [Frontend Rendering Strategy](#7-frontend-rendering-strategy)
8. [Admin UI Design](#8-admin-ui-design)
9. [Example JSON Structures](#9-example-json-structures)
10. [Migration Plan](#10-migration-plan)

---

## 1. Database Schema

All tables use **snake_case** columns (created via raw SQL migration, not Prisma-managed). This matches the existing `hr_requests`, `hr_request_steps`, `hr_audit_logs` convention.

### Core Tables

```sql
-- ============================================================
-- FORM SCHEMA VERSIONS (global templates)
-- ============================================================
CREATE TABLE form_schemas (
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

-- Index for quick lookups
CREATE INDEX idx_form_schemas_type_status ON form_schemas(type, status);

-- ============================================================
-- FORM SECTIONS (within a schema)
-- Stored inline in form_schemas.sections JSONB, but we also
-- have a normalized table for admin queries and reordering.
-- ============================================================
CREATE TABLE form_sections (
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

CREATE INDEX idx_form_sections_schema ON form_sections(schema_id, sort_order);

-- ============================================================
-- FORM QUESTIONS (within a section)
-- ============================================================
CREATE TABLE form_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL REFERENCES form_sections(id) ON DELETE CASCADE,
  schema_id       UUID NOT NULL REFERENCES form_schemas(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,               -- unique answer key: 'first_name', 'license_type'
  type            TEXT NOT NULL,               -- see Question Types below
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

CREATE INDEX idx_form_questions_section ON form_questions(section_id, sort_order);
CREATE INDEX idx_form_questions_schema ON form_questions(schema_id);

-- ============================================================
-- CUSTOMER FORM OVERRIDES
-- Sparse override layer — only stores what differs per customer
-- ============================================================
CREATE TABLE customer_form_configs (
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
CREATE TABLE customer_custom_questions (
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

CREATE INDEX idx_customer_custom_questions_config ON customer_custom_questions(config_id);

-- ============================================================
-- CUSTOMER CUSTOM SECTIONS
-- Per-customer sections added to the form
-- ============================================================
CREATE TABLE customer_custom_sections (
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
CREATE TABLE automation_mappings (
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

CREATE INDEX idx_automation_mappings_type ON automation_mappings(type, company_id);

-- ============================================================
-- FORM LINKS (for Thread integration / secure sharing)
-- ============================================================
CREATE TABLE form_links (
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

CREATE INDEX idx_form_links_token ON form_links(token);
CREATE INDEX idx_form_links_company ON form_links(company_id, type);
```

### Question Types

| Type | Description | Options Source |
|------|-------------|---------------|
| `text` | Single-line text input | — |
| `textarea` | Multi-line text input | — |
| `email` | Email input with validation | — |
| `phone` | Phone number input | — |
| `date` | Date picker | — |
| `select` | Single-select dropdown | `static_options` or `data_source` |
| `multi_select` | Multi-select checkboxes | `static_options` or `data_source` |
| `radio` | Radio button group | `static_options` |
| `checkbox` | Single boolean checkbox | — |
| `heading` | Non-input section heading | — |
| `info` | Informational text block | — |

### Visibility Rule Structure

```json
{
  "operator": "and",
  "conditions": [
    {
      "field": "urgency_type",
      "op": "eq",
      "value": "immediate_termination"
    },
    {
      "field": "department",
      "op": "in",
      "value": ["IT", "Finance"]
    }
  ]
}
```

Supported operators: `eq`, `neq`, `in`, `nin`, `contains`, `not_empty`, `empty`

---

## 2. Question Engine Design

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  Form Renderer                   │
│              (React Client Component)            │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Section 1 │  │ Section 2 │  │  Section N   │  │
│  │ Questions │  │ Questions │  │  Questions   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ answers state
                      ▼
┌─────────────────────────────────────────────────┐
│               Visibility Engine                  │
│         (evaluates rules per question)           │
│                                                  │
│  for each question:                              │
│    if visibility_rules → evaluate(answers)       │
│    return visible: true/false                    │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│               Form Config API                    │
│        GET /api/forms/config?company=X&type=Y    │
│                                                  │
│  1. Load published global schema for type        │
│  2. Load customer_form_configs for company+type  │
│  3. Merge: global sections + overrides           │
│  4. Add customer custom sections/questions       │
│  5. Resolve data_source bindings (M365 data)     │
│  6. Return merged form config                    │
└─────────────────────────────────────────────────┘
```

### Merge Algorithm

The merge follows a three-layer inheritance model:

1. **Global Published Schema** — the base template
2. **Customer Overrides** — sparse edits (hide sections, change labels, reorder)
3. **Customer Custom Additions** — new sections and questions

```
mergedForm = {
  sections: globalSchema.sections
    .filter(s => !overrides.find(o => o.sectionKey === s.key && o.hidden))
    .map(s => ({
      ...s,
      ...overrides.find(o => o.sectionKey === s.key),  // apply overrides
      questions: s.questions
        .filter(q => !questionOverrides.find(o => o.questionKey === q.key && o.hidden))
        .map(q => ({
          ...q,
          ...questionOverrides.find(o => o.questionKey === q.key),  // apply overrides
        }))
        .concat(customQuestions.filter(cq => cq.section_key === s.key))  // add custom Qs
        .sort(byOrder)
    }))
    .concat(customSections)  // add custom sections
    .sort(byOrder)
}
```

### M365 Data Source Resolution

When a question has a `data_source` binding, the form config API resolves it at request time:

```json
{
  "key": "license_type",
  "type": "select",
  "label": "Microsoft 365 License",
  "data_source": {
    "endpoint": "licenses",
    "valueField": "skuPartNumber",
    "labelField": "displayName",
    "labelSuffix": "({available} available)",
    "cacheTtl": 300,
    "filters": { "hasAvailable": true }
  }
}
```

The API calls the existing `/api/hr/m365-data` endpoint (or the Graph client directly) and maps the response to `[{ value, label }]` options. The M365 data is cached per-tenant with configurable TTL.

---

## 3. Admin Model

### Global Default Management

TCT admins manage the global question sets at `/admin/settings/form-builder`.

**Capabilities:**
- Create new schema versions (draft)
- Edit sections: add, remove, reorder, rename
- Edit questions: add, remove, reorder, change type/label/validation/options
- Edit conditional visibility rules
- Preview the form as a customer would see it
- Publish a draft (makes it the active global schema)
- Archive old versions
- See which customers are using which schema version
- Breaking change detection before publish

**Version Lifecycle:**
```
draft → published → archived
         ↓
    (only one published per type at a time)
```

### Per-Customer Customization

TCT admins customize per-customer at `/admin/companies/{id}/form-config`.

**Capabilities:**
- Pin customer to a specific global schema version
- Hide global sections or questions
- Override labels, help text, required/optional, defaults
- Reorder sections and questions
- Add customer-specific sections
- Add customer-specific questions (attached to any section)
- Define customer-specific conditional logic
- Preview the merged form as this customer would see it
- Test conditional logic

### Override Resolution Order

```
1. Global question definition (from published schema)
2. Customer override (sparse — only changed fields)
3. Customer custom questions (appended)
```

If a customer override exists for `labelOverride`, it replaces the global `label`. If `labelOverride` is null, the global label is used. This "sparse override" pattern means customers only store what differs — no full copy of the global schema.

---

## 4. API Structure

### Form Config API

```
GET  /api/forms/config?companySlug=X&type=onboarding&email=Y
     → Returns the merged form config for rendering
     → Requires valid portal session (SSO) or form link token
     → Resolves M365 data sources

GET  /api/forms/config/preview?companyId=X&type=onboarding
     → Admin-only: returns merged form config for preview
     → Requires NextAuth admin session
```

### Admin API — Global Schema

```
GET    /api/admin/forms/schemas?type=onboarding
       → List all schema versions for a type

GET    /api/admin/forms/schemas/:id
       → Get a specific schema with sections and questions

POST   /api/admin/forms/schemas
       → Create a new draft schema (optionally cloned from existing)

PUT    /api/admin/forms/schemas/:id
       → Update a draft schema (sections, questions)

POST   /api/admin/forms/schemas/:id/publish
       → Publish a draft schema (archives the current published one)

DELETE /api/admin/forms/schemas/:id
       → Delete a draft schema (cannot delete published/archived)
```

### Admin API — Per-Customer Config

```
GET    /api/admin/companies/:id/form-config?type=onboarding
       → Get customer form config (overrides + custom questions)

PUT    /api/admin/companies/:id/form-config
       → Save customer form config (overrides + custom questions + custom sections)

POST   /api/admin/companies/:id/form-config/preview
       → Preview the merged form as this customer sees it
```

### Form Submission

```
POST   /api/hr/submit
       → (existing endpoint — already works)
       → Accepts answers from the question engine form
       → Creates hr_request, fires background processing
```

### Form Links (Thread Integration)

```
POST   /api/forms/links
       → Create a secure form link (admin or Thread webhook)
       → Body: { companyId, type, preFill?, expiresInMinutes? }
       → Returns: { url, token, expiresAt }

GET    /api/forms/links/:token
       → Validate a form link token
       → Returns: { valid, companySlug, type, preFill }
```

---

## 5. Thread Integration

### Recommendation: Link-Based Flow

**Embedding forms directly in Thread is not practical** for this use case. Reasons:
- Thread's interface is optimized for chat/messaging, not complex multi-step forms
- Dynamic M365 data (dropdowns populated from Graph API) requires real-time API calls
- Conditional branching needs client-side state management
- Form state would be lost if the Thread conversation is interrupted

**Link-based flow is the production-grade approach**, and Thread's own architecture supports this via Magic Intents.

### Flow

```
Customer → Thread: "I need to offboard John Smith"
                ↓
Thread Magic Intent detects "offboarding" intent
                ↓
Thread webhook → POST /api/forms/links
  {
    companyId: "<detected from Thread contact>",
    type: "offboarding",
    preFill: { first_name: "John", last_name: "Smith" },
    source: "thread"
  }
                ↓
API returns: { url: "https://portal.triplecitiestech.com/form/abc123...", token: "abc123..." }
                ↓
Thread responds to customer:
  "I've prepared an offboarding form for John Smith.
   Please complete the details here: [Offboarding Form](url)
   This link expires in 24 hours."
                ↓
Customer clicks link → SSO login → pre-filled form → submit
                ↓
hr_request created → Autotask ticket → automation pipeline
```

### Thread Webhook Endpoint

```
POST /api/integrations/thread/webhook
Headers: x-thread-signature: <HMAC>
Body: {
  event: "intent_detected",
  intent: "offboard_employee",
  company: { name: "kflorance", threadId: "..." },
  extracted: { employeeName: "John Smith" },
  conversationId: "..."
}
```

The webhook handler:
1. Validates the HMAC signature
2. Maps the Thread company to a TCT company slug
3. Generates a secure form link
4. Returns a response message for Thread to send to the customer

### Form Link Portal Route

Add a new route: `/form/[token]` that:
1. Validates the token against `form_links` table
2. Checks expiration
3. Redirects to SSO login if no session
4. Loads the form with pre-filled data
5. On submission, marks the link as used and links to the hr_request

---

## 6. Automation Mapping Layer

### Design Principle

Answers map to **action types** via configurable rules. The mapping is:
- **Not hardcoded per customer** where possible
- **Global defaults** cover common patterns
- **Per-customer overrides** handle special cases

### Action Types

| Action Type | Description | Triggered By |
|-------------|-------------|-------------|
| `create_ticket` | Create Autotask ticket | Always (on any submission) |
| `revoke_sessions` | Immediately revoke all M365 sessions | urgency_type = 'immediate_termination' |
| `disable_account` | Disable M365 account | urgency_type IN ('immediate_termination', 'standard') |
| `convert_to_shared` | Convert mailbox to shared | data_handling = 'keep_accessible' |
| `forward_email` | Set up email forwarding | data_handling = 'forward_to_manager' |
| `transfer_onedrive` | Transfer OneDrive to manager | data_handling IN ('transfer_to_manager', 'keep_accessible') |
| `remove_groups` | Remove from all M365 groups | Always (offboarding) |
| `remove_licenses` | Remove M365 licenses | Always (offboarding, after grace period) |
| `wipe_devices` | Remote wipe Intune devices | device_handling = 'wipe' |
| `create_user` | Create M365 user account | Always (onboarding) |
| `assign_license` | Assign M365 license | license_type is selected |
| `add_to_groups` | Add to security/distro groups | groups selected |
| `clone_permissions` | Clone another user's group memberships | clone_permissions = 'yes' |

### Mapping Configuration

```json
{
  "trigger_key": "urgency_type",
  "trigger_value": "immediate_termination",
  "action_type": "revoke_sessions",
  "action_config": {
    "graph_method": "revokeSignInSessions",
    "target": "{{answers.work_email}}",
    "notify_admin": true,
    "priority": 0
  }
}
```

Template variables (`{{answers.field_key}}`) are resolved at execution time from the submitted answers.

### Execution Pipeline

```
Submit → hr_request (status: pending)
           ↓
       process route picks up
           ↓
       1. Create Autotask ticket (always first)
           ↓
       2. Load automation_mappings for this type + company
           ↓
       3. Evaluate each mapping against submitted answers
           ↓
       4. Execute matching actions in priority order
           ↓
       5. Log each step to hr_request_steps
           ↓
       6. Update ticket with completion notes
           ↓
       hr_request (status: completed)
```

---

## 7. Frontend Rendering Strategy

### Form Renderer Component

A single `<FormRenderer>` component renders any form config. It receives the merged config from the API and manages:
- Step-by-step wizard navigation (one section per step)
- Answer state (React `useState`)
- Visibility evaluation (runs rules engine on each answer change)
- Dynamic option loading (M365 data already resolved by API)
- Validation (per-question rules)
- Submission

```tsx
// Usage in portal
<FormRenderer
  config={mergedFormConfig}      // from API
  companySlug="kflorance"
  submitterEmail="kurtis@kflorance.com"
  submitterName="Kurtis Florance"
  preFill={preFillData}          // from form link
  onSubmit={handleSubmit}
/>
```

### Progressive Disclosure

- Each section is a "step" in the wizard
- Only visible questions are counted for progress
- Non-technical language throughout
- Help text expandable on click
- Conditional questions appear smoothly with animation

### Step-by-Step Flow (Customer Experience)

**Onboarding:**
```
Step 1: Employee Details (name, start date, title, department)
Step 2: Role & Access (access profile selection — affects what's shown next)
Step 3: Microsoft 365 License (dynamic from Graph)
Step 4: Access & Permissions (groups, teams, SharePoint — dynamic from Graph)
Step 5: Special Instructions (notes, approvals)
Step 6: Review & Submit
```

**Offboarding:**
```
Step 1: Employee Details (name, email, last day)
Step 2: Urgency (standard, immediate termination, planned departure)
Step 3: Data Handling (keep accessible, forward, transfer, delete)
Step 4: Access Transfer (conditional — who gets access to what)
Step 5: Device Handling (return, wipe, keep)
Step 6: Special Instructions
Step 7: Review & Submit
```

---

## 8. Admin UI Design

### Global Form Builder (`/admin/settings/form-builder`)

**Layout:** Two-panel
- Left: Section tree (drag to reorder)
- Right: Question editor for selected section

**Features:**
- Drag-and-drop section and question reordering
- Click to edit any field inline
- "Add Section" / "Add Question" buttons
- Conditional logic builder (visual: "Show this question when [field] [operator] [value]")
- Live preview panel (shows form as customer sees it)
- Version history with diff view
- "Publish" button with breaking change warnings
- "Clone to New Draft" for safe iteration

### Per-Customer Config (`/admin/companies/{id}/form-config`)

**Layout:** Merged form preview with override indicators
- Global questions shown with a "global" badge
- Overridden fields highlighted in a different color
- Custom questions shown with a "custom" badge
- Toggle to hide/show any global section or question
- Click to override label, help text, required status
- "Add Custom Section" / "Add Custom Question" buttons
- "Preview as Customer" button opens the exact form they'd see

---

## 9. Example JSON Structures

### Global Default Schema (Onboarding)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "onboarding",
  "version": 1,
  "status": "published",
  "name": "Default Onboarding v1",
  "sections": [
    {
      "key": "employee_details",
      "title": "Employee Details",
      "description": "Basic information about the new employee",
      "sortOrder": 0,
      "questions": [
        {
          "key": "first_name",
          "type": "text",
          "label": "First Name",
          "isRequired": true,
          "sortOrder": 0
        },
        {
          "key": "last_name",
          "type": "text",
          "label": "Last Name",
          "isRequired": true,
          "sortOrder": 1
        },
        {
          "key": "start_date",
          "type": "date",
          "label": "Start Date",
          "helpText": "When should the employee's account be ready?",
          "isRequired": true,
          "sortOrder": 2
        },
        {
          "key": "job_title",
          "type": "text",
          "label": "Job Title",
          "sortOrder": 3
        },
        {
          "key": "department",
          "type": "text",
          "label": "Department",
          "sortOrder": 4
        },
        {
          "key": "work_location",
          "type": "text",
          "label": "Work Location",
          "placeholder": "e.g. Binghamton, NY / Remote",
          "sortOrder": 5
        },
        {
          "key": "personal_email",
          "type": "email",
          "label": "Personal Email",
          "helpText": "We'll send onboarding instructions here",
          "sortOrder": 6
        },
        {
          "key": "phone",
          "type": "phone",
          "label": "Phone Number",
          "sortOrder": 7
        }
      ]
    },
    {
      "key": "access_profile",
      "title": "Role & Access Profile",
      "description": "What kind of access does this employee need?",
      "sortOrder": 1,
      "questions": [
        {
          "key": "access_profile",
          "type": "radio",
          "label": "Access Profile",
          "helpText": "This determines the default set of groups and permissions",
          "isRequired": true,
          "staticOptions": [
            { "value": "standard_office", "label": "Standard Office Worker (Email, Teams, SharePoint)" },
            { "value": "power_user", "label": "Power User (Full M365 suite)" },
            { "value": "field_worker", "label": "Field Worker (Mobile-only, limited access)" },
            { "value": "executive", "label": "Executive (Full access + additional security)" },
            { "value": "custom", "label": "Custom (I'll specify below)" }
          ],
          "sortOrder": 0
        }
      ]
    },
    {
      "key": "m365_license",
      "title": "Microsoft 365 License",
      "sortOrder": 2,
      "questions": [
        {
          "key": "license_type",
          "type": "select",
          "label": "License Type",
          "isRequired": true,
          "dataSource": {
            "endpoint": "licenses",
            "valueField": "skuPartNumber",
            "labelField": "displayName",
            "labelSuffix": "({available} available)",
            "cacheTtl": 300
          },
          "sortOrder": 0
        }
      ]
    },
    {
      "key": "access_permissions",
      "title": "Access & Permissions",
      "description": "Select the groups, teams, and sites this employee needs access to",
      "sortOrder": 3,
      "questions": [
        {
          "key": "security_groups",
          "type": "multi_select",
          "label": "Security Groups",
          "dataSource": {
            "endpoint": "securityGroups",
            "valueField": "id",
            "labelField": "displayName",
            "cacheTtl": 300
          },
          "sortOrder": 0
        },
        {
          "key": "distribution_lists",
          "type": "multi_select",
          "label": "Distribution Lists",
          "dataSource": {
            "endpoint": "distributionLists",
            "valueField": "id",
            "labelField": "displayName",
            "cacheTtl": 300
          },
          "sortOrder": 1
        },
        {
          "key": "teams_groups",
          "type": "multi_select",
          "label": "Microsoft Teams",
          "dataSource": {
            "endpoint": "m365Groups",
            "valueField": "id",
            "labelField": "displayName",
            "cacheTtl": 300
          },
          "sortOrder": 2
        },
        {
          "key": "sharepoint_sites",
          "type": "multi_select",
          "label": "SharePoint Sites",
          "dataSource": {
            "endpoint": "sharepointSites",
            "valueField": "id",
            "labelField": "displayName",
            "cacheTtl": 300
          },
          "sortOrder": 3
        },
        {
          "key": "clone_permissions",
          "type": "radio",
          "label": "Clone permissions from an existing user?",
          "staticOptions": [
            { "value": "yes", "label": "Yes — clone another user's groups and permissions" },
            { "value": "no", "label": "No — set up fresh" }
          ],
          "sortOrder": 4
        },
        {
          "key": "clone_from_user",
          "type": "select",
          "label": "Clone from user",
          "dataSource": {
            "endpoint": "users",
            "valueField": "userPrincipalName",
            "labelField": "displayName",
            "labelSuffix": "({userPrincipalName})",
            "cacheTtl": 300
          },
          "visibilityRules": {
            "operator": "and",
            "conditions": [
              { "field": "clone_permissions", "op": "eq", "value": "yes" }
            ]
          },
          "sortOrder": 5
        }
      ]
    },
    {
      "key": "special_instructions",
      "title": "Special Instructions",
      "sortOrder": 4,
      "questions": [
        {
          "key": "additional_notes",
          "type": "textarea",
          "label": "Additional Notes",
          "helpText": "Anything else we should know about this onboarding?",
          "placeholder": "e.g. Special software needs, VPN access, building access badge...",
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

### Customer-Specific Override

```json
{
  "companyId": "5b9bb08d-f549-4b49-9cb0-8fbf577995dc",
  "type": "onboarding",
  "baseSchemaId": "550e8400-e29b-41d4-a716-446655440000",
  "sectionOverrides": [
    {
      "sectionKey": "access_profile",
      "titleOverride": "Role Selection"
    }
  ],
  "questionOverrides": [
    {
      "questionKey": "work_location",
      "hidden": true
    },
    {
      "questionKey": "department",
      "requiredOverride": true,
      "helpTextOverride": "Must match your Procore project assignment"
    }
  ]
}
```

### Customer-Specific Custom Questions

```json
[
  {
    "sectionKey": "access_permissions",
    "key": "procore_access",
    "type": "radio",
    "label": "Does this employee need Procore access?",
    "staticOptions": [
      { "value": "yes", "label": "Yes" },
      { "value": "no", "label": "No" }
    ],
    "isRequired": true,
    "sortOrder": 10
  },
  {
    "sectionKey": "access_permissions",
    "key": "cost_center",
    "type": "select",
    "label": "Department Cost Center",
    "staticOptions": [
      { "value": "CC-100", "label": "CC-100 — Administration" },
      { "value": "CC-200", "label": "CC-200 — Operations" },
      { "value": "CC-300", "label": "CC-300 — Field Services" }
    ],
    "sortOrder": 11
  },
  {
    "sectionKey": "access_permissions",
    "key": "construction_software",
    "type": "multi_select",
    "label": "Which construction software should this user access?",
    "staticOptions": [
      { "value": "procore", "label": "Procore" },
      { "value": "bluebeam", "label": "Bluebeam Revu" },
      { "value": "plangrid", "label": "PlanGrid" },
      { "value": "autocad", "label": "AutoCAD" }
    ],
    "visibilityRules": {
      "operator": "and",
      "conditions": [
        { "field": "procore_access", "op": "eq", "value": "yes" }
      ]
    },
    "sortOrder": 12
  }
]
```

### Conditional Logic Example

```json
{
  "key": "forward_email_to",
  "type": "select",
  "label": "Forward email to",
  "helpText": "Who should receive this employee's email going forward?",
  "dataSource": {
    "endpoint": "users",
    "valueField": "userPrincipalName",
    "labelField": "displayName",
    "cacheTtl": 300
  },
  "visibilityRules": {
    "operator": "or",
    "conditions": [
      { "field": "data_handling", "op": "eq", "value": "forward_to_manager" },
      { "field": "data_handling", "op": "eq", "value": "forward_to_specific" }
    ]
  },
  "automationKey": "set_email_forwarding"
}
```

---

## 10. Migration Plan

### Phase 1: Database + API (Week 1)
1. Run migration SQL to create all new tables
2. Seed the default onboarding and offboarding schemas
3. Build form config API (merge algorithm + M365 resolution)
4. Build admin API for schema CRUD

### Phase 2: Form Renderer + Portal (Week 1-2)
5. Build `<FormRenderer>` component
6. Replace current `HrRequestWizard` with `<FormRenderer>` using the config API
7. Ensure backward compatibility with existing hr_requests

### Phase 3: Admin UI (Week 2)
8. Build global form builder at `/admin/settings/form-builder`
9. Build per-customer config at `/admin/companies/{id}/form-config`
10. Add preview functionality

### Phase 4: Thread Integration (Week 3)
11. Build form links system (create, validate, expire)
12. Build `/form/[token]` portal route
13. Build Thread webhook handler
14. Configure Thread Magic Intent for onboarding/offboarding

### Phase 5: Automation Mapping (Week 3-4)
15. Build automation mapping admin UI
16. Extend process route to evaluate mappings
17. Implement M365 provisioning actions (create user, assign license, etc.)
