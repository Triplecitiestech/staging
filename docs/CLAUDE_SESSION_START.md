# Claude Session Startup Checklist

**Every development session must begin by loading these rules before writing any code.**

---

## Required Reading (in order)

### 1. Architecture
**File**: `docs/architecture.md`
- System overview and data flows
- Authentication flow
- Key entity relationships
- Structured logging patterns
- Compliance, SOC, reporting, ticket subsystems

### 2. Codebase map
**File**: `docs/system-map.md`
- Which files own which subsystem
- Component / library / API route inventory

### 3. Data model
**File**: `docs/data-model.md`
- Prisma schema + raw SQL tables
- Entity relationships and data flows

### 4. Engineering Standards
**File**: `docs/coding-standards.md`
- Definition of done (build/lint are NOT completion criteria)
- Mandatory QA process and functional verification
- Testing safety rules (email, blog, customer data)
- Root cause fixing, single source of truth, layer separation
- Sensitive data filtering for customer portals
- Validation report template

### 5. UI Design System
**File**: `docs/UI_STANDARDS.md`
- Forbidden colors (yellow, amber, gold, brown, mustard, orange)
- Approved color palette and component conventions
- Form patterns, loading states, error states
- Status display format (`Status: <label>`)

### 6. QA Standards
**File**: `docs/qa-standards.md`
- Pre-commit checklist
- Feature, API, database, and regression testing checklists
- Severity levels (P0-P3)
- Test data cleanup requirements

### 7. Session state
**Files**: `docs/session-summary.md`, `docs/current-tasks.md`
- Current state, recent changes, key decisions
- Active development work and outstanding items

---

## Session Startup Steps

1. Read the files listed above
2. Run `git status` to understand current branch and state
3. Review `git log --oneline -5` to see recent work
4. Confirm you are on the correct `claude/*` branch
5. Only then begin implementing changes

---

## Completion Criteria Reminder

A task is **not complete** until:
- The feature works end-to-end (not just compiles)
- `npm run build` and `npm run lint` pass
- `npm run test:e2e` passes (when UI or API routes were modified)
- UI verified at mobile, tablet, and desktop breakpoints
- `git diff` reviewed for regressions
- Validation report provided (what changed, what was tested, what was confirmed)
- Changes committed and pushed

**Build + lint passing alone is never sufficient to declare completion.**

### Browserbase Remote Testing
When testing against a deployed preview, use Browserbase for real browser verification:
```bash
BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=xxx \
PLAYWRIGHT_BASE_URL=https://preview.vercel.app \
npm run test:e2e -- --grep @browserbase
```

---

## Quick Reference: What to Read When

| Working on... | Also read |
|---|---|
| Autotask sync | `docs/reference/AUTOTASK_SYNC.md` |
| Customer portal | `docs/reference/CUSTOMER_INVITE_AND_ONBOARDING.md` |
| Blog system | `docs/reference/BLOG_SYSTEM_README.md` |
| Azure AD / auth | `docs/reference/AZURE_AD_SETUP.md` |
| Olujo project | `docs/plans/OLUJO_PROJECT.md` |
| Compliance (overall) | `docs/plans/COMPLIANCE_ARCHITECTURE.md` |
| Compliance workflow / intake | `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md` |
| Compliance remediation / change bundles | `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` |
| Compliance per-control scoring | `docs/COMPLIANCE_PLAYBOOK.md` |
| HR question engine | `docs/plans/QUESTION_ENGINE_ARCHITECTURE.md` |
| Encrypted credentials migration | `docs/runbooks/CREDENTIALS_MIGRATION.md` |
| Incidents / debugging | `docs/runbooks/RUNBOOK.md` |
| Test failure debugging | `docs/runbooks/DEBUGGING_WORKFLOW.md` (if present) |
| Reporting pipeline | `docs/reference/REPORTING_ARCHITECTURE.md` |
| SOC redesign | `docs/plans/SOC_REDESIGN_PLAN.md`, `docs/plans/SOC_REASONING_LAYER_DESIGN.md` |
