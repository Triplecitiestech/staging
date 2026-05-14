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

### Setup state when this session ended

Done:
- Docker daemon started in the sandbox: `sudo dockerd > /tmp/dockerd.log 2>&1 &`
- Postgres 16 running: container `tct-pg`, port **5433**, db `tct`,
  user `postgres`, password `devpass`
- `npx prisma db push` ran successfully — Prisma schema synced to local DB
- `.env.local` created (gitignored, will NOT persist to a new sandbox —
  recreate it; contents below)
- `scripts/local-seed.ts` created and committed — raw-`pg` seed that
  inserts Tri-Bros Transportation + Contoso companies and a realistic
  spread of compliance data (assessment + findings, dispositions,
  connectors, tools, mappings, customer profile, pending changes, a
  bundle, policies, audit log). Reuses `ensureComplianceTables()`.

Not yet done (pick up here):
1. Run the seed: `DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct npx tsx scripts/local-seed.ts`
   (verify `tsx` resolves the `@/` alias in `ensure-tables.ts`; if not,
   run with `npx tsx --tsconfig tsconfig.json` or inline the DDL).
2. Start the dev server with `.env.local`: `npm run dev` (Next reads
   `.env.local` automatically). It will be at `http://localhost:3000`.
3. Build a Playwright screenshot harness:
   - POST `http://localhost:3000/api/test/auth` with
     `Authorization: Bearer local-dev-e2e-secret` and
     `{ "email": "e2e@triplecitiestech.com", "role": "SUPER_ADMIN" }`,
     save `storageState`.
   - With that auth, `page.goto` + `page.screenshot` each of the 8 pages
     at desktop AND mobile widths. Save PNGs to `/tmp/shots/`.
   - The chromium binary IS available (public-page mobile e2e tests passed
     earlier this session).
4. **Read every screenshot** with the Read tool. Write an honest per-page
   verdict.
5. Then decide per page: fix-forward / rebuild / revert. Do NOT guess.

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
