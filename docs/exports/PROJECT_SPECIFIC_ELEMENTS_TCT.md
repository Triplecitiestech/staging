# Project-Specific Elements — Triple Cities Tech

> Everything in this document is specific to the Triple Cities Tech website and should NOT be reused or carried over to other projects.

---

## 1. Company-Specific Content

- **Company name**: Triple Cities Tech
- **Domain**: `www.triplecitiestech.com`
- **Industry**: Managed IT Services / MSP (Managed Service Provider)
- **Geographic focus**: Triple Cities area (Binghamton, Johnson City, Endicott, NY), Upstate NY, Northeast PA
- **Owner**: Kurtis Florance (`kurtis@triplecitiestech.com`)
- **Service offerings**: Managed IT, Cybersecurity, Cloud Services, IT Strategy & Consulting
- **Target industries**: Manufacturing, Dental/Medical, Legal, Automotive, Education, Real Estate
- **Compliance specialties**: HIPAA, CMMC, NIST 800-171

---

## 2. Branding & Design (TCT-Specific)

- **Color palette**: Primary blues/cyans, secondary slates — specific hex values in tailwind.config.js
- **Forbidden colors**: Yellow, amber, orange, gold, brown, mustard — these render poorly on TCT's dark backgrounds
- **Logo**: TCT-specific logo files in `/public/`
- **OG images**: `/og-home.jpg`, `/og-about.jpg`, etc. — TCT-branded
- **Tagline**: "Professional IT Services" / "Managed IT Services"
- **Font choice**: Inter (while reusable, the specific weight hierarchy is tuned for TCT's dark theme)

---

## 3. Integrations Specific to This Site

### Autotask PSA Integration
- Full REST API sync: Companies, Projects, Phases, Tasks, Contacts, Notes
- Multi-step sync endpoint (`/api/autotask/trigger`)
- Entity path fallbacks (3 different paths for tasks/phases)
- Instance-specific picklist values (status codes are unique to TCT's Autotask instance)
- Write-back for notes and time entries (PATCH for tasks returns 404 on this instance)
- **Files**: `src/lib/autotask.ts`, `src/app/api/autotask/`

### Datto RMM Integration
- Device sync for IP verification in SOC triage
- `datto_devices` table for caching device data
- Technician verification via device hostname/IP matching
- **Files**: `src/lib/soc/technician-verifier.ts`, cron job for device sync

### SOC Analyst Agent
- AI-powered security ticket triage using Claude API
- 9-stage pipeline: Ingest → Filter → Enrich → Correlate → Rules → Screen → Deep Analyze → Verdict → Document
- Custom SOC tables (soc_ticket_analysis, soc_incidents, soc_activity_log, soc_rules, soc_config, etc.)
- Suppression rules tuned for TCT's alert patterns (Agent Installation Burst, Technician PH Login, Windows Update Noise)
- **Not reusable**: The SOC system is deeply tied to TCT's Autotask ticket pipeline and Datto RMM

### ChatGenie Widget
- Live chat widget embedded via standard `<script>` tag (not Next.js `<Script>`)
- CSP entries for `messenger.chatgenie.io` and `api.chatgenie.io`

### Azure AD OAuth
- Microsoft OAuth for staff authentication
- Tenant-specific: `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`
- Staff roles: ADMIN, MANAGER, VIEWER
- Stored in `staff_users` table

### Social Media Accounts
- Facebook, Instagram, LinkedIn, Twitter/X tokens tied to TCT's business accounts
- Social publisher (`src/lib/social-publisher.ts`) for cross-posting blog content

---

## 4. Business Workflows Unique to TCT

### Blog System
- AI content generation via Claude API on schedule (Mon/Wed/Fri 8AM)
- Draft → Approval Email → Admin Review → Scheduled Publish pipeline
- Cron: generate, send approval emails (daily noon), publish (every 15 min)
- Approval email goes to `kurtis@triplecitiestech.com`

### Customer Onboarding Portal
- `/onboarding/[companyName]` — customer-facing project dashboard
- Password-based auth separate from staff Azure AD auth
- OnboardingJourney (5-step guided tour for first-time users)
- Ticket timeline from Autotask (customer-visible notes only)
- Customer can reply to open tickets

### Project Management Hierarchy
- Company → Project → Phase → PhaseTask
- Customer visibility controls per item
- Internal vs. customer-facing notes/comments
- Audit logging on all changes

### Demo Mode (Contoso Industries)
- In-memory demo data for safe presentations
- Toggle via AdminHeader button
- Hides real customer data, replaces with synthetic data
- No database writes

### Sales & Marketing System
- `/admin/marketing/*` pages
- Audience targeting: Autotask Contact Action Groups + per-company targeting
- Email campaign management via Resend

### Business Reviews / Reporting
- Monthly/quarterly business review reports
- Customer health scores (computed periodically)
- Company metrics daily rollups
- Ticket lifecycle analytics
- Resource utilization tracking

---

## 5. Database Models Specific to TCT

These models reflect TCT's business domain and should not be reused:

- `StaffUser` — Azure AD-linked staff with roles
- `Company` — Autotask-synced companies
- `CompanyContact` — Autotask contacts
- `Project`, `Phase`, `PhaseTask` — Autotask project hierarchy
- `BlogPost`, `Comment` — AI-generated blog system
- `Assignment` — Staff task assignments
- `AuditLog` — Change tracking
- `Notification` — In-app notifications
- `AutotaskSyncLog` — Sync history
- `Ticket`, `TicketNote`, `TicketTimeEntry` — Autotask ticket cache
- `TicketLifecycle`, `TicketStatusHistory` — Analytics
- `CompanyMetricsDaily`, `CustomerHealthScore` — Reporting
- `BusinessReview` — Customer reports
- `Resource` — Autotask technicians
- All `soc_*` tables — SOC analyst agent
- `datto_devices` — RMM device cache
- Campaign/audience marketing tables

---

## 6. Environment Variables Tied to This Project

```
# TCT Azure AD (Microsoft OAuth)
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# TCT Autotask PSA
AUTOTASK_API_USERNAME=
AUTOTASK_API_SECRET=
AUTOTASK_API_INTEGRATION_CODE=
AUTOTASK_API_BASE_URL=
AUTOTASK_SYNC_SECRET=

# TCT Datto RMM
DATTO_RMM_API_KEY=
DATTO_RMM_API_SECRET=
DATTO_RMM_API_URL=

# TCT Social Media Accounts
FACEBOOK_ACCESS_TOKEN= / FACEBOOK_PAGE_ID=
INSTAGRAM_ACCESS_TOKEN= / INSTAGRAM_ACCOUNT_ID=
LINKEDIN_ACCESS_TOKEN= / LINKEDIN_ORG_ID=
TWITTER_API_KEY= / TWITTER_API_SECRET= / TWITTER_ACCESS_TOKEN= / TWITTER_ACCESS_SECRET=

# TCT-Specific Secrets
MIGRATION_SECRET=Ty3svIEQ5Ehntq4xJzYjAUT5UptrYXOj7tseRTxHYDI=
CRON_SECRET=a63d095dce16b3ad9d55cc79a3db7b9f600502272033b8c3284673e23d757cb1
ONBOARDING_SIGNING_KEY=
BLOG_CRON_SECRET=
APPROVAL_EMAIL=kurtis@triplecitiestech.com

# TCT Browserbase (remote testing)
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
```

---

## 7. Domain Assumptions

- Users run **Windows (PowerShell)** — all CLI instructions given in PowerShell syntax
- **Vercel region**: `iad1` (US East / Virginia) — chosen for proximity to Autotask/Azure services
- **Autotask API has instance-specific behavior**: Task PATCH returns 404, picklist values are unique
- **30-second serverless timeout** for standard routes, 60 seconds for cron/sync
- **No test database available** — `npm run build` and `npm run lint` are the primary quality gates alongside e2e

---

## 8. Content & Pages Specific to TCT

- Homepage marketing sections (IT services, industries, testimonials)
- `/about` — TCT company story
- `/services` — Managed IT, Cybersecurity, Cloud, IT Strategy
- `/industries` — Manufacturing, Dental, Legal, etc.
- `/contact` — TCT contact form
- `/blog` — AI-generated IT industry content
- `/admin/*` — TCT staff portal (projects, companies, SOC, reporting, marketing)
- `/onboarding/*` — TCT customer portal
- FAQ content hardcoded in `FAQSchema.tsx`
- Service descriptions in `ServiceSchema.tsx`
- LocalBusiness/Organization schemas with TCT address, phone, hours

---

## 9. Cron Jobs Specific to TCT

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Mon/Wed/Fri 8AM | `/api/cron/generate-blog` | AI blog generation |
| Daily noon | `/api/cron/send-approval-emails` | Blog approval emails |
| Every 15 min | `/api/cron/publish-scheduled` | Publish approved blogs |
| Every 5 min | `/api/cron/autotask-sync` | Sync from Autotask PSA |
| Every 2 hours | `/api/reports/jobs/sync-tickets` | Ticket reporting cache |
| Weekly Sunday 2AM | `/api/reports/jobs/compute-health` | Customer health scores |
| Every 5 min | `/api/cron/soc-triage` | SOC AI triage |
| Every 30 min | `/api/cron/datto-device-sync` | Datto RMM device cache |
