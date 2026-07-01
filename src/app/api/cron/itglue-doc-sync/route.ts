/**
 * IT Glue document index sync (Tier 1 SOP/triage retrieval).
 *
 * Refreshes the itglue_doc_index content cache: TCT's SOP org plus any org
 * already present in the index. Incremental (only changed docs) and chunked
 * (bounded docs per run) so it stays under the serverless time limit — a full
 * warm of a large library completes over several runs.
 *
 * Secret-authenticated via cronHandler. NOT yet registered in vercel.json — run
 * it manually to warm/verify, then add a schedule once confirmed:
 *   GET https://www.triplecitiestech.com/api/cron/itglue-doc-sync
 *   Authorization: Bearer <CRON_SECRET>
 */

import { cronHandler } from '@/lib/cron-wrapper'
import { syncIndexedOrgs } from '@/lib/itglue-doc-index'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = cronHandler({ name: 'itglue-doc-sync', timeoutMs: 55_000 }, async () => {
  const results = await syncIndexedOrgs()
  const indexed = results.reduce((n, r) => n + r.indexed, 0)
  const remaining = results.reduce((n, r) => n + r.remaining, 0)
  const errors = results.flatMap((r) => r.errors)
  return {
    success: errors.length === 0,
    message: `Synced ${results.length} org(s): ${indexed} docs indexed this run, ${remaining} remaining. Re-run until remaining=0 to fully warm.`,
    data: { results },
    warnings: errors.length ? errors.slice(0, 20) : undefined,
  }
})
