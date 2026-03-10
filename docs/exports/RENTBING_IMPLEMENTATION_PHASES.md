# Rent Bing — Implementation Phases

> Each phase builds on the previous. Complete each phase fully (build passes, lint passes, deployed and verified) before starting the next.

---

## Phase 1 — Foundation & Infrastructure

### What Gets Built
- Fresh Next.js 15 project with TypeScript strict mode
- Tailwind CSS with Rent Bing custom theme (brand colors, typography)
- Supabase project setup (database, auth, storage buckets)
- Prisma schema initialized with base models (Property, Unit, Lead, ContactSubmission)
- Core UI primitives: Button, Card, Container, Input (variant + size systems)
- `cn()` utility (clsx + tailwind-merge)
- Root layout with metadata, security headers, CSP
- Middleware: security headers, bot blocking, SQL injection filtering
- `.env.example` with all variable categories documented
- CLAUDE.md with project conventions, commands, stack, gotchas
- GitHub repo with CI workflow (lint + build) and auto-merge workflow
- Vercel project connected, auto-deploying from main
- Health check endpoint (`/api/admin/system-health`)
- Config verification endpoint (`/api/verify-config`)

### Why This Phase First
Everything else depends on the foundation being solid. A broken build, missing types, or insecure headers will compound into every subsequent phase. Get the skeleton right before adding features.

### Dependencies Required
- GitHub organization/account
- Vercel account (linked to GitHub)
- Supabase project (free tier is fine to start)
- Domain: `rentbing.com` (or chosen domain)
- Cloudflare Turnstile site key (free)
- Resend account + API key

### Expected Outcomes
- `npm run build` passes
- `npm run lint` passes with zero errors
- Preview URL deploys successfully
- Health check endpoint returns `healthy`
- CLAUDE.md is comprehensive and accurate
- Security headers verified in browser dev tools

---

## Phase 2 — Public Marketing Site

### What Gets Built
- **Homepage**: Hero section → Featured Properties (placeholder) → Services overview → Testimonials → CTA
- **About page**: Company story, team, values, service area map
- **Contact page**: Contact form (with Turnstile, honeypot, min-time) → office info → map
- **Properties page**: Grid layout with placeholder cards (real data comes in Phase 4)
- **Header**: Sticky nav with mobile hamburger menu, CTA buttons
- **Footer**: Multi-column links, social icons, legal links
- **SEO foundation**:
  - Per-page metadata files (`metadata.ts` + `layout.tsx` pattern)
  - LocalBusiness + Organization JSON-LD schemas
  - Breadcrumbs component (visual + JSON-LD)
  - AIMetadata component
  - Sitemap.ts + robots.ts
  - OG images per page (1200x630)
  - Canonical URLs on every page
- **Shared components**: Section (background presets), PageHero, FeatureCard, ServiceCard
- **Responsive**: Every page works at sm/md/lg breakpoints
- **Contact form API route**: Turnstile verify → sanitize → Resend email → auto-reply

### Why This Phase
The public site is what potential tenants and property owners see first. It establishes the brand, generates leads, and provides the SEO foundation. No Buildium integration needed yet — property data can be placeholder/static.

### Dependencies Required
- Phase 1 complete
- Rent Bing brand assets (logo, colors, copy)
- Office address, phone, hours for structured data
- Google Business verification (for local SEO)
- Resend domain verification for email sending

### Expected Outcomes
- Full marketing site live at production URL
- Contact form works end-to-end (submit → email received)
- Google can crawl and index all pages
- Lighthouse SEO score > 90
- Mobile and desktop layouts verified
- All structured data validates in Google's Rich Results Test

---

## Phase 3 — Forms & Lead Capture

### What Gets Built
- **Rental Inquiry Form** (on property detail pages):
  - Name, email, phone, move-in date, message
  - Auto-populates property context
  - Saves to `leads` table + sends email notification
- **Rental Application Form** (multi-step wizard):
  - Step 1: Personal info
  - Step 2: Employment & income
  - Step 3: Rental history & references
  - Step 4: Property selection & move-in date
  - Step 5: Consent & e-signature
  - Requires Supabase Auth (applicant creates account)
  - Saves to `applications` table
  - Email confirmation to applicant + notification to admin
- **Maintenance Request Form** (public + tenant portal):
  - Property, unit, category, priority, description, photo upload
  - Photo upload to Supabase Storage
  - Saves to `maintenance_requests` table
  - Email notification to property manager
- **Admin inbox** (`/admin/leads`):
  - View all contact submissions and rental inquiries
  - Status tracking (new → contacted → qualified → converted)
- **Application review** (`/admin/applications`):
  - View submitted applications
  - Status pipeline (submitted → reviewing → approved → denied)

### Why This Phase
Lead capture is the revenue engine. Before integrating with Buildium, the forms need to work locally — saving to Supabase, sending notifications, letting admin review submissions. This ensures the site generates value even before the API integration is live.

### Dependencies Required
- Phase 2 complete
- Supabase Auth configured (email/password for applicants)
- Supabase Storage bucket for maintenance photos
- Resend templates for confirmation/notification emails
- Application form field requirements finalized with Rent Bing

### Expected Outcomes
- Contact form, inquiry form, and application form all work end-to-end
- Admin can view and manage all submissions
- Email notifications fire on every submission
- Photo upload works for maintenance requests
- Application data persists securely with auth
- All forms protected by Turnstile + honeypot + timing

---

## Phase 4 — Buildium Integration

### What Gets Built
- **Buildium API client** (`src/lib/buildium.ts`):
  - Authentication with client ID + secret
  - Methods: getRentals, getUnits, getTenants, getLeases, getApplicants, createApplicant, createNote
  - Pagination handling (limit + offset)
  - Error handling with retry logic (exponential backoff)
  - Response type definitions (`src/types/buildium.ts`)
- **Property sync** (cron every 2 hours):
  - Fetch all rental properties + units from Buildium
  - Upsert into local `properties` + `units` tables
  - Sync photos, amenities, addresses
  - Mark stale records
- **Tenant/lease sync** (cron every 6 hours):
  - Fetch tenants + leases
  - Upsert into local cache for portal use
- **Dynamic property pages**:
  - Replace placeholder property data with real Buildium data
  - Property listing page with search/filter (beds, baths, price, availability)
  - Property detail page with photos, amenities, floor plan, apply CTA
  - ISR for property pages (revalidate every hour)
- **Application write-through**:
  - When application is approved in admin, create applicant in Buildium
  - Link local application record to Buildium applicant ID
- **Buildium status endpoint** (`/api/buildium/status`):
  - Shows sync history, last success, error counts
  - Integration health check
- **Admin Buildium dashboard** (`/admin/buildium`):
  - Sync status, manual trigger, error log

### Why This Phase
Buildium is the operational backbone — but the site needed to work independently first (Phases 1-3). Now we connect the two systems. Property data flows from Buildium to the site. Applications flow from the site to Buildium. The local database serves as a fast cache for rendering.

### Dependencies Required
- Phase 3 complete
- Buildium Premium plan ($375+/month) with API enabled
- Buildium API credentials (client ID + secret)
- Buildium Sandbox account for development/testing
- Property data populated in Buildium

### Expected Outcomes
- Properties page shows real Buildium data
- Property detail pages render with photos, amenities, pricing
- New properties in Buildium appear on site within 2 hours
- Applications submitted on site appear in Buildium
- Sync status visible in admin dashboard
- All API calls logged with timing for debugging

---

## Phase 5 — Operational Tooling

### What Gets Built
- **Tenant Portal** (`/portal/`):
  - Dashboard: lease summary, payment status, maintenance history
  - Maintenance requests: submit new, track existing (linked to Buildium)
  - Documents: view lease, notices (from Buildium files API)
  - Profile: update contact info (syncs to Buildium tenant record)
  - Auth: Supabase email/password, linked to Buildium tenant ID
- **Admin Enhancements**:
  - Maintenance queue: view, assign, prioritize, update status
  - Tenant communications: send notices via Resend, log in Buildium
  - Occupancy dashboard: vacancy rate, lease expiry timeline
  - Revenue dashboard: rent collection status (from Buildium data)
- **Notification system**:
  - Email notifications for: new application, maintenance update, lease expiry warning
  - In-app notification bell for admin
- **Reporting**:
  - Monthly occupancy report
  - Maintenance request analytics
  - Lead conversion tracking
- **E2E Tests** (Playwright):
  - Public page rendering
  - Form submissions
  - Auth flows
  - Admin functionality
  - API health checks

### Why This Phase
The public site and Buildium integration are generating value. Now add the operational tools that make daily property management easier — tenant self-service, maintenance tracking, and reporting. These features reduce phone calls and manual work.

### Dependencies Required
- Phase 4 complete (Buildium data flowing)
- Tenant-to-Buildium-ID mapping established
- Maintenance workflow defined with Rent Bing
- Reporting requirements defined

### Expected Outcomes
- Tenants can log in and submit maintenance requests
- Admin has a functional operational dashboard
- Maintenance requests flow: tenant → local DB → email → admin review → Buildium
- Occupancy and revenue data visible at a glance
- E2E tests pass for critical paths
- Notifications fire reliably

---

## Phase 6 — AI Workflow Integration

### What Gets Built
- **AI Property Descriptions**:
  - Generate compelling listing text from property data + photos
  - Admin reviews and publishes to listing
  - Claude API with property-specific prompts
- **AI Maintenance Triage**:
  - Classify incoming maintenance requests (emergency, urgent, routine)
  - Suggest response templates
  - Auto-route emergencies to on-call
- **AI Chatbot** (property inquiry):
  - Embedded on property pages and homepage
  - Answers common questions: availability, pricing, pet policy, application process
  - Hands off to human for complex inquiries
  - Logs conversations for admin review
- **AI Communication Drafts**:
  - Draft lease renewal reminders
  - Draft maintenance completion notices
  - Draft application status updates
  - Admin reviews and sends
- **AI Analytics** (stretch):
  - Occupancy forecasting
  - Rent optimization suggestions based on market data
  - Maintenance cost prediction
- **Activity logging**:
  - AI decision audit trail (what was generated, confidence, human override)
  - Dashboard for AI activity monitoring

### Why This Phase
AI transforms the site from a marketing/operational tool into an intelligent hub. But it requires all previous phases to be stable — property data must be accurate (Phase 4), forms must work (Phase 3), and the operational workflow must be established (Phase 5) before AI can enhance them.

### Dependencies Required
- Phase 5 complete
- Anthropic API key (`ANTHROPIC_API_KEY`)
- AI usage budget approved by Rent Bing
- Content guidelines for AI-generated text (tone, brand voice)
- Fair housing compliance review for any AI-assisted screening

### Expected Outcomes
- Property listings have professional AI-generated descriptions
- Maintenance requests are auto-triaged and routed
- Chatbot handles common inquiries without human intervention
- Admin saves time with AI-drafted communications
- All AI actions are logged and auditable
- Human override available on every AI decision
