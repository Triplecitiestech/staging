# Session Summary

> Last updated: 2026-04-02 (Session 3)
> Branch: `claude/compliance-engine-continue-faa97`
> Previous branch: `claude/fix-unicode-compliance-engine-wnzk8`

## What Was Built This Session

### Override Persistence Across Assessments
- When a new assessment runs, reviewer overrides from the most recent completed assessment are automatically carried forward
- Override reason is prefixed with `[Carried forward]` for audit trail clarity
- `loadPreviousOverrides()` queries the previous assessment's findings for any non-null overrides
- `storeFindings()` now persists override fields (was previously only writing evaluated fields)
- Only the most recent override per control is carried forward (deduped by controlId)

### Customer Portal Compliance Card
- New compliance section in `CustomerDashboard` fetches data from `/api/compliance/portal`
- Shows radial score gauge (color-coded: green >=80%, cyan >=60%, red <60%)
- Displays framework name, pass/fail/review counts, last assessment date
- Expandable view with score trend bar chart and per-control findings list
- Only renders when `compliancePortalEnabled` is true for the company
- Findings filtered to hide `not_applicable` and `not_assessed` controls
- Control IDs displayed as short numbers (e.g., "1.1" not "cis-v8-1.1")

### Multi-Framework Policy Analysis
- `analyzePolicyWithAI` now accepts `frameworkId` parameter (defaults to `cis-v8`)
- Four frameworks defined: CIS v8, CMMC Level 2, HIPAA Security Rule, NIST SP 800-171 Rev 2
- Each framework has its own control list, ID prefix, and format
- POST `/api/compliance/policies` passes `frameworkIds[0]` to the analyzer
- PATCH `/api/compliance/policies` accepts `frameworkId` for re-analysis
- `compliance_policy_analyses` table gets new `frameworkId` column (auto-created)

### CIS 10.3 (Autorun/Autoplay) — Evidence Quality Improvement
- Now checks `microsoft_intune_config` evidence for specific autorun/removable media config profiles
- Searches profile names and descriptions for keywords: autorun, autoplay, removable media, removable storage, USB
- Matching profiles → **high confidence pass** (previously was medium at best)
- No matching profiles but high compliance rate → **medium pass** with note about profiles
- Reports profile count and names in reasoning for audit clarity
- Remediation advice: "Create an explicit Intune configuration profile named 'Disable Autorun'"

## Previous Session Summary (Session 2)

### Critical Fix: Cross-Customer Data Isolation + Platform Mapping
- Platform Mapping system — all 9 MSP collectors updated to use explicit mappings
- Ubiquiti, BCDR, SaaS Protect, EDR, DNSFilter collectors rewritten for customer isolation
- Policy coverage logic fixes, evaluator improvements (11.x, 7.x, 10.2, 9.2, 17.x)
- UI fixes (Unicode, policy timestamps, FormattedReasoning)

## Architecture Notes
- Override persistence uses `loadPreviousOverrides()` — queries previous completed assessment for same company+framework
- `storeFindings` now writes all 12 columns including override fields
- Multi-framework control lists live in `FRAMEWORK_CONTROLS` map in policies route
- CIS 10.3 evaluator checks 3 evidence sources: device compliance, secure score, AND Intune config profiles
- TypeScript: always use `Array.from()` for Set iteration (no downlevelIteration)
