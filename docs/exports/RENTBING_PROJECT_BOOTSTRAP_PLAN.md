# Rent Bing — Project Bootstrap Plan

> Full plan for launching a modern property management website that integrates with Buildium via its Open API, built on a proven Next.js foundation.

---

## 1. Recommended Architecture

### Overview
```
┌─────────────────────────────────────────────┐
│              Vercel (Hosting)                │
│  ┌──────────────────────────────────────┐   │
│  │     Next.js 15 (App Router)          │   │
│  │  ┌────────┐  ┌────────┐  ┌───────┐  │   │
│  │  │ Public  │  │ Admin  │  │  API  │  │   │
│  │  │ Pages   │  │ Portal │  │ Routes│  │   │
│  │  └────────┘  └────────┘  └───────┘  │   │
│  └──────────────────────────────────────┘   │
│           │              │                   │
│     ┌─────┘              └──────┐            │
│     ▼                           ▼            │
│  ┌──────────┐          ┌──────────────┐     │
│  │ Supabase │          │ Buildium API │     │
│  │ (DB+Auth)│          │ (Properties, │     │
│  │          │          │  Tenants,    │     │
│  └──────────┘          │  Leases)     │     │
│        │               └──────────────┘     │
│        ▼                                     │
│  ┌──────────┐  ┌───────────┐                │
│  │  Resend  │  │ Cloudflare│                │
│  │  (Email) │  │ Turnstile │                │
│  └──────────┘  └───────────┘                │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

**Supabase over raw Prisma PostgreSQL** — YES, use Supabase:
- Built-in auth (email/password, magic link, OAuth) — no NextAuth.js config needed
- Row-level security for tenant data isolation
- Real-time subscriptions (future: live maintenance request updates)
- Storage for property photos and documents
- Dashboard for non-technical team to browse data
- Free tier generous enough for launch; scales cleanly
- PostgreSQL under the hood — migrate to self-hosted if needed

**Prisma — YES, keep it**:
- Use Prisma as the ORM layer on top of Supabase PostgreSQL
- Type-safe queries, schema-as-code, migration management
- Prisma + Supabase work well together (Prisma connects via Supabase's connection pooler)

**Resend — YES, use it**:
- Contact form confirmations
- Rental inquiry notifications
- Application status updates
- Maintenance request confirmations
- Marketing emails (future)

---

## 2. Recommended Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 15 (App Router) | Server components, API routes, ISR |
| **Language** | TypeScript (strict) | Same conventions as foundation |
| **Styling** | Tailwind CSS 3.4+ | Custom theme for Rent Bing brand |
| **Database** | Supabase (PostgreSQL) | Auth + DB + Storage + Realtime |
| **ORM** | Prisma 7+ | Schema-as-code, type-safe queries |
| **Auth** | Supabase Auth | Email/password for tenants, OAuth for admin |
| **Email** | Resend | Transactional + notification emails |
| **Bot Protection** | Cloudflare Turnstile | All public forms |
| **Hosting** | Vercel | Auto-deploy, preview URLs, cron |
| **AI** | Anthropic Claude API | Future: chatbot, listing descriptions, maintenance triage |
| **Property Management** | Buildium Open API | Properties, tenants, leases, maintenance, applications |
| **Analytics** | Vercel Analytics + Speed Insights | Built-in, zero config |

---

## 3. Recommended Repo Structure

```
rentbing/
├── src/
│   ├── app/
│   │   ├── (marketing)/            # Public pages (home, properties, about, contact)
│   │   │   ├── page.tsx            # Homepage
│   │   │   ├── properties/         # Property listings
│   │   │   │   ├── page.tsx        # All properties
│   │   │   │   └── [id]/page.tsx   # Single property detail
│   │   │   ├── about/
│   │   │   ├── contact/
│   │   │   ├── apply/              # Rental application form
│   │   │   └── maintenance/        # Maintenance request (tenant-facing)
│   │   ├── portal/                 # Tenant portal (auth required)
│   │   │   ├── dashboard/
│   │   │   ├── payments/
│   │   │   ├── maintenance/
│   │   │   └── documents/
│   │   ├── admin/                  # Staff portal (admin auth)
│   │   │   ├── dashboard/
│   │   │   ├── properties/
│   │   │   ├── applications/
│   │   │   ├── maintenance/
│   │   │   └── tenants/
│   │   ├── api/
│   │   │   ├── contact/            # Contact form submission
│   │   │   ├── inquiry/            # Rental inquiry
│   │   │   ├── apply/              # Rental application
│   │   │   ├── maintenance/        # Maintenance requests
│   │   │   ├── buildium/           # Buildium sync & proxy endpoints
│   │   │   │   ├── sync/           # Cron-triggered data sync
│   │   │   │   ├── properties/     # Cached property data
│   │   │   │   ├── webhooks/       # Buildium webhook receiver (future)
│   │   │   │   └── status/         # Integration health check
│   │   │   ├── admin/
│   │   │   │   └── system-health/
│   │   │   └── cron/               # Scheduled jobs
│   │   ├── auth/                   # Supabase auth pages (signin, signup, callback)
│   │   └── layout.tsx              # Root layout
│   ├── components/
│   │   ├── layout/                 # Header, Footer, Navigation
│   │   ├── sections/               # Hero, Features, CTA, Testimonials
│   │   ├── ui/                     # Button, Card, Container, Input, Modal
│   │   ├── shared/                 # Section, FeatureCard, PageHero
│   │   ├── properties/             # PropertyCard, PropertyGrid, PropertyDetail
│   │   ├── forms/                  # ContactForm, InquiryForm, ApplicationForm, MaintenanceForm
│   │   ├── portal/                 # Tenant dashboard components
│   │   ├── admin/                  # Admin dashboard components
│   │   └── seo/                    # JSON-LD schemas, Breadcrumbs, AIMetadata
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client (server + browser)
│   │   ├── prisma.ts               # Prisma client with connection pooling
│   │   ├── buildium.ts             # Buildium API client
│   │   ├── buildium-sync.ts        # Sync logic (Buildium → local DB)
│   │   ├── email.ts                # Resend email helpers
│   │   ├── security.ts             # Rate limiting, input sanitization
│   │   └── utils.ts                # Shared utilities
│   ├── config/
│   │   ├── site.ts                 # Site metadata, company info, feature flags
│   │   └── contact.ts              # Contact info from env vars
│   ├── constants/
│   │   ├── navigation.ts           # Nav links, footer links
│   │   └── properties.ts           # Property type definitions, amenity lists
│   ├── types/
│   │   ├── buildium.ts             # Buildium API types
│   │   ├── properties.ts           # Property display types
│   │   └── forms.ts                # Form field types
│   ├── utils/
│   │   └── cn.ts                   # clsx + tailwind-merge
│   ├── hooks/
│   │   ├── useAnimation.ts
│   │   └── useProperties.ts        # Property data fetching hooks
│   └── middleware.ts               # Security headers, bot blocking
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   └── e2e/
├── public/
│   ├── images/                     # Property photos, team photos
│   └── og-*.jpg                    # Open Graph images
├── docs/
│   ├── CLAUDE_SESSION_START.md
│   ├── ARCHITECTURE.md
│   ├── BUILDIUM_INTEGRATION.md
│   ├── UI_STANDARDS.md
│   └── RUNBOOK.md
├── .github/workflows/
│   ├── ci.yml
│   └── auto-merge-claude.yml
├── vercel.json
├── next.config.js
├── tailwind.config.js
├── CLAUDE.md
└── .env.example
```

---

## 4. Recommended Documentation Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Single source of truth for AI sessions — commands, conventions, stack, gotchas |
| `docs/CLAUDE_SESSION_START.md` | Mandatory startup checklist, reading order |
| `docs/ARCHITECTURE.md` | System architecture, data flows, entity diagrams |
| `docs/UI_STANDARDS.md` | Color palette, forbidden colors, component conventions |
| `docs/BUILDIUM_INTEGRATION.md` | Buildium API reference, sync strategy, entity mapping |
| `docs/RUNBOOK.md` | Incident response, diagnostics, rollback procedures |
| `docs/ENGINEERING_STANDARDS.md` | QA process, testing rules, coding standards |
| `.env.example` | All environment variables with comments |

---

## 5. Environment Variable Categories

```bash
# ============ Database (Supabase) ============
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           # Server-side only, never expose
DATABASE_URL=                         # Supabase pooled connection for Prisma

# ============ Auth ============
NEXTAUTH_SECRET=                      # If using NextAuth alongside Supabase Auth
NEXTAUTH_URL=https://www.rentbing.com

# ============ Buildium API ============
BUILDIUM_API_CLIENT_ID=
BUILDIUM_API_SECRET=
BUILDIUM_API_BASE_URL=https://api.buildium.com/v1

# ============ Email (Resend) ============
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@rentbing.com
NEXT_PUBLIC_CONTACT_EMAIL=info@rentbing.com

# ============ Bot Protection ============
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# ============ Public URLs ============
NEXT_PUBLIC_BASE_URL=https://www.rentbing.com

# ============ Cron & Admin ============
CRON_SECRET=
MIGRATION_SECRET=

# ============ AI (Future) ============
ANTHROPIC_API_KEY=

# ============ Analytics (Optional) ============
# Vercel Analytics is auto-configured
```

---

## 6. GitHub Setup

1. **Repository**: `rentbing/rentbing-website` (private)
2. **Branch protection on `main`**: Require status checks (CI passes)
3. **Workflows**:
   - `ci.yml`: Lint + build on PRs and pushes to main
   - `auto-merge-claude.yml`: `claude/**` branches auto-merge to main
4. **Secrets**: Store Vercel token for deployments (automatic via Vercel GitHub integration)

---

## 7. Vercel Setup

1. **Import GitHub repo** → Vercel auto-detects Next.js
2. **Environment variables**: Add all from `.env.example` per environment (Production, Preview, Development)
3. **Domain**: `www.rentbing.com` → Production, preview URLs auto-generated per branch
4. **Region**: Choose based on primary market (e.g., `iad1` for US East)
5. **Cron jobs** (in `vercel.json`):
   - Buildium property sync (every 2 hours)
   - Buildium tenant/lease sync (every 6 hours)
   - Application status check (every 30 min)
   - Health check (daily)
6. **Function timeouts**: 30s default, 60s for Buildium sync routes

---

## 8. Deployment Workflow

```
Developer pushes to claude/[feature]-[sessionId]
    ↓
GitHub Actions CI: lint + build
    ↓ (passes)
Vercel auto-deploys preview: https://[branch]-rentbing.vercel.app
    ↓ (verified)
Auto-merge to main (or manual PR)
    ↓
Vercel auto-deploys production: https://www.rentbing.com
```

---

## 9. SEO Structure

### Per-Page Metadata
| Page | Title Pattern | Schema |
|------|--------------|--------|
| Homepage | `Rent Bing — Property Management in [City]` | LocalBusiness, Organization |
| Properties | `Available Rentals — Rent Bing` | ItemList (properties) |
| Property Detail | `[Address] — [Beds]BR [Baths]BA — Rent Bing` | Product (rental listing) |
| About | `About Rent Bing — Professional Property Management` | AboutPage |
| Contact | `Contact Us — Rent Bing` | ContactPage |
| Apply | `Rental Application — Rent Bing` | WebPage |

### Structured Data
- **LocalBusiness** + **Organization** in root layout
- **RealEstateAgent** schema for the company
- **Product** or **Offer** schema per rental listing
- **Breadcrumbs** auto-generated from URL
- **FAQSchema** for common renter questions
- **AIMetadata** for AI assistant discoverability

### Technical SEO
- Canonical URLs on every page
- Dynamic sitemap.ts generating all property URLs
- robots.ts with proper crawl rules
- OG images per page (`/og-home.jpg`, `/og-properties.jpg`, etc.)
- 1200x630 standard OG image size

---

## 10. Page Structure

### Public Marketing Pages
- **Homepage**: Hero → Featured Properties → Services → Testimonials → CTA
- **Properties Listing**: Search/filter → Property grid → Pagination
- **Property Detail**: Photo gallery → Details → Amenities → Floor plan → Apply CTA → Map
- **About**: Company story → Team → Values → Service area
- **Contact**: Contact form → Office info → Map → Hours

### Tenant Portal (`/portal/`)
- **Dashboard**: Payment summary → Lease info → Recent maintenance → Documents
- **Payments**: Payment history → Make a payment (link to Buildium portal)
- **Maintenance**: Submit request → Track status → History
- **Documents**: Lease documents → Notices → Receipts

### Admin Portal (`/admin/`)
- **Dashboard**: Occupancy stats → Revenue summary → Pending items
- **Properties**: List/search → Add/edit (synced from Buildium)
- **Applications**: Pipeline view → Review → Approve/deny
- **Maintenance**: Queue → Assign → Track → Resolve
- **Tenants**: Directory → Communication → Lease status

---

## 11. Form Architecture

### Contact Form (`/contact`)
- Fields: Name, Email, Phone, Message, Property Interest (optional)
- Protection: Turnstile + honeypot + min submission time
- Server: Validate → Turnstile verify → Resend email to admin + auto-reply to submitter
- Future: Create lead in Buildium via API

### Rental Inquiry Form (`/properties/[id]`)
- Fields: Name, Email, Phone, Move-in Date, Message
- Context: Property ID + address auto-populated
- Server: Validate → Turnstile → Email notification → Save to DB as lead
- Future: Create prospect/applicant in Buildium

### Rental Application Form (`/apply`)
- Multi-step wizard:
  1. Personal info (name, DOB, SSN, current address)
  2. Employment (employer, income, duration)
  3. Rental history (landlord references)
  4. Property selection + desired move-in
  5. Consent + signature
- Protection: Supabase Auth required (applicant creates account)
- Server: Validate all steps → Save to DB → Create applicant in Buildium → Email confirmation
- Future: Background check integration, auto-scoring

### Maintenance Request Form (`/portal/maintenance` or `/maintenance`)
- Fields: Property, Unit, Category (plumbing, electrical, HVAC, etc.), Priority, Description, Photos
- Auth: Tenant must be logged in (or provide lease # for public form)
- Server: Validate → Save to DB → Notify property manager → Future: create in Buildium

---

## 12. Buildium API Integration Strategy

### Authentication
- **Client ID + Secret** in every request header
- Store in env vars: `BUILDIUM_API_CLIENT_ID`, `BUILDIUM_API_SECRET`
- **Sandbox environment** available for development (separate credentials)

### Client Architecture (`src/lib/buildium.ts`)
```typescript
class BuildiumClient {
  // Properties
  getRentals(filters?): Promise<Rental[]>
  getRentalById(id): Promise<Rental>
  getRentalUnits(rentalId): Promise<Unit[]>

  // Tenants
  getTenants(filters?): Promise<Tenant[]>
  getTenantById(id): Promise<Tenant>
  createTenant(data): Promise<Tenant>

  // Leases
  getLeases(filters?): Promise<Lease[]>
  getLeaseById(id): Promise<Lease>

  // Applicants
  getApplicants(filters?): Promise<Applicant[]>
  createApplicant(data): Promise<Applicant>
  getApplicantById(id): Promise<Applicant>

  // Listings
  getListings(): Promise<Listing[]>
  createListing(unitId, data): Promise<Listing>

  // Maintenance (via Work Orders or Tasks)
  // Note: Check Buildium API for maintenance/work order endpoints

  // Files
  uploadFile(resource, resourceId, file): Promise<FileMetadata>
  getFiles(resource, resourceId): Promise<FileMetadata[]>

  // Notes
  createNote(resource, resourceId, data): Promise<Note>
  getNotes(resource, resourceId): Promise<Note[]>
}
```

### Sync Strategy
1. **Cron-based sync** (every 2-6 hours depending on entity):
   - Buildium → Local DB cache for fast rendering
   - Properties, units, tenants, leases
2. **On-demand fetch** for real-time data:
   - Application status, payment status
3. **Write-through** for mutations:
   - Create applicant in both local DB + Buildium simultaneously
   - Maintenance requests: save locally first, push to Buildium async
4. **Conflict resolution**: Buildium is the source of truth for properties/tenants/leases

### Data Model Mapping
| Buildium Entity | Local Table | Sync Direction |
|----------------|-------------|----------------|
| Rental Property | `properties` | Buildium → Local (read-only) |
| Rental Unit | `units` | Buildium → Local (read-only) |
| Tenant | `tenants` | Bidirectional |
| Lease | `leases` | Buildium → Local (read-only) |
| Applicant | `applications` | Local → Buildium (write-through) |
| Listing | `listings` | Bidirectional |
| Note | `notes` | Bidirectional |
| File | `files` | Bidirectional |

### Pagination
- Buildium uses `limit` + `offset` (case-sensitive!)
- Default page size: 50
- Max: 1000 per request
- Sync jobs must paginate through all records

### Rate Limiting
- Buildium API rate limits are not publicly documented
- Implement conservative retry logic: exponential backoff (2s, 4s, 8s, 16s)
- Log all API calls for debugging

### API Availability Note
- Buildium Open API requires **Premium plan** ($375+/month)
- Sandbox account available with Premium subscription for development
- Enable API: Buildium Settings → Application Settings → API Settings → Toggle ON

---

## 13. Future AI Integration Strategy

The architecture should support evolving into an AI-enabled operational hub:

### Phase 6 Capabilities (Future)
- **AI Chatbot**: Property inquiries, maintenance triage, tenant FAQ
- **AI Listing Descriptions**: Generate compelling property descriptions from photos + data
- **AI Maintenance Triage**: Categorize/prioritize incoming maintenance requests
- **AI Application Screening**: Assist with application review (within fair housing guidelines)
- **AI Communication**: Draft tenant communications, lease renewal reminders
- **AI Analytics**: Occupancy forecasting, rent optimization suggestions

### Architecture Preparation
- Anthropic Claude API key in env vars from day one
- `src/lib/ai/` directory reserved for AI modules
- Database tables designed with `aiGenerated`, `aiConfidence` columns where applicable
- API routes structured to accept AI-enhanced payloads
- Activity logging pattern (from SOC foundation) ready for AI audit trails
