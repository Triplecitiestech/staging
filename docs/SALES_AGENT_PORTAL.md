# Sales Agent Portal

Add-on feature for the existing TCT site. Lets independent referral partners
("agents") log in, submit referrals, track their status, and see their signed
agreement. TCT staff manage agents and referrals from the existing
M365-SSO-protected `/admin` area.

## How it fits in

| Surface | URL prefix | Auth |
|---------|------------|------|
| Agent portal | `/agents/*` | Email + password (new). Cookie: `tct_agent_session` |
| Admin pages | `/admin/sales-agents/*`, `/admin/sales-referrals/*` | Existing M365 SSO via `auth()` from `src/auth.ts` |
| API: agents | `/api/agent-portal/*` | Agent session cookie via `requireAgentApi()` |
| API: admin | `/api/admin/sales-agents/*`, `/api/admin/sales-referrals/*` | M365 SSO + role check (`SUPER_ADMIN` / `ADMIN`) |

The two auth systems are completely separate. Agent sessions never grant admin
access; staff M365 sessions are never treated as agent sessions.

## Database

Four new tables (Prisma-managed, additive — no existing tables touched):

- `sales_agents` — one row per referral partner. Holds bcrypt password hash, single-use password-set token, active flag, audit fields.
- `agent_agreements` — one-to-one with `sales_agents`. Stores the signed agreement file content as `BYTEA` directly in the DB (chosen to avoid adding blob storage; see "File storage" below).
- `sales_referrals` — one row per referral. Has a `status` enum and a `contractMonthlyValue` for commission tracking.
- `sales_referral_status_history` — append-only log of status transitions, with `changedByType` (`agent` / `admin` / `system`) and the actor's identifier.

The `ReferralStatus` enum: `SUBMITTED → CONTACTED → PROPOSAL_SENT → SIGNED → MONTH_1_PAID → MONTH_2_PAID → COMMISSION_DUE → COMMISSION_PAID` plus `LOST` and `NOT_A_FIT`.

### Migration

The migration lives at `prisma/migrations/20260420000000_add_sales_agent_portal/migration.sql`. It will run automatically on the next build (`npm run build` calls `prisma migrate deploy` first). To run manually against a remote DB:

```powershell
$env:DATABASE_URL = "<connection string>"
npx prisma migrate deploy
```

All `CREATE TABLE` and `ADD CONSTRAINT` statements are guarded with `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object` blocks, so re-running is safe.

## Required environment variables

Already in the project's standard env (re-used):
- `DATABASE_URL`, `PRISMA_DATABASE_URL`
- `RESEND_API_KEY` — used to send welcome / reset / referral-notification emails
- `NEXT_PUBLIC_BASE_URL` — used to build absolute URLs in emails

New (optional but recommended):
- `AGENT_SIGNING_KEY` — HMAC key for the agent session cookie. If absent, falls back to `ONBOARDING_SIGNING_KEY`. Set this to a long random string (e.g. `openssl rand -base64 48`) in production.
- `SALES_REFERRAL_NOTIFY_EMAIL` — admin inbox that receives a notification email each time an agent submits a referral. Defaults to `sales@triplecitiestech.com`.

## Onboarding a new agent (admin)

1. Sign in to `/admin` with your TCT M365 account.
2. Click **Sales Agents** in the top nav, then **Add Agent**.
3. Enter first name, last name, email, optional phone. Submit.
4. The system creates the agent record, generates a single-use password-set token (48-hour expiry), and emails the agent a welcome message with a "Set your password" link.
5. The success screen shows whether the email actually went out. If Resend was misconfigured, click into the agent's profile and use **Resend welcome email**.
6. After the agent sets their password, they're auto-signed-in to `/agents/dashboard`.

### Resending the welcome email / resetting an agent's password

On the agent profile (`/admin/sales-agents/<id>`), the **Resend welcome email** button:
- Generates a fresh 48-hour token.
- Wipes the agent's existing `passwordHash` (so the only way back in is the new link).
- Sends a fresh welcome email.

For self-service recovery, agents can use **Forgot password** on the login page, which mails them a reset link without touching their existing password until they actually reset it.

## Uploading an agent's signed agreement

1. Open the agent's profile page.
2. Under **Referral Agreement**, choose a `.pdf`, `.doc`, or `.docx` file (max 10 MB) and click **Upload** (or **Replace**).
3. The file is stored in the `agent_agreements.fileData` `BYTEA` column. Only that agent (via the agent portal) and TCT admins can download it.

## Referral status workflow (admin)

1. Open `/admin/sales-referrals` — the full cross-agent list with agent / status / date-range filters and a CSV export.
2. Click into a referral to see contact details, the agent's notes, status history, and the editor.
3. The editor lets you change status, set the contract monthly value, set commission due/paid dates, and write internal admin notes (which the agent never sees).
4. Each status change is recorded in `sales_referral_status_history` with the changing admin's M365 email.

## File storage

For MVP, agreement files live in the `agent_agreements.fileData` `BYTEA` column. This avoids adding new infrastructure (Vercel Blob / S3) and stays inside the same backup story as the rest of the app DB. The data is never served from the public web root; downloads go through `/api/agent-portal/agreement` (agent's own only) or `/api/admin/sales-agents/<id>/agreement` (staff). Both endpoints set `Cache-Control: private, no-store`.

If file sizes grow beyond ~10 MB per agent and become a DB pain, swap the storage layer in `src/app/api/admin/sales-agents/[id]/agreement/route.ts` and `src/app/api/agent-portal/agreement/route.ts` for a blob provider — the rest of the system doesn't care.

## Agent flow (end-to-end)

1. Agent receives the welcome email → clicks **Set your password**.
2. Page at `/agents/set-password?token=…` validates the token, then accepts a new password (min 12 chars, must include 3 of the 4 character classes).
3. On success the cookie is set and the user lands on `/agents/dashboard`.
4. Dashboard shows totals, the agreement download (if uploaded), a CTA to submit a referral, and the agent's referral history table.
5. **Submit a Referral** → `/agents/refer` (validated form, requires consent checkbox).
6. **Training** → `/agents/training` and six sub-pages with the program training content.

## Security notes

- Passwords hashed with `bcryptjs` (cost 12).
- Login responses run a hash compare even when the email doesn't exist (uniform timing), and never confirm whether an email is registered.
- Forgot-password endpoint always returns the same message regardless of whether the email exists.
- Agent referral endpoints filter by `agentId = current_agent.id` at the DB query level, not just in the UI.
- Agreement download endpoints stream from DB; staff endpoints check `auth()` + role; agent endpoint checks `getCurrentAgent()`.
- All mutation endpoints call `checkCsrf()` from `src/lib/security.ts` and login / reset / set-password endpoints call `checkRateLimit(_, { strict: true })`.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Session cookie uses constant-time HMAC compare via `crypto.timingSafeEqual`.

## Local dev

```powershell
npm install
# Make sure DATABASE_URL is set in .env to a local Postgres
npm run build       # runs prisma migrate deploy first
npm run dev
# Sign into /admin with your M365, create an agent, look at the email body
# (Resend will return ok in dev if RESEND_API_KEY is set, or skip the send if not).
```

## Testing checklist

Vitest unit tests live at `tests/unit/agent-session.test.ts` and `tests/unit/agent-auth.test.ts`. Run them with:

```powershell
npm test
```

End-to-end coverage of the auth boundary lives at `tests/e2e/sales-agent-portal.spec.ts`. It checks:

- `/agents/dashboard`, `/agents/refer`, `/agents/training` redirect unauthenticated visitors to `/agents/login`.
- `/admin/sales-agents` and `/admin/sales-referrals` are not reachable from an agent session — they require the existing M365 SSO.
- An agent session created via the API cannot fetch another agent's referral by ID.

Run with `npm run test:e2e` (Playwright).
