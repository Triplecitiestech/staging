/**
 * HMAC-signed magic-link tokens for the customer policy-approval flow.
 *
 * Same pattern as src/lib/onboarding-session.ts: payload + signature
 * joined by a dot, signed with HMAC-SHA256. No server-side storage
 * needed beyond the compliance_policy_approvals row itself — the
 * token is self-contained and the row's `expiresAt` is the authoritative
 * deadline.
 *
 * Token shape: <base64-url(payload)>.<hex-signature>
 * Payload: { approvalId, companyId, policyId, expires }
 *
 * The customer's email contains a /portal/policy-approval/<token>
 * link. The public review page verifies the token (signature + not
 * expired), looks up the approval row, and renders the policy for
 * the customer to approve / reject. The customer's decision POSTs
 * the token back along with their choice + optional notes.
 */

import crypto from 'crypto'

const TOKEN_LIFETIME_DAYS = 30 // matches the default expiresAt window

function getSigningKey(): string {
  const key = process.env.ONBOARDING_SIGNING_KEY
  if (key) return key
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.error('[SECURITY] ONBOARDING_SIGNING_KEY not set — policy-approval tokens are insecure')
  }
  return 'dev-only-signing-key-not-for-production'
}

export interface ApprovalTokenPayload {
  approvalId: string
  companyId: string
  policyId: string
  /** Unix ms when the token stops being valid. */
  expires: number
}

export function signApprovalToken(payload: Omit<ApprovalTokenPayload, 'expires'> & { expires?: number }): string {
  const fullPayload: ApprovalTokenPayload = {
    approvalId: payload.approvalId,
    companyId: payload.companyId,
    policyId: payload.policyId,
    expires: payload.expires ?? Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  }
  const json = JSON.stringify(fullPayload)
  const sig = crypto.createHmac('sha256', getSigningKey()).update(json).digest('hex')
  const b64 = Buffer.from(json).toString('base64url')
  return `${b64}.${sig}`
}

export function verifyApprovalToken(token: string): ApprovalTokenPayload | null {
  try {
    const dot = token.indexOf('.')
    if (dot <= 0) return null
    const b64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const json = Buffer.from(b64, 'base64url').toString('utf-8')
    const expectedSig = crypto.createHmac('sha256', getSigningKey()).update(json).digest('hex')
    // Constant-time compare to avoid timing leaks.
    if (sig.length !== expectedSig.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return null
    const payload = JSON.parse(json) as ApprovalTokenPayload
    if (
      typeof payload.approvalId !== 'string' ||
      typeof payload.companyId !== 'string' ||
      typeof payload.policyId !== 'string' ||
      typeof payload.expires !== 'number'
    ) return null
    if (Date.now() > payload.expires) return null
    return payload
  } catch {
    return null
  }
}

export const APPROVAL_TOKEN_LIFETIME_DAYS = TOKEN_LIFETIME_DAYS
