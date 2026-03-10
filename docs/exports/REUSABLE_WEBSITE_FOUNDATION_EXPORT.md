# Reusable Website Foundation Export

> Extracted from production Next.js project. These are cross-project patterns, conventions, and standards that apply to any new website built with this stack.

---

## 1. Stack Choices & Reasoning

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 15 (App Router) | Server components by default, file-based routing, API routes, ISR, built-in image optimization, Vercel-native |
| **Language** | TypeScript (strict mode) | Catch errors at compile time, self-documenting code, better refactoring |
| **Styling** | Tailwind CSS 3.4+ | Utility-first, mobile-first responsive, consistent design tokens, no CSS-in-JS runtime |
| **Database** | PostgreSQL via Prisma ORM | Type-safe queries, migrations, schema-as-code, serverless-compatible with connection pooling |
| **Auth** | NextAuth.js v5 | Flexible providers (OAuth, credentials), database-backed sessions, middleware integration |
| **Email** | Resend | Developer-friendly API, React email templates, reliable delivery, generous free tier |
| **Bot Protection** | Cloudflare Turnstile | Privacy-respecting CAPTCHA alternative, free, invisible mode available |
| **Hosting** | Vercel | Zero-config Next.js deploys, preview URLs per branch, edge functions, cron jobs, analytics |
| **AI** | Anthropic Claude API | Content generation, analysis, triage — integrate as needed per project |

---

## 2. Repository Structure

```
project-root/
├── src/
│   ├── app/                    # Next.js App Router (pages + API routes)
│   │   ├── (marketing)/        # Route group for public pages
│   │   ├── admin/              # Protected admin portal
│   │   ├── api/                # API route handlers
│   │   └── layout.tsx          # Root layout with metadata
│   ├── components/
│   │   ├── layout/             # Header, Footer, navigation
│   │   ├── sections/           # Page sections (Hero, Features, CTA, etc.)
│   │   ├── ui/                 # Primitives (Button, Card, Container, Input)
│   │   ├── shared/             # Cross-page components (Section, FeatureCard, PageHero)
│   │   ├── seo/                # JSON-LD schemas, breadcrumbs, AI metadata
│   │   └── admin/              # Admin-only components
│   ├── lib/                    # Core utilities (prisma, auth, security, API clients)
│   ├── config/                 # Site metadata, contact info, feature flags
│   ├── constants/              # Navigation data, service definitions, static data
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Helpers (cn.ts for Tailwind class merging)
│   ├── hooks/                  # Custom React hooks (useAnimation, useParallax)
│   └── middleware.ts           # Security headers, bot blocking, request filtering
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # SQL migrations
├── tests/
│   └── e2e/                    # Playwright end-to-end tests
├── public/                     # Static assets (images, OG images, favicon)
├── docs/                       # Project documentation
├── .github/workflows/          # CI/CD pipelines
├── vercel.json                 # Deployment config, crons, function timeouts
├── next.config.js              # Headers, CSP, redirects, image config
├── tailwind.config.js          # Theme customization
├── CLAUDE.md                   # AI assistant instructions (single source of truth)
└── .env.example                # Environment variable template
```

---

## 3. UI/UX Design Preferences

### Color System
- **Two-tier custom palette**: Primary colors (brand identity) + Secondary colors (neutrals) defined in `tailwind.config.js` via `extend.colors`
- **Gradient accents**: Multi-color gradients for CTAs, backgrounds, and interactive elements
- **Dark-first design**: Dark backgrounds (slate-900/950, black) with vibrant accent text (cyan, blue, emerald)
- **Glassmorphism**: `bg-white/10 backdrop-blur-sm border border-white/20` for card surfaces
- **Forbidden colors rule**: Establish and enforce a forbidden colors list per project to maintain brand consistency

### Typography
- **Single font family** (Google Fonts, e.g., Inter) with weight-based hierarchy (300–900)
- **Responsive sizing chains**: `text-2xl sm:text-3xl md:text-4xl lg:text-5xl`
- **Drop shadows** on text for contrast against dark/gradient backgrounds

### Responsive Strategy
- **Mobile-first**: Base styles for mobile, then `sm:` → `md:` → `lg:` overrides
- **Standard breakpoints**: sm (640px), md (768px), lg (1024px)
- **Grid patterns**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- **Padding scaling**: `px-4 sm:px-6 lg:px-8`
- **Every layout change checked at all breakpoints** — desktop-only is never acceptable

### Animation Patterns
- **Scroll-triggered**: IntersectionObserver via custom `useAnimation()` hook — once-only fade-in/slide-up
- **Hover effects**: Scale, shadow, color transitions (`duration-300`)
- **Staggered delays**: Cards animate in sequence using `animationDelay`
- **Performance**: `transform-gpu` for hardware acceleration, Tailwind transitions preferred over custom JS
- **Standard durations**: 200ms (micro), 300ms (hover), 500ms (cards), 700ms (sections)

---

## 4. Component Organization Philosophy

### UI Primitives (`components/ui/`)
- **Variant + Size system**: Each primitive supports variants (primary, secondary, outline, ghost, danger) and sizes (sm, md, lg, xl)
- **`cn()` utility**: Combines `clsx` + `tailwind-merge` for safe class overriding
- **`asChild` pattern**: Allows rendering as `<Link>` or other elements while maintaining styling
- **Loading states**: `isLoading` prop with spinner

### Shared Components (`components/shared/`)
- **Section.tsx**: Background preset system (light, dark, gradient, custom) + scroll animation integration + anchor ID support
- **FeatureCard.tsx**: Icon + title + description with gradient accents and stagger animation
- **PageHero.tsx**: Flexible hero with optional video/image backgrounds, overlays, badges, and text alignment
- **ServiceCard.tsx**: Glassmorphism card with features list and CTA

### Section Container Pattern
```
<section className="relative py-24 overflow-hidden">
  <div className="absolute inset-0"> {/* Background layer: orbs, grids, gradients */} </div>
  <div className="relative z-10 max-w-7xl mx-auto px-6"> {/* Content */} </div>
</section>
```

### Layout Components (`components/layout/`)
- **Header**: Fixed/sticky, mobile hamburger + desktop nav, gradient CTA buttons
- **Footer**: Multi-column link grid, social icons, legal links

---

## 5. Coding Standards

### TypeScript
- **Strict mode** enabled, no `any` types
- **Interfaces** for all props, params, and API responses
- **File extensions**: `.ts` for utilities, `.tsx` for components
- **Path alias**: `@/*` maps to `./src/*`

### React/Next.js
- **Server components by default** — add `'use client'` only when state/interactivity needed
- **PascalCase** for components, **camelCase** for utilities and variables
- **No prop drilling** — use context or fetch data at the component level

### API Routes
- **Standard pattern**: try/catch → `NextResponse.json()` → structured responses
- **Auth check first**: `const session = await auth(); if (!session) return 401`
- **Input validation** before business logic
- **Consistent error shape**: `{ error: string }` with appropriate status codes
- **`export const dynamic = 'force-dynamic'`** for routes that must not be cached

### Database
- **Prisma schema as single source of truth** for data models
- **Every schema field must have a migration** — never add fields without corresponding SQL
- **No hard deletes** — use status fields or `deletedAt` timestamps
- **camelCase column names** — raw SQL must use quoted camelCase (`"companyId"`, `"displayName"`)
- **Connection pooling** for serverless environments

### Git & Commits
- **Branch naming**: `claude/[description]-[sessionId]`
- **Never push directly to `main`**
- **Imperative mood** commit messages (short summary + optional bullet details)
- **Commit after each logical unit** — do not batch
- **Push immediately** with `git push -u origin <branch>`
- **Retry on network failure**: Exponential backoff (2s, 4s, 8s, 16s)

---

## 6. Deployment Conventions (GitHub + Vercel)

### Vercel Setup
- **Auto-deploy**: Every branch gets a preview URL, `main` goes to production
- **Region**: Choose closest to primary audience (e.g., `iad1` for US East)
- **Function timeouts**: Default 30s for API routes, 60s for cron/long-running jobs
- **Cron jobs**: Defined in `vercel.json` with crontab syntax

### GitHub Actions
- **CI workflow** (`ci.yml`): Lint + test on PR and push to main (Node 20, npm cache, `prisma generate` before lint)
- **Auto-merge workflow** (`auto-merge-claude.yml`): `claude/**` branches auto-merge to `main` with `--no-ff`

### Environment Variables
Organize by feature category:
```
# Database
DATABASE_URL=
PRISMA_DATABASE_URL=      # Connection-pooled for app

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Email
RESEND_API_KEY=

# Bot Protection
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Public
NEXT_PUBLIC_BASE_URL=
NEXT_PUBLIC_CONTACT_EMAIL=

# Cron / Migration
CRON_SECRET=
MIGRATION_SECRET=

# AI (optional)
ANTHROPIC_API_KEY=

# Integration-Specific
[INTEGRATION]_API_KEY=
[INTEGRATION]_API_SECRET=
```

---

## 7. Security Patterns

### Next.js Middleware (`middleware.ts`)
- Apply security headers to all routes (except API/static)
- Block suspicious user agents (sqlmap, nikto, masscan, etc.)
- Block SQL injection patterns in query parameters
- Rate limiting via honeypot fields + minimum submission times

### Security Headers (`next.config.js`)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Content Security Policy
- **Dual dev/prod policies**: Development allows `unsafe-eval` + `ws://localhost` for hot reload; production is strict
- **Whitelist per service**: Each external resource (fonts, analytics, CDN, widgets) requires explicit CSP entry
- **Image security**: `dangerouslyAllowSVG: false`, sandbox CSP for images

### Form Protection
- Cloudflare Turnstile widget (invisible mode)
- Server-side token verification
- Honeypot fields (hidden inputs that bots fill)
- Minimum submission time (e.g., 3 seconds) to block automated submissions

---

## 8. SEO Architecture

### Metadata Pattern
- **Root layout**: Exports `Metadata` object with site-wide defaults (title, description, OG, Twitter, robots)
- **Per-page metadata**: Separate `metadata.ts` file per page, imported by `layout.tsx`
- **Canonical URLs**: Full absolute URLs on every page via `alternates.canonical`
- **OG images**: Consistent naming `/og-{page}.jpg`, standard 1200x630

### Structured Data (JSON-LD)
- **Root layout**: LocalBusiness + Organization schemas
- **Component-based**: Dedicated `<FAQSchema>`, `<ServiceSchema>`, `<Breadcrumbs>` components
- **Rendered as**: `<script type="application/ld+json" dangerouslySetInnerHTML={...} />`
- **Breadcrumbs**: Dynamic from `usePathname()`, outputs both JSON-LD and visual UI

### AI Metadata
- Custom `<meta>` tags for AI assistants: business info, services, certifications, geographic focus
- Placed in dedicated `AIMetadata.tsx` component in root layout

### Robots Configuration
```typescript
robots: {
  index: true, follow: true,
  googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 }
}
```

---

## 9. Form Handling Architecture

### Client-Side
1. React state for form fields (`useState`)
2. Client-side validation before submission
3. Turnstile widget renders alongside form
4. Loading state on submit button (`isLoading`)
5. Success/error feedback displayed inline

### Server-Side (API Route)
1. Verify Turnstile token with Cloudflare API
2. Check honeypot field (reject if filled)
3. Check submission timing (reject if < 3 seconds)
4. Validate and sanitize input
5. Execute business logic (send email, save to DB)
6. Return structured JSON response

### Response Pattern
```typescript
// Success
return NextResponse.json({ success: true, message: '...' })
// Error
return NextResponse.json({ error: '...' }, { status: 400 })
```

---

## 10. Resiliency & Self-Healing Patterns

### Health Check Endpoint
- `/api/admin/system-health` — checks DB, email, auth, external APIs
- Uses `Promise.allSettled` for concurrent service checks
- Returns overall status: `healthy | degraded | down`
- Fire-and-forget persistence for historical tracking

### Error Handling
- API routes: try/catch with structured error responses
- External API calls: retry with exponential backoff
- Database: connection pooling for serverless, graceful degradation if tables don't exist
- Cron jobs: self-contained error handling, don't crash on individual record failures

### Self-Improvement Protocol
When a session reveals a new convention or fixes a mistake:
1. Fix the immediate issue
2. Update CLAUDE.md with the lesson
3. Commit both together — ensuring the mistake never repeats

---

## 11. Testing Philosophy

### Quality Gates
- `npm run build` must pass (includes Prisma migration + Next.js compilation)
- `npm run lint` must pass (ESLint, no errors)
- `npm run test:e2e` — Playwright tests covering all systems

### E2E Test Coverage Areas
- Admin page health
- Public page rendering
- Customer portal functionality
- Blog system
- Marketing pages
- API health checks
- Auth enforcement
- Forbidden colors enforcement
- Responsive viewport checks
- Security header verification

### Review Checklist
- `git diff` before every commit — look for typos, broken imports, missing responsive classes
- Check mobile AND desktop breakpoints
- Verify no forbidden colors introduced
- Confirm no security vulnerabilities (XSS, injection, etc.)

---

## 12. Documentation Expectations

### Required Docs
- **CLAUDE.md**: Single source of truth for AI sessions — commands, conventions, gotchas, stack, workflow
- **Session start checklist**: Reading order, completion criteria
- **Engineering standards**: QA process, testing rules, root cause fixing
- **QA standards**: Checklist, validation report template, severity levels
- **UI standards**: Color palette, forbidden colors, component conventions

### Architecture Docs
- System architecture with data flows and entity diagrams
- Reliability patterns (API envelopes, logging, timeouts, retries)
- Runbook for incident response
- Debugging workflow for AI self-healing

### Feature Docs
- One doc per major feature/integration
- API documentation for external integrations
- Environment variable reference (`.env.example`)

---

## 13. How Claude Should Plan Work

### Task Workflow (Ship Cycle)
```
1. Plan      → Use plan mode for complex tasks. Break into subtasks.
2. Implement → Make the code changes.
3. Verify    → Run build + lint. Fix any failures.
4. Review    → git diff — check for responsive issues, missing types, regressions.
5. Commit    → Descriptive message, imperative mood.
6. Push      → git push -u origin <branch>. Confirm success.
7. Confirm   → Tell user what deployed and what to verify.
```

### Autonomy Rules
- **Be autonomous**: Diagnose and fix errors yourself. Only escalate for genuine blockers (credentials, business decisions)
- **Never stop at broken**: If build fails, fix it. If push fails, retry. Loop until done.
- **Full QA is mandatory**: Feature works end-to-end, not just compiles
- **Every change gets committed and pushed** immediately after completion
- **Keep docs up to date**: When you learn something new, update CLAUDE.md

### Subagent Usage
Use subagents for:
- Broad codebase searches (Explore agent)
- Parallel independent tasks
- Keeping main context clean during large refactors
