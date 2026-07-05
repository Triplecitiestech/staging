/**
 * Reconcile cron for async Exchange Online jobs — the backstop for lost
 * callbacks (runner crashed, callback retries exhausted, webhook queue
 * swallowed the job). Any job still pending/dispatched/processing after
 * EXO_JOB_TIMEOUT_MINUTES (default 45; runbook jobs normally finish in
 * 2-10 min including Automation queue time) is timed out HONESTLY: the step
 * is recorded failed, the ticket gets the manual fallback instruction at
 * raised priority, and nothing ever claims the work happened.
 *
 * Schedule: every 15 min (vercel.json). Auth: Vercel-set CRON_SECRET Bearer
 * header via cronHandler, which also converts transient failures to 200
 * { transient: true } per the cron rules in CLAUDE.md.
 */

import { cronHandler } from '@/lib/cron-wrapper'
import { findStaleExchangeJobs } from '@/lib/exchange-online'
import { finalizeExchangeJobFailure } from '@/lib/hr/exchange-finalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TIMEOUT_MINUTES = Number(process.env.EXO_JOB_TIMEOUT_MINUTES ?? '45')

export const GET = cronHandler({ name: 'exchange-jobs-reconcile', timeoutMs: 55_000 }, async () => {
  const stale = await findStaleExchangeJobs(Number.isFinite(TIMEOUT_MINUTES) && TIMEOUT_MINUTES > 0 ? TIMEOUT_MINUTES : 45)
  if (stale.length === 0) {
    return { success: true, message: 'No stale Exchange jobs' }
  }

  const timedOut: string[] = []
  const errors: string[] = []
  for (const job of stale) {
    try {
      await finalizeExchangeJobFailure(
        job,
        `no callback received within ${TIMEOUT_MINUTES} minutes of dispatch (runner or callback delivery failed)`,
        { timedOut: true },
      )
      timedOut.push(job.id)
    } catch (err) {
      // One bad job must not block the rest — it stays stale and is retried
      // on the next run.
      errors.push(`${job.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    success: errors.length === 0,
    message: `Timed out ${timedOut.length}/${stale.length} stale Exchange job(s)`,
    data: { timedOut, errors },
    warnings: errors.length > 0 ? errors : undefined,
  }
})
