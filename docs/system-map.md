# System Map

> Last updated: 2026-03-14

This document maps every major subsystem to its primary source files. Use it to find where logic lives before making changes.

---

## 1. Routes & Pages (`src/app/`)

### Public Marketing (`src/app/(marketing)/`)
| Page | File | Purpose |
|------|------|---------|
| Home | `page.tsx` | Landing page with hero, services, testimonials |
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
- `setup/page.tsx` — blog setup (should be restricted)

### Admin Dashboard (`src/app/admin/`)
| Section | Directory | Primary Logic |
|---------|-----------|---------------|
| Dashboard Home | `page.tsx` | System health cards, quick stats |
| Companies | `companies/` | Company CRUD, Autotask links |
| Contacts | `contacts/page.tsx` | Contact management, invites |
| Projects | `projects/` | Project/phase/task management |
| Blog CMS | `blog/` | Blog editor, approval, scheduling |
| SOC Analyst | `soc/` | Security dashboard, incidents, rules, config |
| Reporting | `reporting/` | Analytics, business reviews, health, technicians |
| Monitoring | `monitoring/page.tsx` | Platform health, AT sync logs, AI usage |
| Marketing | `marketing/` | Campaigns, audiences, content |
| Autotask Logs | `autotask-logs/` | Sync history viewer |
| Debug | `debug/` | Test failure dashboard |
| Preview | `preview/` | Customer portal preview |

### Customer Portal (`src/app/onboarding/`)
- `[companyName]/page.tsx` — portal entry point
- Uses components from `src/components/onboarding/`

### API Routes (`src/app/api/`)
| Group | Directory | Endpoints |
|-------|-----------|-----------|
| Autotask | `autotask/` | `trigger` (multi-step sync), `status` (history) |
| Blog | `blog/` | CRUD, approval, generation |
| Companies | `companies/` | CRUD |
| Contacts | `contacts/` | CRUD, invite |
| Cron | `cron/` | Blog generation, approval emails, publish, AT sync |
| Customer | `customer/` | Tickets timeline, reply |
| Marketing | `marketing/` | Campaigns CRUD, generate, approve, send |
| Onboarding | `onboarding/` | Auth, impersonate |
| Projects | `projects/` | CRUD |
| Reports | `reports/` | 17 endpoints (dashboard, analytics, business review, etc.) |
| SOC | `soc/` | 11 endpoints (tickets, incidents, rules, trends, etc.) |
| Tasks | `tasks/` | CRUD with Autotask write-back |
| Admin | `admin/` | AI chat, staff, portal access |
| Errors | `errors/` | Client error capture |
| Test Failures | `test-failures/` | Ingest, list, migrate |

---

## 2. Components (`src/components/`)

| Directory | Purpose | Key Components |
|-----------|---------|----------------|
| `admin/` | Admin dashboard widgets | `AIProjectAssistant`, `AdminHeader`, `SyncPanel`, `AdminErrorBoundary` |
| `soc/` | SOC Analyst Agent UI | `SocDashboardClient`, `SocIncidentDetail`, `SocRulesManager`, `SocConfigPanel`, `SocFlowchart` |
| `reporting/` | Reporting & analytics | `ReportingDashboard`, `AnalyticsDashboard`, `BusinessReviewDetail`, `ReportAIAssistant`, `TrendChart`, `HealthReport` |
| `tickets/` | Shared ticket components | `TicketTable`, `TicketDetail`, `PriorityBadge`, `SlaIndicator`, `TimelineEntry` |
| `onboarding/` | Customer portal | `OnboardingPortal`, `CustomerDashboard`, `OnboardingJourney`, `TicketTimeline`, `PasswordGate` |
| `sections/` | Marketing page sections | Hero, services, testimonials, CTA sections |
| `companies/` | Company management | `CompanyList`, `NewCompanyForm` |
| `contacts/` | Contact management | `ContactsList` |
| `projects/` | Project management | `NewProjectForm`, `ProjectList` |
| `ui/` | Shared primitives | Buttons, cards, modals, inputs |
| `seo/` | SEO components | JSON-LD structured data, breadcrumbs |
| `layout/` | Layout components | Navigation, footer, page wrappers |

---

## 3. Core Libraries (`src/lib/`)

### Authentication & Security
| File | Purpose |
|------|---------|
| `src/auth.ts` | NextAuth 5 config, Azure AD provider, session enrichment |
| `src/lib/security.ts` | Rate limiting, input sanitization, CSRF, request validation |
| `src/lib/permissions.ts` | Role-based staff permission system (ADMIN/MANAGER/VIEWER) |
| `src/lib/onboarding-data.ts` | Customer portal data layer, password validation |
| `src/lib/onboarding-session.ts` | Signed cookie session management for customer portal |
| `src/middleware.ts` | Security headers, bot blocking, suspicious param filtering |

### AI & Content
| File | Purpose |
|------|---------|
| `src/lib/blog-generator.ts` | Claude Sonnet blog content generation |
| `src/lib/content-curator.ts` | RSS feed aggregation for blog topics |

### SOC Analyst Agent (`src/lib/soc/`)
| File | Purpose |
|------|---------|
| `engine.ts` | Main SOC processing engine — ticket classification, incident creation |
| `correlation.ts` | Incident correlation and merge recommendations |
| `rules.ts` | Rule matching engine (manual + AI-generated) |
| `prompts.ts` | Claude AI prompts for classification and action plans |
| `ip-extractor.ts` | IP address extraction from ticket text |
| `types.ts` | SOC type definitions |
| `technician-verifier.ts` | Verify technician identity for AT write-back |

### Reporting & Analytics (`src/lib/reporting/`)
| File | Purpose |
|------|---------|
| `realtime-queries.ts` | Real-time dashboard metric queries |
| `health-score.ts` | Company health score calculation |
| `analytics.ts` | Trend analytics and time-series data |
| `backfill.ts` | Self-chaining Autotask data backfill |
| `aggregation.ts` | Metric aggregation pipeline |
| `ensure-tables.ts` | Self-healing table creation |
| `sla-config.ts` | SLA threshold configuration |
| `api-user-filter.ts` | Filter out API/automation users from metrics |
| `sync.ts` | Ticket/time entry/note sync from Autotask |
| `lifecycle.ts` | Ticket lifecycle tracking |
| `services.ts` | Reporting service orchestration |
| `types.ts` | Reporting type definitions |

### Unified Tickets (`src/lib/tickets/`)
| File | Purpose |
|------|---------|
| `adapters.ts` | Normalize various ticket sources to `UnifiedTicket` type |
| `utils.ts` | Ticket utility functions |

### Other
| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma client singleton with PrismaPg adapter |
| `src/lib/autotask.ts` | Autotask REST API client, types, status mappers |
| `src/lib/demo-mode.ts` | Contoso Industries demo data generation |
| `src/lib/error-logger.ts` | Centralized error capture with deduplication |
| `src/lib/server-logger.ts` | Structured request logging with requestId |

---

## 4. Database Layer

### Prisma Schema (`prisma/schema.prisma`)
- 30+ models, 500+ lines
- Key models: `StaffUser`, `Company`, `CompanyContact`, `Project`, `Phase`, `PhaseTask`, `BlogPost`, `Comment`, `Assignment`, `AuditLog`, `MarketingCampaign`, `MarketingAudience`
- Key enums: `BlogStatus`, `TaskStatus`, `PhaseStatus`, `ProjectStatus`, `Priority`, `StaffRole`
- All Autotask-linked models have `autotask*Id` fields

### Raw SQL Tables (not Prisma-managed)
| Table Group | Tables | Created By |
|-------------|--------|------------|
| Reporting | `report_tickets`, `report_time_entries`, `report_ticket_notes`, `report_aggregations`, `report_schedules`, `report_targets` | `/api/reports/migrate` + `ensure-tables.ts` |
| SOC | `soc_incidents`, `soc_activities`, `soc_config`, `soc_rules` | `/api/soc/bootstrap` or `/api/soc/migrate` |
| Testing | `test_failures` | `/api/test-failures/migrate` |

---

## 5. External Integrations

### Autotask PSA
- **Client**: `src/lib/autotask.ts` — REST API v1.0 with retry and fallback paths
- **Sync orchestrator**: `src/app/api/autotask/trigger/route.ts` — multi-step sync (cleanup, companies, projects, contacts, merge, resync, diagnose)
- **Cron**: `src/app/api/cron/autotask-sync/route.ts` — scheduled sync
- **Data flow**: Autotask API → AutotaskClient → sync functions → Prisma upsert

### Anthropic Claude AI
- **Blog generation**: `src/lib/blog-generator.ts` (Claude Sonnet)
- **Project chat**: `src/app/api/admin/ai-chat/route.ts` (Claude Haiku)
- **SOC analysis**: `src/lib/soc/prompts.ts` (classification, action plans)
- **Report AI assistant**: `src/app/api/reports/ai-assistant/route.ts` (conversational)
- **Marketing refinement**: `src/app/api/marketing/campaigns/[id]/refine/route.ts`

### Resend (Email)
- Contact form submissions
- Blog approval emails
- Marketing campaign delivery
- Customer invite emails

### Cloudflare Turnstile
- Contact form bot protection
- Site key (public) + secret key (server validation)

### Calendly
- Embedded widget on `/schedule` page
- All scheduling links routed to `/schedule` internally

---

## 6. Testing Infrastructure

- **Config**: `playwright.config.ts` — Chromium + iPhone 13 viewports
- **Tests**: `tests/e2e/` — 30+ specs covering all systems
- **Custom reporter**: `tests/e2e/failure-reporter.ts` — JSON + markdown summaries
- **Browserbase**: `tests/e2e/browserbase.setup.ts` — remote browser testing via CDP
- **Debug CLI**: `scripts/debug-failures.ts` (`npm run debug:failures`)
- **Failure dashboard**: `/admin/debug/failures`
