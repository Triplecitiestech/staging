// src/lib/field/login.ts
//
// Email-code login for contractors. Two steps:
//   requestLoginCode  — email → (if an ACTIVE contractor) hash + store a
//                       6-digit code, deliver it, audit. Unknown emails take
//                       the same visible path and write only an audit row.
//   verifyLoginCode   — email + code → constant-time compare against the
//                       contractor's one open code; 5 wrong attempts kill it;
//                       success consumes the code and mints a session.
//
// Both are called by the /api/field/login/* route handlers, which own the
// 1-second delay, the cookies and the HTTP status codes.

import { encryptSecret, isEncryptionKeyConfigured } from '@/lib/crypto'
import { getPool } from '@/lib/db-pool'
import { sendLoginCodeEmail, type CodeDeliveryResult } from './email'
import {
  consumeLoginCode,
  countCodeRequestsFromIp,
  createSession,
  findActiveContractorByEmail,
  getOpenLoginCode,
  issueLoginCode,
  recordFailedCodeAttempt,
  writeAudit,
  type Queryable,
} from './store'
import { FIELD_SESSION_TTL_MS } from './session'
import { digestsMatch, generateLoginCode, generateSessionToken, sha256Hex } from './tokens'

export const CODE_TTL_MS = 10 * 60 * 1000
export const CODE_TTL_MINUTES = CODE_TTL_MS / 60_000
export const MAX_CODE_ATTEMPTS = 5
/** Per-IP: this many code requests per window → 429. */
export const IP_CODE_REQUEST_LIMIT = 10
export const IP_CODE_REQUEST_WINDOW_MINUTES = 60
/** Artificial delay on every verification attempt, owned by the route. */
export const ATTEMPT_DELAY_MS = 1000

export interface RequestContext {
  ip: string
  userAgent: string | null
}

export type RequestCodeOutcome =
  | { outcome: 'rate_limited' }
  /** The visible response is identical for both of these. */
  | { outcome: 'issued'; contractorId: string; codeId: string; delivery: Promise<CodeDeliveryResult> }
  | { outcome: 'unknown_email' }

export async function requestLoginCode(
  email: string,
  ctx: RequestContext,
  db: Queryable = getPool(),
  deliver: typeof sendLoginCodeEmail = sendLoginCodeEmail,
): Promise<RequestCodeOutcome> {
  const recent = await countCodeRequestsFromIp(ctx.ip, IP_CODE_REQUEST_WINDOW_MINUTES, db)
  if (recent >= IP_CODE_REQUEST_LIMIT) {
    await writeAudit({ actorType: 'system', actorId: null, event: 'code_request_rate_limited', meta: { ip: ctx.ip } }, db)
    return { outcome: 'rate_limited' }
  }

  const contractor = await findActiveContractorByEmail(email, db)

  // Always written — it is the rate-limit counter AND the only trace of an
  // unknown-email attempt. The submitted email is stored; a code never is.
  await writeAudit(
    {
      actorType: contractor ? 'contractor' : 'system',
      actorId: contractor?.id ?? null,
      event: 'code_requested',
      meta: { ip: ctx.ip, email, enrolled: Boolean(contractor), userAgent: ctx.userAgent },
    },
    db,
  )

  if (!contractor) return { outcome: 'unknown_email' }

  const code = generateLoginCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)
  const record = await issueLoginCode(
    {
      contractorId: contractor.id,
      codeHash: sha256Hex(code),
      codeCiphertext: isEncryptionKeyConfigured() ? encryptSecret(code) : null,
      expiresAt,
    },
    db,
  )
  await writeAudit(
    {
      actorType: 'contractor',
      actorId: contractor.id,
      event: 'code_issued',
      meta: { ip: ctx.ip, codeId: record.id, expiresAt: expiresAt.toISOString(), adminVisible: record.codeCiphertext !== null },
    },
    db,
  )

  // Delivery is NOT awaited: the caller's response time must not depend on
  // Resend, and the admin page is the fallback path either way.
  const delivery = deliver(contractor.email, code, CODE_TTL_MINUTES).then(async (result) => {
    await writeAudit(
      {
        actorType: 'system',
        actorId: null,
        event: result === 'sent' ? 'code_email_sent' : 'code_email_failed',
        meta: { contractorId: contractor.id, codeId: record.id, result },
      },
      db,
    ).catch(() => {})
    return result
  })

  return { outcome: 'issued', contractorId: contractor.id, codeId: record.id, delivery }
}

export type VerifyCodeOutcome =
  | { ok: true; contractorId: string; sessionToken: string; expiresAt: Date }
  /** Wrong code, code still alive → "That code didn't work." */
  | { ok: false; reason: 'invalid' }
  /** No live code (none, expired, already used, or locked) → "Request a new code." */
  | { ok: false; reason: 'no_code' }

export async function verifyLoginCode(
  email: string,
  code: string,
  ctx: RequestContext,
  db: Queryable = getPool(),
  now: Date = new Date(),
): Promise<VerifyCodeOutcome> {
  const contractor = await findActiveContractorByEmail(email, db)
  if (!contractor) {
    await writeAudit({ actorType: 'system', actorId: null, event: 'login_failure', meta: { ip: ctx.ip, email, reason: 'not_enrolled' } }, db)
    return { ok: false, reason: 'no_code' }
  }

  const open = await getOpenLoginCode(contractor.id, db)
  if (!open || open.expiresAt.getTime() <= now.getTime() || open.attempts >= MAX_CODE_ATTEMPTS) {
    await writeAudit(
      {
        actorType: 'contractor',
        actorId: contractor.id,
        event: 'login_failure',
        meta: { ip: ctx.ip, reason: !open ? 'no_open_code' : open.attempts >= MAX_CODE_ATTEMPTS ? 'locked' : 'expired', codeId: open?.id ?? null },
      },
      db,
    )
    return { ok: false, reason: 'no_code' }
  }

  if (!digestsMatch(sha256Hex(code), open.codeHash)) {
    const attempts = await recordFailedCodeAttempt(open.id, db)
    const locked = attempts >= MAX_CODE_ATTEMPTS
    await writeAudit(
      { actorType: 'contractor', actorId: contractor.id, event: 'login_failure', meta: { ip: ctx.ip, codeId: open.id, attempts, reason: 'wrong_code' } },
      db,
    )
    if (locked) {
      await writeAudit({ actorType: 'contractor', actorId: contractor.id, event: 'lockout', meta: { ip: ctx.ip, codeId: open.id, attempts } }, db)
      return { ok: false, reason: 'no_code' }
    }
    return { ok: false, reason: 'invalid' }
  }

  await consumeLoginCode(open.id, db)
  const sessionToken = generateSessionToken()
  const expiresAt = new Date(now.getTime() + FIELD_SESSION_TTL_MS)
  const sessionId = await createSession(
    { contractorId: contractor.id, tokenHash: sha256Hex(sessionToken), expiresAt, userAgent: ctx.userAgent, ip: ctx.ip },
    db,
  )
  await writeAudit(
    { actorType: 'contractor', actorId: contractor.id, event: 'login_success', meta: { ip: ctx.ip, codeId: open.id, sessionId } },
    db,
  )
  return { ok: true, contractorId: contractor.id, sessionToken, expiresAt }
}

/** First hop of x-forwarded-for (what Vercel sets), else x-real-ip, else 'unknown'. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const real = headers.get('x-real-ip')?.trim()
  return real ? real.slice(0, 64) : 'unknown'
}
