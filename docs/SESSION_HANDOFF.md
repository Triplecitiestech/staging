# Session Handoff — Compliance Cockpit UI Recovery

> Written 2026-05-14 mid-session, context running low. This is the single
> doc the next session should read first (after the normal bootstrap docs).
> Branch: **`claude/review-workflow-architecture-4UiVX`**

## TL;DR of where things stand

A long multi-session push built out the entire compliance subsystem:
- **Backend (P0–P5): shipped, on production, working.** Customer Profile
  consolidation, finding dispositions, the full Change-Management lifecycle
  (preview + license preconditions + email delivery + verification cron +
  audit + rollback), 6 frameworks (CIS v8 + IG1/2/3, CMMC L1, CMMC L2,
  HIPAA, NIST 800-171, PCI DSS), framework auto-detect. The operator ran
  the customer-profile backfill and confirmed bundle email delivery.
- **Cockpit UI (P2, 8 pages): shipped to production but BAD.** The operator
  reviewed it and said the system "massively regressed" — disjointed UI,
  missing data. **It was built without ever being rendered in a browser**
  (only Playwright auth-status checks, which verify nothing visual). This
  is the problem to fix.

## What the operator is unhappy about (confirmed from one screenshot)

Screenshot was the cockpit landing page for "Tri-Bros Transportation"
(`/admin/compliance/4944a84d-535c-4772-a7a8-affaa8376697`). Even there:
1. **`CIS Controls v8 — IGIG1`** — label bug. `frameworkLabel()` does
   `'cis-v8-ig1'.replace('cis-v8-', 'IG').toUpperCase()` → `IGIG1`.
   Should be `IG1`. This bad helper is **copy-pasted into several of the
   new pages** — grep `frameworkLabel` across `src/app/admin/compliance/`.
2. **Panel disagreement** — POSTURE shows "37 review", FINDINGS panel shows
   "32 REVIEW" for the same assessment. Two different queries
   (`compliance_assessments.manualReviewControls` vs a live count of
   `compliance_findings WHERE status IN ('needs_review','partial')`).
   Never reconciled.
3. **Misleading 28% posture score** — `passed / total` counts
   `needs_review` controls as not-passing, so a mostly-fine customer
   shows 28%. Design flaw, not just a bug.
The operator says the *other 7 pages* are likely worse — unverified.

## Already fixed this session

- **`getCustomerProfileAnswers` shadowing bug** — commit `a27ee90`, shipped.
  It used to return a non-empty `form_responses` row "as-is, no merge with
  legacy", so a partial row (e.g. customer-context-only) shadowed all of
  `policy_org_profiles`. Now it layers: legacy merge = base, form_responses
  overlays per-key. This was a real "missing data" source feeding the
  engine + policy generator.
- **Vercel build fix** — commit `9e58e16`. `CI=true` flips ESLint warnings
  to errors; 7 `<a>`→`<Link>` swaps unblocked the build. **Lesson: always
  run `CI=true npx next build` locally — plain `next build` does not catch
  what Vercel catches.**

## The root-cause fix in progress: hermetic local preview loop

The reason the UI is bad: I never saw it. The fix is a local environment
where the next session CAN see it (Claude is multimodal — it can read PNG
screenshots via the Read tool; it just needs to generate them).

**Why not screenshot production:** `/api/test/auth` (the e2e session
endpoint) is behind the same Vercel edge firewall (`403 host_not_allowed`)
that blocks `/api/migrations/*` and `/api/cron/*`. Preview deploys are
also protected. So an external Playwright runner can't authenticate.
The answer is a fully local app.

### THE LOCAL LOOP WORKS — full reproduce steps

The loop is built and proven end-to-end (edit → re-screenshot → verify).
From a fresh sandbox, reproduce it like this:

```bash
# 1. Docker daemon (the bg process dies between sessions — restart it)
sudo rm -f /var/run/docker.sock
(sudo dockerd > /tmp/dockerd.log 2>&1 &)
until docker info >/dev/null 2>&1; do sleep 2; done

# 2. Postgres 16 — if container 'tct-pg' already exists, `docker start tct-pg`
#    keeps the schema; otherwise create fresh:
docker run -d --name tct-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=tct -p 5433:5432 postgres:16
until docker exec tct-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

# 3. Recreate .env.local (gitignored — contents below), then sync schema:
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx prisma db push --accept-data-loss
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx prisma generate

# 4. Seed (tsx resolves the @/ alias fine — no extra flags needed):
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx tsx scripts/local-seed.ts

# 5. Dev server (reads .env.local automatically):
(npm run dev > /tmp/devserver.log 2>&1 &)
until curl -sS -o /dev/null http://localhost:3000/; do sleep 3; done

# 6. Screenshot harness — committed at scripts/screenshot-cockpit.ts.
#    Captures all 10 compliance pages at desktop + mobile into /tmp/shots/.
npx tsx scripts/screenshot-cockpit.ts
```

Then **Read** the PNGs in `/tmp/shots/` — Claude is multimodal, it can
see them. That IS the review loop.

Notes / gotchas confirmed this session:
- The Playwright-pinned chromium can't be downloaded in the sandbox, but
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` is pre-installed
  and the harness already points `executablePath` at it.
- `scripts/local-seed.ts` reuses `ensureComplianceTables()` — it creates
  the raw-SQL compliance tables AND inserts a realistic data spread for
  company `4944a84d-535c-4772-a7a8-affaa8376697` (Tri-Bros Transportation).
- `npm run seed` (the committed prisma seed) does NOT work locally — it's
  hardcoded for Prisma Accelerate. Use `scripts/local-seed.ts` instead.
- `CI=true npx next build` against the local non-SSL Postgres logs
  blog/sitemap TLS errors during static generation — harmless, unrelated,
  does not happen on Vercel. "✓ Compiled successfully" is the line to check.

### What's been done with the loop so far

- Reviewed all 10 pages (8 cockpit + diagnostics + legacy) at desktop +
  mobile. **Finding: the pages render with data and consistent styling —
  NOT "massively broken."** Real bugs exist; "white screen / missing
  everything" does not (in the local seed env).
- **Fixed + screenshot-verified** (commit `36f09cf`):
  - `IGIG1` label bug → `IG1` (cockpit + findings pages)
  - Cockpit POSTURE vs FINDINGS count mismatch — FINDINGS panel now
    derives from the same `assessmentRows` POSTURE uses
- **Still open** (seen but not yet fixed):
  - Posture % counts `needs_review` as not-passing → understates score.
    Decide: should the denominator exclude needs_review / not_applicable?
  - The gap between the operator's "massively regressed" and what the
    loop shows = rough-but-functional. Next session MUST ask the operator
    for 1-2 specific worst pages/states, OR walk every page state the
    seed doesn't cover (a SENT bundle, awaiting_customer items, a
    framework with 100+ findings, error states).

### Next actions, in order

1. Reproduce the loop (steps above).
2. Ask the operator: which specific page/state looked worst? Close the
   gap between "rough-but-functional" (what the loop shows) and
   "massively regressed" (their experience).
3. Fix pages **one at a time, screenshot-verified before each commit.**
4. Decide per page: fix-forward / rebuild / revert. Do NOT guess.

### Recreate `.env.local` (gitignored — not in the repo)

```
DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct
PRISMA_DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct
NODE_ENV=development
NEXTAUTH_SECRET=local-dev-nextauth-secret-not-real-0000000000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ONBOARDING_SIGNING_KEY=local-dev-onboarding-signing-key-000000000
MIGRATION_SECRET=local-dev-migration-secret
CRON_SECRET=local-dev-cron-secret
E2E_TEST_SECRET=local-dev-e2e-secret
ANTHROPIC_API_KEY=sk-local-dev-not-real
RESEND_API_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_CONTACT_EMAIL=local@example.com
AZURE_AD_CLIENT_ID=local-dev
AZURE_AD_CLIENT_SECRET=local-dev
AZURE_AD_TENANT_ID=local-dev
```

If the sandbox is fresh, also re-run: `sudo dockerd &`, then
`docker run -d --name tct-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=tct -p 5433:5432 postgres:16`,
wait for `pg_isready`, then `DATABASE_URL=... npx prisma db push --accept-data-loss`,
then `npx prisma generate`, then the seed.

## The 8 cockpit pages to review (all under `src/app/admin/compliance/`)

| Route | File | Notes |
|---|---|---|
| `/[companyId]` | `[companyId]/page.tsx` | landing — the screenshotted one |
| `/[companyId]/findings` | `[companyId]/findings/page.tsx` | + `components/compliance/FindingDispositionRow.tsx` |
| `/[companyId]/assessments` | `[companyId]/assessments/page.tsx` | + `components/compliance/RunAssessmentButton.tsx` |
| `/[companyId]/changes` | `[companyId]/changes/page.tsx` | |
| `/[companyId]/changes/new` | `[companyId]/changes/new/page.tsx` | + `components/compliance/NewBundleForm.tsx` |
| `/[companyId]/changes/[bundleId]` | `[companyId]/changes/[bundleId]/page.tsx` | + `components/compliance/BundleComposer.tsx` |
| `/[companyId]/connections` | `[companyId]/connections/page.tsx` | |
| `/[companyId]/policies` | `[companyId]/policies/page.tsx` | |
| `/diagnostics` | `diagnostics/page.tsx` | TCT-only, not per-customer |

Shared bug: the `frameworkLabel()` helper is duplicated across these with
the `IGIG1` defect. Fix once, ideally extract to a shared util.

## Process rules — agreed with the operator, do not violate

1. **One page at a time.** Never batch UI again.
2. **Screenshot-verify before commit**, not after. The local loop exists
   for exactly this.
3. **No auto-merge of unreviewed UI.** Work on the branch; only let a page
   reach production after it has been screenshot-reviewed.
4. **`CI=true npx next build`** before every push — mirrors Vercel.

## Pending decision for the operator

Whether to revert the cockpit UI off production now, or leave it (the
legacy `/admin/compliance` dashboard is untouched and is still the default
entry point — the cockpit lives at separate `/[companyId]` URLs, so it is
not breaking existing workflows). This session deferred the decision until
the pages can actually be seen. Revisit after the screenshot review.

## Everything else still open (lower priority — see docs/current-tasks.md)

- **C13 real Graph executor handlers** — 8 stubs; needs operator
  test-tenant green-light per action.
- **W13/W15** — delete legacy intake UIs; blocked on a real Profile editor.
- **W16** — drop legacy `policy_org_profiles` + `compliance_customer_context`
  tables; operator-gated, after soak.
- **P6 carryovers** — DOCX/SharePoint/ZIP policy export, policy editing UI,
  customer attestation UI, customer portal compliance card.
- **Security hardening** — `CRON_SECRET` rotation (operator did
  `MIGRATION_SECRET`), per-tenant credential encryption Waves 2-5, audit
  guards on `/admin/setup` etc., CSP violation reporting.
