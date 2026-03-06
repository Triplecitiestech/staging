# Engineering Standards

**Repository**: Triplecitiestech/staging
**Last Updated**: 2026-03-06
**Enforced By**: All developers and Claude Code sessions

These are first-class engineering standards for this project. They are mandatory and must be followed in every development session.

---

## 1. Definition of Done

Code is NOT complete when it compiles, builds, or passes lint. Code is complete when:

- The feature works end-to-end as a real user would experience it
- All impacted areas have been tested
- UI behavior has been verified at all breakpoints (mobile, tablet, desktop)
- Database writes/reads have been verified with correct values
- API behavior has been verified (success, error, edge cases)
- Regression testing has been performed on adjacent systems
- Errors and edge cases have been tested
- No test artifacts remain in the database

**Every change must be validated as working software, not just compilable code.**

---

## 2. Mandatory QA Process

For every feature or change, follow this process before marking work as complete:

### 2.1 Feature Testing

Test the feature end-to-end as a real user would:
- Navigate pages
- Click buttons
- Submit forms
- Verify state persistence after refresh
- Verify status transitions work correctly
- Test at all responsive breakpoints

### 2.2 API Testing

Verify all affected API endpoints:
- Success responses return correct data
- Validation errors return proper messages
- Authentication/authorization is enforced
- Unexpected inputs are handled gracefully
- Response shapes match TypeScript types

### 2.3 Database Verification

Confirm database writes are correct:
- Records exist with correct values
- Relationships are properly maintained
- Timestamps are set correctly
- No orphaned records created
- Soft deletes work (no hard deletes)

### 2.4 Regression Testing

Test adjacent systems that may have been affected:
- Shared UI components still work
- Shared services/API helpers still work
- Navigation still functions
- Integrations (Autotask, email, blog) still work
- Other pages that use modified components still render

### 2.5 Edge Case Testing

Test failure scenarios:
- Missing data / null values
- Duplicate data
- Invalid inputs
- Race conditions
- Refresh during workflow
- Double form submissions
- Empty states (no data)
- Large data sets

### 2.6 Browser-Level Simulation

Testing must simulate actual browser interaction:
- If browser automation exists, run it
- If not, simulate realistic user flows
- Verify client-side state management
- Check that `useState` syncs with prop changes via `useEffect`
- Verify absolute-positioned dropdowns aren't clipped

---

## 3. Testing Safety Rules

### 3.1 Email Safety

- **NEVER** send emails to real customer addresses
- Use test-send functionality only
- Send only to safe internal test emails (e.g., dev@triplecitiestech.com)
- Never trigger customer-facing email flows during testing
- Autotask contact emails are REAL customer emails — do not send to them

### 3.2 Blog / Communications Safety

- Do not publish real communications during testing
- Use DRAFT status only for test blog posts
- Never trigger approval emails to real recipients during testing
- Delete all test blog posts when testing is complete

### 3.3 Test Data Cleanup

All test data must be deleted when testing is finished:
- Test audiences
- Test campaigns
- Test communications
- Test blog posts
- Test logs
- Test recipients
- Test companies/contacts

**No test clutter may remain in the database.**

### 3.4 Customer Data Protection

- Never modify real customer records during testing
- Use mock or isolated test data
- If testing requires real data, use read-only operations
- Never delete or update Autotask-synced records for testing purposes

---

## 4. Migration Responsibility

Developers (including Claude Code sessions) are responsible for migration validation:

1. Review migration SQL carefully before applying
2. Confirm it only performs intended schema changes
3. Apply migrations appropriately if the environment allows
4. If migrations cannot be run directly, explain exactly why and what minimal step is required
5. Never offload avoidable migration work to the user
6. Test migrations on preview deployments before production
7. Production migrations must use API endpoints, not Prisma CLI

---

## 5. Validation Report

Whenever a feature or change is completed, produce a structured report:

```
## Validation Report

### A. What was tested
[List features/components tested]

### B. How it was tested
[Describe testing methodology]

### C. Results
[Pass/fail for each test]

### D. Bugs discovered
[List any bugs found during testing]

### E. Fixes applied
[List fixes made]

### F. Remaining limitations
[Any known limitations or issues]

### G. Migration status
[Migration applied/pending/not needed]

### H. Deployment readiness
[Ready/Not ready + reasoning]
```

---

## 6. Code Quality Gates

Before any commit:

1. `npm run build` — must pass
2. `npm run lint` — must pass with zero errors
3. `git diff` review — check for:
   - Broken imports
   - Missing responsive classes
   - TypeScript errors
   - Forbidden colors (see UI_STANDARDS.md)
   - Security vulnerabilities
4. Self-review of all changed files

---

## 7. Ship Cycle

Every change follows this cycle. No steps may be skipped:

```
1. Plan      → Use plan mode for complex tasks. Break into subtasks.
2. Implement → Make the code changes.
3. Verify    → npm run build && npm run lint. Fix any failures.
4. Test      → Full QA process (Section 2 above).
5. Review    → git diff — check for regressions, responsive issues, types.
6. Commit    → Descriptive message, imperative mood.
7. Push      → git push -u origin <branch>. Confirm success.
8. Report    → Provide validation report (Section 5 above).
9. Confirm   → Tell user what deployed and what to verify.
```

If step 3 or 4 fails, return to step 2. Never proceed with a broken build or failing tests.

---

## 8. Error Handling Standards

- Never silently catch and ignore errors
- Always log error details for debugging
- API routes must return structured error responses
- Client-side errors must show user-friendly messages
- Never use empty catch blocks: `try { } catch { }`
- Autotask API errors must be reported, not swallowed

---

## 9. Security Standards

- No command injection, XSS, SQL injection, or OWASP top 10 vulnerabilities
- Validate all user input at system boundaries
- Use parameterized queries (Prisma handles this)
- CSP headers must be maintained in `next.config.js`
- Honeypot fields on public forms
- Rate limiting on sensitive endpoints
- Never expose internal error details to end users

---

## 10. Documentation Standards

When conventions change or new patterns are established:

1. Update CLAUDE.md with the new convention
2. Update relevant standards files (this file, UI_STANDARDS.md, QA_STANDARDS.md)
3. Commit documentation updates alongside code changes
4. Ensure future sessions inherit the knowledge

---

## 11. Customer Portal Standards

### 11.1 Project View Consistency
- The CustomerDashboard component is the canonical project view for customers
- Admin preview (Preview as Customer) and customer portal must render the same component
- Never maintain two separate implementations of the same view

### 11.2 Status Display
- Status badges must always show the format: `Status: <label>` (e.g., "Status: In Progress")
- Never display status without the label prefix

### 11.3 Ticket Timeline
- When a customer clicks a ticket, they must see a chronological timeline including:
  - Ticket description
  - External (customer-visible) communications
  - Customer notes
  - Technician notes marked as customer-visible
  - Time entries with summary notes
  - Ticket status changes
- Internal Autotask notes must NEVER appear in the customer portal
- Each entry must display timestamp, author, and author type

### 11.4 Customer Ticket Replies
- Customers must be able to reply to open tickets from the portal
- Replies create notes in Autotask via the API
- Replies are marked as external/customer-visible
- The portal must refresh the timeline after a reply is sent

### 11.5 Customer Onboarding Journey
- First-time portal users see a guided onboarding overlay
- Steps: Welcome, Navigation, Tickets, Action Items, Completion
- Users can skip at any time
- Completion is recorded in localStorage to prevent repetition

---

## 12. Demo Mode Standards

### 12.1 Purpose
Demo mode allows safe demonstrations without exposing real customer data.
Used for investor demos, partner demos, and presentations.

### 12.2 Demo Company
- Built-in demo company: Contoso Industries
- Demo data includes fake projects, tickets, communications, and progress

### 12.3 Behavior
- When enabled, admin dashboards display demo data
- Real customer data is hidden
- When disabled, normal data returns
- Demo mode toggle is available in the AdminHeader

### 12.4 Data Safety
- Demo mode data is generated in-memory from `src/lib/demo-mode.ts`
- No demo data is written to the database
- No real customer data is modified when demo mode is toggled

---

## 13. Audience & Marketing Standards

### 13.1 Audience Providers
The audience system supports multiple providers:
- Autotask companies (by individual company selection)
- Autotask Contact Action Groups (pre-defined contact groups)
- Manual contact lists
- Future: CSV imports, CRM integrations

### 13.2 Provider Architecture
Each provider must implement:
- `resolveRecipients(criteria)` — returns list of recipients
- `getTargetingOptions()` — returns available targeting options for UI

### 13.3 Navigation
All marketing pages must include AdminHeader for consistent navigation.
All marketing pages must use the ambient gradient background.

---

## 14. UI Color Enforcement

### 14.1 Forbidden Colors (PERMANENT)
The following colors must NEVER appear anywhere in the UI:
- yellow-* classes
- amber-* classes
- gold or gold-like colors
- brown-* or brownish tones
- mustard or yellow-brown combinations

### 14.2 Customer Action Highlighting
When a customer action is required, use:
- red (bg-red-500/*, text-red-*) for urgent attention
- bright orange (bg-orange-500/*, text-orange-*) for important notices
Never use amber/gold for alerts.

### 14.3 Purple Usage
Minimize purple (purple-*) in admin interfaces. Prefer:
- indigo-* for subtle accent/category colors
- rose-* for distinctive action cards
- teal-* for project-related elements

---

**These standards are non-negotiable. Every development session must adhere to them.**
