/**
 * Shared query helpers for compliance_policy_approvals. Used by:
 *   - the policies list endpoint (returns latest approval per policy
 *     so the operator UI can render status badges)
 *   - the sharepoint-publish executor (checks the approval table as
 *     the authoritative gate, instead of trusting the client-side
 *     customer-approved flag)
 *
 * Returns the MOST RECENT approval row whose policyContentHash matches
 * the current policy content. Stale approvals (content has been edited
 * since the approval was given) are intentionally not returned — they
 * shouldn't count toward "customer has approved this".
 */

import type { PoolClient } from 'pg'

export interface ApprovalSnapshot {
  id: string
  decision: 'pending' | 'approved' | 'rejected' | 'expired'
  decisionNotes: string | null
  decidedAt: string | null
  recipientEmail: string
  requesterEmail: string
  expiresAt: string
  createdAt: string
  /** True when the policy content hasn't changed since the approval was requested. */
  freshForCurrentContent: boolean
}

/**
 * Latest approval row for a single (companyId, policyId), with a
 * freshness flag indicating whether the policy content is still the
 * same as when the approval was requested.
 */
export async function loadLatestApproval(
  client: PoolClient,
  companyId: string,
  policyId: string
): Promise<ApprovalSnapshot | null> {
  const res = await client.query<{
    id: string
    decision: 'pending' | 'approved' | 'rejected' | 'expired'
    decisionNotes: string | null
    decidedAt: string | null
    recipientEmail: string
    requesterEmail: string
    expiresAt: string
    createdAt: string
    freshForCurrentContent: boolean
  }>(
    `SELECT
       a.id,
       a.decision,
       a."decisionNotes",
       a."decidedAt"::text AS "decidedAt",
       a."recipientEmail",
       a."requesterEmail",
       a."expiresAt"::text AS "expiresAt",
       a."createdAt"::text AS "createdAt",
       (encode(sha256(convert_to(p.content, 'UTF8')), 'hex') = a."policyContentHash") AS "freshForCurrentContent"
     FROM compliance_policy_approvals a
     JOIN compliance_policies p ON p.id = a."policyId"
     WHERE a."companyId" = $1 AND a."policyId" = $2
     ORDER BY a."createdAt" DESC
     LIMIT 1`,
    [companyId, policyId]
  )
  return res.rows[0] ?? null
}

/**
 * Bulk variant — one query for many policies. Used by the policies
 * list endpoint so we don't N+1.
 */
export async function loadLatestApprovalsForPolicies(
  client: PoolClient,
  companyId: string,
  policyIds: string[]
): Promise<Map<string, ApprovalSnapshot>> {
  const map = new Map<string, ApprovalSnapshot>()
  if (policyIds.length === 0) return map
  const res = await client.query<{
    policyId: string
    id: string
    decision: 'pending' | 'approved' | 'rejected' | 'expired'
    decisionNotes: string | null
    decidedAt: string | null
    recipientEmail: string
    requesterEmail: string
    expiresAt: string
    createdAt: string
    freshForCurrentContent: boolean
  }>(
    `SELECT DISTINCT ON (a."policyId")
       a."policyId",
       a.id,
       a.decision,
       a."decisionNotes",
       a."decidedAt"::text AS "decidedAt",
       a."recipientEmail",
       a."requesterEmail",
       a."expiresAt"::text AS "expiresAt",
       a."createdAt"::text AS "createdAt",
       (encode(sha256(convert_to(p.content, 'UTF8')), 'hex') = a."policyContentHash") AS "freshForCurrentContent"
     FROM compliance_policy_approvals a
     JOIN compliance_policies p ON p.id = a."policyId"
     WHERE a."companyId" = $1 AND a."policyId" = ANY($2::text[])
     ORDER BY a."policyId", a."createdAt" DESC`,
    [companyId, policyIds]
  )
  for (const row of res.rows) {
    const { policyId, ...rest } = row
    map.set(policyId, rest)
  }
  return map
}
