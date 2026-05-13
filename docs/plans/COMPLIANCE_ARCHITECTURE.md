# Compliance Architecture

> **Status: Design proposal (2026-05-13).** Supersedes scattered references in `docs/architecture.md`, `docs/system-map.md`, and `docs/COMPLIANCE_PLAYBOOK.md`. Once implemented, this becomes the source of truth for the Triple Cities Tech compliance subsystem and the other docs should point here.
>
> This document does NOT replace `COMPLIANCE_PLAYBOOK.md` — the playbook covers per-control scoring logic and evaluator behavior, which remains correct. This document covers system shape, data model, lifecycle, and boundaries.

---

## 1. Purpose

The compliance subsystem evaluates a customer's IT estate against a chosen security framework (CIS v8, CMMC L1, etc.), generates and maintains the policies that govern that estate, surfaces gaps as findings, and shepherds those findings through a remediation lifecycle — including bundling end-user-impacting changes for customer approval before deployment.

Compliance is a **TCT-internal** product. Customers see outputs (generated policies, posture reports, change bundles) but do not author profiles or run assessments themselves. This may change in the future; nothing in the data model is hostile to a customer-facing surface, but no such surface is being built today.

---

## 2. Six concerns

The subsystem is organized around six concerns. Each is independently versionable; each has its own data, its own UI, its own update cadence.

```
                       ┌────────────────────────────┐
                       │   Customer Profile         │  ← Discovery
                       │   (identity, env, scope)   │
                       └────────────┬───────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐         ┌────────────────────┐         ┌─────────────────┐
│  Integration │         │   Policy Library   │         │   Tool          │
│  Connections │         │   (uploaded +      │         │   Inventory     │
│  (status,    │         │    generated)      │         │   (deployed     │
│  credentials)│         │                    │         │    capabilities)│
└──────┬───────┘         └─────────┬──────────┘         └────────┬────────┘
       │                           │                              │
       └──────────────┬────────────┴──────────────┬──────────────┘
                      ▼                           ▼
            ┌─────────────────┐         ┌─────────────────┐
            │   Assessment    │◀────────│  Platform       │
            │   Engine        │         │  Mappings       │
            │  (rerunnable)   │         └─────────────────┘
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────────────┐
            │   Findings (lifecycle:  │
            │   open/accepted/sched/  │
            │   in-progress/done)     │
            └────────┬────────────────┘
                     │
       ┌─────────────┼─────────────────┬─────────────────┐
       ▼             ▼                 ▼                 ▼
┌──────────┐  ┌────────────┐   ┌──────────────┐  ┌──────────────┐
│ Change   │  │ Roadmap /  │   │ Customer     │  │ Posture      │
│ Bundles  │  │ Project    │   │ Attestation  │  │ Trend (delta │
│ (impact, │  │ (billable, │   │ + Approval   │  │ over time)   │
│ approval)│  │ deferred)  │   └──────────────┘  └──────────────┘
└──────────┘  └────────────┘
```

### 2.1 Customer Profile (Discovery)
The single source of truth for "what does this customer look like": identity (name, locations, industry, employee count), regulatory scope (PHI / PII / CUI / PCI / SOX), operational context (on-prem servers, remote work, BYOD, custom apps), and compliance objectives (which frameworks at which level).

**Authoritative store:** the existing question engine (`form_schemas`, `form_sections`, `form_questions`, `customer_form_configs`). A new schema `type='customer_profile'` is authored in code and answered by TCT staff in the admin UI.

Today this information is **fragmented across three stores** (`policy_org_profiles.answers`, `customer_context_answers`, the `ComplianceSetupWizard` UI). Consolidating them is the largest single piece of refactor work. See [COMPLIANCE_WORKFLOW_REDESIGN.md](./COMPLIANCE_WORKFLOW_REDESIGN.md) §3.

### 2.2 Integration Connections
Per-customer OAuth / API-key state for each integrated platform: Microsoft Graph (multi-tenant), Datto RMM, Datto EDR, Datto BCDR, DNSFilter, Autotask, Domotz, IT Glue, SaaS Alerts, Ubiquiti, EasyDMARC, MyITProcess.

**Authoritative store:** `compliance_connectors` (existing). One row per `(companyId, connectorType)`. Status enum: `not_configured | available | configured | verified | error`.

Credentials themselves live in `integration_credentials` (encrypted, per-tenant) per `docs/runbooks/CREDENTIALS_MIGRATION.md`.

### 2.3 Tool Inventory
What tools the customer has **deployed** (vs. what TCT could connect to). Drives N/A logic in the engine: a customer without EDR can't be evaluated on EDR controls and those controls correctly show as `manual_review` or N/A rather than `failed`.

**Authoritative store:** `compliance_company_tools`. **Action item: this table is referenced by the workflow-status route but is missing from `src/lib/compliance/ensure-tables.ts`. It must be added.**

Catalog of available tools lives in code: `src/lib/compliance/registry/tool-definitions.ts` (~20 tools) and `src/lib/compliance/registry/capabilities.ts` (~35 capabilities).

### 2.4 Platform Mappings
Some platforms host one TCT customer across multiple entities (one Datto RMM tenant has many sites; one Ubiquiti console has many sites; one DNSFilter org has many sub-orgs). Platform mappings are the explicit linkage `(TCT companyId, platform, externalEntityId)`.

**Authoritative store:** `compliance_platform_mappings`. UNIQUE on `(companyId, platform, externalId)` — schema is **one-to-many**: a single customer may have multiple Datto RMM sites mapped. The UI must permit adding multiple rows per platform; the schema already does.

### 2.5 Policy Library
Two kinds of policies coexist in one table:
- **Uploaded policies** — customer's existing docs (.docx, .pdf, .md, SharePoint links). AI analysis maps each to CIS v8 controls and produces gap recommendations.
- **Generated policies** — Claude-generated from the Customer Profile + catalog template. Versioned in `policy_versions`. Generation history in `policy_generation_records`.

**Authoritative stores:** `compliance_policies`, `compliance_policy_analyses`, `policy_generation_records`, `policy_versions`, `policy_intake_answers` (per-policy small refinement Q&A on top of the Customer Profile).

Catalog (~15 standard policies) and framework mappings (which policies cover which controls) are static code: `src/lib/compliance/policy-generation/catalog.ts`, `framework-mappings.ts`.

### 2.6 Assessment Engine
The core. Reads Profile + Connections + Inventory + Mappings + Library, runs evidence collectors against connected platforms, evaluates per-control rules, writes findings.

**Authoritative store:** `compliance_assessments`, `compliance_evidence`, `compliance_findings`, `compliance_audit_log`. Assessments are rerunnable — each run creates a new row. There is **no "initial" or "final" column**; ordering is purely temporal.

**Frameworks with full evaluators today:** CIS v8 (65 controls, with IG1/IG2/IG3 selectivity), CMMC L1. **Type-stubbed only:** NIST 800-171, HIPAA, PCI, CMMC L2 — accept assessment runs but produce only policy-analysis coverage, not control evaluations.

Evidence collectors (`src/lib/compliance/collectors/`):
- `graph.ts` — Microsoft 365 / Entra / Intune / Defender / Exchange
- `msp.ts` — every non-Microsoft connector (Datto RMM/EDR/BCDR, DNSFilter, Domotz, IT Glue, SaaS Alerts, Ubiquiti, EasyDMARC, MyITProcess)

Comparison: `engine.compareAssessments(currentId, previousId)` already exists and returns deltas (newly passed, newly failed, improved, regressed). The "Step 6 final vs. initial" UI just needs to consume it.

### 2.7 Findings Lifecycle
Each finding carries a **disposition** that survives reassessment. When an assessment re-runs and a previously-failed control now passes, the finding row updates — but the disposition record (accepted-risk, scheduled, in-progress, etc.) persists.

**New table:** `compliance_finding_dispositions`. Keyed on `(companyId, frameworkId, controlId)`. Fields:
- `lifecycleStatus`: `open | accepted_risk | scheduled | in_progress | completed | customer_declined | billable_project | superseded`
- `assignedTo` (StaffUser FK)
- `dueDate`
- `projectId` / `phaseTaskId` (nullable, links to `projects` / `phase_tasks` for billable work)
- `customerImpactSummary` (plain-English text — required if the finding will produce a customer-facing change)
- `internalNotes`
- `acceptedRiskRationale` (required when status = accepted_risk)
- `decisionBy` (StaffUser FK), `decidedAt`
- `lastReviewedAt` — used to surface stale dispositions in the cockpit

This separation is what unlocks remediation tracking without losing the audit trail on each re-assessment.

### 2.8 Change Bundles + Remediation
End-user-impacting changes are not deployed in isolation. Pending changes are bundled per customer, a customer-facing report is generated, the customer agrees on dates per change, staff attests they communicated, then deploys.

Full design lives in [CHANGE_MANAGEMENT_AND_REMEDIATION.md](./CHANGE_MANAGEMENT_AND_REMEDIATION.md). At the architecture level:
- New tables: `compliance_pending_changes`, `compliance_change_bundles`, `compliance_change_bundle_items`.
- Each pending change carries: linked finding(s), declarative action reference (from action catalog), plain-English customer impact, staff-only technical notes, status, attestation timestamps.
- Bundles aggregate N pending changes into one customer conversation.
- Per-change customer decision (`approved | declined | deferred`) is captured on each bundle item.

### 2.9 Roadmap / Billable Lifecycle
Findings that warrant billable work get a disposition status of `billable_project` and a `projectId` / `phaseTaskId`. Reuses the existing `Project → Phase → PhaseTask` hierarchy — no parallel work-tracking system.

Pattern: **one persistent "Compliance Operations" project per customer**, with a new `Phase` for each engagement window (e.g., "Q2 2026 Compliance Engagement"). Findings that go billable become `PhaseTask` rows in the open phase.

### 2.10 Posture Trend
Visual of how the customer's compliance posture has changed over time. Built entirely on top of `engine.compareAssessments()`. Replaces the "Final Assessment" stage — there is no final, only a latest, and a delta against any prior assessment.

---

## 3. Data model — current state and target state

### 3.1 Tables that exist today (raw SQL, not Prisma-managed)

All managed by `src/lib/compliance/ensure-tables.ts` (idempotent CREATE TABLE IF NOT EXISTS).

| Table | Purpose | Notes |
|-------|---------|-------|
| `compliance_connectors` | Per-customer integration status | One row per `(companyId, connectorType)` |
| `compliance_assessments` | Assessment runs (rerunnable) | No `isFinal` column — temporal only |
| `compliance_evidence` | Raw collector output per assessment + source | `rawData` JSONB; `validForHours` for staleness |
| `compliance_findings` | Per-control evaluation results | `overrideStatus` / `overrideReason` for manual overrides |
| `compliance_audit_log` | Audit trail for all compliance actions | |
| `compliance_policies` | Uploaded + generated policies | `analyzedControlsCovered/Partial/Missing` counts |
| `compliance_policy_analyses` | Deep AI analysis output per policy | JSONB blobs for covered/partial/missing/gaps/recommendations |
| `compliance_attestations` | Manual signed statements | |
| `compliance_platform_mappings` | Customer → external-entity mapping | UNIQUE on `(companyId, platform, externalId)` — 1:M |
| `compliance_webhook_events` | Inbound SaaS Alerts webhooks | |
| `policy_org_profiles` | **(To be retired)** Org profile Q&A | JSONB single row per company |
| `policy_intake_answers` | Per-policy refinement Q&A | UNIQUE on `(companyId, policySlug)` |
| `policy_generation_records` | Per-policy generation state machine | mode: new/improve/update-framework/standardize/fill-missing |
| `policy_versions` | Generated policy version history | |
| `integration_credentials` | Encrypted per-tenant API credentials | See CREDENTIALS_MIGRATION runbook |
| `integration_credential_access_log` | Audit log of credential reads | |

### 3.2 Tables referenced but missing (bugs)

| Table | Referenced by | Action |
|-------|---------------|--------|
| `compliance_company_tools` | `/api/compliance/workflow-status`, `/api/compliance/registry/company-tools` | **Add to `ensure-tables.ts`** |
| `customer_context_answers` | `/api/compliance/customer-context` | Either add to `ensure-tables.ts` (short-term) or migrate to question engine (target state — see §3.4) |

### 3.3 New tables required for the target state

| Table | Purpose |
|-------|---------|
| `compliance_finding_dispositions` | Durable per-control lifecycle status that survives reassessment (§2.7) |
| `compliance_pending_changes` | Staged remediation actions awaiting bundle / approval / deployment |
| `compliance_change_bundles` | Customer-facing groupings of pending changes for one approval conversation |
| `compliance_change_bundle_items` | Join table: bundle → change, with per-change customer decision |

Full DDL is in [CHANGE_MANAGEMENT_AND_REMEDIATION.md](./CHANGE_MANAGEMENT_AND_REMEDIATION.md) §5.

### 3.4 Tables to retire (after migration)

| Table | Retire because | Migrate to |
|-------|----------------|------------|
| `policy_org_profiles` | Duplicates the Customer Profile concept | A `customer_form_responses` row scoped to a `form_schema` of type `customer_profile` (the existing HR question engine) |
| `customer_context_answers` (if it ever gets created) | Same: duplicates Customer Profile | Same |

`policy_intake_answers` **stays** — its concern is genuinely per-policy refinement, not customer-wide profile.

### 3.5 Reused tables (no compliance-specific changes)

| Table | Used for |
|-------|----------|
| `form_schemas`, `form_sections`, `form_questions`, `customer_form_configs`, `form_responses` (HR question engine) | Customer Profile authoring + answering |
| `projects`, `phases`, `phase_tasks` | Billable remediation / roadmap |
| `staff_users` | `assignedTo`, `decisionBy`, `deployedBy`, etc. |
| `companies` | All compliance data is keyed by `companyId` |
| `audit_log` | High-level audit; complement to `compliance_audit_log` |

---

## 4. UI surfaces — current and target

### 4.1 Current
- `/admin/compliance` — Legacy tabbed dashboard (Connectors, Assessments, Evidence, Platform Mapping, Policy Analysis, Policy Generation, CSV Export)
- `/admin/compliance/workflow` — 6-step Guided Workflow stepper
- `/admin/compliance/setup` — Environment discovery wizard (third intake surface — duplicates profile)
- `/admin/compliance/tools` — Tool registry view (route exists, component stub)

### 4.2 Target
- `/admin/compliance/[companyId]` — **Single front door per customer.** Default view = Operations Cockpit (latest assessment summary, open findings by severity, pending changes, current bundle, last reassessment date, last policy review date). Bootstrap mode (full workflow stepper) is reachable from the cockpit when bootstrap is incomplete.
- `/admin/compliance/[companyId]/profile` — Customer Profile editor (question engine UI)
- `/admin/compliance/[companyId]/connections` — Integration connections + Tool Inventory + Platform Mappings (the three setup-y things in one place)
- `/admin/compliance/[companyId]/policies` — Policy Library (upload, analysis, generation, versions, export) — merges PolicyManager + PolicyGenerationDashboard
- `/admin/compliance/[companyId]/assessments` — Assessment list, run, results, comparison
- `/admin/compliance/[companyId]/findings` — Findings ledger with disposition controls
- `/admin/compliance/[companyId]/changes` — Pending changes + bundles + customer-facing reports
- `/admin/compliance/diagnostics` — TCT-only: connector error log, raw evidence JSON, evaluator debug. Hidden from the per-customer view.

The legacy `/admin/compliance` dashboard is retired once the cockpit is the default. Pre-retirement, the migration plan in [COMPLIANCE_WORKFLOW_REDESIGN.md](./COMPLIANCE_WORKFLOW_REDESIGN.md) §6 lists every legacy feature with its target home so nothing is lost.

---

## 5. Framework support

| Framework | Evaluators | Policy mapping | Status |
|-----------|------------|----------------|--------|
| CIS v8 (IG1/IG2/IG3) | ✅ 65 controls | ✅ Full | Production |
| CMMC L1 | ✅ Full | ✅ Full | Production |
| CMMC L2 | ❌ Stub | Partial | Roadmap |
| NIST 800-171 | ❌ Stub | Partial | Roadmap |
| HIPAA | ❌ Stub | Partial | Roadmap |
| PCI DSS | ❌ Stub | Partial | Roadmap |

The framework type union in `src/lib/compliance/types.ts` accepts all of the above as valid `frameworkId` values. Assessments can be created for stubbed frameworks but will produce only policy-coverage analysis, not control evaluations. The cockpit must clearly label stub frameworks so staff don't mistake an empty assessment for a clean assessment.

---

## 6. Boundary: what compliance owns vs. integrates with

**Compliance owns:**
- All `compliance_*` and `policy_*` tables
- All `/api/compliance/*` and `/api/compliance/policies/*` routes
- All evidence collectors (`src/lib/compliance/collectors/`)
- The framework definitions and evaluators
- The Change Bundle workflow

**Compliance integrates with:**
- **Question engine** (HR-built) for Customer Profile + per-policy intake — see `docs/plans/QUESTION_ENGINE_ARCHITECTURE.md`
- **Autotask sync** for company list, contact list, and ticket / phase / task data — see `docs/reference/AUTOTASK_SYNC.md`
- **Microsoft Graph multi-tenant** for M365 collection — see CLAUDE.md "M365 Multi-Tenant Onboarding"
- **Resilience module** (`src/lib/resilience.ts`) for retry / timeout / circuit breakers
- **Credentials module** (`src/lib/credentials.ts`) for encrypted tenant secrets
- **Project / Phase / Task system** for billable remediation roadmap
- **Customer portal** for surfacing posture summaries (read-only)
- **Email (Resend)** for change-bundle delivery and customer attestations

**Compliance does NOT own:**
- The HR question engine (use it, don't fork it)
- The Autotask client (use it, don't duplicate)
- The Project model (use it for roadmap, don't build a parallel one)
- The SOC engine (different concern, different cadence — they share no tables)
- The reporting pipeline (different data; reports may consume compliance summaries but compliance doesn't consume report aggregations)

---

## 7. Workflow shape

A dedicated document covers this in detail: [COMPLIANCE_WORKFLOW_REDESIGN.md](./COMPLIANCE_WORKFLOW_REDESIGN.md). Summary:

**Bootstrap** (one-time per customer, can be revisited):
1. Customer Profile (Discovery)
2. Connections + Inventory + Platform Mappings (parallel; any order)
3. Policy Library Ingestion (before any assessment)
4. Baseline Assessment

**Operations Cockpit** (permanent):
- Findings & Lifecycle
- Policy Generation (on demand, using the profile)
- Change Management (pending changes → bundles → customer approval → deployment)
- Posture Trend (compare any two assessments)

Critically, the old 6-step linear UI is replaced. Step state today is computed not persisted, so this is a UI reshape with minimal data migration. The bootstrap stepper survives as the "first time setting up this customer" flow; it does not survive as the only way to navigate.

---

## 8. Cross-cutting policies

### 8.1 Computed vs. persisted state
Workflow / bootstrap progress is **computed** from the underlying data tables (row counts, last-updated timestamps). There is no `compliance_workflow_status` table and there should not be one. The cockpit re-derives status on every load. This keeps the system honest — staff can't claim a step is "complete" while the underlying data is missing.

### 8.2 Override carry-forward
When a finding is manually overridden (`overrideStatus`, `overrideReason`, `overrideBy`), the override carries forward to the next assessment so the customer doesn't have to re-justify the same exception every quarter. Carry-forward logic lives in `src/lib/compliance/engine.ts`; do not duplicate it elsewhere.

The disposition (§2.7) and the override are **different things**: override changes how a control scores; disposition tracks what we are doing about a failed control. A finding can have both (e.g., overridden to `manual_review` AND disposition = `scheduled`).

### 8.3 Environment-aware N/A
The Customer Profile's operational-context answers (on-prem servers? backup scope? remote work?) drive N/A logic in the engine. See [COMPLIANCE_PLAYBOOK.md](../COMPLIANCE_PLAYBOOK.md) for the per-control rules. The N/A logic must read from the Customer Profile, not from the legacy `customer_context_answers` or `policy_org_profiles` tables, once consolidation lands.

### 8.4 Audit
Every state change writes to `compliance_audit_log` with `(companyId, action, actor, metadata, timestamp)`. The change-management lifecycle writes especially fine-grained audit (one row per status transition, communication, attestation, deployment, verification). See [CHANGE_MANAGEMENT_AND_REMEDIATION.md](./CHANGE_MANAGEMENT_AND_REMEDIATION.md) §8.

### 8.5 Resilience
All external API calls (collectors, AI generation, customer email) must use `src/lib/resilience.ts` for timeout + retry. No ad-hoc retry loops. Long-running generation uses streaming with idle+wall timeouts (already implemented in `src/lib/compliance/policy-generation/generator.ts`).

### 8.6 Credentials
Per-tenant API credentials (M365, Datto, etc.) are stored encrypted in `integration_credentials`. The compliance subsystem reads via `src/lib/credentials.ts`, which transparently handles the encryption and the per-credential access log. Direct reads of `companies.m365_client_secret` and similar are deprecated; see CREDENTIALS_MIGRATION runbook.

---

## 9. Glossary

| Term | Meaning |
|------|---------|
| **Customer Profile** | The consolidated set of customer-identifying + environmental answers that drives both engine N/A logic and policy generation. Single store, authored via question engine. |
| **Connection** | An authenticated integration to one external platform on behalf of one customer. Status enum in `compliance_connectors`. |
| **Tool** | A vendor capability that the customer has deployed (or not), regardless of whether TCT has API access. Catalog in code; per-customer status in `compliance_company_tools`. |
| **Platform Mapping** | The explicit linkage between a TCT customer and one or more external entities within a single platform (e.g., two Datto RMM sites belong to one customer). |
| **Capability** | An abstract security control the customer can achieve via one or more tools (e.g., "mfa_enforcement"). Used by the registry/resolver for gap analysis. |
| **Assessment** | One run of the engine against the customer's profile + evidence. Rerunnable. No `isFinal`. |
| **Evidence** | Raw collector output for one assessment + one source type (e.g., M365 secure score JSON snapshot). |
| **Finding** | The per-control evaluation result for one assessment. Has status + confidence + reasoning + evidence references + suggested remediation text. |
| **Override** | A manual edit of how a control scores. Persisted on the finding; carries forward to next assessment. |
| **Disposition** | The durable lifecycle decision about a failed control (open / accepted_risk / scheduled / in_progress / completed / customer_declined / billable_project / superseded). Persists across assessments. |
| **Pending Change** | A staged remediation action awaiting customer approval and deployment. |
| **Change Bundle** | A grouping of pending changes presented to the customer in one consolidated impact report. |
| **Customer Impact Summary** | Plain-English description of how a change will affect end users. Required field on every pending change that produces customer-facing impact. |
| **Staff Attestation** | TCT staff confirmation that they communicated a change to the customer. The acknowledgement gate before deployment. (Customer-side acknowledgement is not separately required; staff attestation is sufficient.) |
| **Bootstrap** | The one-time setup path: Profile → Connections → Inventory → Mappings → Policy Library → Baseline Assessment. |
| **Cockpit** | The permanent operations view for a customer's compliance state. |

---

## 10. Cross-references

| Topic | Document |
|-------|----------|
| Per-control scoring rules, evidence sources, env-aware N/A | `docs/COMPLIANCE_PLAYBOOK.md` |
| Workflow reshape from 6-step to bootstrap+cockpit, intake consolidation | `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md` |
| Change bundle data model, customer impact reports, deployment lifecycle | `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` |
| HR question engine (reused for Customer Profile) | `docs/plans/QUESTION_ENGINE_ARCHITECTURE.md` |
| Encrypted per-tenant credentials | `docs/runbooks/CREDENTIALS_MIGRATION.md` |
| Autotask integration | `docs/reference/AUTOTASK_SYNC.md` |
| Backlog of future tool integrations | `docs/compliance-future-integrations.md` |
| Overall system architecture (compliance is one of several subsystems) | `docs/architecture.md` |
| Database tables (compliance section forthcoming) | `docs/data-model.md` |
| File/module ownership | `docs/system-map.md` |
| Active work items | `docs/current-tasks.md` |
