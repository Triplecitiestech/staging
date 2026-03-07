# Claude Session Startup Checklist

**Every development session must begin by loading these rules before writing any code.**

---

## Required Reading (in order)

### 1. Engineering Standards
**File**: `ENGINEERING_STANDARDS.md`
- Definition of done (build/lint are NOT completion criteria)
- Mandatory QA process and functional verification
- Testing safety rules (email, blog, customer data)
- Root cause fixing, single source of truth, layer separation
- Sensitive data filtering for customer portals
- Validation report template

### 2. UI Design System
**File**: `docs/UI_STANDARDS.md`
- Forbidden colors (yellow, amber, gold, brown, mustard)
- Approved color palette and component conventions
- Form patterns, loading states, error states
- Status display format (`Status: <label>`)

### 3. QA Standards
**File**: `QA_STANDARDS.md`
- Pre-commit checklist
- Feature, API, database, and regression testing checklists
- Severity levels (P0-P3)
- Test data cleanup requirements

### 4. Architecture
**File**: `docs/ARCHITECTURE.md`
- System overview and data flows
- Authentication flow
- Key entity relationships
- Structured logging patterns

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
| Autotask sync | `AUTOTASK_SYNC.md` |
| Customer portal | `ONBOARDING_PORTAL.md` |
| Blog system | `BLOG_SYSTEM_README.md` |
| Azure AD / auth | `AZURE_AD_SETUP.md` |
| Olujo project | `OLUJO_PROJECT.md` |
| Incidents / debugging | `docs/RUNBOOK.md` |
| Test failure debugging | `docs/DEBUGGING_WORKFLOW.md` |
| API reliability | `docs/SELF_HEALING_AND_RELIABILITY.md` |
