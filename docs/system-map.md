# System Map

> Last updated: 2026-03-20

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
| Projects | `projects/` | Project list, new project, AI project creation |
| Contacts | `contacts/page.tsx` | All contacts with role management |
| SOC | `soc/` | Security alert triage, incident management |
| Reporting | `reporting/` | Analytics, health scores, business reviews, pipeline status |
| Blog CMS | `blog/` | Post management, AI generation, approval workflow |
| Marketing | `marketing/` | Campaigns, social setup, audiences |
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
| `submit/route.ts` | POST | Submit HR request (raw pg, requires companySlug in body) |
| `requests/route.ts` | GET | List requests (requires companySlug + email params) |
| `requests/[id]/route.ts` | GET | Single request detail |
| `process/route.ts` | POST | Background processing (fire-and-forget) |
| `m365-data/route.ts` | GET | Live tenant data (groups, licenses, users, sites) |

### M365 Admin Routes (`src/app/api/admin/companies/[id]/`)
| Route | Methods | Purpose |
|-------|---------|---------|
| `m365/route.ts` | GET, PUT, POST, PATCH | M365 credentials CRUD + test + complete |

---

## 2. Key Components (`src/components/`)

### Admin
| Component | File | Purpose |
|-----------|------|---------|
| Tech Onboarding Wizard | `admin/TechOnboardingWizard.tsx` | 4-step wizard for techs to onboard customers |
| Company Detail | `companies/CompanyDetail.tsx` | Company detail page with "Onboard Customer" button |

### Customer Portal
| Component | File | Purpose |
|-----------|------|---------|
| OnboardingPortal | `onboarding/OnboardingPortal.tsx` | Portal shell — routes to dashboard or legacy timeline |
| CustomerDashboard | `onboarding/CustomerDashboard.tsx` | Ticket stats cards + project list + ticket table |
| HrRequestSection | `onboarding/HrRequestSection.tsx` | Employee Management card + manager verify modal |
| HrRequestCards | `onboarding/HrRequestCards.tsx` | Action cards + FormRendererLoader — loads schema from API, renders FormRenderer |
| FormRenderer | `onboarding/FormRenderer.tsx` | Schema-driven step-by-step wizard (replaces legacy HrRequestWizard) |
| FormField | `onboarding/FormField.tsx` | Individual field components (text, select, multi_select, radio, checkbox, user_select, date, etc.) |
| VisibilityEngine | `onboarding/VisibilityEngine.ts` | Conditional field visibility rule evaluation |
| PasswordGate | `onboarding/PasswordGate.tsx` | Legacy — no longer rendered (portal is open) |

---

## 3. Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `prisma.ts` | Singleton PrismaClient with PrismaPg serverless adapter |
| `graph.ts` | Microsoft Graph API client — per-tenant token cache, all Graph methods |
| `autotask.ts` | Autotask REST API client — companies, contacts, projects, phases, tasks, tickets |
| `pax8.ts` | Pax8 partner API client |
| `onboarding-session.ts` | Legacy signed-cookie session (still used for logout, not for auth) |
| `onboarding-data.ts` | Fetches structured onboarding data for legacy timeline view |
| `security.ts` | Rate limiting, request validation, security event logging |

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
| `AutotaskSyncLog` | `autotask_sync_logs` | Sync run history |
| `HrRequest` | `hr_requests` | Raw pg only |
| `HrRequestStep` | `hr_request_steps` | Raw pg only |
| `HrAuditLog` | `hr_audit_logs` | Raw pg only |

### Raw SQL tables (NOT Prisma-managed)
- SOC tables: `soc_incidents`, `soc_rules`, `soc_config`
- Reporting tables: created via `/api/reports/migrate`

---

## 5. Critical Gotchas

| Gotcha | Detail |
|--------|--------|
| Raw pg for HR routes | Never use Prisma for `hr_*` tables — use `pg.Pool` with `DATABASE_URL` |
| `"updatedAt"` in raw SQL | Prisma stores camelCase field names verbatim — must quote: `"updatedAt" = NOW()` |
| `companySlug` required | All HR API calls need `companySlug` in body (POST) or query params (GET) |
| M365 columns snake_case | Only M365 columns use `@map("snake_case")` — everything else is camelCase in DB |
| Portal is open | `isAuthenticated = true` always in `onboarding/[companyName]/page.tsx` |
| JSONB cast | Raw pg inserts of JSON strings need `::jsonb` cast: `$1::jsonb` |
| Manager verify | CLIENT_MANAGER role OR `isPrimary=true` in `company_contacts` grants HR access |
