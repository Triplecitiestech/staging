# Triple Cities Tech — Website & Admin Platform

Professional website and internal admin platform for Triple Cities Tech (TCT), a managed IT services company in the Southern Tier of New York.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.4 |
| UI | React 18, Tailwind CSS 3.4 |
| ORM / DB | Prisma 7 → PostgreSQL (Vercel Postgres) |
| Auth | NextAuth v5 (Azure AD / Microsoft OAuth) |
| AI | Anthropic SDK (Claude) |
| Email | Resend |
| Hosting | Vercel (iad1 region) |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use Vercel Postgres)
- Anthropic API key

### Environment Variables

Create `.env.local` from the template:

```bash
cp .env.example .env.local   # if .env.example exists, otherwise create manually
```

Required variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Auth (Azure AD)
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000
AZURE_AD_CLIENT_ID=<from-azure-portal>
AZURE_AD_CLIENT_SECRET=<from-azure-portal>
AZURE_AD_TENANT_ID=<from-azure-portal>

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...

# Spam protection
TURNSTILE_SECRET_KEY=<cloudflare-turnstile>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<cloudflare-turnstile>
```

### Install & Run

```bash
npm install              # also runs prisma generate via postinstall
npx prisma migrate dev   # apply migrations locally
npm run seed             # seed database (optional)
npm run dev              # http://localhost:3000
```

### Build for Production

```bash
npm run build   # runs prisma migrate deploy && next build
npm start       # serve at port 3000
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test        # runs vitest (unit + integration)
```

## Deployment (Vercel)

Pushes to `main` deploy automatically via Vercel.

CI merges `claude/*` branches → `main` via `.github/workflows/auto-merge-claude.yml`.

Vercel crons (configured in `vercel.json`):
- `/api/cron/generate-blog` — Mon/Wed/Fri 8 AM UTC
- `/api/cron/send-approval-emails` — Daily noon UTC
- `/api/cron/publish-scheduled` — Every 15 minutes

### Health Check

After deploy, verify:
1. Public site loads: `GET /`
2. API responds: `GET /api/companies` (requires auth)
3. Cron endpoints: check Vercel dashboard → Cron Jobs tab

## Common Failures

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `PrismaClientInitializationError` | Missing `DATABASE_URL` | Set env var; run `prisma generate` |
| 401 on admin pages | Azure AD config wrong or session expired | Check `AZURE_AD_*` vars; re-login |
| AI chat hangs / 500 | Missing or invalid `ANTHROPIC_API_KEY` | Set key; check Anthropic dashboard for rate limits |
| Build fails on Vercel | Migration drift | Run `npx prisma migrate deploy` locally first |
| Turnstile 403 on contact form | Wrong Turnstile keys for domain | Update `TURNSTILE_SECRET_KEY` for current domain |

## Project Structure

```
src/
├── app/
│   ├── api/           # 60+ REST API routes
│   ├── admin/         # Staff admin dashboard
│   ├── services/      # Public services page
│   ├── blog/          # Public blog
│   └── [company]/     # Customer onboarding portal
├── components/
│   ├── admin/         # Admin UI components
│   ├── companies/     # Company management forms
│   ├── projects/      # Project management forms
│   └── shared/        # Reusable UI components
├── lib/
│   ├── prisma.ts      # Prisma client singleton
│   ├── security.ts    # Rate limiting, validation, security logging
│   ├── blog-generator.ts   # AI blog content generation
│   ├── content-curator.ts  # RSS feed aggregation
│   └── server-logger.ts    # Structured logging with correlation IDs
└── constants/         # Service definitions, UI constants
prisma/
├── schema.prisma      # 26+ models
├── migrations/        # PostgreSQL migrations
└── seed.ts            # Database seeder
docs/                  # Architecture, standards, runbooks
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — **START HERE for development** — Standards, patterns, and AI-assisted coding guide
- [Architecture](docs/ARCHITECTURE.md) — system flows, data model, AI integration, current vs. target state
- [UI Standards](docs/UI_STANDARDS.md) — table layout, forms, loading/error states, verified-create pattern
- [Self-Healing & Reliability](docs/SELF_HEALING_AND_RELIABILITY.md) — timeouts, retries, idempotency (target state)
- [Runbook](docs/RUNBOOK.md) — incident response, debugging, deploy issues
- [Changelog](docs/CHANGELOG.md) — release history and in-progress work

## Development Standards

This project follows the **Smart Sumai engineering model**:

1. **Verified-Create Pattern**: UI never shows success without backend confirmation (`{success, id, url, requestId}`)
2. **Self-Healing Reliability**: Structured logging, request IDs, timeouts, safe retries, idempotency
3. **AI Operation Rules**: Create record first, mark as processing, run AI async, update when complete

**Note:** These standards are being incrementally applied across the codebase. See [CLAUDE.md](CLAUDE.md) for implementation guidelines and reference examples.
