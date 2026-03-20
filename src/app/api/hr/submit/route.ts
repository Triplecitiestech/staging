import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubmitRequestBody {
  type: 'onboarding' | 'offboarding'
  answers: Record<string, unknown>
  submittedByEmail: string
  submittedByName?: string
}

// ---------------------------------------------------------------------------
// POST /api/hr/submit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate session
  const session = await getAuthenticatedCompany()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse and validate body
  let body: SubmitRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, answers, submittedByEmail, submittedByName } = body

  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid type — must be "onboarding" or "offboarding"' },
      { status: 400 }
    )
  }

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers must be an object' }, { status: 400 })
  }

  if (!submittedByEmail || typeof submittedByEmail !== 'string') {
    return NextResponse.json({ error: 'submittedByEmail is required' }, { status: 400 })
  }

  const normalizedEmail = submittedByEmail.toLowerCase().trim()

  // 3. Load company by slug
  const company = await prisma.company.findFirst({
    where: { slug: session.companySlug },
    include: {
      contacts: {
        where: { isActive: true },
      },
    },
  })

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // 4. Validate submitter is a CLIENT_MANAGER contact
  const managerContact = company.contacts.find(
    (c) =>
      c.email?.toLowerCase() === normalizedEmail &&
      c.customerRole === 'CLIENT_MANAGER'
  )

  if (!managerContact) {
    return NextResponse.json(
      { error: 'Forbidden — this email is not authorized to submit HR requests for this company' },
      { status: 403 }
    )
  }

  // 5. Compute idempotency key — scoped per hour to prevent duplicate submissions
  const answersTyped = answers as Record<string, string>
  const hourSlot = Math.floor(Date.now() / 3_600_000)
  const rawKey = [
    company.id,
    normalizedEmail,
    type,
    (answersTyped.first_name ?? '').trim().toLowerCase(),
    (answersTyped.last_name ?? '').trim().toLowerCase(),
    hourSlot,
  ].join(':')

  const idempotencyKey = createHash('sha256').update(rawKey).digest('hex')

  // 6. Check for duplicate within the last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  const existing = await prisma.hrRequest.findFirst({
    where: {
      idempotencyKey,
      createdAt: { gte: tenMinutesAgo },
    },
  })

  if (existing) {
    return NextResponse.json(
      {
        error: 'Duplicate request detected — an identical request was submitted within the last 10 minutes',
        requestId: existing.id,
      },
      { status: 409 }
    )
  }

  // 7. Derive target UPN for offboarding requests
  const targetUpn =
    type === 'offboarding' && typeof answersTyped.work_email === 'string'
      ? answersTyped.work_email.toLowerCase().trim()
      : null

  // 8. Create HrRequest record
  const hrRequest = await prisma.hrRequest.create({
    data: {
      companyId: company.id,
      companySlug: session.companySlug,
      type,
      status: 'pending',
      submittedByEmail: normalizedEmail,
      submittedByName: submittedByName?.trim() ?? managerContact.name ?? null,
      answers,
      idempotencyKey,
      targetUpn,
    },
  })

  // 9. Write audit log entry
  await prisma.hrAuditLog.create({
    data: {
      companyId: company.id,
      requestId: hrRequest.id,
      actor: normalizedEmail,
      action: 'request_submitted',
      resource: `hr_request:${hrRequest.id}`,
      details: {
        type,
        employeeName: `${answersTyped.first_name ?? ''} ${answersTyped.last_name ?? ''}`.trim(),
        submittedByName: hrRequest.submittedByName,
      },
      severity: 'info',
    },
  })

  // 10. Fire-and-forget background processing
  // We don't await this — let it run asynchronously
  const processUrl = new URL('/api/hr/process', request.url)
  const internalSecret = process.env.INTERNAL_SECRET ?? ''

  fetch(processUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': internalSecret,
    },
    body: JSON.stringify({ requestId: hrRequest.id }),
  }).catch((err) => {
    // Log but don't surface — background job failure is handled by the processor
    console.error('[hr/submit] Failed to kick off background processing:', err)
  })

  // 11. Return 202 Accepted
  return NextResponse.json(
    {
      requestId: hrRequest.id,
      message: 'Request submitted successfully',
    },
    { status: 202 }
  )
}
