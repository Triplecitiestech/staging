# Runbook: Retrofit `_prisma_migrations` (make real migrations work)

*Created: 2026-06-09 · Status: NOT YET EXECUTED · Operator-driven — do NOT run from a Claude session. Kurtis runs this from his own machine with production credentials.*

## Why

Production has no `_prisma_migrations` table — Prisma's migration runner has never applied anything there. Every column was created by raw `ALTER TABLE` in `/api/migrations/run`. That means every schema change today is a **manual two-phase deploy** (deploy code → remember to POST the migration endpoint), with a guaranteed crash window between the two and a human dependency in the middle.

This runbook "baselines" the production database so `prisma migrate deploy` works. After it, migrations apply **automatically during the Vercel build, before new code serves traffic** — no manual POST, no crash window, one deploy instead of two.

**Risk level: low.** The retrofit only creates a bookkeeping table and writes rows into it. It makes **zero changes** to your actual data tables. It is fully reversible at any point by dropping `_prisma_migrations`.

## Prerequisites

- Node 20 + this repo cloned locally, `npm ci` run
- Vercel CLI installed and logged in (`npm i -g vercel`, `vercel login`)
- ~30 minutes; no maintenance window needed

## ⚠️ Never do these

- **NEVER** run `prisma migrate dev` or `prisma migrate reset` with the production `DATABASE_URL` — `reset` **drops the entire database**.
- The only Prisma migration commands safe against production are: `migrate diff` (read-only), `migrate status` (read-only), `migrate resolve` (bookkeeping only), and — after this retrofit — `migrate deploy`.

## Steps (PowerShell)

### 1 · Pull production env and point Prisma at prod

```powershell
cd C:\path\to\staging
vercel env pull .env.production.local --environment=production
# Open .env.production.local, copy the DATABASE_URL value, then:
$env:DATABASE_URL = "<paste the DATABASE_URL value here>"
```

### 2 · Check for drift between prod and schema.prisma (read-only)

```powershell
# "What would prod need to match schema.prisma?"
npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script -o drift-prod-needs.sql
Get-Content drift-prod-needs.sql
```

- **If the file is empty / no-ops:** prod matches the schema — continue to step 3.
- **If it contains `ALTER TABLE ... ADD COLUMN`:** schema.prisma has fields whose `ALTER TABLE` was never POSTed. Apply them the old way first (add to `src/app/api/migrations/run/route.ts` if missing, deploy, then `Invoke-RestMethod -Method Post -Uri "https://www.triplecitiestech.com/api/migrations/run" -Headers @{ Authorization = "Bearer <MIGRATION_SECRET>" }`), then re-run step 2 until clean.
- **If it contains `DROP`/`CREATE TABLE` for `report_*`, `soc_*`, `cfo_settings`, `hr_*` or other raw-pg tables:** those tables are intentionally outside Prisma — ignore statements about tables that have no model in `schema.prisma`. Only statements touching Prisma-modeled tables matter.

### 3 · Archive the old (never-applied) migration files

```powershell
$stamp = Get-Date -Format "yyyyMMdd"
Move-Item prisma\migrations "prisma\migrations-archive-$stamp"
New-Item -ItemType Directory prisma\migrations | Out-Null
Set-Content prisma\migrations\migration_lock.toml "provider = `"postgresql`""
```

(The old files were never applied anywhere, so they are history, not state. Git keeps them in `prisma/migrations-archive-*`.)

### 4 · Generate the baseline migration from schema.prisma

```powershell
New-Item -ItemType Directory prisma\migrations\000000000000_baseline | Out-Null
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma\migrations\000000000000_baseline\migration.sql
```

(Use `-o`, not `>` — PowerShell redirection writes UTF-16 and corrupts the SQL file.)

### 5 · Mark the baseline as already applied on production

```powershell
npx prisma migrate resolve --applied 000000000000_baseline
```

This creates `_prisma_migrations` on prod and records the baseline as done — **it does not run any SQL against your data tables.**

### 6 · Verify

```powershell
npx prisma migrate status
# Expected: "Database schema is up to date!"
```

If it instead lists pending migrations or errors, STOP and investigate — do not proceed to step 7.

### 7 · Commit and flip the pipeline

```powershell
git checkout -b claude/enable-migrate-deploy-manual
git add prisma
```

Then edit `vercel.json` line 2:

```json
"buildCommand": "prisma migrate deploy && tsx scripts/check-schema-drift.ts && next build",
```

```powershell
git add vercel.json
git commit -m "Enable prisma migrate deploy in Vercel build (post-baseline)"
git push -u origin claude/enable-migrate-deploy-manual
```

The gated auto-merge will run the checks and merge. Watch the first production build log in Vercel — you should see `No pending migrations to apply.`

### 8 · Clean up

```powershell
Remove-Item .env.production.local, drift-prod-needs.sql
Remove-Item Env:\DATABASE_URL
```

## Rollback

At any point before step 7: `DROP TABLE "_prisma_migrations";` on prod restores the exact previous world (and `git checkout prisma/` locally). After step 7: also revert the `vercel.json` change.

## The new workflow after this retrofit

**Adding a schema field becomes ONE deploy:**
1. Edit `prisma/schema.prisma`.
2. Create a migration file: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script -o prisma/migrations/<yyyyMMddHHmmss>_<name>/migration.sql` (shadow-DB-free; review the SQL).
3. Commit + push. The build applies the migration **before** the new code goes live. Done — no POST to `/api/migrations/run` for Prisma-model changes anymore.

**Expand-contract policy (reliability rule, applies forever):**
- Migrations in a deploy must be **additive** (ADD COLUMN, CREATE TABLE, CREATE INDEX). Additive-first means a Vercel instant-rollback of the code always still works against the migrated DB.
- **Never DROP or RENAME** a column/table in the same deploy as the code change. Drop/rename only in a *later* deploy, after production code has stopped referencing it.

**What does NOT change:** `report_*`, `soc_*`, `cfo_settings`, and the HR/M365 raw-pg patterns stay exactly as they are (self-healing `ensure-tables` / `/api/migrations/run`). This retrofit covers Prisma-modeled tables only.
