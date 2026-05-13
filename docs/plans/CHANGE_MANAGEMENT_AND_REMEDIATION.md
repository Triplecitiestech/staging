# Change Management and Remediation

> **Status: Design proposal (2026-05-13).** Companion to [COMPLIANCE_ARCHITECTURE.md](./COMPLIANCE_ARCHITECTURE.md) and [COMPLIANCE_WORKFLOW_REDESIGN.md](./COMPLIANCE_WORKFLOW_REDESIGN.md).
>
> **Greenfield design.** Today there is no remediation, change management, or deployment system in the codebase — zero code matches `deployPolicy`, `applyBaseline`, `tenant-action`, `harden`, `remediate`. Every choice in this document is new.

---

## 1. Goals

Compliance findings need to turn into deployed fixes. The platform must:

1. Let TCT staff stage remediation actions for failed controls without forcing them down a per-finding approval ping-pong with the customer.
2. Bundle multiple pending changes into one consolidated customer communication, so "kill multiple birds at once" replaces "back-and-forth per change".
3. Force plain-English end-user impact analysis on every customer-impacting change before it can leave staff hands.
4. Capture staff attestation that they communicated the change (acknowledgement gate before deployment). Customer-side reply is not required as a separate gate — staff attestation is sufficient.
5. Support per-change customer decisions inside a bundle (approve / decline / defer) so a customer can approve five of seven changes without invalidating the bundle.
6. Hand billable / large-scope changes off to the existing Project / Phase / PhaseTask system rather than building a parallel work tracker.
7. Provide a deployment record sufficient for audit: who proposed, who communicated, who customer agreed via, who deployed, when, and what was verified afterwards.
8. Support both automated executors (Graph API calls, etc.) and manual execution (staff makes the change in a vendor admin console, then marks deployed) with the same lifecycle.

Non-goals:

- Customer self-service approval portal. (TCT-only for now.)
- Multi-step orchestration / DAGs of remediations. Each change is a single atomic action.
- Automatic scheduling. Customers pick dates; the platform doesn't choose for them.

---

## 2. Model overview

```
                 Finding (compliance_findings)
                            │
                            │  disposition.lifecycleStatus = scheduled
                            ▼
                 Pending Change (compliance_pending_changes)
                            │
                            │  status = drafted | bundled | …
                            ▼
                 Change Bundle (compliance_change_bundles)
                            │  many pending changes → one bundle
                            │  status = drafted | awaiting_customer | partially_approved | scheduled | deploying | complete
                            ▼
                 Bundle Item (compliance_change_bundle_items)
                            │  per-change customer decision
                            │  decision = approved | declined | deferred
                            ▼
                 Deployment (back on Pending Change)
                            │  staff attestation + executor invocation
                            ▼
                 Verification
                            │  re-run relevant evaluator(s)
                            ▼
                 Finding updates + Audit
```

State flows in one direction. Findings → pending changes → bundles → bundle items → deployment → verification → finding update. Audit log entries written at every transition.

---

## 3. Action catalog (declarative, code-only)

The catalog is **not a database table**. It is code: versioned alongside the engine, reviewed in PRs, deployable atomically. Every action is a static export.

### 3.1 Shape

```ts
// src/lib/compliance/actions/types.ts

export interface RemediationAction {
  /** stable identifier, e.g. 'm365.enforce_mfa_all_users' */
  id: string;
  /** human-readable name shown in admin UI */
  name: string;
  /** which framework controls this action satisfies / partially satisfies */
  satisfiesControls: Array<{ frameworkId: FrameworkId; controlId: string; coverage: 'full' | 'partial' }>;
  /** capability from the registry (cross-references tool capabilities) */
  capabilityId: CapabilityId;
  /** whether the action can be reversed and via what action id */
  reversible: boolean;
  rollbackActionId?: string;
  /** mandatory customer-impact metadata; absence is a build-time error */
  impact: {
    /** plain-English description rendered to customer in the bundle report */
    userFacing: string;
    /** operational notes for staff only */
    operational: string;
    /** scope: per-user / per-device / tenant-wide / specific-group */
    blastRadius: 'tenant_wide' | 'group' | 'per_user' | 'per_device' | 'none';
    /** rough estimate; renders in bundle report as "expected disruption" */
    estimatedDisruptionMinutes: number;
    /** whether this action could log out users / interrupt sessions */
    sessionDisruptive: boolean;
    /** whether this action could block legitimate users until they act (e.g. MFA enrollment) */
    requiresEndUserAction: boolean;
  };
  /** preconditions checked before the action can be staged or executed */
  preconditions: ReadonlyArray<Precondition>;
  /** how to actually execute */
  executor:
    | { kind: 'automated'; handler: string /* function id resolvable at runtime */ }
    | { kind: 'manual'; instructions: string /* staff-facing markdown */ };
  /** post-execution verification: which evaluator to re-run */
  verification: {
    evaluatorIds: string[];
    /** how long to wait before re-running (some changes need propagation time) */
    delaySecondsBeforeVerify: number;
  };
}
```

### 3.2 Examples (illustrative)

```ts
{
  id: 'm365.enforce_mfa_all_users',
  name: 'Enforce MFA for all users (Conditional Access)',
  satisfiesControls: [
    { frameworkId: 'cis-v8', controlId: '6.3', coverage: 'full' },
    { frameworkId: 'cis-v8', controlId: '6.5', coverage: 'partial' },
  ],
  capabilityId: 'mfa_enforcement',
  reversible: true,
  rollbackActionId: 'm365.revert_mfa_conditional_access',
  impact: {
    userFacing:
      'Every user signing in to Microsoft 365 will be prompted to set up Microsoft Authenticator on their phone the next time they log in. After enrollment, users will be asked for a code from the app whenever they sign in from a new device. Sign-ins from already-trusted devices may not prompt for the code. The setup takes about 5 minutes per user.',
    operational:
      'Creates a CA policy "Require MFA - All Users" applied to all cloud apps with no exclusions except break-glass accounts.',
    blastRadius: 'tenant_wide',
    estimatedDisruptionMinutes: 5,
    sessionDisruptive: false,
    requiresEndUserAction: true,
  },
  preconditions: [
    { kind: 'connector_verified', connectorType: 'microsoft_graph' },
    { kind: 'break_glass_accounts_excluded' },
  ],
  executor: { kind: 'automated', handler: 'graph.applyConditionalAccessPolicy.mfaAll' },
  verification: { evaluatorIds: ['cis-v8.6.3', 'cis-v8.6.5'], delaySecondsBeforeVerify: 60 },
},

{
  id: 'manual.deploy_security_awareness_training',
  name: 'Deploy security awareness training program',
  satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '14.1', coverage: 'full' }],
  capabilityId: 'security_awareness_training',
  reversible: false,
  impact: {
    userFacing:
      'Your team will receive monthly 5-minute training videos on phishing and security best practices. Completion will be tracked; non-completion will generate reminders.',
    operational: 'Schedule BullPhish campaigns; assign all users.',
    blastRadius: 'per_user',
    estimatedDisruptionMinutes: 5,
    sessionDisruptive: false,
    requiresEndUserAction: true,
  },
  preconditions: [{ kind: 'tool_deployed', toolId: 'bullphish' }],
  executor: {
    kind: 'manual',
    instructions: '1. Log in to BullPhish portal\n2. Create monthly training campaign\n3. Assign all users\n4. Set notification cadence to weekly reminders\n5. Return here and mark deployed',
  },
  verification: { evaluatorIds: ['cis-v8.14.1'], delaySecondsBeforeVerify: 0 },
},
```

### 3.3 Versioning + change log
Each action has a `version` (semver-ish). Bumping the impact text or changing the executor handler bumps the version. Pending changes record the action `id + version` they were staged against, so a bundle in flight isn't silently mutated by a later action revision.

### 3.4 Build-time validation
Every action must have a non-empty `impact.userFacing`. CI lints this. An action without an impact summary is a build error — this is how we enforce "no customer-impacting change without plain-English impact analysis".

### 3.5 Capability + control coverage
The action catalog declares which controls it satisfies. The cockpit's "open findings" view can suggest applicable actions per finding by looking up `satisfiesControls`. Suggestions are not automatic — staff still stages each change deliberately.

---

## 4. Lifecycle

### 4.1 States

```
DRAFTED ─────────────────────────────────────────► ABANDONED
  │
  ▼
BUNDLED
  │
  ▼
AWAITING_CUSTOMER ───────► CUSTOMER_DECLINED
  │
  ▼  (customer approves or defers)
SCHEDULED ─────────────────► DEFERRED
  │
  ▼  (staff attests communication, deployment window opens)
DEPLOYING
  │
  ▼
VERIFYING
  │
  ▼
COMPLETE                            ROLLED_BACK
  │                                    ▲
  └────► (failed verification) ────────┘
```

State per pending change:
- `drafted` — staff created the change, customer impact written, not yet attached to a bundle
- `bundled` — attached to an in-progress bundle, not yet sent
- `awaiting_customer` — bundle delivered to customer; awaiting decision
- `customer_declined` — terminal for this iteration; finding disposition flips to `customer_declined`
- `deferred` — customer asked to revisit later; carries a `deferredUntil` date; auto-reappears in the cockpit when due
- `scheduled` — customer agreed on a deployment date; staff has attested communication
- `deploying` — execution in flight (automated handler running, or staff has clicked "I am doing this now" on a manual action)
- `verifying` — execution complete; verification evaluator is running (with `delaySecondsBeforeVerify` buffer)
- `complete` — verification confirmed the control is now satisfied; finding disposition flips to `completed`
- `rolled_back` — verification failed or staff invoked rollback; if `rollbackActionId` exists it was called; finding disposition reverts to `open`
- `abandoned` — staff cancelled before sending to customer

### 4.2 Bundle state (`compliance_change_bundles.status`)

- `drafted` — staff is composing
- `awaiting_customer` — sent to customer; awaiting decision(s)
- `partially_approved` — at least one item approved, at least one not; bundle is actionable
- `fully_approved` — every item has a decision (some may be declined/deferred, but no item is still pending)
- `scheduled` — at least one approved item has a deployment date set
- `deploying` — at least one approved item is in `deploying` state
- `complete` — every approved item has reached `complete` or `rolled_back`; bundle is closed for further activity
- `cancelled` — staff cancelled before deployment

A bundle moves to `complete` when every item is in a terminal state (complete / rolled_back / declined / deferred). Deferred items become new pending changes that can be added to a future bundle.

### 4.3 Staff attestation
To move a pending change from `awaiting_customer` to `scheduled`, the staff member must:
- Record `communicatedAt` (date+time)
- Record `communicatedBy` (StaffUser FK; defaults to current user)
- Pick `communicationMethod` from: `email | phone | in_person | ticket | screenshare | meeting`
- Optionally paste a customer reply / ticket link into `customerReplyReference` (free-text)

The platform does not require a customer-side reply to be ingested. The attestation is the gate. The `customerReplyReference` is for audit and is included in the deployment record.

### 4.4 Verification + rollback
After execution:
1. Wait `verification.delaySecondsBeforeVerify` seconds (some changes need propagation).
2. Re-run the listed evaluator(s) against fresh evidence.
3. If all targeted controls now pass, change → `complete`. Finding disposition → `completed`. Audit logged.
4. If any targeted control still fails, change → `rolled_back` (if `rollbackActionId` exists, invoke it; otherwise just mark `rolled_back` and surface an alert). Finding disposition → `open`. Audit logged with the verification result.

Verification is **mandatory** — even manual executors trigger a re-run of the relevant evaluator. Staff cannot mark `complete` without verification.

---

## 5. Data model

All new tables. None Prisma-managed; created by `ensure-tables.ts`.

### 5.1 `compliance_pending_changes`

```sql
CREATE TABLE IF NOT EXISTS compliance_pending_changes (
  id                          TEXT PRIMARY KEY,
  "companyId"                 TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "actionId"                  TEXT NOT NULL,           -- catalog id
  "actionVersion"             TEXT NOT NULL,           -- catalog version snapshot
  "linkedFindingIds"          JSONB NOT NULL,          -- array of finding ids
  "customerImpactSummary"     TEXT NOT NULL,           -- plain-English; defaults to action.impact.userFacing, editable
  "internalNotes"             TEXT,                    -- staff-only
  status                      TEXT NOT NULL,           -- see §4.1
  "bundleId"                  TEXT REFERENCES compliance_change_bundles(id) ON DELETE SET NULL,
  "deferredUntil"             TIMESTAMPTZ,
  "communicatedAt"            TIMESTAMPTZ,
  "communicatedBy"            TEXT,                    -- staff_users.id
  "communicationMethod"       TEXT,
  "customerReplyReference"    TEXT,
  "scheduledFor"              TIMESTAMPTZ,
  "deployedAt"                TIMESTAMPTZ,
  "deployedBy"                TEXT,
  "verifiedAt"                TIMESTAMPTZ,
  "verificationResult"        JSONB,                   -- snapshot of re-run findings
  "rolledBackAt"              TIMESTAMPTZ,
  "rolledBackReason"          TEXT,
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy"                 TEXT NOT NULL,
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON compliance_pending_changes ("companyId", status);
CREATE INDEX ON compliance_pending_changes ("bundleId");
```

### 5.2 `compliance_change_bundles`

```sql
CREATE TABLE IF NOT EXISTS compliance_change_bundles (
  id                      TEXT PRIMARY KEY,
  "companyId"             TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,                -- e.g. "Q2 2026 Security Updates"
  status                  TEXT NOT NULL,                -- see §4.2
  "customerFacingNotes"   TEXT,                         -- intro paragraph in the bundle report
  "internalNotes"         TEXT,
  "reportPdfUrl"          TEXT,                         -- generated PDF location
  "sentAt"                TIMESTAMPTZ,
  "sentBy"                TEXT,                         -- staff_users.id
  "sentVia"               TEXT,                         -- email | portal | manual
  "customerRespondedAt"   TIMESTAMPTZ,
  "completedAt"           TIMESTAMPTZ,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy"             TEXT NOT NULL,
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON compliance_change_bundles ("companyId", status);
```

### 5.3 `compliance_change_bundle_items`

```sql
CREATE TABLE IF NOT EXISTS compliance_change_bundle_items (
  id                  TEXT PRIMARY KEY,
  "bundleId"          TEXT NOT NULL REFERENCES compliance_change_bundles(id) ON DELETE CASCADE,
  "pendingChangeId"   TEXT NOT NULL REFERENCES compliance_pending_changes(id) ON DELETE CASCADE,
  "displayOrder"      INTEGER NOT NULL,
  "customerDecision"  TEXT,                           -- null while pending, then approved | declined | deferred
  "customerNote"      TEXT,                           -- optional comment captured from customer
  "decisionRecordedAt" TIMESTAMPTZ,
  "decisionRecordedBy" TEXT,                          -- staff_users.id (staff captures customer's reply)
  "agreedDeploymentDate" TIMESTAMPTZ,                 -- per-item date the customer agreed to
  "deferredUntil"     TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("bundleId", "pendingChangeId")
);
```

### 5.4 `compliance_finding_dispositions`
(Defined in [COMPLIANCE_ARCHITECTURE.md](./COMPLIANCE_ARCHITECTURE.md) §2.7; replicated DDL here for completeness.)

```sql
CREATE TABLE IF NOT EXISTS compliance_finding_dispositions (
  id                          TEXT PRIMARY KEY,
  "companyId"                 TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "frameworkId"               TEXT NOT NULL,
  "controlId"                 TEXT NOT NULL,
  "lifecycleStatus"           TEXT NOT NULL,                      -- see §2.7 of architecture
  "assignedTo"                TEXT,                               -- staff_users.id
  "dueDate"                   TIMESTAMPTZ,
  "projectId"                 TEXT,                               -- projects.id (nullable)
  "phaseTaskId"               TEXT,                               -- phase_tasks.id (nullable)
  "customerImpactSummary"     TEXT,
  "internalNotes"             TEXT,
  "acceptedRiskRationale"     TEXT,
  "decisionBy"                TEXT,
  "decidedAt"                 TIMESTAMPTZ,
  "lastReviewedAt"            TIMESTAMPTZ,
  "supersededByPendingChangeId" TEXT,                             -- when a change is in flight to address this
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("companyId", "frameworkId", "controlId")
);
```

### 5.5 Audit additions

`compliance_audit_log` continues to be the single audit table. New `action` values:
- `pending_change.created` / `.updated` / `.attached_to_bundle` / `.detached` / `.abandoned`
- `bundle.created` / `.item_added` / `.item_removed` / `.sent` / `.customer_response_recorded` / `.cancelled` / `.completed`
- `change.communicated` / `.scheduled` / `.deploying` / `.deployed` / `.verifying` / `.verified` / `.rolled_back`
- `disposition.created` / `.updated` / `.linked_to_project`

Every row carries `metadata` JSONB with relevant ids + previous/next status for diff.

---

## 6. API surface

All routes under `/api/compliance/`. Authenticated; require staff role (none customer-facing).

### 6.1 Pending changes

| Verb | Path | Purpose |
|------|------|---------|
| GET | `/api/compliance/[companyId]/changes` | List pending changes (filterable by status) |
| POST | `/api/compliance/[companyId]/changes` | Create a pending change (must reference action + linked finding(s); validates customer impact present) |
| GET | `/api/compliance/[companyId]/changes/[id]` | Read one |
| PATCH | `/api/compliance/[companyId]/changes/[id]` | Update customer impact text, internal notes, etc. (only while status = drafted or bundled) |
| POST | `/api/compliance/[companyId]/changes/[id]/abandon` | Cancel before sending |
| POST | `/api/compliance/[companyId]/changes/[id]/communicate` | Record staff attestation (moves awaiting_customer → scheduled) |
| POST | `/api/compliance/[companyId]/changes/[id]/deploy` | Trigger executor; moves scheduled → deploying → verifying → complete |
| POST | `/api/compliance/[companyId]/changes/[id]/rollback` | Invoke rollbackAction if reversible; otherwise mark rolled_back |

### 6.2 Bundles

| Verb | Path | Purpose |
|------|------|---------|
| GET | `/api/compliance/[companyId]/bundles` | List bundles |
| POST | `/api/compliance/[companyId]/bundles` | Create empty bundle |
| GET | `/api/compliance/[companyId]/bundles/[id]` | Read bundle + items |
| PATCH | `/api/compliance/[companyId]/bundles/[id]` | Update title, notes |
| POST | `/api/compliance/[companyId]/bundles/[id]/items` | Add a pending change as an item |
| DELETE | `/api/compliance/[companyId]/bundles/[id]/items/[itemId]` | Remove item (returns change to status=drafted) |
| POST | `/api/compliance/[companyId]/bundles/[id]/preview` | Render the customer-facing report (PDF + HTML preview, not sent) |
| POST | `/api/compliance/[companyId]/bundles/[id]/send` | Generate PDF, optionally email to customer, mark sent |
| POST | `/api/compliance/[companyId]/bundles/[id]/items/[itemId]/decision` | Record customer decision per item (approved / declined / deferred + date) |
| POST | `/api/compliance/[companyId]/bundles/[id]/cancel` | Cancel the bundle |

### 6.3 Dispositions

| Verb | Path | Purpose |
|------|------|---------|
| GET | `/api/compliance/[companyId]/dispositions` | List dispositions (joined to latest findings) |
| PATCH | `/api/compliance/[companyId]/dispositions/[controlId]` | Update disposition (status, assignee, due date, accepted-risk rationale, etc.) |
| POST | `/api/compliance/[companyId]/dispositions/[controlId]/link-project` | Create/link a PhaseTask under the customer's Compliance Operations project |

### 6.4 Action catalog (read-only)

| Verb | Path | Purpose |
|------|------|---------|
| GET | `/api/compliance/actions` | List all actions in the catalog (with versions) |
| GET | `/api/compliance/actions/[actionId]` | Read one action including impact, executor metadata, version history |
| GET | `/api/compliance/actions/suggest?controlId=...` | Suggest applicable actions for a given finding |

---

## 7. The customer-facing change bundle report

The report is the centerpiece of "kill multiple birds at once". Each bundle produces:

1. A **PDF** uploaded to a storage provider; URL persisted as `compliance_change_bundles.reportPdfUrl`.
2. An **email** (Resend) with the PDF attached + an inline summary + a "Reply with your decisions" prompt.
3. An **HTML preview** in the admin UI for staff review before sending.

### 7.1 PDF / email structure

```
[ TCT Compliance Update — {Customer Name} ]

Hi {Primary Contact First Name},

We've reviewed your environment and identified {N} security changes
we'd like to make on your behalf. Each one is described below in
plain language, with a recommended rollout date. Please reply with
"yes / no / later" for each, and any preferred dates.

────────────────────────────────────────────────────
Change 1 of {N} — {Action Name}
────────────────────────────────────────────────────

What it does
  {customerImpactSummary.userFacing}

How it affects your team
  • Who it affects: {blastRadius in plain English}
  • Time impact per person: {estimatedDisruptionMinutes} minutes
  • Sign-in interruption: {sessionDisruptive ? Yes : No}
  • Action required by your team: {requiresEndUserAction ? "yes — set up authenticator app" : "no"}

Why we're recommending it
  Required to satisfy: {control names}, part of {framework name}.

Our suggested rollout date
  {proposedDate}

────────────────────────────────────────────────────
Change 2 of {N} …
────────────────────────────────────────────────────

How to respond
  Reply to this email with one of:
   - "Approve all and proceed with suggested dates"
   - Per-change responses ("Change 1: yes, March 18", "Change 2: defer", "Change 3: no")
   - Or schedule a 15-minute call to discuss.

Thank you,
{TCT Staff Name}
```

The PDF version is the durable artifact stored in `reportPdfUrl` and referenced from audit log.

### 7.2 Email template
Rendered server-side; uses Resend. Lives in `src/lib/compliance/bundle-report/email-template.tsx`. Must comply with the existing UI standards (no forbidden colors, no inline secrets, full URLs via `NEXT_PUBLIC_BASE_URL`).

### 7.3 PDF generation
Same content rendered via a PDF library (e.g. `@react-pdf/renderer`, already a dependency for business review PDFs in reporting). Stored in Vercel Blob or equivalent; URL persisted.

### 7.4 Recording customer responses
Customer replies arrive as email replies, phone notes, or in-person notes. Staff opens the bundle in the admin UI and records each item's decision (approved / declined / deferred) plus the agreed deployment date. The bundle item carries `decisionRecordedBy` = the staff member entering it; `customerNote` is the verbatim customer text if any.

This is consistent with "staff attestation is sufficient" — the platform records what the customer said via staff, not via a separate customer login.

---

## 8. Audit + reporting

### 8.1 Audit trail
Every state change writes to `compliance_audit_log`. A bundle that has gone through the full lifecycle produces ~15–25 audit rows. The audit is consultable per change, per bundle, per customer.

### 8.2 Compliance evidence reports
Because every change has staff attestation, communication method, customer-decision record, deployment timestamp, verification result, and a PDF artifact, the lifecycle naturally produces the evidence framework auditors will ask for ("show me how you communicated this change to the customer, the customer's agreement, and the verification that it worked"). The data model is built for this; no additional reporting plumbing is required beyond a "Print evidence pack for control X" button on the cockpit.

### 8.3 Stale-disposition surfacing
Dispositions older than N days (e.g., `accepted_risk` more than 90 days without `lastReviewedAt`) surface in the cockpit as needing review. Auditors expect periodic re-review of accepted risks.

---

## 9. Integration with billable work

When a disposition's `lifecycleStatus` becomes `billable_project`:

1. The cockpit prompts: "Is there a Compliance Operations project for this customer?" If yes, the next phase is selected; if no, one is created (`Project.name = "Compliance Operations"`, persistent).
2. A `PhaseTask` is created under the current open phase with:
   - Title = `[Compliance] {control name} — {action name (if any)}`
   - Description = the finding reasoning + suggested remediation + linked pending change reference
   - Assignee = the StaffUser from disposition
   - Due date = disposition.dueDate
3. `compliance_finding_dispositions.projectId` and `phaseTaskId` are populated.
4. PhaseTask status updates flow back: when the task is marked complete in the project view, the disposition's `lastReviewedAt` updates and the cockpit prompts staff to either run verification or close the disposition.

This means billable compliance work appears in pipeline status, technician reports, and the customer portal (project tab) without any new reporting wiring.

---

## 10. Authorization

- **Create / edit pending changes:** any staff with `manage_compliance` permission (new permission key)
- **Send bundles to customers:** same; default-on for ADMIN, opt-in for TECHNICIAN
- **Deploy automated actions:** ADMIN only — automated execution can have tenant-wide blast radius
- **Deploy manual actions (mark as deployed):** TECHNICIAN+
- **Override / accept risk:** ADMIN only
- **Read all of the above:** SUPER_ADMIN, ADMIN, BILLING_ADMIN, TECHNICIAN

Permission additions go into `src/lib/permissions.ts`.

---

## 11. What this design does NOT do

- **No customer portal sign-off.** Customers respond via email/phone/meeting; staff records the decision. If we ever build a customer self-service portal for changes, the bundle item's `customerDecision` is the field a customer-facing form would write to.
- **No automatic bundling.** Staff manually drag pending changes into a bundle. We may add a "suggest bundle" helper later (e.g., group by deployment window, by blast radius).
- **No DAG orchestration.** Each action is atomic. If a remediation requires multiple steps, that's multiple actions, multiple pending changes, separate verifications. The bundle is the only grouping primitive.
- **No automatic verification scheduling.** Verification re-runs the evaluator immediately after `delaySecondsBeforeVerify`. If it fails, the change is rolled back / flagged; we don't retry later.
- **No partial-execution recovery.** If an automated executor fails partway through (some users got MFA enforced, some didn't), the change goes to `rolled_back` and staff investigates manually. We do not attempt automated half-rollback.
- **No multi-customer batch operations.** Every bundle is scoped to one customer. Internal "deploy MFA to these 10 customers" is N separate bundles.

---

## 12. Action items captured

| # | Item | Where |
|---|------|-------|
| C1 | Build action catalog scaffolding + types | new: `src/lib/compliance/actions/types.ts`, `catalog.ts`, `validators.ts` |
| C2 | Seed initial catalog with 10–15 high-value actions | same |
| C3 | Build-time lint: every action requires non-empty `impact.userFacing` | new: `scripts/validate-action-catalog.ts` run in CI |
| C4 | Add 4 new tables to `ensure-tables.ts` (pending_changes, change_bundles, change_bundle_items, finding_dispositions) | `src/lib/compliance/ensure-tables.ts` |
| C5 | Build Pending Change API routes (§6.1) | new under `src/app/api/compliance/[companyId]/changes/` |
| C6 | Build Bundle API routes (§6.2) | new under `src/app/api/compliance/[companyId]/bundles/` |
| C7 | Build Disposition API routes (§6.3) | new under `src/app/api/compliance/[companyId]/dispositions/` |
| C8 | Build Action Catalog API routes (§6.4) | new under `src/app/api/compliance/actions/` |
| C9 | Build Pending Changes admin UI (per-customer changes page) | new: `src/app/admin/compliance/[companyId]/changes/page.tsx` |
| C10 | Build Bundle composer + preview | new component: `BundleComposer.tsx` |
| C11 | Build customer-facing bundle report (HTML + PDF + email) | new: `src/lib/compliance/bundle-report/` |
| C12 | Build verification runner (re-run evaluator after `delaySecondsBeforeVerify`) | hook into `engine.ts` |
| C13 | Build executor framework (automated handlers registered by id) | new: `src/lib/compliance/actions/executors/` |
| C14 | Wire disposition lifecycle into AssessmentResults / Findings UI | `AssessmentResults.tsx` + new Findings page |
| C15 | Add `manage_compliance` permission to permissions.ts | `src/lib/permissions.ts` |
| C16 | Stale-disposition surfacing in cockpit | `Cockpit.tsx` |
| C17 | Wire billable dispositions to per-customer Compliance Operations project | new helper in `src/lib/compliance/billable-handoff.ts` |

These all carry into `docs/current-tasks.md`.
