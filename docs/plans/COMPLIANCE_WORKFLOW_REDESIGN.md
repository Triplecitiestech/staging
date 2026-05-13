# Compliance Workflow Redesign

> **Status: Design proposal (2026-05-13).** Companion to [COMPLIANCE_ARCHITECTURE.md](./COMPLIANCE_ARCHITECTURE.md). This document covers (a) the shape of the new bootstrap-plus-cockpit workflow, (b) the consolidation of the three intake/discovery surfaces into one Customer Profile, and (c) the legacy `/admin/compliance` retirement plan with a feature-by-feature destination so nothing is lost.

---

## 1. What's wrong with the current 6-step workflow

The live `/admin/compliance/workflow` page renders a linear 6-step stepper:

| Step | Today |
|------|-------|
| 1 | Prerequisites (M365 setup + autotaskCompanyId) |
| 2 | Tool Configuration (mixes connector setup, deployed-tool toggles, environment Q&A) |
| 3 | Platform Mapping |
| 4 | Initial Assessment |
| 5 | Policy Generation |
| 6 | Final Assessment |

Problems:

1. **Linear and rigid.** Real compliance work is cyclical: re-run quarterly, fix one finding, re-run, generate a new policy, re-run. The "Final Assessment" is a UI label that pretends the customer is done. They are never done.

2. **Three intake surfaces collect overlapping data.**
   - `ComplianceSetupWizard.tsx` (separate page at `/admin/compliance/setup`) asks environment discovery questions
   - `policy_org_profiles.answers` (JSONB) collects 70+ org-profile questions via `PolicyGenerationDashboard.tsx`
   - `customer_context_answers` (referenced via `/api/compliance/customer-context`) collects env-aware N/A inputs inside workflow Step 2
   - "Does customer have on-prem servers?" is asked in at least two of these.

3. **Policy ingestion is missing from the workflow.** `PolicyManager.tsx` (upload + SharePoint + AI analysis) is only reachable from the legacy `/admin/compliance` tabbed dashboard, not from `/admin/compliance/workflow`. The initial assessment therefore runs **before** existing customer policies are loaded — so the assessment thinks the customer has no policy coverage when they actually have a SharePoint full of them.

4. **Step status is computed, but UI presents it as if it were persisted state.** The visual progression implies "you have completed steps 1–4, do step 5 next". Underneath, status is re-derived from row counts on every load. This is fine in principle but the UI metaphor obscures it.

5. **Two bugs in the underlying schema.**
   - `compliance_company_tools` is queried by `/api/compliance/workflow-status` and `/api/compliance/registry/company-tools` but is not created by `src/lib/compliance/ensure-tables.ts`.
   - `customer_context_answers` similarly absent from `ensure-tables.ts`.

6. **"Final assessment" is a phase concept, not a schema concept.** The engine has `compareAssessments(currentId, previousId)` returning deltas — there is no need for a "final" stage; latest-vs-baseline solves the same problem more flexibly.

7. **Two overlapping policy UIs and two overlapping assessment-result views.** `PolicyManager.tsx` (analysis) and `PolicyGenerationDashboard.tsx` (generation) both manipulate `compliance_policies` from different navigation paths. `AssessmentResults.tsx` exists standalone and is also inlined in the stepper.

---

## 2. New workflow shape — bootstrap plus cockpit

### 2.1 Bootstrap (run once per customer, can be revisited)

Bootstrap is a finite sequence with explicit completion criteria. When all four stages are complete, the customer is "ready for ongoing compliance operations" and the cockpit becomes the default view.

```
┌─────────────────────────────────────────────────────────────────┐
│  Stage A — Customer Profile (Discovery)                         │
│  Question engine schema 'customer_profile'. ~70 questions.      │
│  Identity, regulatory scope, operational context, frameworks.   │
│  Complete when: all required questions answered.                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage B — Connections + Inventory + Mappings (parallel)        │
│                                                                  │
│  B.1 Integration Connections                                    │
│      M365, Datto*, DNSFilter, IT Glue, SaaS Alerts, Ubiquiti…   │
│      Complete when: relevant connectors per Profile = verified. │
│                                                                  │
│  B.2 Tool Inventory                                             │
│      Deployed-tool toggles (compliance_company_tools).          │
│      Complete when: every catalog tool has a known status.      │
│                                                                  │
│  B.3 Platform Mappings                                          │
│      For each connected platform that returned >1 entity,       │
│      map customer to one or more (1:M supported by schema).     │
│      Complete when: every multi-entity platform is mapped.      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage C — Policy Library Ingestion                             │
│  Upload / SharePoint-link existing customer policies.           │
│  AI analysis maps each to controls.                             │
│  Complete when: every catalog policy slug is either uploaded,   │
│  marked "customer has none", or marked "will generate".         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage D — Baseline Assessment                                  │
│  Run engine against framework(s) chosen in Profile.             │
│  Complete when: assessment status = complete, findings written. │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       ╔═════════════╗
                       ║   COCKPIT   ║
                       ╚═════════════╝
```

Note Stage C lands **before** Stage D. This is the key correction: assess against the customer's actual policy posture, not against zero.

### 2.2 Cockpit (permanent operations view)

Default landing for any customer that has completed bootstrap. Surfaces:

- **Posture summary** — latest assessment score, framework, date; last-reassessment date; quick "Re-run" button.
- **Open findings** by severity (critical / high / medium / low / passed / overridden) with disposition counts.
- **Pending changes** — count of staged remediations not yet bundled.
- **Active change bundle** — if one is in flight, show customer status (drafted / awaiting customer / approved / scheduled).
- **Recent activity** — last N audit log entries: assessments run, policies generated, changes deployed, attestations received.
- **Bootstrap freshness** — if Profile hasn't been reviewed in N months, or Policy Library hasn't had a re-ingestion check, surface a soft prompt.
- **Direct links** to: Profile editor, Connections, Policies, Assessments, Findings, Changes, Diagnostics.

The cockpit does **not** require re-running bootstrap to make changes; staff can edit the Profile, re-ingest policies, or run another assessment at any time. Bootstrap is just the "first time setup" path.

### 2.3 What about customers mid-bootstrap?

If bootstrap is incomplete, the cockpit shows a bootstrap progress panel at the top that links into the bootstrap stages. Staff can also reach the cockpit's other surfaces freely — the gate is informational, not blocking. A customer with no assessment can still have policies uploaded; a customer with no policies can still have a tentative assessment run (and it will correctly show low policy coverage).

---

## 3. Customer Profile — consolidation of three intake surfaces into one

### 3.1 Today: three stores, partially overlapping

| Store | Where it's populated | What's in it |
|-------|----------------------|--------------|
| `policy_org_profiles.answers` (JSONB) | `PolicyGenerationDashboard.tsx` org-profile tab | 70+ questions: identity, regulatory scope, operational context, people/roles, review cadences |
| `customer_context_answers` (referenced, not created) | Workflow Step 2 sub-panel | Environment questions: on-prem servers, backup scope, customer type |
| `ComplianceSetupWizard.tsx` UI state | `/admin/compliance/setup` page | Environment toggles (no documented persistence target — likely lost) |

Overlap: "operational context" in #1 includes "remote work allowed?", "BYOD?", "contractors?" — overlaps with #2's environment questions and #3's setup-wizard toggles.

### 3.2 Target: one store via the HR question engine

The HR onboarding/offboarding system (`docs/plans/QUESTION_ENGINE_ARCHITECTURE.md`) already implements schema-driven forms with sections, questions, customer overrides, visibility rules, and persisted responses. **Compliance reuses this engine.**

New objects (no new tables):
- A `form_schemas` row of `type = 'customer_profile'` authored in code.
- Sections (`form_sections`) for: Identity, Regulatory Scope, Operational Context, People & Roles, Review Cadences, Framework Selection.
- Questions (`form_questions`) for each individual prompt, including conditional visibility (e.g., "HIPAA scope?" only visible if "Regulated industry = healthcare").
- Per-customer answers stored in `form_responses` keyed on `(companyId, formSchemaId)`.

### 3.3 Migration plan

1. **Author the schema in code** (new file: `src/lib/compliance/customer-profile-schema.ts`) and seed it on app boot via the existing question-engine seeder.
2. **Backfill from `policy_org_profiles.answers`** — one-time migration script that reads the JSONB blob, maps keys to the new question IDs, writes to `form_responses`. Old table stays in place during transition.
3. **Update every consumer:**
   - Engine N/A logic (`src/lib/compliance/engine.ts`) reads from question-engine responses instead of `policy_org_profiles` / `customer_context_answers`.
   - Policy generation (`src/lib/compliance/policy-generation/generator.ts`) reads from question-engine responses.
   - ComplianceSetupWizard either redirects to the new profile editor or is deleted.
4. **Drop the old surfaces:**
   - `/api/compliance/customer-context` → deprecated; returns the equivalent answers from the question engine for any caller that hasn't migrated.
   - `ComplianceSetupWizard.tsx` → deleted after the profile editor is live.
   - `policy_org_profiles` table → kept but unused, dropped in a later wave after a verification window.

### 3.4 What stays per-policy

`policy_intake_answers` is genuinely per-policy refinement: "for the Acceptable Use Policy, what's the disciplinary escalation path?". This is too small and policy-specific to belong in the Customer Profile, and it doesn't drive engine N/A logic. **Keep this table as-is.** Reduce its question set to truly per-policy items only; anything customer-wide moves to the Profile.

---

## 4. Step-status computation — clarify, don't replace

The current `/api/compliance/workflow-status` route is the right idea (compute from data, don't persist) but the derivation rules need updating for the new stages:

| Stage | Complete when |
|-------|---------------|
| A. Customer Profile | `form_responses` row exists for `(companyId, customer_profile schema)` AND all required questions answered |
| B.1 Connections | Every connector required by the Profile's framework selection is `status = verified` |
| B.2 Inventory | `compliance_company_tools` has a row for every tool in the registry catalog (`deployed` true or false) |
| B.3 Mappings | For every connected platform that returned multiple external entities, ≥1 row exists in `compliance_platform_mappings` |
| C. Policy Library | Every policy slug in `policy_catalog.ts` has either: an uploaded row in `compliance_policies`, or a `policy_generation_records` row with status ≥ drafted, or an explicit "not applicable" marker |
| D. Baseline | At least one `compliance_assessments` row with `status = complete` |

Action item: add `compliance_company_tools` to `ensure-tables.ts` so Stage B.2 doesn't query a missing table.

---

## 5. Comparison and "Final Assessment" — what changes

Today's "Step 6 Final Assessment" stage:
- Forces creation of a second assessment after policies are defined
- Logic: ≥2 assessments AND latest assessment date > latest policy date
- UI labels them "Initial" and "Final"

This concept is **retired** in the new design:

- **No `isFinal` column.** Already true in the schema.
- **No fixed "second" run.** Customers re-assess on whatever cadence makes sense — quarterly is typical but not enforced.
- **Comparison is on-demand from the cockpit.** Any two assessments can be diffed via `engine.compareAssessments(currentId, previousId)` — already implemented; the UI just needs to consume it.
- **Default comparison surface = "latest vs. baseline".** Baseline = the first complete assessment for the chosen framework. Latest = the most recent. Cockpit also allows "latest vs. previous" and arbitrary pair selection.

This is purely a UI change — no migration needed.

---

## 6. Legacy `/admin/compliance` retirement plan

Inventory of every surface in the legacy tabbed dashboard, with its destination in the new structure. The legacy URL is retired only after every item below is confirmed migrated.

| Legacy surface | New home | Notes |
|----------------|----------|-------|
| **Connectors tab** — status + last-collected + error message | Cockpit "Connections" section + `/admin/compliance/[companyId]/connections` | Keep the error-message + retry view; staff use this to debug failed pulls |
| **Connectors raw status / diagnostics** | `/admin/compliance/diagnostics` (TCT-only, not per-customer) | New page; pulls from `compliance_connectors.errorMessage`, `lastCollectedAt`; not exposed to non-admin staff |
| **Assessments tab** — list, run, view | `/admin/compliance/[companyId]/assessments` | List + Run button + drilldown into AssessmentResults |
| **Assessment results (findings table)** | `/admin/compliance/[companyId]/findings` | Standalone — AssessmentResults.tsx is reused, no duplicate component |
| **Evidence raw JSON drilldown** | Drilldown from AssessmentResults `View Evidence` button | TCT-only; not in customer-facing portal. Engineers need this to debug control evaluations. |
| **Platform Mapping tab** | `/admin/compliance/[companyId]/connections` (combined with Connections + Inventory) | UI must support adding multiple rows per platform (schema is 1:M; UI may not currently expose this — verify and fix) |
| **Policy Analysis tab (PolicyManager)** | `/admin/compliance/[companyId]/policies` — "Library" view | Merged with Policy Generation; one front door for all policy operations |
| **Policy Generation tab (PolicyGenerationDashboard)** | `/admin/compliance/[companyId]/policies` — "Generate" view | See above |
| **CSV Export button** | "Export" action on Findings page | Same `/api/compliance/export` route, repositioned button |
| **Tool Capability Map** | `/admin/compliance/[companyId]/connections` (informational sub-panel) | Currently a separate component (`ToolCapabilityMap.tsx`); demote to a sub-view, do not give it its own page |

After the migration:
- `/admin/compliance` (no companyId) → redirect to a customer picker
- `/admin/compliance/workflow` → kept as alias; redirects to `/admin/compliance/[companyId]` (cockpit) once a company is selected
- `/admin/compliance/setup` → deleted; the ComplianceSetupWizard component is deleted
- `/admin/compliance/tools` → deleted; tools surface lives in Connections

---

## 7. Component consolidation

| Component today | Disposition |
|-----------------|-------------|
| `ComplianceDashboard.tsx` (21 KB) | **Delete** after migration |
| `ComplianceWorkflow.tsx` (66 KB) | **Delete** — replaced by `CockpitView.tsx` + per-stage components for the bootstrap path |
| `ComplianceSetupWizard.tsx` (24 KB) | **Delete** — replaced by question engine UI rendering the `customer_profile` schema |
| `PlatformMappingPanel.tsx` (18 KB) | **Keep**, hosted in Connections page. **Audit:** confirm it can add multiple rows per platform. |
| `PolicyManager.tsx` (51 KB) | **Keep**, merged into Policies page as "Library" tab |
| `PolicyGenerationDashboard.tsx` (87 KB) | **Keep**, merged into Policies page as "Generate" tab. **Refactor:** stop authoring profile questions inside this component; read profile from question engine. |
| `AssessmentResults.tsx` (38 KB) | **Keep** — single source for findings display, used by Assessments + Findings + Cockpit drilldowns |
| `ToolCapabilityMap.tsx` (16 KB) | **Keep** as a sub-panel of Connections |
| `StepIndicator` (inside ComplianceWorkflow) | **Keep** as a reusable bootstrap stepper component, moved to `src/components/compliance/BootstrapStepper.tsx` |

Net: delete 3 components (~111 KB), refactor 1 to remove duplicate profile authoring, keep 5.

---

## 8. API surface changes

### 8.1 Routes to keep
- `GET /api/compliance/` — list assessments (no change)
- `GET|POST|DELETE|PATCH /api/compliance/assessments/[id]` — no change
- `GET|POST /api/compliance/connectors` — no change
- `GET|POST|DELETE /api/compliance/platform-mappings` — no change
- `GET|POST|PATCH /api/compliance/policies/*` — no change
- `GET /api/compliance/registry` — no change
- `GET|POST /api/compliance/registry/company-tools` — depends on `compliance_company_tools` being created
- `POST /api/compliance/ai-assist` — no change
- `GET /api/compliance/export` — no change
- `POST /api/compliance/webhooks/saas-alerts` — no change
- `GET /api/compliance/debug-collectors` — no change

### 8.2 Routes to update
- `GET /api/compliance/workflow-status` — repurposed as `GET /api/compliance/bootstrap-status` returning the 4-stage progress. Old name kept as alias for one release.
- `GET|POST /api/compliance/customer-context` — kept temporarily for backwards compat; reads/writes via the question engine under the hood. Marked deprecated. Removed after the migration window.

### 8.3 Routes to add
- `GET /api/compliance/[companyId]/cockpit` — single fetch returning everything the cockpit needs (posture summary, open finding counts, pending changes, bootstrap freshness, recent activity). Reduces round-trips from the new cockpit page.
- `GET /api/compliance/[companyId]/profile` — read the Customer Profile (question engine response)
- `POST /api/compliance/[companyId]/profile` — write profile answers (delegates to question engine)
- Change-management routes — covered in [CHANGE_MANAGEMENT_AND_REMEDIATION.md](./CHANGE_MANAGEMENT_AND_REMEDIATION.md) §6.

---

## 9. Data migration sequence

Strict ordering matters here because production runs continuously and several of these tables are read by hot paths.

1. **Pre-flight:** Add `compliance_company_tools` and `customer_context_answers` to `ensure-tables.ts` (fixes existing bugs). Run idempotent ensure on next deploy.
2. **Wave 1:** Author and seed the `customer_profile` question schema. Question engine starts answering reads via the new schema for *new* customers. Existing customers continue to read from `policy_org_profiles`.
3. **Wave 2:** Backfill script copies every `policy_org_profiles.answers` blob into `form_responses` rows. Verify per-customer. Engine consumers are still reading from `policy_org_profiles` at this point.
4. **Wave 3:** Switch engine N/A logic + policy generator to read from question engine. Old reads from `policy_org_profiles` and `customer_context_answers` removed. Soak for one release.
5. **Wave 4:** Delete the legacy intake UIs (`ComplianceSetupWizard`, the org-profile tab inside `PolicyGenerationDashboard`). Build the new Customer Profile editor.
6. **Wave 5:** Drop `policy_org_profiles` and `customer_context_answers` tables. **Operator-gated** — not done automatically.

Audit log entries are written at every wave transition (`compliance_audit_log`).

---

## 10. Open items deferred to the implementation plan

These don't affect the architecture but need answers before code lands:

1. **Customer Profile schema versioning.** When we add a question, do existing customer responses remain valid? Question engine supports versioning; we should pick a forward-compatibility policy (likely: additive changes are silent, removed questions are deprecated not deleted).
2. **Profile completeness for assessment.** Should an assessment refuse to run if Profile is incomplete? Recommend: run anyway, but mark findings derived from missing profile data as `manual_review` with reasoning "profile incomplete".
3. **Bootstrap reachability.** From inside the cockpit, how prominent is the "edit profile / re-ingest policies" link? Recommend: persistent sidebar; not a hidden gear icon.
4. **What renders in the customer portal?** Currently nothing compliance-related. The cockpit and bundles are TCT-only. A customer-facing posture summary is reasonable future work; out of scope here.

---

## 11. Action items captured

Implementation backlog generated by this redesign. All carry forward into `docs/current-tasks.md`:

| # | Item | Where |
|---|------|-------|
| W1 | Add `compliance_company_tools` to `ensure-tables.ts` | `src/lib/compliance/ensure-tables.ts` |
| W2 | Add `customer_context_answers` to `ensure-tables.ts` (interim) | same |
| W3 | Author `customer_profile` schema in question engine | new: `src/lib/compliance/customer-profile-schema.ts` |
| W4 | Backfill script for `policy_org_profiles.answers` → `form_responses` | new: `scripts/backfill-customer-profile.ts` |
| W5 | Engine N/A logic reads question engine | `src/lib/compliance/engine.ts`, `frameworks/cis-v8.ts`, `frameworks/cmmc-l1.ts` |
| W6 | Policy generator reads question engine | `src/lib/compliance/policy-generation/generator.ts` |
| W7 | Build cockpit page + endpoint | new: `src/app/admin/compliance/[companyId]/page.tsx`, `src/app/api/compliance/[companyId]/cockpit/route.ts` |
| W8 | Build Connections page (merged Connectors + Inventory + Mappings) | new: `src/app/admin/compliance/[companyId]/connections/page.tsx` |
| W9 | Build Policies page (merged Library + Generate) | new: `src/app/admin/compliance/[companyId]/policies/page.tsx` |
| W10 | Build Assessments / Findings pages | new: `src/app/admin/compliance/[companyId]/assessments/page.tsx`, `findings/page.tsx` |
| W11 | Build Diagnostics page (TCT-only) | new: `src/app/admin/compliance/diagnostics/page.tsx` |
| W12 | Audit PlatformMappingPanel for 1:M UI support | `src/components/compliance/PlatformMappingPanel.tsx` |
| W13 | Refactor PolicyGenerationDashboard to stop authoring profile questions | same component |
| W14 | Wire `engine.compareAssessments()` into cockpit UI | new + AssessmentResults.tsx |
| W15 | Delete `ComplianceSetupWizard`, `ComplianceDashboard`, `ComplianceWorkflow` | after migration |
| W16 | Drop `policy_org_profiles` and `customer_context_answers` tables | operator-gated |

These are tracked in `docs/current-tasks.md` with priorities and dependencies.
