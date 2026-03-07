# Autotask Reporting & Analytics — Architecture Document

> **Phase 1 Deliverable** — Architecture and data modeling only.
> No dashboards, charts, email reports, or UI pages are included in this phase.
>
> Last Updated: 2026-03-07

---

## Table of Contents

1. [Autotask Data Audit](#1-autotask-data-audit)
2. [Core Reporting Metrics](#2-core-reporting-metrics)
3. [Reporting Data Layer](#3-reporting-data-layer)
4. [Metric Calculation Jobs](#4-metric-calculation-jobs)
5. [Customer Health Scoring Model](#5-customer-health-scoring-model)
6. [Benchmark / Target System](#6-benchmark--target-system)
7. [Reporting API Layer](#7-reporting-api-layer)
8. [Scheduled Reporting System](#8-scheduled-reporting-system)
9. [Decisions & Trade-offs](#9-decisions--trade-offs)

---

## 1. Autotask Data Audit

### 1.1 Data Currently Stored Locally (Prisma Models)

| Entity | Local Model | Autotask Link Field | Key Fields Stored |
|--------|-------------|--------------------|--------------------|
| Company | `Company` | `autotaskCompanyId` | slug, displayName, primaryContact, contactEmail, autotaskLastSync |
| Contact | `CompanyContact` | `autotaskContactId` | name, email, title, phone, isPrimary, isActive |
| Project | `Project` | `autotaskProjectId` | title, status, projectType, startedAt, completedAt, autotaskLastSync |
| Phase | `Phase` | `autotaskPhaseId` | title, description, status, owner, scheduledDate, completedDate, orderIndex |
| Task | `PhaseTask` | `autotaskTaskId` | taskText, status, priority, assignedTo, assignedToName, dueDate, completedAt |
| Comment | `Comment` | (none) | content, isInternal, authorEmail, authorName (project notes imported as comments) |
| Sync Log | `AutotaskSyncLog` | (none) | syncType, status, counts, errors, durationMs |

### 1.2 Data Fetched On-Demand from Autotask (NOT Stored Locally)

| Entity | Autotask Fields Available | How Currently Used |
|--------|--------------------------|-------------------|
| **Tickets** | id, ticketNumber, title, description, status, priority, createDate, completedDate, companyID | Customer dashboard — last 30 days only |
| **Ticket Notes** | id, ticketID, title, description, noteType, publish, creatorResourceID, creatorContactID, createDateTime | Customer timeline — filtered to publish=3 only |
| **Ticket Time Entries** | id, ticketID, resourceID, dateWorked, startDateTime, endDateTime, hoursWorked, summaryNotes, internalNotes, isNonBillable | Customer timeline — only entries with summaryNotes |
| **Task Time Entries** | id, taskID, resourceID, dateWorked, startDateTime, endDateTime, hoursWorked, summaryNotes, internalNotes, isNonBillable | Time entry creation for project tasks |
| **Resources** | id, firstName, lastName, email, isActive, userName | Name resolution in timelines; StaffUser.autotaskResourceId cached |

### 1.3 Data NOT Currently Fetched But Available in Autotask REST API

These fields exist in the Autotask API and are **required for reporting**:

| Field / Entity | Autotask API Field | Reporting Use |
|----------------|-------------------|---------------|
| **Ticket Queue** | `queueID` | Queue-based metrics, workload distribution |
| **Ticket SLA** | `serviceLevelAgreementID` | SLA compliance tracking |
| **Ticket Due Date** | `dueDateTime` | SLA breach detection, aging calculations |
| **Ticket Assigned Resource** | `assignedResourceID` | Technician performance attribution |
| **Ticket Source** | `source` | Channel analysis (email, phone, portal) |
| **Ticket Sub-Issue Type** | `subIssueType` | Issue categorization |
| **Ticket Issue Type** | `issueType` | Issue categorization |
| **Ticket Category** | `ticketCategory` | Ticket classification |
| **Ticket First Response DateTime** | (computed from first note) | First response time metric |
| **Ticket Last Activity** | `lastActivityDate` | Staleness detection |
| **Ticket Estimated Hours** | `estimatedHours` | Utilization comparison |
| **Resource Department** | `departmentID` | Team-level reporting |
| **Resource Hourly Rate** | (not available via API) | Cost analysis (must configure locally) |
| **Contract / Retainer** | `contractID` on tickets | Contract-based consumption tracking |

### 1.4 Gap Summary

**Critical gaps** that must be closed for reporting:

1. **Tickets are not stored locally.** Every report query would hit the Autotask API directly. Unacceptable for performance, historical analysis, and trend reporting. **Must sync tickets locally.**
2. **Time entries are not stored locally.** Cannot compute utilization, logged hours, or consumption metrics without local storage.
3. **Resources/technicians are not stored locally.** Only `StaffUser.autotaskResourceId` exists. Need a dedicated `Resource` table for technician-level reporting.
4. **No ticket lifecycle tracking.** Cannot compute first response time or time-to-resolution without storing ticket notes with timestamps.
5. **No SLA, queue, or source fields fetched.** Need to expand the Autotask ticket query to include these fields.

---

## 2. Core Reporting Metrics

### 2.1 Metric Definitions

Each metric below specifies: fields used, start/end events, edge cases, and whether waiting-on-customer time is included.

---

#### M1: First Response Time (FRT)

**Definition**: Time between ticket creation and the first technician response (note or time entry).

| Attribute | Value |
|-----------|-------|
| **Start event** | `ticket.createDate` |
| **End event** | Earliest of: first ticket note where `creatorResourceID IS NOT NULL` and `publish IN (1, 3)`, or first time entry `createDateTime` on the ticket |
| **Fields used** | `ticket.createDate`, `ticket_notes.createDateTime`, `ticket_notes.creatorResourceID`, `time_entries.createDateTime` |
| **Unit** | Minutes |
| **Waiting-on-customer** | N/A (this metric measures initial response only) |
| **Edge cases** | If no technician note or time entry exists → FRT is NULL (ticket has not been responded to). If the first note is a system-generated note → skip it (filter by `noteType`). If a customer replies before a tech does → does not count as FRT. |
| **Reopened tickets** | FRT is measured only once — from original creation. Reopening does not reset FRT. |

---

#### M2: First Resolution Time

**Definition**: Time between ticket creation and the first time the ticket transitions to a "complete/resolved" status.

| Attribute | Value |
|-----------|-------|
| **Start event** | `ticket.createDate` |
| **End event** | First occurrence of `ticket.status` transitioning to a resolved status (status value = Complete) |
| **Fields used** | `ticket.createDate`, `ticket.completedDate` (if available), or derived from status history |
| **Unit** | Minutes |
| **Waiting-on-customer** | **Included** — this is wall-clock time from creation to first resolution |
| **Edge cases** | If ticket has never been resolved → NULL. If ticket was resolved and reopened, this still records the first resolution. |

---

#### M3: Full Resolution / Close Time

**Definition**: Wall-clock time from ticket creation to final closure (last time status became resolved, accounting for reopens).

| Attribute | Value |
|-----------|-------|
| **Start event** | `ticket.createDate` |
| **End event** | `ticket.completedDate` (final) — the most recent completed date on a ticket that is currently in resolved status |
| **Fields used** | `ticket.createDate`, `ticket.completedDate`, `ticket.status` |
| **Unit** | Minutes |
| **Waiting-on-customer** | **Included** by default. A separate "active resolution time" metric (M3a) can exclude waiting-on-customer periods. |
| **Edge cases** | If ticket is currently open → NULL. If ticket was reopened and re-resolved, use the latest `completedDate`. |
| **Reopened tickets** | Uses the final close date, making the metric longer for reopened tickets. This is intentional — it measures true customer wait time. |

---

#### M3a: Active Resolution Time (excludes waiting-on-customer)

**Definition**: Total time a ticket was actively being worked (excludes periods in "Waiting Customer" status).

| Attribute | Value |
|-----------|-------|
| **Calculation** | `Full Resolution Time` minus `sum(waiting-on-customer periods)` |
| **Fields used** | Ticket status history (transitions to/from "Waiting Customer" status), `ticket.createDate`, `ticket.completedDate` |
| **Unit** | Minutes |
| **Edge cases** | If no status history is available, falls back to Full Resolution Time. If ticket is entirely "Waiting Customer" → active time is 0. |

> **Note**: Computing M3a requires ticket status change history. Autotask does not expose a status history API directly. We will approximate this by tracking status at each sync interval and recording transitions in the `ticket_status_history` table (see Section 3). Alternatively, ticket notes with `noteType` indicating status changes can be used as a proxy.

---

#### M4: Tickets Closed (Count)

**Definition**: Count of tickets where `completedDate` falls within the reporting period.

| Attribute | Value |
|-----------|-------|
| **Fields used** | `ticket.completedDate`, `ticket.status` (must be in resolved state) |
| **Grouping** | By technician, company, queue, priority, time period |
| **Edge cases** | If a ticket is closed and reopened within the same period, it counts once when finally closed. Count only tickets whose current status is resolved. |

---

#### M5: First Touch Resolution Rate (FTRR)

**Definition**: Percentage of tickets resolved after a single technician interaction (one note + resolution, no back-and-forth).

| Attribute | Value |
|-----------|-------|
| **Formula** | `(tickets resolved with ≤ 1 technician note) / (total tickets resolved) × 100` |
| **Fields used** | Ticket notes (count where `creatorResourceID IS NOT NULL`), `ticket.completedDate` |
| **Edge cases** | Tickets resolved with only a time entry and no note → counts as first-touch. Tickets with only customer notes (no tech note) do not qualify. System-generated notes are excluded from the count. |

---

#### M6: Reopen Rate

**Definition**: Percentage of tickets that were resolved and then reopened.

| Attribute | Value |
|-----------|-------|
| **Formula** | `(tickets with reopen_count > 0) / (total tickets resolved at least once) × 100` |
| **Fields used** | `ticket_lifecycle.reopen_count` (derived from status transitions) |
| **Detection** | A ticket is "reopened" if it transitions from a resolved status back to a non-resolved status. Each such transition increments `reopen_count`. |
| **Edge cases** | Tickets that are closed, reopened, and closed again in rapid succession (e.g., accidental status change) may inflate the rate. A minimum reopen duration threshold (e.g., 5 minutes) can be configured to filter noise. |

---

#### M7: Average Time to Close

**Definition**: Mean of Full Resolution Time across resolved tickets in the reporting period.

| Attribute | Value |
|-----------|-------|
| **Formula** | `SUM(full_resolution_minutes) / COUNT(resolved tickets)` |
| **Fields used** | `ticket_lifecycle.full_resolution_minutes` |
| **Edge cases** | Exclude tickets with NULL resolution time (still open). Outlier tickets (e.g., >90 days) may be flagged but still included in the average. |

---

#### M8: Median Time to Close

**Definition**: Median of Full Resolution Time across resolved tickets.

| Attribute | Value |
|-----------|-------|
| **Formula** | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY full_resolution_minutes)` |
| **Rationale** | Median is more robust to outliers than mean. Reports should display both M7 and M8 together. |

---

#### M9: Technician Time Logged

**Definition**: Total hours logged by a technician across all tickets and tasks in the reporting period.

| Attribute | Value |
|-----------|-------|
| **Formula** | `SUM(hoursWorked)` from time entries where `resourceID = technician` and `dateWorked` is within the period |
| **Fields used** | `time_entries.hoursWorked`, `time_entries.resourceID`, `time_entries.dateWorked` |
| **Grouping** | By technician, by company, by ticket, by day |
| **Edge cases** | Non-billable time entries (`isNonBillable = true`) are counted separately. Internal notes time is still counted. |

---

#### M10: Technician Utilization Signals

**Definition**: Ratio of billable hours logged to available hours in the period.

| Attribute | Value |
|-----------|-------|
| **Formula** | `(billable hours logged) / (available hours) × 100` |
| **Available hours** | Configurable per technician via the benchmark/target system (default: 8 hours/day × working days in period). |
| **Fields used** | `time_entries.hoursWorked`, `time_entries.isNonBillable`, `reporting_targets.value` |
| **Edge cases** | If no target is configured → use default 8h/day. Weekends and holidays excluded from available hours (configurable). This is a **signal**, not an exact measure, since Autotask doesn't track clock-in/clock-out. |

---

#### M11: Backlog Count

**Definition**: Count of currently open (unresolved) tickets at a point in time.

| Attribute | Value |
|-----------|-------|
| **Formula** | `COUNT(tickets)` where `status NOT IN (resolved statuses)` and `createDate <= snapshot_date` |
| **Snapshots** | Computed daily; stored in `company_metrics_daily.backlog_count` |
| **Grouping** | By company, by queue, by priority, by technician |
| **Edge cases** | Tickets in "Waiting Customer" are included in backlog by default. A separate "active backlog" excludes waiting-on-customer tickets. |

---

#### M12: SLA Compliance

**Definition**: Percentage of tickets where response and resolution met the configured SLA target.

| Attribute | Value |
|-----------|-------|
| **Formula** | `(tickets meeting SLA) / (total tickets subject to SLA) × 100` |
| **SLA types** | Response SLA (FRT ≤ target) and Resolution SLA (Full Resolution Time ≤ target) |
| **Fields used** | `ticket_lifecycle.first_response_minutes`, `ticket_lifecycle.full_resolution_minutes`, `reporting_targets` for target values by priority |
| **Edge cases** | If no SLA target is configured for a priority → ticket is excluded from SLA compliance calculation. Tickets without FRT (never responded) are SLA breaches for response SLA. |
| **Priority-based** | SLA targets differ by priority (e.g., URGENT: respond in 15 min, resolve in 4 hours; LOW: respond in 8 hours, resolve in 5 days). |

---

#### M13: Customer Ticket Volume

**Definition**: Count of tickets created by or for a specific company in the reporting period.

| Attribute | Value |
|-----------|-------|
| **Formula** | `COUNT(tickets)` where `companyID = company` and `createDate` is within the period |
| **Grouping** | By company, by priority, by source, by month |
| **Trend** | Compare to previous period to detect volume changes. |

---

#### M14: Customer Support Time Consumption

**Definition**: Total technician hours spent on a company's tickets in the reporting period.

| Attribute | Value |
|-----------|-------|
| **Formula** | `SUM(time_entries.hoursWorked)` for all tickets belonging to the company within the period |
| **Fields used** | `time_entries.hoursWorked`, `time_entries.dateWorked`, `tickets.companyID` |
| **Breakdown** | Billable vs. non-billable hours. By technician. By ticket. |
| **Edge cases** | Time entries on project tasks (not tickets) are tracked separately as "project hours" vs. "support hours". |

---

### 2.2 Metric Summary Table

| ID | Metric | Unit | Aggregation | Key Dimensions |
|----|--------|------|-------------|----------------|
| M1 | First Response Time | Minutes | Avg, Median, P90 | Priority, Queue, Technician |
| M2 | First Resolution Time | Minutes | Avg, Median | Priority, Company |
| M3 | Full Resolution Time | Minutes | Avg, Median, P90 | Priority, Company, Technician |
| M3a | Active Resolution Time | Minutes | Avg, Median | Priority, Company |
| M4 | Tickets Closed | Count | Sum | Technician, Company, Priority, Period |
| M5 | First Touch Resolution Rate | Percent | Rate | Technician, Queue |
| M6 | Reopen Rate | Percent | Rate | Company, Queue |
| M7 | Average Time to Close | Minutes | Avg | Priority, Company |
| M8 | Median Time to Close | Minutes | Median | Priority, Company |
| M9 | Technician Time Logged | Hours | Sum | Technician, Company, Day |
| M10 | Technician Utilization | Percent | Rate | Technician, Period |
| M11 | Backlog Count | Count | Snapshot | Company, Priority, Queue |
| M12 | SLA Compliance | Percent | Rate | Priority, Company |
| M13 | Customer Ticket Volume | Count | Sum | Company, Priority, Period |
| M14 | Customer Support Consumption | Hours | Sum | Company, Technician, Period |

---

## 3. Reporting Data Layer

### 3.1 Design Principles

1. **Reports never query raw Autotask data directly.** All reporting queries run against local materialized tables.
2. **Sync first, aggregate second.** Raw ticket/time entry data is synced locally, then aggregation jobs compute derived metrics.
3. **Daily snapshots for trend analysis.** Point-in-time snapshots enable "as of" queries and trend charts.
4. **Incremental updates.** Aggregation jobs only recompute metrics for dates/entities that changed since the last run.

### 3.2 New Prisma Models — Raw Data Storage

These models store synced Autotask data locally for reporting:

#### `Ticket` — Local ticket cache

```
model Ticket {
  id                    String    @id @default(uuid())
  autotaskTicketId      String    @unique
  ticketNumber          String
  companyId             String                // FK to Company
  title                 String
  description           String?   @db.Text
  status                Int                   // Autotask status picklist value
  statusLabel           String?               // Resolved label (e.g., "Complete")
  priority              Int                   // Autotask priority picklist value
  priorityLabel         String?               // Resolved label (e.g., "High")
  queueId               Int?                  // Autotask queue picklist value
  queueLabel            String?               // Resolved label
  source                Int?                  // Autotask source picklist value
  sourceLabel           String?               // Resolved label (e.g., "Email")
  issueType             Int?
  subIssueType          Int?
  assignedResourceId    Int?                  // Primary technician
  creatorResourceId     Int?                  // Who created the ticket
  contactId             Int?                  // Customer contact
  contractId            Int?                  // Associated contract
  slaId                 Int?                  // Service level agreement
  dueDateTime           DateTime?
  estimatedHours        Float?
  createDate            DateTime
  completedDate         DateTime?
  lastActivityDate      DateTime?
  autotaskLastSync      DateTime

  // Relations
  company               Company   @relation(fields: [companyId], references: [id])

  @@map("tickets")
  @@index([companyId])
  @@index([assignedResourceId])
  @@index([status])
  @@index([createDate])
  @@index([completedDate])
  @@index([queueId])
}
```

#### `TicketTimeEntry` — Time entries for tickets

```
model TicketTimeEntry {
  id                    String    @id @default(uuid())
  autotaskTimeEntryId   String    @unique
  autotaskTicketId      String                // Links to Ticket.autotaskTicketId
  resourceId            Int                   // Technician
  dateWorked            DateTime
  startDateTime         DateTime?
  endDateTime           DateTime?
  hoursWorked           Float
  summaryNotes          String?   @db.Text
  isNonBillable         Boolean   @default(false)
  createDateTime        DateTime?

  @@map("ticket_time_entries")
  @@index([autotaskTicketId])
  @@index([resourceId])
  @@index([dateWorked])
}
```

#### `Resource` — Autotask technicians/users

```
model Resource {
  id                    String    @id @default(uuid())
  autotaskResourceId    Int       @unique
  firstName             String
  lastName              String
  email                 String
  isActive              Boolean   @default(true)
  departmentId          Int?
  autotaskLastSync      DateTime

  @@map("resources")
  @@index([email])
}
```

#### `TicketNote` — For first-response-time calculation

```
model TicketNote {
  id                    String    @id @default(uuid())
  autotaskNoteId        String    @unique
  autotaskTicketId      String
  title                 String?
  description           String?   @db.Text
  noteType              Int?
  publish               Int?                  // 1=All, 2=Internal, 3=Customer Portal
  creatorResourceId     Int?                  // Technician who created note
  creatorContactId      Int?                  // Customer who created note
  createDateTime        DateTime

  @@map("ticket_notes")
  @@index([autotaskTicketId])
  @@index([creatorResourceId])
  @@index([createDateTime])
}
```

### 3.3 Materialized Reporting Tables

These tables are computed by aggregation jobs, not by the sync process.

#### `ticket_lifecycle` — Per-ticket computed metrics

```
model TicketLifecycle {
  id                        String    @id @default(uuid())
  autotaskTicketId          String    @unique
  companyId                 String
  assignedResourceId        Int?
  priority                  Int
  queueId                   Int?
  createDate                DateTime
  completedDate             DateTime?
  isResolved                Boolean   @default(false)

  // Computed metrics
  firstResponseMinutes      Float?            // M1
  firstResolutionMinutes    Float?            // M2
  fullResolutionMinutes     Float?            // M3
  activeResolutionMinutes   Float?            // M3a
  waitingCustomerMinutes    Float?            // Total time in waiting-on-customer
  techNoteCount             Int       @default(0)  // For first-touch calculation
  customerNoteCount         Int       @default(0)
  reopenCount               Int       @default(0)  // M6
  totalHoursLogged          Float     @default(0)
  billableHoursLogged       Float     @default(0)
  isFirstTouchResolution    Boolean   @default(false)  // M5
  slaResponseMet            Boolean?          // M12 - null if no SLA target
  slaResolutionMet          Boolean?          // M12 - null if no SLA target

  computedAt                DateTime  @default(now())

  @@map("ticket_lifecycle")
  @@index([companyId])
  @@index([assignedResourceId])
  @@index([createDate])
  @@index([isResolved])
  @@index([priority])
}
```

#### `technician_metrics_daily` — Daily technician rollup

```
model TechnicianMetricsDaily {
  id                        String    @id @default(uuid())
  resourceId                Int
  date                      DateTime  @db.Date

  // Volume
  ticketsAssigned           Int       @default(0)
  ticketsCreated            Int       @default(0)   // Tickets created during this day
  ticketsClosed             Int       @default(0)
  ticketsReopened           Int       @default(0)

  // Time
  hoursLogged               Float     @default(0)
  billableHoursLogged       Float     @default(0)
  nonBillableHoursLogged    Float     @default(0)

  // Performance
  avgFirstResponseMinutes   Float?
  avgResolutionMinutes      Float?
  firstTouchResolutions     Int       @default(0)
  totalResolutions          Int       @default(0)   // For FTRR calculation

  // Backlog
  openTicketCount           Int       @default(0)   // Snapshot at end of day

  computedAt                DateTime  @default(now())

  @@unique([resourceId, date])
  @@map("technician_metrics_daily")
  @@index([date])
  @@index([resourceId])
}
```

#### `company_metrics_daily` — Daily company rollup

```
model CompanyMetricsDaily {
  id                        String    @id @default(uuid())
  companyId                 String
  date                      DateTime  @db.Date

  // Volume
  ticketsCreated            Int       @default(0)
  ticketsClosed             Int       @default(0)
  ticketsReopened           Int       @default(0)

  // By priority
  ticketsCreatedUrgent      Int       @default(0)
  ticketsCreatedHigh        Int       @default(0)
  ticketsCreatedMedium      Int       @default(0)
  ticketsCreatedLow         Int       @default(0)

  // Time
  supportHoursConsumed      Float     @default(0)
  billableHoursConsumed     Float     @default(0)

  // Performance
  avgFirstResponseMinutes   Float?
  avgResolutionMinutes      Float?
  firstTouchResolutionRate  Float?            // Percent (0-100)
  reopenRate                Float?            // Percent (0-100)
  slaResponseCompliance     Float?            // Percent (0-100)
  slaResolutionCompliance   Float?            // Percent (0-100)

  // Backlog
  backlogCount              Int       @default(0)   // Open tickets at end of day
  backlogUrgent             Int       @default(0)
  backlogHigh               Int       @default(0)

  computedAt                DateTime  @default(now())

  @@unique([companyId, date])
  @@map("company_metrics_daily")
  @@index([date])
  @@index([companyId])
}
```

#### `ticket_status_history` — Status transition tracking

```
model TicketStatusHistory {
  id                    String    @id @default(uuid())
  autotaskTicketId      String
  previousStatus        Int?
  newStatus             Int
  previousStatusLabel   String?
  newStatusLabel        String
  changedAt             DateTime
  detectedAt            DateTime  @default(now())  // When our sync detected it

  @@map("ticket_status_history")
  @@index([autotaskTicketId])
  @@index([changedAt])
}
```

> **Note on status history**: Autotask does not expose a ticket status change log API. Status transitions are detected by comparing `ticket.status` at each sync interval. When a ticket's status differs from its previously recorded status, a `ticket_status_history` row is created. This means transitions that happen between sync intervals (e.g., two changes in 1 hour when sync runs hourly) will be collapsed into one transition. For most reporting purposes, this granularity is sufficient.

### 3.4 Entity Relationship Diagram (Reporting Layer)

```
Autotask API                    Local Sync Tables              Materialized Tables
─────────────                   ────────────────               ───────────────────

[Tickets API]  ──sync──>  Ticket ─────────────────> TicketLifecycle
                               │                          │
[TicketNotes API] ─sync─> TicketNote                      │ (per-ticket metrics)
                               │                          │
[TimeEntries API] ─sync─> TicketTimeEntry                 │
                               │                          ▼
[Resources API] ──sync──> Resource              TechnicianMetricsDaily
                                                          │
                          Company ─────────────> CompanyMetricsDaily
                               │                          │
                          TicketStatusHistory              ▼
                                                CustomerHealthScore
                                                          │
                                                ReportingTarget
```

---

## 4. Metric Calculation Jobs

### 4.1 Job Architecture

All metric computation runs as **background API routes** triggered by Vercel cron or manual admin action. Jobs are idempotent — running them twice produces the same result.

```
┌─────────────────────────────────────────────────────────────┐
│                     Reporting Job Pipeline                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SYNC JOBS (fetch from Autotask → local tables)          │
│     ├── syncTickets       — every 2 hours                   │
│     ├── syncTimeEntries   — every 2 hours                   │
│     ├── syncTicketNotes   — every 2 hours                   │
│     └── syncResources     — daily                           │
│                                                             │
│  2. LIFECYCLE JOB (compute per-ticket metrics)              │
│     └── computeLifecycle  — runs after sync                 │
│         - Scans tickets modified since last run             │
│         - Computes FRT, resolution times, reopen count      │
│         - Evaluates SLA compliance against targets          │
│         - Writes/updates ticket_lifecycle rows              │
│                                                             │
│  3. AGGREGATION JOBS (roll up to daily tables)              │
│     ├── aggregateTechnicianDaily  — nightly (for prior day) │
│     └── aggregateCompanyDaily     — nightly (for prior day) │
│                                                             │
│  4. HEALTH SCORE JOB                                        │
│     └── computeCustomerHealth     — weekly                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Job Definitions

#### Job 1: `syncTickets`

- **Trigger**: Vercel cron every 2 hours, or manual via admin
- **Endpoint**: `GET /api/reports/jobs/sync-tickets?secret=MIGRATION_SECRET`
- **Logic**:
  1. Query Autotask for tickets modified since last sync (`lastActivityDate >= lastSyncTimestamp`)
  2. For each ticket: upsert into local `Ticket` table (match on `autotaskTicketId`)
  3. Compare `ticket.status` to previously stored status — if changed, insert into `ticket_status_history`
  4. Resolve picklist labels for status, priority, queue, source (cache picklist values from `getFieldInfo`)
  5. Record sync timestamp
- **Pagination**: Autotask pagination (500 per page max), process all pages
- **Timeout**: 60s (`maxDuration = 60`), process in batches if needed
- **Idempotency**: Upsert on `autotaskTicketId` — safe to re-run

#### Job 2: `syncTimeEntries`

- **Trigger**: Runs after syncTickets (same cron)
- **Endpoint**: `GET /api/reports/jobs/sync-time-entries?secret=MIGRATION_SECRET`
- **Logic**:
  1. Query Autotask for time entries modified since last sync
  2. Upsert into `TicketTimeEntry` (match on `autotaskTimeEntryId`)
- **Scope**: Ticket time entries only (project task time entries are separate and less relevant to service desk reporting)

#### Job 3: `syncTicketNotes`

- **Trigger**: Runs after syncTickets
- **Endpoint**: `GET /api/reports/jobs/sync-ticket-notes?secret=MIGRATION_SECRET`
- **Logic**:
  1. For each ticket synced in the current batch, fetch notes from Autotask
  2. Upsert into `TicketNote` (match on `autotaskNoteId`)
- **Optimization**: Only fetch notes for tickets that were modified since last sync

#### Job 4: `syncResources`

- **Trigger**: Daily at midnight
- **Endpoint**: `GET /api/reports/jobs/sync-resources?secret=MIGRATION_SECRET`
- **Logic**:
  1. Fetch all active resources from Autotask
  2. Upsert into `Resource` (match on `autotaskResourceId`)

#### Job 5: `computeLifecycle`

- **Trigger**: Runs after sync jobs complete (chained)
- **Endpoint**: `GET /api/reports/jobs/compute-lifecycle?secret=MIGRATION_SECRET`
- **Logic**:
  1. Find all tickets where `Ticket.autotaskLastSync > TicketLifecycle.computedAt` (or no lifecycle row exists)
  2. For each ticket:
     - Query its notes → find first tech response → compute FRT (M1)
     - Query status history → detect resolution events → compute M2, M3
     - Query status history → compute waiting-on-customer duration → compute M3a
     - Count tech notes vs customer notes → determine first-touch (M5)
     - Count reopen events from status history (M6)
     - Sum time entries → compute total/billable hours
     - Evaluate FRT and resolution against SLA targets → set `slaResponseMet`, `slaResolutionMet` (M12)
  3. Upsert `TicketLifecycle` row

#### Job 6: `aggregateTechnicianDaily`

- **Trigger**: Nightly at 1:00 AM
- **Endpoint**: `GET /api/reports/jobs/aggregate-technician?secret=MIGRATION_SECRET&date=YYYY-MM-DD`
- **Logic**:
  1. For each active resource, for the target date:
     - Count tickets assigned, created, closed, reopened
     - Sum hours from time entries
     - Compute avg FRT, avg resolution time from lifecycle table
     - Count first-touch resolutions
     - Count currently open tickets (backlog snapshot)
  2. Upsert `TechnicianMetricsDaily` row
- **Backfill**: Accepts optional `date` param; defaults to yesterday

#### Job 7: `aggregateCompanyDaily`

- **Trigger**: Nightly at 1:15 AM
- **Endpoint**: `GET /api/reports/jobs/aggregate-company?secret=MIGRATION_SECRET&date=YYYY-MM-DD`
- **Logic**:
  1. For each company with tickets, for the target date:
     - Count tickets created (total + by priority)
     - Count tickets closed, reopened
     - Sum support hours consumed
     - Compute avg FRT, resolution time, FTRR, reopen rate
     - Compute SLA compliance rates
     - Count open tickets (backlog snapshot + by priority)
  2. Upsert `CompanyMetricsDaily` row

#### Job 8: `computeCustomerHealth`

- **Trigger**: Weekly (Sunday at 2:00 AM)
- **Endpoint**: `GET /api/reports/jobs/compute-health?secret=MIGRATION_SECRET`
- **Logic**: See Section 5

### 4.3 Cron Configuration (vercel.json)

```json
{
  "crons": [
    { "path": "/api/reports/jobs/sync-tickets?secret=CRON_SECRET", "schedule": "0 */2 * * *" },
    { "path": "/api/reports/jobs/sync-time-entries?secret=CRON_SECRET", "schedule": "10 */2 * * *" },
    { "path": "/api/reports/jobs/sync-ticket-notes?secret=CRON_SECRET", "schedule": "20 */2 * * *" },
    { "path": "/api/reports/jobs/sync-resources?secret=CRON_SECRET", "schedule": "0 0 * * *" },
    { "path": "/api/reports/jobs/compute-lifecycle?secret=CRON_SECRET", "schedule": "30 */2 * * *" },
    { "path": "/api/reports/jobs/aggregate-technician?secret=CRON_SECRET", "schedule": "0 1 * * *" },
    { "path": "/api/reports/jobs/aggregate-company?secret=CRON_SECRET", "schedule": "15 1 * * *" },
    { "path": "/api/reports/jobs/compute-health?secret=CRON_SECRET", "schedule": "0 2 * * 0" }
  ]
}
```

### 4.4 Job Orchestration

Jobs are staggered by 10-minute intervals to avoid overlap and stay within Vercel's concurrency limits. The dependency chain is:

```
syncTickets (xx:00) → syncTimeEntries (xx:10) → syncTicketNotes (xx:20) → computeLifecycle (xx:30)
                                                                                    │
                                            aggregateTechnicianDaily (01:00) ◄──────┘
                                            aggregateCompanyDaily (01:15) ◄─────────┘
                                            computeCustomerHealth (Sun 02:00) ◄─────┘
```

Each job checks for the presence of fresh sync data before running. If syncTickets didn't run (e.g., Autotask API was down), downstream jobs skip and log a warning.

### 4.5 Manual Trigger

All jobs are also manually triggerable from the admin panel via:
- `POST /api/reports/jobs/run` with `{ "job": "syncTickets", "params": { "date": "2026-03-07" } }`
- Requires admin auth (session + ADMIN role)

### 4.6 Backfill Strategy

For initial deployment:
1. Run `syncTickets` with a wide date range (e.g., last 12 months)
2. Run `syncTimeEntries` and `syncTicketNotes` for all synced tickets
3. Run `computeLifecycle` for all tickets
4. Run `aggregateTechnicianDaily` and `aggregateCompanyDaily` for each day in the backfill range

A dedicated backfill endpoint handles this: `POST /api/reports/jobs/backfill?secret=MIGRATION_SECRET&months=12`

---

## 5. Customer Health Scoring Model

### 5.1 Design Principles

- **Transparent**: Every factor has a visible weight and contribution. Admins can see exactly why a score is what it is.
- **Configurable**: Weights and thresholds are stored in the database, not hardcoded.
- **Relative**: Scores are normalized to 0-100 where 100 is healthiest.
- **Trend-aware**: Score includes directional indicators (improving, stable, declining).

### 5.2 Health Score Factors

| Factor | Weight (default) | Data Source | Scoring Logic |
|--------|-----------------|-------------|---------------|
| **Ticket Volume Trend** | 20% | `company_metrics_daily` last 30 vs prior 30 days | Decreasing volume = healthier. Score: 100 if volume dropped >20%, 50 if stable (±10%), 0 if volume increased >50%. Linear interpolation between thresholds. |
| **Reopen Rate** | 15% | `ticket_lifecycle.reopenCount` for company's tickets in last 90 days | 0% reopen = 100 score. Target reopen rate (default 5%) = 70 score. >20% = 0 score. |
| **Priority Mix** | 15% | `company_metrics_daily` by priority in last 30 days | High ratio of URGENT/HIGH tickets = unhealthy. Score: 100 if <10% are urgent/high, 0 if >60% are urgent/high. |
| **Support Hours Trend** | 15% | `company_metrics_daily.supportHoursConsumed` last 30 vs prior 30 | Increasing consumption = less healthy. Similar to volume trend scoring. |
| **Average Resolution Time** | 15% | `company_metrics_daily.avgResolutionMinutes` in last 30 days | Compared against target resolution time by priority. Meeting all targets = 100. Missing all = 0. |
| **Aging Tickets** | 10% | Open tickets where `createDate` is older than target resolution time × 2 | 0 aging tickets = 100. Score decreases proportionally with count of aging tickets. |
| **SLA Compliance** | 10% | `company_metrics_daily.slaResponseCompliance` + `slaResolutionCompliance` in last 30 days | Average of response and resolution SLA compliance rates. |

**Total**: 100% (weights sum to 1.0)

### 5.3 Health Score Model

```
model CustomerHealthScore {
  id                    String    @id @default(uuid())
  companyId             String
  computedAt            DateTime  @default(now())
  periodStart           DateTime               // Start of evaluation window
  periodEnd             DateTime               // End of evaluation window

  // Overall
  overallScore          Float                  // 0-100
  trend                 String                 // "improving", "stable", "declining"
  previousScore         Float?                 // Last period's score for trend

  // Factor scores (0-100 each)
  ticketVolumeTrendScore      Float
  reopenRateScore             Float
  priorityMixScore            Float
  supportHoursTrendScore      Float
  avgResolutionTimeScore      Float
  agingTicketsScore           Float
  slaComplianceScore          Float

  // Raw values (for transparency)
  ticketCountCurrent          Int
  ticketCountPrevious         Int
  reopenRate                  Float              // Percent
  urgentHighPercent           Float              // Percent
  supportHoursCurrent         Float
  supportHoursPrevious        Float
  avgResolutionMinutes        Float?
  agingTicketCount            Int
  slaCompliancePercent        Float?

  @@map("customer_health_scores")
  @@index([companyId])
  @@index([computedAt])
}
```

### 5.4 Trend Calculation

- **Improving**: Current score > previous score by ≥ 5 points
- **Declining**: Current score < previous score by ≥ 5 points
- **Stable**: Within ±5 points of previous score

### 5.5 Health Score Tiers

| Score Range | Label | Color (for future UI) |
|-------------|-------|----------------------|
| 80-100 | Healthy | Green (emerald-500) |
| 60-79 | Needs Attention | Blue (blue-500) |
| 40-59 | At Risk | Orange (orange-500) |
| 0-39 | Critical | Rose (rose-500) |

> Note: No yellow/amber per project color rules.

---

## 6. Benchmark / Target System

### 6.1 Design

Targets are stored in a configuration table, not hardcoded. They support scoping by priority, company, or globally.

```
model ReportingTarget {
  id                    String    @id @default(uuid())
  metricKey             String                 // e.g., "first_response_time", "resolution_time"
  scope                 String    @default("global")  // "global", "priority", "company"
  scopeValue            String?                // e.g., "URGENT", "company-uuid"
  targetValue           Float                  // The target number
  unit                  String                 // "minutes", "percent", "hours", "count"
  description           String?
  isActive              Boolean   @default(true)
  createdBy             String                 // Staff email
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@unique([metricKey, scope, scopeValue])
  @@map("reporting_targets")
}
```

### 6.2 Target Resolution Order

When evaluating a metric for a specific ticket, the system resolves the target in this order:

1. **Company-specific + priority-specific**: `scope=company, scopeValue=companyId, metricKey includes priority`
2. **Priority-specific**: `scope=priority, scopeValue=URGENT/HIGH/etc.`
3. **Company-specific (all priorities)**: `scope=company, scopeValue=companyId`
4. **Global default**: `scope=global, scopeValue=NULL`

First match wins. If no target exists → metric is excluded from SLA compliance calculations.

### 6.3 Default Targets (Seeded)

These are starting values. Admins can adjust via the admin panel.

| Metric | Priority | Target | Unit |
|--------|----------|--------|------|
| `first_response_time` | URGENT | 15 | minutes |
| `first_response_time` | HIGH | 60 | minutes |
| `first_response_time` | MEDIUM | 240 | minutes (4 hours) |
| `first_response_time` | LOW | 480 | minutes (8 hours) |
| `resolution_time` | URGENT | 240 | minutes (4 hours) |
| `resolution_time` | HIGH | 480 | minutes (8 hours) |
| `resolution_time` | MEDIUM | 2880 | minutes (2 days) |
| `resolution_time` | LOW | 7200 | minutes (5 days) |
| `reopen_rate` | (global) | 5 | percent |
| `first_touch_resolution_rate` | (global) | 30 | percent |
| `technician_daily_hours` | (global) | 8 | hours |
| `customer_monthly_support_hours` | (global) | 20 | hours |

### 6.4 Target Management API

- `GET /api/reports/targets` — List all active targets
- `POST /api/reports/targets` — Create or update a target
- `DELETE /api/reports/targets/:id` — Deactivate a target (soft delete via `isActive = false`)

Requires ADMIN role.

---

## 7. Reporting API Layer

### 7.1 Design Principles

- All reporting APIs query materialized tables, never raw Autotask data
- Standard response envelope: `{ data: T, meta: { period, generatedAt, dataFreshness } }`
- Support date range parameters: `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Default to last 30 days if no date range specified
- All endpoints require admin auth (session + ADMIN or MANAGER role)

### 7.2 Endpoints

#### Technician Reports

```
GET /api/reports/technicians
  Query: ?from, ?to, ?resourceId
  Returns: Array of technician summaries with:
    - ticketsClosed, ticketsAssigned
    - hoursLogged (billable, non-billable)
    - avgFirstResponseMinutes, avgResolutionMinutes
    - firstTouchResolutionRate
    - utilizationPercent (vs target)
    - openTicketCount (current backlog)

GET /api/reports/technicians/:resourceId
  Query: ?from, ?to
  Returns: Detailed technician report with:
    - Daily breakdown (from technician_metrics_daily)
    - Per-company breakdown
    - Trend vs. previous period

GET /api/reports/technicians/:resourceId/tickets
  Query: ?from, ?to, ?status
  Returns: List of tickets with lifecycle metrics for drill-down
```

#### Company Reports

```
GET /api/reports/companies
  Query: ?from, ?to, ?companyId
  Returns: Array of company summaries with:
    - ticketsCreated, ticketsClosed
    - supportHoursConsumed
    - avgResolutionMinutes
    - reopenRate, firstTouchResolutionRate
    - slaCompliance
    - backlogCount
    - healthScore (latest)

GET /api/reports/companies/:companyId
  Query: ?from, ?to
  Returns: Detailed company report with:
    - Daily breakdown (from company_metrics_daily)
    - Priority distribution
    - Top tickets by hours consumed
    - Technician breakdown
    - Trend vs. previous period

GET /api/reports/companies/:companyId/tickets
  Query: ?from, ?to, ?status, ?priority
  Returns: List of tickets with lifecycle metrics
```

#### Customer Health

```
GET /api/reports/customer-health
  Returns: Array of all companies with:
    - Latest health score
    - Trend direction
    - Score tier (Healthy/At Risk/etc.)
    - Factor breakdown

GET /api/reports/customer-health/:companyId
  Returns: Health score detail with:
    - Current score + all factor scores
    - Historical scores (last 12 data points)
    - Raw values for each factor
    - Recommendations (derived from lowest-scoring factors)
```

#### Dashboard Summary

```
GET /api/reports/dashboard
  Query: ?from, ?to
  Returns: High-level summary for admin dashboard:
    - Total tickets created/closed in period
    - Overall SLA compliance
    - Top 5 busiest companies
    - Top 5 technicians by hours logged
    - Current total backlog
    - Trend arrows (vs. previous period)
```

#### Data Freshness

```
GET /api/reports/status
  Returns: Job status information:
    - Last sync timestamp for each job
    - Next scheduled run
    - Any errors from last run
    - Data coverage (earliest/latest ticket dates)
```

### 7.3 Response Envelope

All reporting endpoints return:

```typescript
interface ReportResponse<T> {
  data: T;
  meta: {
    period: {
      from: string;  // ISO date
      to: string;    // ISO date
    };
    generatedAt: string;    // ISO timestamp
    dataFreshness: string;  // ISO timestamp of last sync
    ticketCount: number;    // Total tickets in scope
  };
}
```

---

## 8. Scheduled Reporting System

### 8.1 Architecture

Scheduled reports are defined by admin users and executed by Vercel cron. Reports are rendered to HTML email and sent via Resend.

```
┌──────────────────────────────────────────────────────┐
│                Scheduled Report Flow                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ReportSchedule (DB)                                 │
│    ├── reportType: "technician_weekly"                │
│    ├── schedule: "weekly" / "monthly" / "quarterly"   │
│    ├── recipients: ["admin@company.com"]              │
│    ├── config: { resourceIds: [...] }                │
│    └── nextRunAt: DateTime                           │
│                                                      │
│  Cron Job (daily at 6:00 AM)                         │
│    └── GET /api/reports/jobs/send-scheduled           │
│         1. Query ReportSchedule where nextRunAt <= now│
│         2. For each due schedule:                    │
│            a. Call reporting API to get data          │
│            b. Render HTML email template              │
│            c. Send via Resend                        │
│            d. Update nextRunAt                        │
│            e. Log to ReportDeliveryLog               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 8.2 Data Models

```
model ReportSchedule {
  id                    String    @id @default(uuid())
  reportType            String                 // "technician_weekly", "company_monthly", etc.
  name                  String                 // "Weekly Technician Performance"
  schedule              String                 // "weekly", "monthly", "quarterly"
  dayOfWeek             Int?                   // 0=Sun, 1=Mon... (for weekly)
  dayOfMonth            Int?                   // 1-28 (for monthly)
  monthOfQuarter        Int?                   // 1-3 (for quarterly, which month in quarter)
  recipients            String[]               // Email addresses
  config                Json?                  // Report-specific config (filters, scope)
  isActive              Boolean   @default(true)
  nextRunAt             DateTime
  lastRunAt             DateTime?
  lastRunStatus         String?                // "success", "failed"
  createdBy             String                 // Staff email
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("report_schedules")
  @@index([nextRunAt])
  @@index([isActive])
}

model ReportDeliveryLog {
  id                    String    @id @default(uuid())
  scheduleId            String
  reportType            String
  periodStart           DateTime
  periodEnd             DateTime
  recipientCount        Int
  status                String                 // "sent", "failed", "partial"
  error                 String?   @db.Text
  sentAt                DateTime  @default(now())

  @@map("report_delivery_logs")
  @@index([scheduleId])
  @@index([sentAt])
}
```

### 8.3 Report Types

| Report Type | Schedule | Period Covered | Content |
|-------------|----------|----------------|---------|
| `technician_weekly` | Weekly (Monday) | Prior 7 days | Per-technician: tickets closed, hours logged, FRT, resolution time, FTRR, backlog |
| `company_monthly` | Monthly (1st) | Prior calendar month | Per-company: ticket volume, hours consumed, SLA compliance, reopen rate, top issues |
| `customer_load_monthly` | Monthly (1st) | Prior calendar month | All companies ranked by support consumption (hours, ticket volume) |
| `customer_health_quarterly` | Quarterly | Prior 90 days | All companies with health scores, trends, at-risk callouts |

### 8.4 `nextRunAt` Calculation

When a report is delivered:
- **Weekly**: `nextRunAt = next occurrence of dayOfWeek at 06:00 UTC`
- **Monthly**: `nextRunAt = dayOfMonth of next month at 06:00 UTC`
- **Quarterly**: `nextRunAt = dayOfMonth of monthOfQuarter in next quarter at 06:00 UTC`

### 8.5 Cron Entry

```json
{ "path": "/api/reports/jobs/send-scheduled?secret=CRON_SECRET", "schedule": "0 6 * * *" }
```

### 8.6 Schedule Management API

- `GET /api/reports/schedules` — List all schedules
- `POST /api/reports/schedules` — Create a new schedule
- `PATCH /api/reports/schedules/:id` — Update schedule (recipients, config, active status)
- `DELETE /api/reports/schedules/:id` — Deactivate
- `POST /api/reports/schedules/:id/test` — Send a test report immediately

Requires ADMIN role.

---

## 9. Decisions & Trade-offs

### 9.1 Why Store Tickets Locally?

**Decision**: Sync tickets to local PostgreSQL instead of querying Autotask on every report load.

**Rationale**:
- Autotask API has rate limits and latency (~500ms per query)
- Reporting requires aggregation over months of data — scanning thousands of tickets per request is not feasible against the API
- Historical trend analysis needs point-in-time snapshots
- Status history detection requires comparing current vs. previous state
- Backfill and recomputation require access to historical data

**Trade-off**: Data is not real-time. At 2-hour sync intervals, reports can be up to 2 hours stale. This is acceptable for reporting (not for live ticket dashboards, which can still use on-demand API calls).

### 9.2 Why Materialized Tables Instead of Views?

**Decision**: Pre-compute metrics into separate tables rather than using PostgreSQL materialized views.

**Rationale**:
- Vercel Postgres has connection pooling constraints — long-running `REFRESH MATERIALIZED VIEW` commands may timeout
- Incremental updates are easier with explicit tables (only recompute changed rows)
- The aggregation logic is complex (joins across 4+ tables) — debugging is easier with explicit job code
- Daily tables are append-only (one row per entity per day), which is simple and auditable

**Trade-off**: More code to maintain. But the predictability and debuggability outweigh the cost.

### 9.3 Why Not Real-Time Metrics?

**Decision**: Metrics are computed on a schedule (2-hour sync + nightly aggregation), not in real-time.

**Rationale**:
- Vercel serverless functions have a 60s timeout. Real-time computation of aggregate metrics across thousands of tickets would exceed this.
- Autotask API rate limits prevent high-frequency polling
- Reporting users expect "as of last night" data, not real-time
- The admin dashboard can still use a "refresh now" button that triggers an on-demand sync + recomputation

### 9.4 Status History Limitation

**Decision**: Detect status changes by comparing ticket status at each 2-hour sync interval.

**Limitation**: If a ticket changes status twice between syncs (e.g., New → In Progress → Complete in 1 hour), we only capture New → Complete. The intermediate state is lost.

**Mitigation**: For most reporting purposes, only the start and end states matter. The 2-hour interval captures the vast majority of transitions. Ticket notes with status-change indicators can be used as a secondary signal to fill gaps.

### 9.5 Health Score Subjectivity

**Decision**: Health score weights are configurable, with documented defaults.

**Rationale**: Any health score is inherently subjective. Different MSPs prioritize different factors. By making weights configurable and showing factor breakdowns, admins can calibrate the model to their business reality. The score is a starting point for conversation, not a verdict.

---

## Appendix A: File Locations (Planned)

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add new models: Ticket, TicketTimeEntry, TicketNote, Resource, TicketLifecycle, TechnicianMetricsDaily, CompanyMetricsDaily, CustomerHealthScore, TicketStatusHistory, ReportingTarget, ReportSchedule, ReportDeliveryLog |
| `src/lib/reporting/` | New directory for reporting utilities |
| `src/lib/reporting/sync.ts` | Ticket/time entry/note sync logic |
| `src/lib/reporting/lifecycle.ts` | Per-ticket lifecycle metric computation |
| `src/lib/reporting/aggregation.ts` | Daily rollup computations |
| `src/lib/reporting/health-score.ts` | Customer health score computation |
| `src/lib/reporting/targets.ts` | Target resolution and lookup |
| `src/app/api/reports/` | All reporting API endpoints |
| `src/app/api/reports/jobs/` | Background job endpoints |
| `src/app/api/reports/targets/` | Target CRUD |
| `src/app/api/reports/schedules/` | Schedule CRUD |

## Appendix B: Autotask Ticket Fields Reference

Fields available from `GET /v1.0/Tickets/query`:

```
id, ticketNumber, title, description, status, priority, queueID,
source, issueType, subIssueType, ticketCategory,
companyID, companyLocationID, contactID,
assignedResourceID, assignedResourceRoleID,
creatorResourceID, creatorType,
contractID, serviceLevelAgreementID,
dueDateTime, estimatedHours,
createDate, completedDate, lastActivityDate,
ticketType, changeApprovalStatus, changeApprovalType,
resolvedDateTime, resolvedDueDateTime,
firstResponseDateTime, firstResponseDueDateTime,
firstResponseInitiatingResourceID
```

> Note: Field availability may vary by Autotask instance and API user permissions. Use `?step=diagnose` to verify.

## Appendix C: Migration Strategy

New tables will be created via Prisma migration. The migration will:

1. Add all new models to `schema.prisma`
2. Run `npx prisma migrate dev --name add-reporting-tables`
3. Deploy via the existing migration API endpoint
4. Seed default `ReportingTarget` rows

No existing tables are modified. The new `Ticket` table is entirely separate from the existing `PhaseTask` table (which stores project tasks, not service desk tickets).
