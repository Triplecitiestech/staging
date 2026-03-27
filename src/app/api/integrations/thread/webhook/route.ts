import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getPool } from '@/lib/db-pool'
import { randomBytes } from 'crypto'

const pool = getPool()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreadWebhookBody {
  event: string
  intent: string
  company: {
    name: string
    threadId?: string
  }
  extracted?: {
    employeeName?: string
    [key: string]: unknown
  }
  conversationId?: string
}

// ---------------------------------------------------------------------------
// HMAC validation
// ---------------------------------------------------------------------------

function validateSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return expected === signature
}

// ---------------------------------------------------------------------------
// POST /api/integrations/thread/webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  // Validate HMAC signature
  const webhookSecret = process.env.THREAD_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature = request.headers.get('x-thread-signature') ?? ''
    if (!validateSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('[thread/webhook] THREAD_WEBHOOK_SECRET not set — skipping signature validation')
  }

  let body: ThreadWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Parse intent
  let type: 'onboarding' | 'offboarding'
  const intent = (body.intent ?? '').toLowerCase()

  if (intent.includes('onboard') || intent.includes('new_employee') || intent.includes('hire')) {
    type = 'onboarding'
  } else if (intent.includes('offboard') || intent.includes('termina') || intent.includes('remove_employee')) {
    type = 'offboarding'
  } else {
    return NextResponse.json({
      message: "I couldn't determine if this is an onboarding or offboarding request. Could you clarify?",
    })
  }

  // Map Thread company to TCT company slug
  const companyName = body.company?.name ?? ''
  if (!companyName) {
    return NextResponse.json({ error: 'No company information provided' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // Try to find company by slug or display name
    const companyRes = await client.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM companies
       WHERE LOWER(slug) = $1 OR LOWER("displayName") LIKE $2
       LIMIT 1`,
      [companyName.toLowerCase().trim(), `%${companyName.toLowerCase().trim()}%`]
    )

    if (companyRes.rows.length === 0) {
      return NextResponse.json({
        message: `I couldn't find a company matching "${companyName}" in our system. Please contact support.`,
      })
    }

    const company = companyRes.rows[0]

    // Build pre-fill from extracted data
    const preFill: Record<string, string> = {}
    const employeeName = body.extracted?.employeeName ?? ''
    if (employeeName) {
      const parts = employeeName.trim().split(/\s+/)
      preFill.first_name = parts[0] ?? ''
      preFill.last_name = parts.slice(1).join(' ') || ''
    }

    // Generate form link
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await client.query(
      `INSERT INTO form_links (company_id, type, token, pre_fill, source, expires_at, created_by)
       VALUES ($1, $2, $3, $4::jsonb, 'thread', $5, 'thread')`,
      [
        company.id,
        type,
        token,
        Object.keys(preFill).length > 0 ? JSON.stringify(preFill) : null,
        expiresAt.toISOString(),
      ]
    )

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin
    const url = `${baseUrl}/form/${token}`

    const typeLabel = type === 'onboarding' ? 'onboarding' : 'offboarding'
    const nameLabel = employeeName ? ` for ${employeeName}` : ''

    return NextResponse.json({
      message: `I've prepared an ${typeLabel} form${nameLabel}. Please complete the details here:`,
      link: {
        url,
        label: `Complete ${type === 'onboarding' ? 'Onboarding' : 'Offboarding'} Form`,
      },
      expiresAt: expiresAt.toISOString(),
    })
  } finally {
    client.release()
  }
}
