# Data Model — Triple Cities Tech

> **Canonical reference for the database schema and data architecture.**
> Read this to understand the database without reading all 1,323 lines of `prisma/schema.prisma`.

---

## 1. Overview

The platform uses **Prisma ORM** with **PostgreSQL** (Vercel Postgres) as its primary data store. The database serves multiple purposes:

- **Project management**: Tracking customer companies, projects, phases, and tasks
- **Autotask PSA integration**: Syncing companies, projects, contacts, tickets, and time entries from an external PSA system
- **Blog & marketing**: AI-generated content, approval workflows, audience targeting, campaign delivery
- **SOC (Security Operations Center)**: AI-driven security alert triage and incident tracking
- **Reporting & analytics**: Ticket lifecycle metrics, SLA compliance, technician performance, customer health scores
- **Platform monitoring**: API usage tracking, health snapshots, error logging, threshold alerts

The database has two layers:
1. **Prisma-managed models** — defined in `prisma/schema.prisma`, migrated via Prisma migrations
2. **Raw SQL tables** — created at runtime via migration endpoints, used by SOC and reporting subsystems

**Key file**: `src/lib/prisma.ts` — singleton PrismaClient with PrismaPg adapter for serverless connection pooling.

---

## 2. Core Entities

### Company

**Purpose**: Represents a customer organization.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `slug` | String (unique) | URL-friendly identifier (e.g., `acme-manufacturing`) |
| `displayName` | String | Human-readable name |
| `primaryContact` | String? | Contact name |
| `contactEmail` | String? | Contact email |
| `passwordHash` | String | bcrypt hash for customer portal access |
| `autotaskCompanyId` | String? (unique) | Autotask Company/Account ID |
| `autotaskLastSync` | DateTime? | Last successful sync |
| `companyClassification` | String? | Autotask classification (e.g., "Platinum Managed Service") |

**Relationships**:
- Has many `Project`
- Has many `CompanyContact`
- Has many `Ticket`
- Has many `BusinessReview`

**Used in**: Admin dashboard, customer portal (`/onboarding/[companyName]`), Autotask sync, reporting, SOC

**Table name**: `companies`

---

### CompanyContact

**Purpose**: Individual contacts within a customer company. Supports customer portal access with role-based permissions.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `companyId` | String | FK to Company |
| `name` | String | Contact name |
| `email` | String | Contact email |
| `title` | String? | Job title |
| `phone` | String? | Phone number |
| `phoneType` | PhoneType? | MOBILE or WORK |
| `isPrimary` | Boolean | Primary contact flag |
| `customerRole` | CustomerRole | CLIENT_MANAGER, CLIENT_USER, CLIENT_VIEWER |
| `inviteStatus` | InviteStatus | NOT_INVITED, INVITED, ACCEPTED, DECLINED |
| `autotaskContactId` | String? (unique) | Autotask Contact ID |

**Relationships**:
- Belongs to `Company` (cascade delete)

**Used in**: Admin contact management, customer portal auth, Autotask contact sync, marketing audience resolution

**Table name**: `company_contacts`

---

### Project

**Purpose**: A customer project (onboarding, migration, security implementation, or custom).

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `companyId` | String | FK to Company |
| `projectType` | ProjectType | ONBOARDING, M365_MIGRATION, FORTRESS, CUSTOM |
| `title` | String | Project title |
| `slug` | String (unique) | URL-friendly identifier |
| `status` | ProjectStatus | ACTIVE, COMPLETED, ON_HOLD, CANCELLED |
| `currentPhaseId` | String? | Active phase reference |
| `aiGenerated` | Boolean | Whether AI created this project |
| `generationPrompt` | String? | Original Claude API prompt |
| `autotaskProjectId` | String? (unique) | Autotask Project ID |

**Relationships**:
- Belongs to `Company` (cascade delete)
- Has many `Phase`
- Has many `AuditLog`

**Used in**: Admin project management, customer portal, Autotask sync

**Table name**: `projects`

---

### Phase

**Purpose**: A stage within a project (e.g., "Assessment", "Migration", "Verification").

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `projectId` | String | FK to Project |
| `title` | String | Phase name |
| `description` | String? | Phase description |
| `status` | PhaseStatus | NOT_STARTED, SCHEDULED, WAITING_ON_CUSTOMER, IN_PROGRESS, REQUIRES_CUSTOMER_COORDINATION, DISCUSSED, COMPLETE |
| `owner` | PhaseOwner? | TCT, CUSTOMER, BOTH |
| `orderIndex` | Int | Sort order |
| `isVisibleToCustomer` | Boolean | Customer portal visibility |
| `autotaskPhaseId` | String? (unique) | Autotask Phase ID |
| `customerNotes` | String? | Visible to customer |
| `internalNotes` | String? | Staff only |

**Relationships**:
- Belongs to `Project` (cascade delete)
- Has many `PhaseTask`
- Has many `Comment`
- Has many `Assignment`
- Has many `AuditLog`

**Used in**: Admin project detail, customer portal, Autotask sync

**Table name**: `phases`

---

### PhaseTask

**Purpose**: Individual work items within a phase. Supports sub-tasks (up to 3 levels).

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `phaseId` | String | FK to Phase |
| `taskText` | String | Task description |
| `status` | TaskStatus | 12 statuses (NOT_STARTED through CUSTOMER_NOTE_ADDED) |
| `completed` | Boolean | Legacy field — use `status` instead |
| `priority` | Priority | LOW, MEDIUM, HIGH, URGENT |
| `assignedTo` | String? | Assignee email |
| `dueDate` | DateTime? | Due date |
| `isVisibleToCustomer` | Boolean | Customer portal visibility |
| `parentTaskId` | String? | Self-reference for sub-tasks |
| `autotaskTaskId` | String? (unique) | Autotask Task ID |

**Relationships**:
- Belongs to `Phase` (cascade delete)
- Has many `PhaseTask` (sub-tasks, self-referential)
- Has many `Comment`
- Has many `Assignment`

**Used in**: Admin task management, customer portal, Autotask sync

**Table name**: `phase_tasks`

---

### Comment

**Purpose**: Comments on phases or tasks. Supports internal (staff-only) and external (customer-visible) comments.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `phaseId` | String? | FK to Phase (optional) |
| `taskId` | String? | FK to PhaseTask (optional) |
| `content` | String | Comment text |
| `isInternal` | Boolean | true = staff only |
| `authorEmail` | String | Staff email or "customer" |
| `authorName` | String | Display name |

**Used in**: Admin project detail, customer portal

**Table name**: `comments`

---

### Assignment

**Purpose**: Staff assignments to phases or tasks.

**Key fields**: `phaseId?`, `taskId?`, `assigneeEmail`, `assigneeName`, `assignedBy`

**Constraints**: Unique per (phase + assignee) and (task + assignee)

**Table name**: `assignments`

---

### Notification

**Purpose**: Notification queue for staff (assignments, comments, status changes, mentions).

**Key fields**: `recipientEmail`, `type` (NotificationType), `entityType`, `entityId`, `title`, `message`, `isRead`

**Table name**: `notifications`

---

## 3. Operational Entities

### Ticket

**Purpose**: Local cache of Autotask service desk tickets for reporting and analytics.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `autotaskTicketId` | String (unique) | Autotask Ticket ID |
| `ticketNumber` | String | Display number |
| `companyId` | String | FK to Company |
| `title` | String | Ticket title |
| `status` | Int | Autotask status picklist value |
| `statusLabel` | String? | Resolved status label |
| `priority` | Int | Autotask priority picklist value |
| `priorityLabel` | String? | Resolved priority label |
| `queueId` | Int? | Autotask queue |
| `assignedResourceId` | Int? | Primary technician |
| `slaId` | Int? | SLA agreement |
| `createDate` | DateTime | Ticket creation date |
| `completedDate` | DateTime? | Resolution date |

**Relationships**: Belongs to `Company`

**Used in**: Reporting dashboards, SOC triage, customer portal ticket views, business reviews

**Table name**: `tickets`

---

### TicketNote

**Purpose**: Cached ticket notes from Autotask for response time tracking and communication history.

**Key fields**: `autotaskNoteId` (unique), `autotaskTicketId`, `description`, `noteType`, `publish` (1=All, 2=Internal, 3=Customer Portal), `creatorResourceId`, `creatorContactId`

**Used in**: Reporting (first-response-time calculation), customer portal ticket timeline

**Table name**: `ticket_notes`

---

### TicketTimeEntry

**Purpose**: Time entries logged against tickets, synced from Autotask.

**Key fields**: `autotaskTimeEntryId` (unique), `autotaskTicketId`, `resourceId`, `hoursWorked`, `isNonBillable`

**Used in**: Reporting (utilization, billable hours), business reviews

**Table name**: `ticket_time_entries`

---

### Resource

**Purpose**: Cached Autotask technicians/users for reporting attribution.

**Key fields**: `autotaskResourceId` (unique Int), `firstName`, `lastName`, `email`, `isActive`

**Used in**: Reporting (technician performance), time entry attribution

**Table name**: `resources`

---

### TicketStatusHistory

**Purpose**: Status transition tracking, detected by sync diffing.

**Key fields**: `autotaskTicketId`, `previousStatus`, `newStatus`, `changedAt`

**Used in**: Reporting (lifecycle computation, reopen detection)

**Table name**: `ticket_status_history`

---

### TicketLifecycle

**Purpose**: Materialized per-ticket SLA and performance metrics.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `autotaskTicketId` | String (unique) | Links to Ticket |
| `firstResponseMinutes` | Float? | Time to first tech response |
| `fullResolutionMinutes` | Float? | Total time to resolution |
| `activeResolutionMinutes` | Float? | Active work time |
| `waitingCustomerMinutes` | Float? | Time spent waiting on customer |
| `techNoteCount` | Int | Number of tech notes |
| `reopenCount` | Int | Number of reopens |
| `isFirstTouchResolution` | Boolean | Resolved on first interaction |
| `slaResponseMet` | Boolean? | SLA response target met |
| `slaResolutionMet` | Boolean? | SLA resolution target met |

**Used in**: Reporting dashboards, SLA compliance, health scores

**Table name**: `ticket_lifecycle`

---

### TechnicianMetricsDaily / CompanyMetricsDaily

**Purpose**: Daily rollup tables for technician performance and company support metrics.

**TechnicianMetricsDaily key fields**: `resourceId`, `date`, tickets assigned/created/closed/reopened, hours logged (billable/non-billable), avg response/resolution times

**CompanyMetricsDaily key fields**: `companyId`, `date`, tickets by priority, support hours consumed, SLA compliance rates, backlog counts

**Used in**: Reporting dashboards, trend charts, business reviews

**Table names**: `technician_metrics_daily`, `company_metrics_daily`

---

### CustomerHealthScore

**Purpose**: Computed health scores for each company, tracking seven weighted factors.

**Key fields**: `companyId`, `overallScore`, `trend` (improving/stable/declining), factor scores (ticket volume, reopen rate, priority mix, support hours, resolution time, aging tickets, SLA compliance)

**Used in**: Reporting dashboard, business reviews, admin company views

**Table name**: `customer_health_scores`

---

### SOC Tables (Raw SQL — NOT Prisma-managed)

These tables are created via `/api/soc/migrate` and managed with raw SQL queries.

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `soc_ticket_analysis` | Per-ticket AI screening results — verdict, confidence, alertSource, alertCategory, aiReasoning, recommendedAction | `autotaskTicketId` (unique), `incidentId`, `verdict`, `confidenceScore`, `alertSource`, `alertCategory` |
| `soc_incidents` | Correlated incident groups linking related tickets, with reasoning layer | `reasoning` (JSONB — `SocReasoning` document), `proposedActions` (JSONB, legacy), `humanGuidance` (JSONB, legacy), `customerCommunication` (JSONB, legacy), `verdict`, `confidenceScore`, `aiSummary` |
| `soc_activity_log` | Full audit trail of SOC actions (screening, triage, approvals) | `action`, `detail`, `aiReasoning`, `metadata` (JSONB) |
| `soc_pending_actions` | Human approval queue for automated response actions | `actionType` (add_note, send_customer_message, status_change, etc.), `actionPayload` (JSONB), `status` (pending/approved/rejected/executed/failed) |
| `soc_rules` | Suppression and correlation rules (editable via admin UI) | `ruleType`, `pattern` (JSONB), `action`, `isActive`, `matchCount` |
| `soc_config` | Key-value configuration (dry_run mode, thresholds, AI model, internal_site_ids, etc.) | `key` (unique), `value` |
| `soc_job_status` | SOC pipeline job execution tracking | `jobName` (unique), `lastRunAt`, `lastRunStatus`, `lastRunMeta` (JSONB) |
| `soc_communications` | Communication lifecycle tracking (outbound messages, follow-ups) | `incidentId`, `direction`, `messageType`, `status`, `followUpDueAt` |
| `datto_devices` | Cached Datto RMM devices for technician IP verification | `dattoDeviceId` (unique), `hostname`, `extIpAddress`, `intIpAddress`, `lastUser`, `siteId`, `isTechDevice` |

**Reasoning layer (2026-03-14)**: The `soc_incidents.reasoning` JSONB column stores a `SocReasoning` document with: `incidentSummary`, `classification` (5-value), `riskLevel`, `confidence`, `assessmentRationale`, `evidence[]` (dynamic items), `recommendedAction`, `customerMessageRequired`, `customerMessageDraft`, `internalNote`. Old records without this column use legacy `proposedActions`/`humanGuidance`/`customerCommunication` columns.

**Used in**: SOC dashboard (`/admin/soc/*`), SOC triage engine (`src/lib/soc/engine.ts`)

---

### AuditLog

**Purpose**: Audit trail for project/phase/task changes.

**Key fields**: `projectId`, `phaseId?`, `staffEmail`, `staffName`, `staffRole`, `actionType` (CREATED, UPDATED, STATUS_CHANGED, DELETED, AI_GENERATED, TEMPLATE_APPLIED, PASSWORD_CHANGED), `entityType`, `changes` (JSON before/after diff)

**Used in**: Admin activity feeds, compliance

**Table name**: `audit_logs`

---

### ErrorLog

**Purpose**: Application error logging with deduplication.

**Key fields**: `level` (error/warn/fatal), `source` (server/api/client/unhandled), `message`, `stack`, `path`, `count` (dedup counter), `resolved`

**Used in**: Platform monitoring, admin error dashboard

**Table name**: `error_logs`

---

### ApiUsageLog

**Purpose**: Tracks API calls to external providers (Anthropic, Resend, Autotask).

**Key fields**: `provider`, `feature` (blog-generation, campaign-gen, ai-chat, etc.), `model`, `inputTokens`, `outputTokens`, `costCents`, `durationMs`

**Used in**: Platform monitoring dashboard, cost tracking

**Table name**: `api_usage_logs`

---

### AutotaskSyncLog

**Purpose**: Records each Autotask sync run with counts of created/updated entities.

**Key fields**: `syncType` (full/incremental), `status` (success/partial/failed), counters for companies/projects/contacts/tasks created/updated, `durationMs`, `errors`

**Used in**: Admin sync panel, platform monitoring

**Table name**: `autotask_sync_logs`

---

### TestFailure

**Purpose**: Captures e2e test failures with AI-generated debugging artifacts.

**Key fields**: `testName`, `testFile`, `errorMessage`, `errorStack`, `consoleErrors` (JSON), `networkErrors` (JSON), `screenshotPath`, `summary`, `rootCauseHypothesis`, `suggestedFix`, `status` (open/investigating/fixed/wont_fix)

**Used in**: Admin debug dashboard (`/admin/debug/failures`)

**Table name**: `test_failures`

---

### DeletedRecord

**Purpose**: Soft-delete archive for reversible deletions.

**Key fields**: `entityType`, `entityId`, `entityData` (full JSON snapshot), `relatedData` (child records), `deletedBy`, `restoredAt?`

**Used in**: Admin undo/restore operations

**Table name**: `deleted_records`

---

## 4. Blog & Marketing Entities

### BlogPost

**Purpose**: AI-generated or manually authored blog articles with approval workflow.

**Key fields**:
| Field | Type | Notes |
|-------|------|-------|
| `slug` | String (unique) | URL path |
| `title` | String | Post title |
| `content` | String | Markdown body |
| `status` | BlogStatus | DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → REJECTED → ARCHIVED |
| `visibility` | ContentVisibility | PUBLIC, CUSTOMER, INTERNAL |
| `accessToken` | String? (unique) | Magic link token for restricted posts |
| `sourceUrls` | String[] | URLs used for AI inspiration |
| `aiModel` | String? | Claude model used |
| `scheduledFor` | DateTime? | Scheduled publish time |
| `approvalToken` | String? (unique) | Email approval link token |
| `views` | Int | View counter |
| `campaignId` | String? | Linked campaign |

**Relationships**: Belongs to `StaffUser` (author), belongs to `BlogCategory?`, has many `BlogTag`

**Used in**: Public blog (`/blog`), admin blog management, cron-based publishing pipeline

**Table name**: `blog_posts`

---

### BlogCategory / BlogTag

**Purpose**: Blog taxonomy for categorization and tagging.

**Table names**: `blog_categories`, `blog_tags`

---

### CommunicationCampaign

**Purpose**: Marketing campaign — a single communication to a targeted audience.

**Key fields**: `name`, `contentType` (CommunicationContentType enum — 7 types), `topic`, `audienceId`, `visibility`, `deliveryMode` (BLOG_AND_EMAIL, EMAIL_ONLY, BLOG_ONLY), `status` (CampaignStatus — 10 states from DRAFT to CANCELLED), generated content fields, email tracking counters

**Relationships**: Belongs to `Audience`, has many `CampaignRecipient`, has many `CampaignAuditLog`

**Used in**: Admin marketing (`/admin/marketing/*`)

**Table name**: `communication_campaigns`

---

### Audience / AudienceSource

**Purpose**: Reusable audience segments with filter criteria, sourced from Autotask, HubSpot, CSV, or manual entry.

**AudienceSource**: Provider configuration (Autotask PSA, HubSpot CRM, etc.)
**Audience**: Named segment with `filterCriteria` JSON (e.g., `{ companyIds: [...] }` or `{ groupId: "..." }`)

**Table names**: `audience_sources`, `audiences`

---

### CampaignRecipient

**Purpose**: Snapshot of resolved recipients at email send time, with delivery tracking.

**Key fields**: `campaignId`, `name`, `email`, `companyName`, `emailStatus` (PENDING → SENT → DELIVERED → OPENED → FAILED → BOUNCED)

**Table name**: `campaign_recipients`

---

## 5. Authentication & Identity

### StaffUser

**Purpose**: Internal staff accounts for the admin portal.

**Key fields**: `email` (unique), `name`, `role` (StaffRole), `isActive`, `autotaskResourceId?`

**Roles** (defined in `StaffRole` enum):
| Role | Access Level |
|------|-------------|
| SUPER_ADMIN | Full control — manage staff, system settings, billing |
| ADMIN | Manage projects, companies, contacts, blog, SOC, marketing |
| BILLING_ADMIN | View projects/companies, manage billing, view reports |
| TECHNICIAN | View assigned projects/tickets, add notes, update task status |

**Auth flow**: Azure AD OAuth → NextAuth.js → matched to `StaffUser` by email. Permissions checked via `src/lib/permissions.ts`.

**Table name**: `staff_users`

---

### NextAuth Tables (Account, Session, User, VerificationToken)

**Purpose**: Standard NextAuth.js database adapter tables for OAuth.

| Model | Purpose | Table |
|-------|---------|-------|
| `User` | OAuth user identity | `users` |
| `Account` | OAuth provider credentials | `accounts` |
| `Session` | Active sessions (database strategy) | `sessions` |
| `VerificationToken` | Email verification tokens | `verification_tokens` |

**Auth flow**: Azure AD OAuth → `Account` (stores tokens) → `User` (identity) → `Session` (active login) → matched to `StaffUser` by email for role-based access.

---

### Customer Authentication

Customer portal auth is **not** OAuth-based. Companies have a `passwordHash` field on the `Company` model. Individual contacts use `CompanyContact` with `customerRole` and `inviteStatus` for portal access management. Customer sessions are managed via `src/lib/onboarding-session.ts`.

---

## 6. Integrations

### Autotask PSA (Primary External Data Source)

Autotask is the authoritative system for companies, projects, contacts, and tickets.

**Sync direction**: Autotask → Local DB (one-way sync for most data; limited write-back for task status and notes)

**Synced entities and their local models**:
| Autotask Entity | Local Model | Sync Identifier |
|----------------|-------------|-----------------|
| Companies | `Company` | `autotaskCompanyId` |
| Projects | `Project` | `autotaskProjectId` |
| Phases | `Phase` | `autotaskPhaseId` |
| Tasks | `PhaseTask` | `autotaskTaskId` |
| Contacts | `CompanyContact` | `autotaskContactId` |
| Tickets | `Ticket` | `autotaskTicketId` |
| Ticket Notes | `TicketNote` | `autotaskNoteId` |
| Time Entries | `TicketTimeEntry` | `autotaskTimeEntryId` |
| Resources | `Resource` | `autotaskResourceId` |

**Key files**: `src/lib/autotask.ts` (API client), `src/app/api/autotask/trigger/route.ts` (sync endpoint)

**Sync is tracked via**: `AutotaskSyncLog` model

---

### Claude AI (Anthropic)

AI is used for:
- Blog content generation (`src/lib/blog-generator.ts`) — writes `BlogPost`
- Campaign content generation (`src/lib/marketing/campaign-generator.ts`) — writes `CommunicationCampaign`
- SOC ticket triage (`src/lib/soc/engine.ts`) — writes to `soc_ticket_analysis`, `soc_incidents`
- Reporting AI assistant (`/api/reports/ai-assistant`) — reads from reporting tables
- Project chat — reads project data from Prisma models

**Usage tracked in**: `ApiUsageLog`

---

### Resend (Email)

Email delivery for:
- Blog approval notifications
- Campaign email sends — tracked in `CampaignRecipient.emailStatus`
- Customer portal invitations
- Report delivery — tracked in `ReportDeliveryLog`

**Usage tracked in**: `ApiUsageLog`

---

### Datto RMM

Device inventory cached in `datto_devices` (raw SQL table) for SOC technician IP verification.

---

## 7. Data Flow

### Autotask Sync Pipeline
```
Autotask REST API
  → AutotaskClient (src/lib/autotask.ts)
    → /api/autotask/trigger (multi-step sync)
      → Prisma: Company, Project, Phase, PhaseTask, CompanyContact
      → AutotaskSyncLog (audit)
```

### Ticket Reporting Pipeline
```
Autotask Tickets API
  → /api/reports/sync (reporting sync)
    → Ticket, TicketNote, TicketTimeEntry, Resource (Prisma)
      → Lifecycle computation → TicketLifecycle
        → Daily aggregation → TechnicianMetricsDaily, CompanyMetricsDaily
          → Health scoring → CustomerHealthScore
            → Business reviews → BusinessReview
```

### SOC Triage Pipeline
```
Ticket table (cached Autotask tickets)
  → SOC Engine (src/lib/soc/engine.ts)
    → Tier 1: Claude Haiku screening → soc_ticket_analysis
      → Tier 2: Claude Sonnet deep analysis (if needed)
        → Correlation → soc_incidents
          → Context enrichment (historical FP rate, technician roster, device verification)
            → Tier 3: Claude Sonnet reasoning → SocReasoning JSONB on soc_incidents
              → Derive pending actions (customer messages gated by customerMessageRequired)
                → Human approval → soc_pending_actions
                  → Action execution → soc_activity_log
```

### Blog Publishing Pipeline
```
AI Generation (Claude API) or Manual Draft
  → BlogPost (status: DRAFT)
    → Approval email (Resend) → PENDING_APPROVAL
      → Admin review → APPROVED
        → Cron publish → PUBLISHED (public blog)
```

### Marketing Campaign Pipeline
```
Campaign creation → CommunicationCampaign (DRAFT)
  → AI content generation → CONTENT_READY
    → Admin approval → APPROVED
      → Blog publish → PUBLISHED
        → Audience resolution → CampaignRecipient (snapshot)
          → Email send (Resend) → SENT
```

### Customer Portal
```
Company.passwordHash (auth)
  → CompanyContact (role-based access)
    → Project/Phase/PhaseTask (filtered by isVisibleToCustomer)
    → Ticket (via Autotask ticket cache)
      → TicketNote (customer-visible notes only)
```

---

## 8. Important Constraints

### Unique Identifiers
- All primary keys are UUIDs (`@id @default(uuid())`)
- Autotask sync IDs are unique: `autotaskCompanyId`, `autotaskProjectId`, `autotaskPhaseId`, `autotaskTaskId`, `autotaskContactId`, `autotaskTicketId`, `autotaskNoteId`, `autotaskTimeEntryId`, `autotaskResourceId`
- Slugs are unique: `Company.slug`, `Project.slug`, `BlogPost.slug`
- Email uniqueness: `StaffUser.email`, `User.email`

### Foreign Keys and Cascade Rules
| Relationship | On Delete |
|-------------|-----------|
| Company → Project | Cascade |
| Company → CompanyContact | Cascade |
| Project → Phase | Cascade |
| Phase → PhaseTask | Cascade |
| Phase → Comment | Cascade |
| Phase → Assignment | Cascade |
| PhaseTask → Comment | Cascade |
| PhaseTask → PhaseTask (sub-tasks) | Cascade |
| Project → AuditLog | Cascade |
| Phase → AuditLog | SetNull |
| User → Account | Cascade |
| User → Session | Cascade |
| CommunicationCampaign → CampaignRecipient | Cascade |
| CommunicationCampaign → CampaignAuditLog | Cascade |

### Composite Unique Constraints
- `CompanyContact`: (`companyId`, `email`)
- `Account`: (`provider`, `providerAccountId`)
- `Assignment`: (`phaseId`, `assigneeEmail`) and (`taskId`, `assigneeEmail`)
- `TechnicianMetricsDaily`: (`resourceId`, `date`)
- `CompanyMetricsDaily`: (`companyId`, `date`)
- `BusinessReview`: (`companyId`, `reportType`, `variant`, `periodStart`)
- `ReportingTarget`: (`metricKey`, `scope`, `scopeValue`)

### Integrity Assumptions
- No hard deletes — use `DeletedRecord` for soft deletes or status fields
- Reporting tables are self-healing — `ensure-tables.ts` auto-creates missing tables before jobs run
- SOC tables are created on demand via `/api/soc/migrate`
- Prisma column names are camelCase in raw SQL — always use quoted identifiers (e.g., `"companyId"`, `"displayName"`)
- Autotask data is treated as authoritative — local data is overwritten on sync

---

## 9. Entity Relationship Diagram

```
StaffUser
├── BlogPost (author)

User (NextAuth)
├── Account (OAuth provider)
└── Session (active login)

Company
├── Project
│   ├── Phase
│   │   ├── PhaseTask
│   │   │   ├── PhaseTask (sub-tasks, self-ref)
│   │   │   ├── Comment
│   │   │   └── Assignment
│   │   ├── Comment
│   │   ├── Assignment
│   │   └── AuditLog
│   └── AuditLog
├── CompanyContact
├── Ticket
│   └── (raw SQL: TicketNote, TicketTimeEntry, TicketStatusHistory)
├── BusinessReview
├── CompanyMetricsDaily
└── CustomerHealthScore

Resource (Autotask technician)
└── TechnicianMetricsDaily

Ticket → TicketLifecycle (1:1 materialized metrics)

AudienceSource
└── Audience
    └── CommunicationCampaign
        ├── CampaignRecipient
        └── CampaignAuditLog

BlogPost
├── BlogCategory
└── BlogTag (many-to-many)

--- Raw SQL (not Prisma-managed) ---
soc_ticket_analysis ── soc_incidents (reasoning JSONB)
soc_rules             soc_config
soc_activity_log      soc_pending_actions
soc_job_status        soc_communications
datto_devices
```

---

## 10. Summary

### Major Entities Discovered
- **37 Prisma models** across auth, projects, tickets, blog, marketing, reporting, monitoring, and platform operations
- **8 raw SQL table groups** for SOC and reporting (created at runtime, not Prisma-managed)

### Key Relationships
- `Company` is the central entity — linked to projects, contacts, tickets, health scores, metrics, and business reviews
- `Project → Phase → PhaseTask` is the core project management hierarchy with sub-task support
- `Ticket` is a local cache of Autotask data, feeding into lifecycle metrics, daily aggregations, and health scores
- `BlogPost` and `CommunicationCampaign` share content visibility and audience targeting infrastructure
- `StaffUser` drives role-based access; `CompanyContact` drives customer portal access

### Where the Schema is Used
- **168+ files** import the Prisma client across API routes, lib modules, and page components
- **46+ files** use raw SQL (`$queryRaw`/`$executeRawUnsafe`) for reporting and SOC operations
- **Admin portal** (`/admin/*`) — full CRUD on all models
- **Customer portal** (`/onboarding/[companyName]`) — read-only filtered views of projects, phases, tasks, tickets
- **Public site** (`/blog`, marketing pages) — blog posts, content visibility
- **Cron jobs** — blog publishing, Autotask sync, reporting aggregation
- **API routes** (`/api/*`) — 100+ endpoints spanning all subsystems
