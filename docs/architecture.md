# Architecture

> Last updated: 2026-04-24

## System Overview

Triple Cities Tech is a Next.js 15 App Router application with:
- **Public site** — marketing pages, blog, contact form, scheduling
- **Admin dashboard** — staff-only project management, AI tools, blog CMS, SOC analyst, reporting & analytics, platform monitoring, marketing campaigns
- **Customer portal** — per-company onboarding with ticket timeline, invite system, portal roles

All four surface areas share one Next.js deployment on Vercel (iad1).

## Technology Stack

```
┌─────────────────────────────────────────────┐
│  Browser                                    │
│  React 18 + Tailwind CSS + Recharts         │
│  NextAuth session (Azure AD)                │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│  Vercel Edge (middleware.ts)                 │
│  Security headers, bot blocking, CSP        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Next.js App Router                         │
│  src/app/api/**  (100+ REST API routes)     │
│  30s default / 60s for sync routes          │
└──────┬──────────┬───────────┬───────────────┘
       │          │           │
┌──────▼──────┐  ┌▼─────────┐ ┌▼──────────────┐
│  Prisma 7   │  │ Claude   │ │ Autotask PSA  │
│  PostgreSQL │  │ API      │ │ REST API v1.0 │
│  (Vercel)   │  │ (25s TO) │ │ (sync/tickets)│
│  + raw SQL  │  └──────────┘ └───────────────┘
│  (reporting,│
│   SOC, test)│
└─────────────┘
```

## Authentication Flow

```
User → /admin/* → middleware checks path
  → NextAuth session check (src/auth.ts)
    → Azure AD OAuth (PKCE)
    → On sign-in: validate email against staff_users table
    → Session enriched with { role, staffId }
    → Roles: ADMIN | MANAGER | VIEWER
```

**Key files:**
- `src/auth.ts` — NextAuth config, Azure AD provider, Prisma adapter
- `src/middleware.ts` — security headers, suspicious request blocking
- `prisma/schema.prisma` — `StaffUser`, `Account`, `Session`, `User` models

## Create Company Flow

```
NewCompanyForm.tsx                     POST /api/companies
┌─────────────────┐                   ┌──────────────────────────┐
│ Form submit      │ ──fetch POST──▶ │ 1. auth() check           │
│                  │                  │ 2. Generate password      │
│ Shows spinner    │                  │ 3. Generate unique slug   │
│                  │                  │ 4. prisma.company.create  │
│ On success:      │ ◀──{success,──  │ 5. Return envelope:       │
│ redirect to      │    id, url}      │    {success, id, url,     │
│ /admin/companies │                  │     requestId}            │
│                  │                  │                           │
│ On error:        │ ◀──{error,────  │ 6. Log with requestId     │
│ show inline msg  │    requestId}    │    + latency              │
└─────────────────┘                   └──────────────────────────┘
```

**Key files:**
- `src/components/companies/NewCompanyForm.tsx` — client form
- `src/app/api/companies/route.ts` — POST handler
- `src/app/admin/companies/new/page.tsx` — page wrapper

## AI Project Chat Flow

```
AIProjectAssistant.tsx                POST /api/admin/ai-chat
┌─────────────────────┐              ┌────────────────────────────┐
│ User types message   │──fetch───▶  │ 1. auth() check             │
│                      │             │ 2. Build system prompt       │
│ Show typing dots     │             │    with project context      │
│                      │             │ 3. anthropic.messages.create │
│ Display AI response  │◀─{message}─ │    model: haiku              │
│                      │             │    timeout: 25s              │
│ If JSON detected:    │             │ 4. Return {message, usage,   │
│ show "Create Phases" │             │    requestId}                │
│                      │             └────────────────────────────┘
│ On "Create Phases":  │
│ POST /api/phases ×N  │──sequential──▶ prisma.phase.create
│ POST /api/tasks ×N   │──sequential──▶ prisma.phaseTask.create
│ Reload page          │
└─────────────────────┘
```

**Key files:**
- `src/components/admin/AIProjectAssistant.tsx` — chat widget
- `src/app/api/admin/ai-chat/route.ts` — AI endpoint
- `src/app/api/phases/route.ts` — phase CRUD
- `src/app/api/tasks/route.ts` — task CRUD

## Blog Generation Flow (Automated)

```
Vercel Cron (MWF 8AM UTC)
  → GET /api/cron/generate-blog
    → ContentCurator: fetch RSS feeds (10s timeout)
    → BlogGenerator: call Claude Sonnet for content
    → prisma.blogPost.create (status: DRAFT)
    → Send approval email via Resend
    → Staff clicks approve/reject link
    → /api/blog/approval handles status change
    → Vercel Cron (15min): publish if scheduledFor <= now
```

**Key files:**
- `src/lib/content-curator.ts` — RSS aggregation
- `src/lib/blog-generator.ts` — AI content generation
- `src/app/api/cron/generate-blog/route.ts` — cron handler
- `src/app/api/blog/approval/route.ts` — approval workflow

## Autotask PSA Sync Flow

```
Autotask REST API v1.0
  │
  ▼
GET /api/autotask/trigger?step=<step>
  ├─ step=companies  → AutotaskClient.getAllProjects() → getCompany(id)
  │                    → prisma.company.upsert (by autotaskCompanyId)
  │
  ├─ step=projects   → AutotaskClient.getAllProjects() (paginated, 5/page)
  │   For each:
  │   ├─ syncProject → prisma.project.upsert (by autotaskProjectId)
  │   ├─ getProjectPhases → syncPhase → prisma.phase.upsert (by autotaskPhaseId)
  │   ├─ getProjectTasks  → syncTask  → prisma.phaseTask.upsert (by autotaskTaskId)
  │   └─ getProjectNotes  → prisma.comment.create
  │
  ├─ step=merge      → Find duplicate companies by name
  │                    → Move projects/contacts to AT-synced winner
  │                    → Delete non-AT duplicates
  │
  └─ step=resync     → Re-fetch phases+tasks for AT projects
                       → Clean up empty phases
                       → Update phase statuses from task completion
```

**Key files:**
- `src/lib/autotask.ts` — API client, types, status mappers
- `src/app/api/autotask/trigger/route.ts` — multi-step sync (main file)
- `src/app/api/autotask/status/route.ts` — sync history

**See `AUTOTASK_SYNC.md` for full documentation.**

## SOC Analyst Agent Flow

```
Autotask Tickets (security-related)
  │
  ▼
GET /api/soc/tickets → fetch from Autotask, filter by security keywords
  │
  ▼
POST /api/soc/run → SOC Engine (src/lib/soc/engine.ts)
  ├─ For each ticket:
  │   ├─ IP extraction (src/lib/soc/ip-extractor.ts)
  │   ├─ Rule matching (src/lib/soc/rules.ts)
  │   ├─ AI screening via Claude Haiku (Tier 1)
  │   │   → alertSource, category, isFalsePositive, confidence
  │   ├─ AI deep analysis via Claude Sonnet (Tier 2, if needed)
  │   │   → verdict, confidence, reasoning, ticketNote
  │   ├─ Correlation check (src/lib/soc/correlation.ts)
  │   │   → merge recommendations for related incidents
  │   ├─ Context enrichment:
  │   │   ├─ Historical FP rate (getHistoricalFpRate)
  │   │   ├─ Technician roster (getTechnicianRoster)
  │   │   └─ Device verification (technician-verifier.ts)
  │   ├─ Reasoning generation via Claude Sonnet (Tier 3)
  │   │   → SocReasoning: incidentSummary, classification (5-value),
  │   │     riskLevel, confidence, evidence[], recommendedAction,
  │   │     customerMessageRequired, customerMessageDraft, internalNote
  │   └─ Create/update soc_incidents + soc_pending_actions + soc_activity_log
  │
  ▼
Admin UI (/admin/soc)
  ├─ Dashboard: ticket-centric view, actionable filter, trend analysis
  ├─ Ticket Detail: reasoning-first layout:
  │   1. Ticket Header (number, status, priority, company)
  │   2. Incident Summary (plain-language from reasoning)
  │   3. Security Assessment (classification badge + risk + confidence)
  │   4. Investigation Evidence (dynamic EvidenceItem[] with colors)
  │   5. Recommended Action
  │   6. Pending Actions (approve/reject, below reasoning)
  │   7. Technical Details (collapsed)
  │   Legacy fallback for old records without reasoning data
  ├─ Rules: AI-generated + manual rules, enable/disable
  ├─ Config: engine settings, run controls
  └─ Human approval: review AI recommendations → approve/reject actions

Classification system (5 values):
  false_positive (green) | expected_activity (cyan) | informational (blue)
  suspicious (rose) | confirmed_threat (red)

Customer message gating: only created when reasoning.customerMessageRequired === true
```

**Key files:**
- `src/lib/soc/` — engine, correlation, rules, prompts, types, IP extractor, technician-verifier
- `src/app/api/soc/` — 11 endpoints (tickets, incidents, rules, trends, run, config, etc.)
- `src/components/soc/` — dashboard, ticket detail (reasoning-first), config panel, rules manager, flowchart
- Tables: `soc_incidents` (with `reasoning` JSONB), `soc_ticket_analysis`, `soc_activity_log`, `soc_pending_actions`, `soc_rules`, `soc_config`, `soc_job_status`, `datto_devices`, `soc_communications` (raw SQL, not Prisma)

## Reporting & Analytics Flow

```
Autotask API
  │
  ▼
Backfill Pipeline (src/lib/reporting/backfill.ts)
  ├─ Self-chaining: one API call triggers next batch server-side
  ├─ Batch: 7 days per invocation to avoid timeouts
  ├─ Self-healing: ensure-tables.ts auto-creates missing tables
  └─ Writes to: report_tickets, report_time_entries, report_ticket_notes
       │
       ▼
Real-time Queries (src/lib/reporting/realtime-queries.ts)
  ├─ Dashboard metrics: open/closed/SLA/resolution time
  ├─ Company health scores (src/lib/reporting/health-score.ts)
  ├─ Technician performance
  ├─ Trend analytics (src/lib/reporting/analytics.ts)
  └─ API user filtering (src/lib/reporting/api-user-filter.ts)
       │
       ▼
Admin UI (/admin/reporting)
  ├─ Dashboard: stat cards, trend charts (Recharts AreaChart), drill-downs
  ├─ Analytics: date range filtering, AI assistant with conversation history
  ├─ Business Review: downloadable PDF, SLA metrics, cross-period tracking
  ├─ Companies: per-company detail with health score
  ├─ Technicians: per-tech performance metrics
  └─ Health: health score distribution across all companies
```

**Key files:**
- `src/lib/reporting/` — 20+ modules (aggregation, analytics, backfill, health-score, sla-config, etc.)
- `src/app/api/reports/` — 17 endpoints
- `src/components/reporting/` — 18 components
- Tables: `report_tickets`, `report_time_entries`, `report_ticket_notes`, `report_aggregations`, `report_schedules`, `report_targets` (raw SQL, not Prisma)

## Compliance Evidence & Assessment Flow

The largest single subsystem: ~14,000 LOC across `src/lib/compliance/` and `src/app/api/compliance/`. Automates CIS v8 (full) and CMMC L1 (full) assessments today; type-stubbed for CMMC L2, NIST 800-171, HIPAA, PCI (assessments can be created but only policy-coverage analysis is produced — no control evaluations).

> **Active redesign in progress (2026-05-13).** The current 6-step Guided Workflow, three overlapping intake stores, and missing remediation system are being reworked into a bootstrap-plus-cockpit shape with a Change Bundle remediation lifecycle. See `docs/plans/COMPLIANCE_ARCHITECTURE.md`, `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md`, and `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` for the design contract that supersedes this section. The text below describes the system **as currently implemented**.

```
Admin UI                         /api/compliance/assessments (POST)
┌─────────────────┐             ┌──────────────────────────────────┐
│ Start assessment│ ──────────▶ │ engine.runAssessment             │
│ for Company X   │              │ (src/lib/compliance/engine.ts)   │
│  framework:     │              └──────────────────────────────────┘
│   cis-v8        │                             │
└─────────────────┘                             ▼
                               ┌─────────────────────────────────────┐
                               │ 1. ensureComplianceTables()         │
                               │    self-healing raw SQL, creates    │
                               │    18 tables if missing             │
                               └─────────────────────────────────────┘
                                               │
                                               ▼
                               ┌─────────────────────────────────────┐
                               │ 2. Dispatch configured collectors   │
                               │    (Promise.allSettled — parallel)  │
                               │                                     │
                               │  collectors/graph.ts  ──▶ M365 API  │
                               │  collectors/msp.ts    ──▶ Datto,    │
                               │                          DNSFilter, │
                               │                          IT Glue,   │
                               │                          Domotz,    │
                               │                          SaaS Alerts│
                               │                          Ubiquiti,  │
                               │                          MyITProcess│
                               └─────────────────────────────────────┘
                                               │
                                               ▼
                               ┌─────────────────────────────────────┐
                               │ 3. Store as EvidenceRecord          │
                               │    (sourceType, rawData JSONB,      │
                               │     summary, validForHours)         │
                               │    → compliance_evidence            │
                               └─────────────────────────────────────┘
                                               │
                                               ▼
                               ┌─────────────────────────────────────┐
                               │ 4. Evaluate each control            │
                               │    CIS_V8_EVALUATORS[controlId](ctx)│
                               │    → Finding {status, confidence,   │
                               │       reasoning, remediation}       │
                               │    → compliance_findings            │
                               └─────────────────────────────────────┘
                                               │
                                               ▼
                               ┌─────────────────────────────────────┐
                               │ 5. Update assessment summary        │
                               │    + compliance_audit_log entry     │
                               └─────────────────────────────────────┘
```

**Key concepts:**
- **Collector adapter**: each integration exposes `(companyId, assessmentId) => { evidence[], errors[] }`. Dispatch is currently `if (availableConnectors.has('x')) collectors.push(...)` in `engine.ts`.
- **Evidence is tool-agnostic**: `EvidenceRecord` is the single shape — `sourceType`, `rawData` (JSONB snapshot), `summary` (human readable). Evaluators read by `sourceType`.
- **Capability registry** (`src/lib/compliance/registry/`) catalogs which tools satisfy which capabilities (e.g., `mfa_status` → `microsoft_graph`). Currently informational — evaluators don't yet consume it. Planned operationalisation.
- **Frameworks implemented**: CIS v8 (65 controls, 65 evaluators in `frameworks/cis-v8.ts`, with IG1 / IG2 / IG3 selectivity) and CMMC L1 (`frameworks/cmmc-l1.ts`, full). `FrameworkId` type also declares CMMC L2 / NIST 800-171 / HIPAA / PCI but these have only policy-mapping coverage, no evaluators — assessments against them complete with empty findings.
- **Policy generation** is a parallel flow: `src/lib/compliance/policy-generation/` takes an org profile + policy-specific questionnaire + framework mappings, builds a Claude prompt, returns Markdown. Versioned in `policy_versions`.
- **6-step Guided Workflow** at `/admin/compliance/workflow` is a UI veneer — step status is **computed on every request** from row counts and timestamps in the underlying tables, not persisted. There is no `compliance_workflow_status` table. The legacy `/admin/compliance` tabbed dashboard (`ComplianceDashboard.tsx`) still exists alongside the workflow stepper (`ComplianceWorkflow.tsx`) and the separate setup wizard at `/admin/compliance/setup` (`ComplianceSetupWizard.tsx`); the workflow redesign plan consolidates them.
- **Assessment comparison** (`engine.compareAssessments(currentId, previousId)`) is implemented and returns deltas (newly passed, newly failed, improved, regressed). The 6-step UI's "Step 6 Final Assessment" is purely a temporal label — no `isFinal` schema column.
- **Remediation / deployment / change management is NOT YET IMPLEMENTED**. Findings have a `remediation` text column (descriptive only) and an `overrideStatus` column (manual scoring override). There is no executor framework, no Change Bundle workflow, no customer-impact analysis layer. See `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` for the proposed design.
- **Credentials** for each integration come from either `process.env.*` (MSP-global — Datto, DNSFilter, etc.) or `companies.m365_client_secret` (M365 only, plaintext today). Migration to encrypted per-tenant storage is tracked in `docs/runbooks/CREDENTIALS_MIGRATION.md`.

**Key files:**
- `src/lib/compliance/engine.ts` — assessment lifecycle orchestrator (~57 KB; includes `runAssessment`, `compareAssessments`, `overrideFinding`, connector management)
- `src/lib/compliance/types.ts` — `FrameworkId`, `ControlDefinition`, `EvidenceRecord`, `Finding`, `EvaluationContext`, 21 `EvidenceSourceType` variants
- `src/lib/compliance/collectors/` — `graph.ts` (M365 — Secure Score / CA / MFA / Intune / Defender / audit), `msp.ts` (Datto RMM/EDR/BCDR, DNSFilter, IT Glue, Domotz, SaaS Alerts, Ubiquiti, EasyDMARC, MyITProcess)
- `src/lib/compliance/frameworks/cis-v8.ts` — 65 control definitions + 65 evaluator functions + `applyPolicyCoverage` enhancement
- `src/lib/compliance/frameworks/cmmc-l1.ts` — CMMC L1 framework + evaluators (full)
- `src/lib/compliance/registry/` — `capabilities.ts`, `tool-definitions.ts`, `control-capability-map.ts`, `resolver.ts`
- `src/lib/compliance/policy-generation/` — `generator.ts`, `catalog.ts`, `framework-mappings.ts`, `questionnaire.ts`, `export.ts`, `types.ts`
- `src/lib/compliance/saas-alerts-normalizer.ts` — webhook normalisation
- `src/components/compliance/` — `ComplianceDashboard.tsx` (legacy tabs), `ComplianceWorkflow.tsx` (6-step stepper), `ComplianceSetupWizard.tsx` (env discovery — duplicates profile), `PlatformMappingPanel.tsx`, `PolicyManager.tsx`, `PolicyGenerationDashboard.tsx` (largest component in repo at 87 KB), `AssessmentResults.tsx`, `ToolCapabilityMap.tsx`
- `src/app/api/compliance/` — ~22 route directories: `/`, `assessments/[id]`, `assessments/[id]/cowork-worksheet`, `connectors`, `customer-context`, `workflow-status`, `platform-mappings`, `policies`, `policies/catalog`, `policies/questionnaire`, `policies/generate`, `policies/generate/diagnose`, `policies/export`, `policies/sharepoint-scan`, `registry`, `registry/company-tools`, `ai-assist`, `portal`, `export`, `setup`, `webhooks/saas-alerts`, `debug-collectors`

**Tables (all raw SQL, not Prisma-managed, created by `src/lib/compliance/ensure-tables.ts`):**
- `compliance_connectors` — per-company integration status
- `compliance_assessments` — assessment instances + summary counters (rerunnable; no `isFinal` column)
- `compliance_evidence` — collected evidence snapshots (JSONB rawData)
- `compliance_findings` — per-control results (status, confidence, reasoning, overrides)
- `compliance_audit_log` — every compliance-related action
- `compliance_policies` + `compliance_policy_analyses` — policies and their gap analyses
- `compliance_attestations` — customer testimony for manual controls
- `compliance_platform_mappings` — explicit `company → external site/org/device` mapping (1:M — schema permits multiple rows per company per platform)
- `compliance_webhook_events` — inbound webhook events (currently SaaS Alerts only, 90-day TTL)
- `policy_org_profiles` + `policy_intake_answers` + `policy_generation_records` + `policy_versions` — policy generation pipeline
- `integration_credentials` + `integration_credential_access_log` — encrypted per-tenant credentials + read audit (dormant; populated by Wave 2 of credentials migration)

**Self-heal scope (tables historically created inline; now centralized as of 2026-05-13):**
- `compliance_company_tools` — queried by `/api/compliance/workflow-status` and `/api/compliance/registry/company-tools`. Now created by `ensure-tables.ts` so workflow-status reads are race-free even before the company-tools route is hit.
- `compliance_customer_context` — queried by `/api/compliance/customer-context`. Now created by `ensure-tables.ts`. Will be retired entirely once intake consolidates into the question engine per `COMPLIANCE_WORKFLOW_REDESIGN.md`.

**Three intake stores collect overlapping data and need consolidation:**
`policy_org_profiles.answers` (org profile), `compliance_customer_context` (environment), and the in-page state of `ComplianceSetupWizard.tsx` (also environment). The redesign uses the HR question engine (`form_schemas`, `form_responses`) as the single Customer Profile store. See `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md` §3.

**Webhook receiver**: `/api/compliance/webhooks/saas-alerts` ingests Kaseya SaaS Alerts events. Validates the partner-echoed token (env var `SAAS_ALERTS_WEBHOOK_TOKEN`) when configured, always ACKs 200 to prevent Kaseya from disabling the subscription on transient errors.

**See also:**
- `docs/plans/COMPLIANCE_ARCHITECTURE.md` — proposed consolidated architecture (six concerns, target data model, target UI surface)
- `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md` — bootstrap-plus-cockpit reshape, intake consolidation, legacy retirement plan
- `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` — Change Bundle workflow, action catalog, customer impact analysis, deployment lifecycle (greenfield)
- `docs/COMPLIANCE_PLAYBOOK.md` — per-control scoring logic, evidence sources, env-aware N/A rules
- `docs/compliance-future-integrations.md` — future tool integrations backlog

## Unified Ticket System

```
Autotask API → Raw ticket data
  │
  ▼
Adapters (src/lib/tickets/adapters.ts)
  → Normalize to UnifiedTicket type (src/types/tickets.ts)
     │
     ├─ Admin views (reporting dashboard, company detail)
     ├─ SOC dashboard (security ticket triage)
     ├─ Customer portal (customer-visible tickets)
     └─ Shared components (src/components/tickets/)
         ├─ TicketTable — sortable, filterable table
         ├─ TicketDetail — full ticket view with notes
         ├─ PriorityBadge — color-coded priority indicator
         ├─ SlaIndicator — SLA status display
         └─ TimelineEntry — chronological note display
```

## Staff Permission System

```
src/lib/permissions.ts
  │
  StaffRole (ADMIN | MANAGER | VIEWER)
  │
  ├─ ADMIN: full access to all features
  ├─ MANAGER: project management, reporting, limited config
  └─ VIEWER: read-only access to dashboards and reports

Used by: API routes, admin components, navigation visibility
```

## Marketing Campaign Flow

```
Admin creates campaign (/admin/marketing/campaigns/new)
  │
  ▼
Audience Selection
  ├─ Per-company targeting
  ├─ Autotask Contact Action Groups
  └─ Manual audience entry
  │
  ▼
Content Creation
  ├─ Manual content authoring
  ├─ AI content refinement via Claude
  └─ Content visibility controls
  │
  ▼
Campaign Workflow
  ├─ Draft → Generate → Approve → Send
  ├─ Delivery modes with magic link tokens
  └─ Email delivery via Resend
```

**Key files:**
- `src/app/api/marketing/campaigns/` — CRUD, generate, approve, publish, send
- `src/app/admin/marketing/` — campaign list, editor, audience management

## Customer Invite Flow

```
Staff (/admin/contacts)
  │
  ▼
POST /api/contacts/invite
  ├─ Assign portal role (PRIMARY, TECHNICAL, BILLING, VIEWER)
  ├─ Generate invite email via Resend
  └─ Track inviteAcceptedAt
  │
  ▼
Customer accepts → /onboarding/[companyName]
  ├─ Password gate (separate from Azure AD)
  ├─ Dashboard with projects, tickets, stats
  ├─ Ticket timeline and reply capability
  └─ First-time onboarding journey
```

**See `docs/CUSTOMER_INVITE_AND_ONBOARDING.md` for full documentation.**

## Data Model (Key Entities)

```
StaffUser ─── BlogPost
                │
Company ──── Project ──── Phase ──── PhaseTask
  │             │           │           │
  │             │         Comment     Comment
  │             │         Assignment  Assignment
  │             │
  │           AuditLog
  │
CompanyContact ─── (portal role, invite tracking)
  │
AutotaskSyncLog

MarketingCampaign ─── MarketingAudience
ErrorLog
Notification

--- Raw SQL tables (not Prisma-managed) ---
report_tickets, report_time_entries, report_ticket_notes
report_aggregations, report_schedules, report_targets
soc_incidents, soc_activities, soc_config, soc_rules
test_failures
```

Each Prisma entity can have Autotask ID fields (`autotaskCompanyId`, `autotaskProjectId`, etc.) linking them to Autotask records. Raw SQL tables are created via migration endpoints and auto-healed by `ensure-tables.ts`. See `prisma/schema.prisma` for the full Prisma schema.

## Structured Logging

All API routes use `src/lib/server-logger.ts`:
- Every request gets a `requestId` (UUID)
- Timing captures: total latency, DB time, AI time
- Structured JSON format: `{ timestamp, requestId, level, message, context }`
- Security events via `src/lib/security.ts:logSecurityEvent()`

## Error Handling

- **API routes**: Standard response envelope `{ success, data?, error?, requestId }`
- **Client**: `AdminErrorBoundary` wraps all admin pages
- **AI calls**: 25s timeout via AbortController; errors surfaced to user
- **Non-critical failures** (audit logs): caught and logged, don't block primary operation
- **Self-healing tables**: `ensure-tables.ts` auto-creates missing reporting/SOC tables before queries run
- **Self-chaining sync**: Backfill auto-triggers next batch on completion; no manual retry needed
- **SOC engine**: Never silently swallows AI errors; surfaces per-ticket error detail in dashboard

## Cron Jobs

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| MWF 8AM UTC | `/api/cron/generate-blog` | AI blog content generation |
| Daily noon | `/api/cron/approval-emails` | Send blog approval emails |
| Every 15min | `/api/cron/publish-blog` | Publish approved blog posts |
| Configurable | `/api/cron/autotask-sync` | Autotask data sync |

Auth: Vercel sets `Authorization: Bearer <CRON_SECRET>` automatically. Do not use secrets in URL paths.
