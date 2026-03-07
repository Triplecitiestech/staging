# AI Self-Healing Debugging Workflow

**Repository**: Triplecitiestech/staging
**Last Updated**: 2026-03-07

This document defines the automated debugging workflow for e2e test failures. When Playwright tests fail, the system captures artifacts and generates structured summaries for Claude to diagnose and fix.

---

## How It Works

```
Test fails → FailureReporter captures artifacts → Debug summary generated
                                                         ↓
                                          test-results/failures/*.json
                                          test-results/failures/*.md
                                                         ↓
                                          Claude reads summary → diagnoses → fixes → retests
```

---

## 1. Artifact Capture

When a Playwright test fails, the custom reporter (`tests/e2e/failure-reporter.ts`) automatically captures:

| Artifact | How | Where |
|---|---|---|
| Screenshot | Playwright `screenshot: 'only-on-failure'` | `test-results/` |
| Video | Playwright `video: 'retain-on-failure'` | `test-results/` |
| Trace | Playwright `trace: 'on-first-retry'` | `test-results/` |
| Error message + stack | From Playwright `TestResult.errors` | `test-results/failures/*.json` |
| Console errors | Captured per-test via `page.on('pageerror')` | `test-results/failures/*.json` |
| Git commit SHA + branch | From `git rev-parse` | `test-results/failures/*.json` |
| Environment | Derived from `PLAYWRIGHT_BASE_URL` | `test-results/failures/*.json` |

---

## 2. Failure Storage

Failures are stored as structured files in `test-results/failures/`:

```
test-results/failures/
  2026-03-07T12-30-00-000Z_homepage-loads-successfully.json   # Full failure record
  2026-03-07T12-30-00-000Z_homepage-loads-successfully.md     # Human-readable summary
  latest-report.json                                          # Consolidated report
```

### JSON Record Fields

```typescript
{
  failure: {
    testName: string        // Test title
    testFile: string        // File path relative to repo root
    url?: string            // Page URL at failure time
    environment: string     // local | preview | production | ci
    errorMessage: string    // Error message
    errorStack?: string     // Stack trace
    consoleErrors?: string[]// Browser console errors
    networkErrors?: string[]// Failed network requests
    screenshotPath?: string // Path to failure screenshot
    tracePath?: string      // Path to Playwright trace
    commitSha?: string      // Git short SHA
    branchName?: string     // Current branch
  },
  summary: {
    whatFailed: string
    whereFailed: string
    symptoms: string[]
    consoleErrors: string[]
    networkFailures: string[]
    probableRootCause: string
    impactedFiles: string[]
    confidence: 'high' | 'medium' | 'low'
    suggestedNextSteps: string[]
  }
}
```

### Database Storage (Future)

The `TestFailure` model in `prisma/schema.prisma` supports database-backed storage with:
- Status tracking (open → investigating → fixed → wont_fix)
- Resolution tracking (resolvedAt, resolvedBy)
- AI-generated fields (summary, rootCauseHypothesis, suggestedFix, impactedFiles)

To enable DB storage, create a migration for the `test_failures` table and update the reporter.

---

## 3. Debug Summary

Each failure generates a structured summary with:

- **What failed** — test name and file
- **Where** — page URL
- **Symptoms** — timeout, missing element, auth failure, 500 error, etc.
- **Console errors** — browser console output
- **Network failures** — failed HTTP requests
- **Probable root cause** — rule-based analysis of error patterns
- **Impacted files** — derived from URL and error type
- **Confidence** — high/medium/low
- **Suggested next steps** — ordered debugging actions

---

## 4. Claude Debugging Workflow

When a test failure is detected, Claude must follow this process:

### Step 1: Read the failure summary
```bash
npm run debug:failures
```
Or read the markdown summary directly from `test-results/failures/`.

### Step 2: Read the associated artifacts
- Review screenshot if available
- Review the error message and stack trace
- Check console errors and network failures

### Step 3: Inspect relevant code
- Read the failing test file
- Read the impacted application files listed in the summary
- Trace the data flow from the failing assertion back to the source

### Step 4: Identify root cause
- Match the error pattern to known categories (timeout, auth, 500, hydration, schema)
- Check if the issue is in the test itself or in the application code
- Check git log for recent changes to impacted files

### Step 5: Propose and implement a fix
- Fix the root cause, not the symptom
- If the test is wrong (e.g., selector changed), fix the test
- If the app is wrong, fix the app code

### Step 6: Rerun the failing test
```bash
npm run test:e2e -- --grep "test name"
```
**A fix is NOT confirmed until the previously failing test passes.**

### Step 7: Report resolution
- Describe what was wrong and what was fixed
- Confirm the test passes
- Clean up failure artifacts: `npm run debug:failures -- clean`

---

## 5. Commands

| Command | Description |
|---|---|
| `npm run test:e2e` | Run all e2e tests |
| `npm run debug:failures` | Show latest failure report |
| `npm run debug:failures -- list` | List all failure artifact files |
| `npm run debug:failures -- show <file>` | Show a specific failure summary |
| `npm run debug:failures -- clean` | Remove all failure artifacts |

---

## 6. Module Boundaries

| Module | Location | Responsibility |
|---|---|---|
| Test runner config | `playwright.config.ts` | Test execution, artifact settings |
| Artifact capture | `tests/e2e/failure-reporter.ts` | Custom reporter, file output |
| Debug summary logic | `src/lib/test-failure-capture.ts` | Pattern analysis, summary generation |
| Database model | `prisma/schema.prisma` → `TestFailure` | Persistent storage (future) |
| CLI tool | `scripts/debug-failures.ts` | Developer-facing failure review |
| Workflow docs | `docs/DEBUGGING_WORKFLOW.md` | This file |

---

## 7. Future Expansion

This system is designed to support:

- **Automatic issue creation** — reporter creates GitHub issues for P0/P1 failures
- **Automatic PR drafts** — Claude generates fix PRs from failure summaries
- **Recurring failure detection** — group duplicate failures by error message pattern
- **Environment-specific dashboards** — filter failures by local/preview/production
- **Scheduled background review** — cron job runs tests and triggers Claude analysis
- **Database-backed storage** — migrate from file-based to `TestFailure` table

These are not built yet but the data model and module boundaries support them.

---

**Rule: A fix is never confirmed until the previously failing test passes.**
