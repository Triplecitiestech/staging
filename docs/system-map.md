# System Map

> Last updated: 2026-03-27

This document maps every major subsystem to its primary source files. Use it to find where logic lives before making changes.

---

## 1. Routes & Pages (`src/app/`)

### Public Marketing (`src/app/(marketing)/`)
| Page | File | Purpose |
|------|------|---------|
| Home | `page.tsx` | Landing page |
| About | `about/page.tsx` | Company info |
| Contact | `contact/page.tsx` | Contact form (Turnstile + honeypot) |
| Services | `services/page.tsx` | Service listings |
| Industries | `industries/*/page.tsx` | 4 vertical industry pages |
| Support | `support/page.tsx` | Support portal |
| Payment | `payment/page.tsx` | Payment portal |
| MSA | `msa/page.tsx` | Master Service Agreement |
| Schedule | `schedule/page.tsx` | Embedded Calendly widget |

### Blog (`src/app/blog/`)
- `page.tsx` — blog listing (public)
- `[slug]/page.tsx` — individual blog post

### Admin Dashboard (`src/app/admin/`)
| Section | Directory | Primary Logic |
|---------|-----------|---------------|
| Dashboard | `page.tsx` | KPI overview |
| Companies | `companies/` | Company CRUD, company detail |
| **Company Onboarding** | `companies/[id]/onboard/page.tsx` | 4-step tech wizard (Autotask + M365 + portal) |
| **Company Detail** | `companies/[id]/page.tsx` | Company info, contacts, projects (uses `CompanyDetail.tsx`) |
| Projects | `projects/` | Project list, new project, AI project creation |
| Contacts | `contacts/page.tsx` | All contacts with role management |
| SOC | `soc/` | Security alert triage, incident management |
| Reporting | `reporting/` | Analytics, health scores, business reviews, pipeline status |
| Blog CMS | `blog/` | Post management, AI generation, approval workflow |
| Marketing | `marketing/` | Campaigns, social setup, audiences |
| **Portal Preview** | `preview/[slug]/page.tsx` | Admin preview of customer portal (server component, uses `PreviewBanner` + `OnboardingPortal`) |
| Autotask Logs | `autotask-logs/page.tsx` | Sync history and error log |
| Pipeline Status | `reporting/status/page.tsx` | Manual pipeline job triggers |

### Customer Portal (`src/app/onboarding/`)
| File | Purpose |
|------|---------|
| `[companyName]/page.tsx` | Portal entry — no password, always authenticated |
| `[companyName]/error.tsx` | Error boundary |

### HR API Routes (`src/app/api/hr/`)
| Route | Method | Purpose |
|-------|--------|---------|
| `verify-manager/route.ts` | POST | Verify email is CLIENT_MANAGER or isPrimary |
| `submit/route.ts` | POST | Submit HR request (raw pg via `getPool()`, requires companySlug in body) |
| `requests/route.ts` | GET | List requests (requires companySlug + email params) |
| `requests/[id]/route.ts` | GET | Single request detail |
| `process/route.ts` | POST | Background processing — creates Autotask tickets, M365 provisioning, emails |
| `m365-data/route.ts` | GET | Live tenant data (groups, licenses, users, sites) |

### M365 Admin Routes (`src/app/api/admin/companies/[id]/`)
| Route | Methods | Purpose |
|-------|---------|---------|
| `m365/route.ts` | GET, PUT, POST, PATCH | M365 credentials CRUD + test + complete |

### Cron Jobs (`src/app/api/cron/`)
| Route | Schedule | Purpose |
|-------|----------|---------|
| `health-monitor/route.ts` | Every 15 min | DB, error rate, cron job health, Autotask API checks; sends email alerts |
| `autotask-sync/route.ts` | Every 5 min | Sync companies/contacts/projects from Autotask |
| `blog-generate/route.ts` | Mon/Wed/Fri 8AM | AI blog generation |
| `blog-publish/route.ts` | Every 15 min | Publish scheduled blog posts |

### Reporting Job Routes (`src/app/api/reports/jobs/`)
| Route | Schedule | Job Name |
|-------|----------|----------|
| `sync-tickets/route.ts` | Every 2 hours | `sync_tickets` |
| `sync-time-entries/route.ts` | Every 2 hours | `sync_time_entries` |
| `aggregate-company/route.ts` | 1:15 AM daily | `aggregate_company` |
| `aggregate-technician/route.ts` | 1 AM daily | `aggregate_technician` |

---

## 2. Key Components (`src/components/`)

### Admin
| Component | File | Purpose |
|-----------|------|---------|
| AdminHeader | `admin/AdminHeader.tsx` | Top nav with demo mode toggle |
| DemoModeProvider | `admin/DemoModeProvider.tsx` | React context for demo mode anonymization |
| PreviewBanner | `admin/PreviewBanner.tsx` | Client component for admin portal preview banner |
| Tech Onboarding Wizard | `admin/TechOnboardingWizard.tsx` | 4-step wizard for techs to onboard customers |
| Company Detail | `companies/CompanyDetail.tsx` | Company detail page with demo mode, contacts, projects |

### Customer Portal
| Component | File | Purpose |
|-----------|------|---------|
| OnboardingPortal | `onboarding/OnboardingPortal.tsx` | Portal shell — routes to dashboard or legacy timeline; has demo mode |
| CustomerDashboard | `onboarding/CustomerDashboard.tsx` | Ticket stats cards + project list + ticket table; has demo mode |
| HrRequestSection | `onboarding/HrRequestSection.tsx` | Employee Management card + manager verify modal |
| HrRequestCards | `onboarding/HrRequestCards.tsx` | Action cards + FormRendererLoader — loads schema from API, renders FormRenderer |
| FormRenderer | `onboarding/FormRenderer.tsx` | Schema-driven step-by-step wizard (replaces legacy HrRequestWizard) |
| FormField | `onboarding/FormField.tsx` | Individual field components (text, select, multi_select, radio, checkbox, user_select, date, etc.) |
| VisibilityEngine | `onboarding/VisibilityEngine.ts` | Conditional field visibility rule evaluation |
| PasswordGate | `onboarding/PasswordGate.tsx` | Legacy — no longer rendered (portal is open) |

### Compliance Engine
| Component | File | Purpose |
|-----------|------|---------|
| ComplianceDashboard | `compliance/ComplianceDashboard.tsx` | Main dashboard with tabs: Assessments, Policy Analysis, Policy Generation, Platform Mapping |
| PolicyManager | `compliance/PolicyManager.tsx` | Upload/paste/SharePoint policy import + AI analysis |
| PolicyGenerationDashboard | `compliance/PolicyGenerationDashboard.tsx` | Policy generation workflow: catalog, intake, AI generation, review, export |
| ToolCapabilityMap | `compliance/ToolCapabilityMap.tsx` | Tool registry + capability gap analysis |
| PlatformMappingPanel | `compliance/PlatformMappingPanel.tsx` | Per-company platform site/org mappings |

### Compliance Lib (`src/lib/compliance/`)
| Module | Purpose |
|--------|---------|
| `engine.ts` | Assessment lifecycle, evidence collection, evaluation |
| `ensure-tables.ts` | Bootstrap all compliance + policy generation tables |
| `types.ts` | Core type definitions |
| `frameworks/cis-v8.ts` | CIS v8 control definitions + 68 evaluators |
| `collectors/graph.ts` | Microsoft 365 evidence collection |
| `collectors/msp.ts` | Datto, DNSFilter, Domotz, IT Glue, SaaS Alerts collectors |
| `registry/` | Tool definitions, capabilities, control-capability map, resolver |
| `policy-generation/catalog.ts` | Master policy catalog (30+ types) |
| `policy-generation/framework-mappings.ts` | CIS v8, HIPAA, NIST 800-171, CMMC mappings |
| `policy-generation/questionnaire.ts` | Org profile + policy-specific intake questions |
| `policy-generation/generator.ts` | AI policy generation via Claude API |
| `policy-generation/export.ts` | HTML/Markdown document rendering + storage provider stubs |

### Compliance API Routes (`src/app/api/compliance/`)
| Route | Purpose |
|-------|---------|
| `policies/catalog/route.ts` | Policy catalog + needs analysis |
| `policies/questionnaire/route.ts` | Questionnaire answers (org profile + policy-specific) |
| `policies/generate/route.ts` | AI policy generation + status management |
| `policies/export/route.ts` | Policy download (individual + bundle) |

### Tickets (shared across admin, SOC, customer portal, reporting)
| Component | File | Purpose |
|-----------|------|---------|
| TicketTable | `tickets/TicketTable.tsx` | Shared ticket table with demo mode |
| TicketDetail | `tickets/TicketDetail.tsx` | Ticket detail view with demo mode |
| TimelineEntry | `tickets/TimelineEntry.tsx` | Ticket timeline note entries with demo mode |

### SOC
| Component | File | Purpose |
|-----------|------|---------|
| SocDashboardClient | `soc/SocDashboardClient.tsx` | SOC dashboard with demo mode |
| SocTicketDetail | `soc/SocTicketDetail.tsx` | SOC ticket detail with demo mode |

### Reporting
| Component | File | Purpose |
|-----------|------|---------|
| BusinessReviewDetail | `reporting/BusinessReviewDetail.tsx` | Business review with demo mode |
| AnnualReportDetail | `reporting/AnnualReportDetail.tsx` | Annual report with demo mode |
| PriorityBreakdownChart | `reporting/PriorityBreakdownChart.tsx` | Priority breakdown drilldown with demo mode |

---

## 3. Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `prisma.ts` | Singleton PrismaClient with PrismaPg serverless adapter — **MUST have SSL config** |
| `db-pool.ts` | Shared raw pg Pool for 24+ routes — **MUST have SSL config** |
| `demo-mode.ts` | Demo mode anonymization engine (anonCompany, anonPerson, anonEmail, anonTicketTitle, skewNumber, skewPercent) |
| `graph.ts` | Microsoft Graph API client — per-tenant token cache, all Graph methods |
| `autotask.ts` | Autotask REST API client — companies, contacts, projects, phases, tasks, tickets |
| `pax8.ts` | Pax8 partner API client |
| `error-logger.ts` | Centralized error logging to `error_logs` table (ErrorLog model) |
| `api-usage-tracker.ts` | Tracks AI/email/API usage to ApiUsageLog |
| `permissions.ts` | Role-based staff permission system |
| `security.ts` | Rate limiting, request validation, security event logging |
| `onboarding-session.ts` | Legacy signed-cookie session (still used for logout, not for auth) |
| `onboarding-data.ts` | Fetches structured onboarding data for legacy timeline view |
| `blog-generator.ts` | AI content generation via Claude API |

### Subsystem Directories
| Directory | Purpose |
|-----------|---------|
| `lib/soc/` | SOC engine, correlation, rules, prompts, types |
| `lib/reporting/` | 20+ modules: sync, aggregation, analytics, health score, SLA, job status |
| `lib/tickets/` | Unified ticket adapters and utils |

---

## 4. Database (`prisma/schema.prisma`)

Key models and their table names:

| Model | Table | Notes |
|-------|-------|-------|
| `Company` | `companies` | Has M365 credential fields (added via migration, declared in schema) |
| `CompanyContact` | `company_contacts` | Mixed camelCase columns (`companyId`, `customerRole`, `isPrimary`, `isActive`) |
| `Project` | `projects` | |
| `Phase` | `phases` | |
| `PhaseTask` | `phase_tasks` | |
| `Ticket` | `tickets` | Synced from Autotask |
| `ErrorLog` | `error_logs` | Deduplicated error tracking (may need migration on prod) |
| `ReportingJobStatus` | `reporting_job_status` | Cron job execution tracking |
| `AutotaskSyncLog` | `autotask_sync_logs` | Sync run history |

### Raw SQL tables (NOT Prisma-managed)
- HR tables: `hr_requests`, `hr_request_steps`, `hr_audit_logs`
- SOC tables: `soc_incidents`, `soc_rules`, `soc_config`, `soc_job_status`
- Reporting tables: `report_tickets`, `report_time_entries`, `report_ticket_notes`, `report_aggregations`
- Question engine: `form_schemas`, `form_sections`, `form_questions`, `customer_form_configs`, etc.

---

## 5. Critical Gotchas

| Gotcha | Detail |
|--------|--------|
| **SSL on all pools** | Both `prisma.ts` and `db-pool.ts` MUST have `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false`. Without it, all prod DB connections fail silently. |
| Raw pg for HR routes | Never use Prisma for `hr_*` tables — use `getPool()` from `db-pool.ts` |
| `"updatedAt"` in raw SQL | Prisma stores camelCase field names verbatim — must quote: `"updatedAt" = NOW()` |
| `companySlug` required | All HR API calls need `companySlug` in body (POST) or query params (GET) |
| M365 columns snake_case | Only M365 columns use `@map("snake_case")` — everything else is camelCase in DB |
| Portal is open | `isAuthenticated = true` always in `onboarding/[companyName]/page.tsx` |
| JSONB cast | Raw pg inserts of JSON strings need `::jsonb` cast: `$1::jsonb` |
| Manager verify | CLIENT_MANAGER role OR `isPrimary=true` in `company_contacts` grants HR access |
| Job name convention | Reporting jobs use **underscores** (`sync_tickets`) in the DB, not hyphens |
| Demo mode null safety | All anon functions return `''` for null/undefined input; `demo.title()` guards with `t \|\| ''` |
| HR ticket creation | `/api/hr/process` runs as fire-and-forget background fetch; email sends before ticket creation |
