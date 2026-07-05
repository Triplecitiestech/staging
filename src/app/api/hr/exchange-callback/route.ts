/**
 * Callback endpoint for the Azure Automation Exchange runner.
 *
 * The runbook POSTs its structured result here after re-reading Exchange
 * state (docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md). Auth is an HMAC-SHA256
 * signature over the RAW request body in the x-exo-signature header, verified
 * timing-safe against EXO_CALLBACK_SECRET — fail closed when unset.
 *
 * Idempotency: claimExchangeJob is a single-use state transition
 * (pending/dispatched -> processing); replayed callbacks find a terminal
 * status and are answered as duplicates without re-running the continuation.
 * A callback that arrives after the reconcile cron timed the job out is
 * recorded on the ticket as a late result but never re-claims the job.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  claimExchangeJob,
  getExchangeJob,
  releaseExchangeJobClaim,
  evaluateExchangeJobResult,
  verifyExchangeSignature,
  type ExchangeCallbackBody,
} from '@/lib/exchange-online'
import { finalizeExchangeJobSuccess, finalizeExchangeJobFailure } from '@/lib/hr/exchange-finalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.EXO_CALLBACK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Exchange callback is not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-exo-signature') ?? ''
  if (!verifyExchangeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: ExchangeCallbackBody
  try {
    body = JSON.parse(rawBody) as ExchangeCallbackBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.jobId || typeof body.jobId !== 'string' || !['succeeded', 'failed'].includes(body.status)) {
    return NextResponse.json({ error: 'jobId and status (succeeded|failed) are required' }, { status: 400 })
  }

  try {
    const job = await claimExchangeJob(body.jobId)
    if (!job) {
      const existing = await getExchangeJob(body.jobId)
      if (!existing) return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
      // Terminal or already being processed — this is a replay or a late
      // callback after the reconcile cron timed the job out. Acknowledge so
      // the runner stops retrying; surface late results on the ticket.
      if (existing.status === 'timed_out' && existing.finalize_context?.ticketId) {
        const { AutotaskClient } = await import('@/lib/autotask')
        try {
          await new AutotaskClient().createTicketNote(existing.finalize_context.ticketId, {
            title: 'Late Exchange Automation Result Received',
            description:
              `The Exchange runner reported "${body.status}" for job ${body.jobId} AFTER it was timed out and handed to manual follow-up.\n` +
              `Verify the mailbox state before redoing any manual steps.` +
              (body.error ? `\nRunner error: ${body.error}` : ''),
            noteType: 1,
            publish: 2,
          })
        } catch {
          // Non-fatal — the job record still holds the late result below
        }
      }
      return NextResponse.json({ ok: true, duplicate: true, status: existing.status })
    }

    if (body.status === 'succeeded') {
      // Trust nothing: assert observed state satisfies the request
      const payload = job.payload
      const verdict = payload
        ? evaluateExchangeJobResult(payload, body)
        : { ok: false, mismatches: ['job payload missing — cannot verify observed state'] }
      if (verdict.ok) {
        await finalizeExchangeJobSuccess(job, body)
        return NextResponse.json({ ok: true, result: 'succeeded' })
      }
      await finalizeExchangeJobFailure(
        job,
        `runner reported success but observed state does not match the request: ${verdict.mismatches.join('; ')}`,
        { callback: body },
      )
      return NextResponse.json({ ok: true, result: 'failed_verification' })
    }

    await finalizeExchangeJobFailure(job, body.error || 'runner reported failure without detail', { callback: body })
    return NextResponse.json({ ok: true, result: 'failed' })
  } catch (err) {
    // 500 tells the runner to retry its callback (it backs off 2s/4s/8s/16s);
    // the reconcile cron is the ultimate backstop if all retries fail. Release
    // the claim so the retry can re-enter instead of seeing a phantom
    // in-flight job.
    await releaseExchangeJobClaim(body.jobId).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[hr/exchange-callback] Processing failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
