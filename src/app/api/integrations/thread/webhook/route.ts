import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { checkAutomationKey } from '@/lib/api-auth'
import { createFormLink, resolveFormCompany } from '@/lib/form-links'

const pool = getPool()

// ---------------------------------------------------------------------------
// POST /api/integrations/thread/webhook?key=<THREAD_AUTOMATION_KEY>&type=<onboarding|offboarding>
//
// Target for Thread's Magic Agents "Automation URL" feature
// (https://docs.getthread.com/article/7vxm10v3zj-magic-agents-automation-url).
// Thread POSTs a bare JSON body — it cannot send auth headers or signatures —
// so authentication is the ?key= URL parameter (fail-closed, see
// checkAutomationKey). Paste the full URL, including key and type, into each
// intent's Automation URL field in Thread:
//
//   .../api/integrations/thread/webhook?key=<value>&type=onboarding
//   .../api/integrations/thread/webhook?key=<value>&type=offboarding
//
// Payload (per Thread docs):
//   {
//     "intent_name":   "New Employee Onboarding",
//     "intent_fields": { "<configured field name>": "<customer response>" },
//     "meta_data": {
//       "ticket_id": 123, "ticket_board_name": "...", "ticket_board_id": 1,
//       "contact_id": 456, "contact_name": "...", "contact_email": "...",
//       "company_id": "789", "company_name": "...", "company_types": ["..."]
//     }
//   }
//
// meta_data.company_id is the Autotask company ID and is the PRIMARY company
// resolver; company_name/slug and the contact email domain are fallbacks, and
// fuzzy name matching is never used when company_id was supplied.
//
// Response contract (Thread relays `message` verbatim to the customer):
//   200 { "success": 200, "message": "<text containing the form link>" }
// ---------------------------------------------------------------------------

interface ThreadAutomationBody {
  intent_name?: string
  intent_fields?: Record<string, unknown>
  meta_data?: {
    ticket_id?: number
    ticket_board_name?: string
    ticket_board_id?: number
    contact_id?: number
    contact_name?: string
    contact_email?: string
    company_id?: string | number
    company_name?: string
    company_types?: string[]
  }
}

type FormType = 'onboarding' | 'offboarding'

/** Determine the form type: explicit ?type= wins, else intent_name keywords. */
function resolveFormType(request: NextRequest, intentName: string): FormType | null {
  const explicit = request.nextUrl.searchParams.get('type')?.toLowerCase().trim()
  if (explicit === 'onboarding' || explicit === 'offboarding') return explicit

  const intent = intentName.toLowerCase()
  if (/onboard|new[\s_-]?employee|new[\s_-]?hire|\bhire\b/.test(intent)) return 'onboarding'
  if (/offboard|termina|remove[\s_-]?employee|departure/.test(intent)) return 'offboarding'
  return null
}

/**
 * Pull an employee name out of intent_fields. Field names are whatever was
 * configured on the intent in Thread, so match on normalized keys instead of
 * exact strings.
 */
function extractPreFill(intentFields: Record<string, unknown>): Record<string, string> {
  const normalized = new Map<string, string>()
  for (const [key, value] of Object.entries(intentFields)) {
    if (typeof value !== 'string' || !value.trim()) continue
    normalized.set(key.toLowerCase().replace(/[^a-z0-9]/g, ''), value.trim())
  }

  const preFill: Record<string, string> = {}
  const first = normalized.get('firstname')
  const last = normalized.get('lastname')
  if (first) preFill.first_name = first
  if (last) preFill.last_name = last

  if (!preFill.first_name && !preFill.last_name) {
    const fullName =
      normalized.get('employeename') ??
      normalized.get('newemployeename') ??
      normalized.get('employeefullname') ??
      normalized.get('fullname') ??
      normalized.get('employee') ??
      normalized.get('name')
    if (fullName) {
      const parts = fullName.split(/\s+/)
      preFill.first_name = parts[0] ?? ''
      preFill.last_name = parts.slice(1).join(' ')
    }
  }

  return preFill
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Fail-closed URL-key auth — Thread cannot send headers or signatures.
  const denied = checkAutomationKey(request)
  if (denied) return denied

  let body: ThreadAutomationBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const intentName = typeof body.intent_name === 'string' ? body.intent_name : ''
  const intentFields =
    body.intent_fields && typeof body.intent_fields === 'object' ? body.intent_fields : {}
  const meta = body.meta_data ?? {}

  const type = resolveFormType(request, intentName)
  if (!type) {
    return NextResponse.json(
      {
        error:
          'Could not determine form type. Add &type=onboarding or &type=offboarding to the Automation URL configured in Thread.',
      },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    // company_id (the Autotask company ID) is the primary key; name/slug and
    // the contact email domain are fallbacks. resolveFormCompany never fuzzy-
    // matches when company_id was supplied.
    const company = await resolveFormCompany(client, {
      autotaskCompanyId: meta.company_id,
      companyName: meta.company_name,
      email: meta.contact_email,
    })

    if (!company) {
      console.warn(
        `[thread/webhook] No managed company for company_id=${meta.company_id ?? 'n/a'} company_name=${meta.company_name ?? 'n/a'}`
      )
      return NextResponse.json({ error: 'not_configured' }, { status: 404 })
    }

    const preFill = extractPreFill(intentFields)

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin
    const link = await createFormLink(client, {
      companyId: company.id,
      type,
      baseUrl,
      preFill,
      expiresInMinutes: 24 * 60,
      source: 'thread',
      createdBy: 'thread',
      // ticket_id is the Thread chat-ticket ID — the future join key for
      // merging that chat ticket with the Autotask ticket created on submit.
      sourceMeta: {
        intentName,
        intentFields,
        ticketId: meta.ticket_id ?? null,
        ticketBoardName: meta.ticket_board_name ?? null,
        ticketBoardId: meta.ticket_board_id ?? null,
        contactId: meta.contact_id ?? null,
        contactName: meta.contact_name ?? null,
        contactEmail: meta.contact_email ?? null,
        companyId: meta.company_id ?? null,
        companyName: meta.company_name ?? null,
      },
    })

    const employeeName = [preFill.first_name, preFill.last_name].filter(Boolean).join(' ')
    const nameLabel = employeeName ? ` for ${employeeName}` : ''

    // Thread relays `message` to the customer verbatim — the link must be in
    // the text. Exact response contract per Thread's Automation URL docs.
    return NextResponse.json({
      success: 200,
      message: `I've prepared a secure ${type} form${nameLabel}. Please complete it here: ${link.url} — this link expires in 24 hours and can be used for one submission.`,
    })
  } catch (err) {
    console.error('[thread/webhook] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create form link' }, { status: 500 })
  } finally {
    client.release()
  }
}
