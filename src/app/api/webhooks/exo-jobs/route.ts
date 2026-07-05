import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { verifyExoCallback, type ExoCallbackBody } from '@/lib/exchange-online'
import { AutotaskClient } from '@/lib/autotask'

const pool = getPool()

// ---------------------------------------------------------------------------
// POST /api/webhooks/exo-jobs — result callback from the Azure Automation
// runbook (scripts/exo/Invoke-TctExoOffboardingJob.ps1).
//
// Auth: per-job HMAC — the runbook signs the raw body with HMAC-SHA256 keyed
// by the job's callback_token (header x-exo-signature). No shared secret.
// ---------------------------------------------------------------------------

interface ExoJobFullRow {
  id: string
  request_id: string | null
  company_slug: string | null
  ticket_id: number | null
  action: string
  payload: { mailbox?: string; delegates?: string[] } | string
  status: string
  callback_token: string
  notify_on_callback: boolean
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  let body: ExoCallbackBody
  try {
    body = JSON.parse(rawBody) as ExoCallbackBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.jobId || typeof body.ok !== 'boolean') {
    return NextResponse.json({ error: 'jobId and ok are required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    const jobRes = await client.query<ExoJobFullRow>(
      `SELECT id, request_id, company_slug, ticket_id, action, payload, status, callback_token, notify_on_callback
       FROM exo_jobs WHERE id = $1`,
      [body.jobId]
    )
    if (jobRes.rows.length === 0) {
      return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
    }
    const job = jobRes.rows[0]

    const signature = request.headers.get('x-exo-signature') ?? ''
    if (!verifyExoCallback(rawBody, signature, job.callback_token)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Idempotency: a terminal job never transitions again (and never re-posts notes)
    if (job.status === 'succeeded' || job.status === 'failed') {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const newStatus = body.ok ? 'succeeded' : 'failed'
    await client.query(
      `UPDATE exo_jobs
       SET status = $2, result = $3::jsonb, error = $4, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [job.id, newStatus, JSON.stringify({ observed: body.observed ?? null, warnings: body.warnings ?? [] }), body.error ?? null]
    )

    // Record the step on the HR request so the admin flow view shows it
    if (job.request_id) {
      try {
        await client.query(
          `INSERT INTO hr_request_steps
             (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
           VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW(), NOW())`,
          [
            job.request_id,
            'convert_shared_mailbox',
            'Convert Mailbox to Shared (Exchange automation)',
            body.ok ? 'completed' : 'failed',
            JSON.stringify({ jobId: job.id }),
            body.ok ? JSON.stringify({ observed: body.observed ?? null }) : null,
            body.ok ? null : JSON.stringify({ message: body.error ?? 'Unknown runbook error' }),
          ]
        )
      } catch (err) {
        console.warn('[exo-jobs] Failed to record hr_request_steps row:', err instanceof Error ? err.message : err)
      }
    }

    // The pipeline only sets notify_on_callback when it stopped waiting — in
    // that case the ticket record is finalized here instead.
    if (job.notify_on_callback && job.ticket_id) {
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload
      const mailbox = payload?.mailbox ?? 'the mailbox'
      const delegates: string[] = Array.isArray(payload?.delegates) ? payload.delegates : []
      try {
        const autotask = new AutotaskClient()
        if (body.ok) {
          await autotask.createTicketNote(job.ticket_id, {
            title: 'Mailbox Converted to Shared (Exchange automation)',
            description:
              `Confirmed by Exchange automation:\n` +
              `Mailbox ${mailbox} is now a SHARED mailbox (observed RecipientTypeDetails: ${body.observed?.recipientType ?? 'SharedMailbox'}).\n` +
              (delegates.length > 0 ? `Access granted to: ${delegates.join(', ')}\n` : '') +
              (body.warnings && body.warnings.length > 0 ? `Warnings: ${body.warnings.join('; ')}\n` : '') +
              `\nNEXT STEP: remove the Microsoft 365 license from ${mailbox} now that conversion is confirmed (shared mailboxes under 50 GB need no license), then close out the remaining checklist items.`,
            noteType: 1,
            publish: 2,
          })
          await autotask.createTicketNote(job.ticket_id, {
            title: 'Shared Mailbox Ready',
            description:
              `The mailbox for ${mailbox} has been converted to a shared mailbox` +
              (delegates.length > 0 ? ` and access has been granted to: ${delegates.join(', ')}.` : '.'),
            noteType: 1,
            publish: 1,
          })
        } else {
          await autotask.createTicketNote(job.ticket_id, {
            title: 'Mailbox Conversion FAILED (Exchange automation)',
            description:
              `The Exchange automation could not convert ${mailbox} to a shared mailbox.\n` +
              `Error: ${body.error ?? 'Unknown runbook error'}\n\n` +
              `Complete the conversion manually: Microsoft 365 admin center -> Active users -> ${mailbox} -> Mail -> Convert to shared mailbox, then grant access` +
              (delegates.length > 0 ? ` to: ${delegates.join(', ')}` : '') +
              ` (Exchange admin center -> mailbox delegation). The mailbox must still be licensed to convert; remove the license after conversion.`,
            noteType: 1,
            publish: 2,
          })
        }
      } catch (err) {
        console.warn('[exo-jobs] Failed to post Autotask note:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[exo-jobs] Callback processing failed:', msg)
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
