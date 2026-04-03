# QA Standards

**Repository**: Triplecitiestech/staging
**Last Updated**: 2026-03-06

This document defines the quality assurance standards for this project. These are mandatory for all development sessions.

---

## Core Principle: Claude Must Own QA

Whenever any feature or change is implemented, full validation and QA must be performed by the implementing developer/agent.

**Completion does NOT mean:**
- Code compiles
- Build passes
- Lint passes

**Completion means:**
- The feature works end-to-end
- All impacted areas were tested
- UI behavior was verified at all breakpoints
- Database writes/reads were verified
- API behavior was verified
- Regression testing was performed
- Errors and edge cases were tested
- All test artifacts were cleaned up

---

## QA Checklist

### Pre-Commit Checklist

- [ ] `npm run build` passes
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run test` passes (unit tests via vitest)
- [ ] `npm run test:e2e` passes (when UI/API routes changed)
- [ ] `git diff` reviewed for issues
- [ ] No forbidden colors in UI (yellow, amber, brown, mustard, gold)
- [ ] No `any` types in TypeScript
- [ ] No unused imports
- [ ] No console.log in production code
- [ ] Responsive design verified (mobile, tablet, desktop)
- [ ] No security vulnerabilities introduced
- [ ] **New fetch() in useEffect has AbortController cleanup**
- [ ] **New API catch blocks return error status, not 200 with empty data**
- [ ] **New mutation endpoints have checkCsrf()**
- [ ] **New auth endpoints have checkRateLimit()**
- [ ] **New cron routes use classifyError() for transient errors**

### Feature Testing Checklist

- [ ] Feature works as expected end-to-end
- [ ] All user flows tested (happy path)
- [ ] Error states tested
- [ ] Empty states tested
- [ ] Loading states verified
- [ ] Form validation works (client + server)
- [ ] Navigation works correctly
- [ ] State persists after page refresh
- [ ] Double-submit prevention works

### API Testing Checklist

- [ ] Success responses verified
- [ ] Error responses verified — **catch blocks return error status codes, not 200 with empty data**
- [ ] Authentication enforced — **route calls `auth()` or `checkSecretAuth()`**
- [ ] Input validation works
- [ ] Response shapes match types
- [ ] Edge cases handled (empty, null, invalid)
- [ ] **CSRF protection on mutation endpoints** — `checkCsrf()` called for customer-facing POST/PUT/PATCH/DELETE
- [ ] **Rate limiting on auth endpoints** — `checkRateLimit()` called for login/password/lookup endpoints
- [ ] **Cron routes handle transient errors** — `classifyError()` used, 200 returned for transient failures

### Database Checklist

- [ ] Records created with correct values
- [ ] Relationships maintained
- [ ] No orphaned records
- [ ] Soft deletes used (no hard deletes)
- [ ] Timestamps correct
- [ ] Unique constraints respected

### Regression Checklist

- [ ] Adjacent components still work
- [ ] Shared services still function
- [ ] Navigation intact
- [ ] Integrations unaffected
- [ ] Other pages using modified code still render

---

## Testing Safety Rules

### Email Safety
- NEVER send to real customer emails
- Use internal test addresses only
- Autotask contact emails are REAL — do not send to them

### Blog / Communications Safety
- Use DRAFT status only for test posts
- Never trigger approval emails to real recipients
- Delete all test posts when done

### Test Data Cleanup
All test data must be removed after testing:
- Test companies, contacts, projects
- Test blog posts, comments
- Test notifications, assignments
- Test logs, sync records

### Customer Data Protection
- Never modify real customer records
- Use mock/isolated test data
- Read-only operations for real data verification

---

## Validation Report Template

Every completed feature must include this report:

```markdown
## Validation Report

### A. What was tested
- [Feature/component 1]
- [Feature/component 2]

### B. How it was tested
- [Method 1: e.g., manual flow testing]
- [Method 2: e.g., API endpoint verification]

### C. Results
| Test | Result |
|------|--------|
| [Test 1] | PASS/FAIL |
| [Test 2] | PASS/FAIL |

### D. Bugs discovered
- [Bug 1 description]
- [Bug 2 description]

### E. Fixes applied
- [Fix 1 description]
- [Fix 2 description]

### F. Remaining limitations
- [Limitation 1]

### G. Migration status
[Applied / Pending / Not needed]

### H. Deployment readiness
[Ready / Not ready — reasoning]
```

---

## Severity Levels

| Severity | Description | Action |
|----------|-------------|--------|
| P0 - Critical | Feature broken, data loss, security issue | Fix immediately, do not ship |
| P1 - High | Major functionality broken | Fix before shipping |
| P2 - Medium | Minor functionality issue | Fix in same session if possible |
| P3 - Low | Cosmetic, minor UX issue | Note for future fix |

---

---

## Stabilization Rules (Added 2026-04-03)

These rules were added after a comprehensive production stabilization audit that found systemic patterns causing regressions and silent failures. **Every new feature or change must follow these rules.**

### New Component Checklist

When creating or modifying a client component that fetches data:

- [ ] **AbortController on every useEffect+fetch** — pass signal to fetch, abort on cleanup
- [ ] **Error state shown to user** — don't silently show empty data on fetch failure
- [ ] **Loading state shown** — spinner or skeleton during data load
- [ ] **AbortError handled in catch** — `if (err instanceof DOMException && err.name === 'AbortError') return`

### New API Route Checklist

When creating or modifying an API route:

- [ ] **Auth enforced** — `auth()` for admin routes, `getPortalSession()` for customer routes, `checkSecretAuth()` for diagnostic routes
- [ ] **CSRF protection** — `checkCsrf()` on customer-facing mutation endpoints
- [ ] **Rate limiting** — `checkRateLimit()` on auth/login endpoints
- [ ] **Error responses use status codes** — never return 200 with empty data in catch blocks
- [ ] **Cron routes classify errors** — `classifyError()` for transient vs permanent, return 200 for transient

### New Cron Job Checklist

When creating a new cron job:

- [ ] **Use `cronHandler()` from `src/lib/cron-wrapper.ts`** if possible — it handles auth, retry, timeout, and transient error classification automatically
- [ ] If not using cronHandler, ensure: auth via `Authorization: Bearer CRON_SECRET`, transient error returns 200, structured logging
- [ ] **Add to `vercel.json`** with appropriate maxDuration
- [ ] **Register in the e2e cron auth test** in `tests/e2e/error-handling.spec.ts`

### Regression Prevention

Before pushing any change:

- [ ] **Run `npm run test`** — all 58+ unit tests must pass
- [ ] **Run `npm run test:e2e`** — all e2e tests must pass
- [ ] **Check for silent failures** — grep your changed files for `catch { }`, `catch () => {}`, or catch blocks returning 200
- [ ] **Check for missing AbortController** — grep your changed component files for `useEffect` + `fetch` without `AbortController`

---

**These QA standards are mandatory. No feature ships without full validation.**
