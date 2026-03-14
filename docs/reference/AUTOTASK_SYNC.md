# Autotask PSA Integration

**Last Updated**: 2026-03-06

This document covers the Autotask PSA (Professional Services Automation) integration that syncs companies, projects, phases, tasks, contacts, and notes from Autotask into the Triple Cities Tech platform.

---

## Overview

Autotask is the **primary source of truth** for project data. The sync pulls data from the Autotask REST API v1.0 and creates/updates records in the local PostgreSQL database. The AT-synced records are authoritative — when duplicates exist, the Autotask version wins.

## Architecture

```
Autotask PSA (REST API v1.0)
    │
    ▼
AutotaskClient (src/lib/autotask.ts)
    │ - Auth via API headers (username, secret, integration code)
    │ - Zone-specific base URL
    │ - Automatic pagination (follows nextPageUrl)
    │ - Fallback entity paths for phases/tasks
    │
    ▼
Sync Trigger (src/app/api/autotask/trigger/route.ts)
    │ - Multi-step process (cleanup → companies → projects → contacts → merge → resync)
    │ - Paginated (5 projects per request to stay within 60s timeout)
    │ - Comprehensive error reporting per project
    │
    ▼
Prisma Models
    Company (autotaskCompanyId)
    CompanyContact (autotaskContactId)
    Project (autotaskProjectId)
    Phase (autotaskPhaseId)
    PhaseTask (autotaskTaskId)
    Comment (project notes imported as comments)
    AutotaskSyncLog (sync history)
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTOTASK_API_USERNAME` | API user email | `api@company.com` |
| `AUTOTASK_API_SECRET` | API user secret key | `abc123...` |
| `AUTOTASK_API_INTEGRATION_CODE` | Integration code from Autotask | `XYZ789...` |
| `AUTOTASK_API_BASE_URL` | Zone-specific REST API base URL | `https://webservices6.autotask.net/ATServicesRest` |
| `MIGRATION_SECRET` | Secret for triggering sync (shared with migration endpoints) | `my-secret` |

## Sync Steps

All steps are triggered via `GET /api/autotask/trigger?secret=MIGRATION_SECRET&step=<step>`.

### Step 0: `cleanup`
Removes AT-synced companies that have zero projects. Useful for cleaning up failed previous sync attempts.

### Step 1: `companies`
- Fetches all projects from Autotask to identify which companies have projects
- Fetches each unique company by ID
- Creates new Company records or updates existing ones (matched by `autotaskCompanyId`)
- Generates random passwords for new companies (customer portal access)
- Auto-generates URL slugs

### Step 2: `projects&page=N`
- Fetches all projects, processes 5 per page
- For each project:
  - Finds or creates the local Company
  - Creates/updates the Project record
  - Fetches phases from Autotask → creates/updates Phase records
  - Fetches tasks from Autotask → creates/updates PhaseTask records
  - Fetches project notes → creates Comment records
  - Syncs project description as an internal comment
- Follow `nextPage` URL in response until no more projects
- Detailed per-project reporting in response (phases/tasks/notes/errors)

### Step 3: `contacts`
- Auto-creates the `company_contacts` table if it doesn't exist (no migration needed)
- For each AT-synced company, fetches contacts from Autotask
- Creates/updates CompanyContact records (matched by `autotaskContactId`)
- Handles email collisions (same email in same company)

### Step 4: `merge`
- Finds duplicate companies by normalized name (case-insensitive)
- For each duplicate group:
  - **Winner**: the company WITH an `autotaskCompanyId` (or the one with most projects)
  - **Losers**: all other companies with the same name
  - Moves all projects from losers to winner
  - Moves contacts from losers to winner (handles email collisions)
  - Transfers contact info (primaryContact, etc.) if winner is missing it
  - Deletes loser companies
- Reports: projects moved, contacts moved, companies deleted

### Step 5: `resync&page=N`
- Re-fetches phases and tasks from Autotask for all AT-synced projects
- Fixes empty phases by re-running the phase/task sync
- Cleans up empty phases (no tasks, no comments, no AT phase ID)
- Updates phase statuses based on task completion:
  - All tasks complete → COMPLETE
  - Any task waiting → WAITING_ON_CUSTOMER
  - Any task in progress → IN_PROGRESS
  - Otherwise → NOT_STARTED

### Step 6: `diagnose`
- Shows raw Autotask API responses for the first project
- Displays: sample projects, phases, tasks, notes
- Shows task and project status picklist values from the Autotask instance
- Invaluable for debugging API issues

## Status Mappings

### Project Status (Autotask → Local)
| AT Value | AT Meaning | Local Status |
|----------|-----------|--------------|
| 0 | Inactive | ON_HOLD |
| 1 | New | ACTIVE |
| 4 | Active | ACTIVE |
| 5 | Complete | COMPLETED |

### Task Status (Autotask → Local)
| AT Value | AT Meaning | Local Status |
|----------|-----------|--------------|
| 1 | New | NOT_STARTED |
| 4 | In Progress | WORK_IN_PROGRESS |
| 5 | Complete | REVIEWED_AND_DONE |
| 7 | Waiting Customer | WAITING_ON_CLIENT |

**Important**: These values are instance-specific picklist values. Use `?step=diagnose` to verify the actual values for your Autotask instance. The diagnose step shows the `taskStatusPicklist` and `projectStatusPicklist` from Autotask.

### Task Priority (Autotask → Local)
| AT Value | AT Meaning | Local Priority |
|----------|-----------|----------------|
| 1 | Low | LOW |
| 2 | Medium | MEDIUM |
| 3 | High | HIGH |
| 4 | Critical | URGENT |

### Phase Status
Phases don't have a direct status field in Autotask. Status is derived from:
- Due date in the past → COMPLETE
- `isScheduled` flag → SCHEDULED
- Start date in the past → IN_PROGRESS
- Otherwise → NOT_STARTED

The `resync` step also updates phase status based on task completion.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/autotask.ts` | API client, TypeScript types, status mapping functions |
| `src/app/api/autotask/trigger/route.ts` | Multi-step sync endpoint (the main file) |
| `src/app/api/autotask/status/route.ts` | Sync history viewer (no auth required) |
| `prisma/schema.prisma` | Database schema (autotask fields on Company, Project, Phase, PhaseTask) |

## Autotask API Notes

### Entity Paths
The Autotask REST API v1.0 supports both parent/child endpoints and direct queries:

- **Phases**: `Projects/{id}/Phases/query` (child) or `Phases/query` (direct with filter)
- **Tasks**: `Projects/{id}/Tasks/query` (child), `ProjectTasks/query`, or `Tasks/query`
- **Notes**: `Projects/{id}/Notes/query` (child) or `ProjectNotes/query`

The client tries multiple paths with fallbacks since Autotask instances vary.

### Authentication
Headers required on every request:
```
Content-Type: application/json
ApiIntegrationCode: <integration code>
UserName: <api username>
Secret: <api secret>
```

### Pagination
The API returns `pageDetails.nextPageUrl` for multi-page results. The client automatically follows these.

## Troubleshooting

### No phases or tasks syncing
1. Run `?step=diagnose` — check if phases/tasks sections show data or errors
2. If errors: the Autotask API entity path may differ for your instance
3. If empty: the projects in Autotask may genuinely have no tasks
4. Run `?step=resync&page=1` to retry

### Empty phases showing in UI
1. Run `?step=resync&page=1` — this re-fetches tasks AND cleans up empty phases
2. The resync also updates phase statuses based on task completion

### Duplicate companies
1. Run `?step=merge` — automatically finds and merges duplicates
2. The AT-synced company is always kept as the winner
3. Projects and contacts from non-AT duplicates are moved to the winner

### Wrong task statuses
1. Run `?step=diagnose` to see your Autotask instance's actual picklist values
2. If values differ from defaults (1/4/5/7), update the constants in `src/lib/autotask.ts`
3. Re-run `?step=projects&page=1` to re-sync

### Contacts step failing
- The contacts step auto-creates the `company_contacts` table if it doesn't exist
- If it still fails, check the error in the response — likely a Prisma/Postgres issue

## Data Model

### Autotask ID Fields
Each synced model has an autotask ID field that links it to the Autotask record:
- `Company.autotaskCompanyId` (unique)
- `CompanyContact.autotaskContactId` (unique)
- `Project.autotaskProjectId` (unique)
- `Phase.autotaskPhaseId` (unique)
- `PhaseTask.autotaskTaskId` (unique)

### Sync Timestamps
- `Company.autotaskLastSync` — last time this company was synced
- `Project.autotaskLastSync` — last time this project was synced

### Sync Log
`AutotaskSyncLog` records every sync operation with:
- `syncType` — which step ran (e.g., `companies`, `projects-page-1`)
- `status` — `success`, `partial`, or `failed`
- Counts: companiesCreated, projectsCreated, tasksCreated, etc.
- `errors` — JSON array of error messages
- `durationMs` — how long the sync took

View sync history at `GET /api/autotask/status` (no auth required).

## Recommended Sync Order (Full Fresh Sync)

```
1. ?step=cleanup          # Remove orphan AT companies
2. ?step=companies        # Sync companies
3. ?step=projects&page=1  # Sync projects (follow nextPage links)
4. ?step=contacts         # Sync contacts
5. ?step=merge            # Deduplicate companies
6. ?step=resync&page=1    # Re-fetch tasks, fix empty phases (follow nextPage links)
```

For incremental syncs after initial setup, typically only steps 3 and 6 are needed.
