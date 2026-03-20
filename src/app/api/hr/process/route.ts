import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessRequestBody {
  requestId: string
}

interface AutotaskTicketPayload {
  CompanyID: number
  Title: string
  Description: string
  Status: number
  Priority: number
  QueueID?: number
  IssueType?: number
  SubIssueType?: number
}

interface AutotaskTimeEntryPayload {
  TicketID: number
  ResourceID: number
  DateWorked: string
  StartDateTime: string
  EndDateTime: string
  HoursWorked: number
  SummaryNotes: string
  BillingCodeID?: number
}

interface AutotaskTicketResponse {
  item?: {
    id: number
    ticketNumber: string
  }
  // Some versions return an array
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAutotaskHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    UserName: process.env.AUTOTASK_API_USERNAME ?? '',
    Secret: process.env.AUTOTASK_API_SECRET ?? '',
    ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE ?? '',
  }
}

function getAutotaskBaseUrl(): string {
  return (process.env.AUTOTASK_API_BASE_URL ?? '').replace(/\/$/, '')
}

function formatAnswersAsDescription(
  type: string,
  answers: Record<string, unknown>
): string {
  const lines: string[] = []
  const a = answers as Record<string, string>

  if (type === 'onboarding') {
    lines.push('=== EMPLOYEE ONBOARDING REQUEST ===', '')
    lines.push('EMPLOYEE DETAILS')
    lines.push(`  Name:           ${a.first_name ?? ''} ${a.last_name ?? ''}`.trimEnd())
    if (a.start_date)      lines.push(`  Start Date:     ${a.start_date}`)
    if (a.job_title)       lines.push(`  Job Title:      ${a.job_title}`)
    if (a.department)      lines.push(`  Department:     ${a.department}`)
    if (a.work_location)   lines.push(`  Work Location:  ${a.work_location}`)
    if (a.personal_email)  lines.push(`  Personal Email: ${a.personal_email}`)
    if (a.phone)           lines.push(`  Phone:          ${a.phone}`)

    lines.push('', 'MICROSOFT 365 SETUP')
    if (a.license_type)    lines.push(`  License Type:   ${a.license_type}`)
    if (a.groups_to_add)   lines.push(`  Groups/Teams:   ${a.groups_to_add}`)
    if (a.clone_permissions === 'yes') {
      lines.push(`  Clone From:     ${a.clone_from_user ?? 'Not specified'}`)
    } else {
      lines.push('  Clone Permissions: No')
    }
    if (a.additional_notes) lines.push('', `NOTES\n  ${a.additional_notes}`)
  } else {
    lines.push('=== EMPLOYEE OFFBOARDING REQUEST ===', '')
    lines.push('EMPLOYEE DETAILS')
    lines.push(`  Name:           ${a.first_name ?? ''} ${a.last_name ?? ''}`.trimEnd())
    if (a.work_email)      lines.push(`  Work Email:     ${a.work_email}`)
    if (a.last_day)        lines.push(`  Last Day:       ${a.last_day}`)

    lines.push('', 'ACCOUNT HANDLING')
    if (a.account_action)  lines.push(`  Action:         ${a.account_action}`)
    if (a.forward_email)   lines.push(`  Forward To:     ${a.forward_email}`)
    if (a.delegate_access) lines.push(`  Delegate To:    ${a.delegate_access}`)
    lines.push(
      `  Remove Groups:  ${a.remove_from_groups === 'yes' ? 'Yes' : 'No'}`,
      `  Wipe Devices:   ${a.wipe_devices === 'yes' ? 'Yes — wipe all managed devices' : 'No'}`,
    )
    if (a.additional_notes) lines.push('', `NOTES\n  ${a.additional_notes}`)
  }

  return lines.join('\n')
}

function buildTicketTitle(type: string, answers: Record<string, unknown>): string {
  const a = answers as Record<string, string>
  const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()
  return type === 'onboarding'
    ? `[ONBOARDING] New Employee: ${fullName}`
    : `[OFFBOARDING] Employee Termination: ${fullName}`
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// POST /api/hr/process
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate internal secret
  const providedSecret = request.headers.get('x-internal-secret') ?? ''
  const expectedSecret = process.env.INTERNAL_SECRET ?? ''

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse body
  let body: ProcessRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  // 3. Load the HR request
  const hrRequest = await prisma.hrRequest.findUnique({
    where: { id: body.requestId },
    include: { company: true },
  })

  if (!hrRequest) {
    return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
  }

  // 4. Guard against re-processing
  if (hrRequest.status === 'completed' || hrRequest.status === 'running') {
    return NextResponse.json(
      { message: `Request already in state: ${hrRequest.status}` },
      { status: 200 }
    )
  }

  // 5. Update status to running
  await prisma.hrRequest.update({
    where: { id: hrRequest.id },
    data: { status: 'running', startedAt: new Date() },
  })

  const answers = hrRequest.answers as Record<string, unknown>
  const baseUrl = getAutotaskBaseUrl()
  const autotaskHeaders = getAutotaskHeaders()

  // autotaskCompanyId is stored as String? in the schema; Autotask REST expects an integer.
  const rawCompanyId = hrRequest.company.autotaskCompanyId
  const autotaskCompanyId: number = rawCompanyId ? parseInt(rawCompanyId, 10) : 0

  if (!rawCompanyId || isNaN(autotaskCompanyId)) {
    await prisma.hrRequest.update({
      where: { id: hrRequest.id },
      data: {
        status: 'failed',
        errorMessage: `Company "${hrRequest.company.displayName}" has no Autotask Company ID configured`,
        retryCount: { increment: 1 },
      },
    })
    return NextResponse.json(
      { error: 'Company has no Autotask Company ID configured' },
      { status: 422 }
    )
  }

  // -----------------------------------------------------------------
  // STEP 1: Create Autotask Ticket
  // -----------------------------------------------------------------

  const ticketStepStart = new Date()

  const ticketPayload: AutotaskTicketPayload = {
    CompanyID: autotaskCompanyId,
    Title: buildTicketTitle(hrRequest.type, answers),
    Description: formatAnswersAsDescription(hrRequest.type, answers),
    Status: 1,   // New
    Priority: 2, // Medium
  }

  let ticketId: number | null = null
  let ticketNumber: string | null = null
  let ticketStepError: string | null = null

  try {
    const ticketRes = await fetch(`${baseUrl}/V1.0/Tickets`, {
      method: 'POST',
      headers: autotaskHeaders,
      body: JSON.stringify(ticketPayload),
    })

    if (!ticketRes.ok) {
      const errText = await ticketRes.text()
      throw new Error(`Autotask ticket creation failed (${ticketRes.status}): ${errText}`)
    }

    const ticketData = (await ticketRes.json()) as AutotaskTicketResponse

    // Autotask returns { item: { id, ticketNumber } } on success
    if (ticketData?.item?.id) {
      ticketId = ticketData.item.id
      ticketNumber = ticketData.item.ticketNumber
    } else {
      throw new Error(`Unexpected Autotask response shape: ${JSON.stringify(ticketData)}`)
    }
  } catch (err) {
    ticketStepError = err instanceof Error ? err.message : String(err)
  }

  // Record the ticket creation step
  await prisma.hrRequestStep.create({
    data: {
      requestId: hrRequest.id,
      stepKey: 'create_ticket',
      stepName: 'Create Autotask Ticket',
      status: ticketStepError ? 'failed' : 'completed',
      attempt: 1,
      input: { payload: ticketPayload },
      output: ticketId ? { ticketId, ticketNumber } : null,
      error: ticketStepError ? { message: ticketStepError } : null,
      startedAt: ticketStepStart,
      completedAt: new Date(),
    },
  })

  if (ticketStepError || ticketId === null) {
    // Mark as failed and bail
    await prisma.hrRequest.update({
      where: { id: hrRequest.id },
      data: {
        status: 'failed',
        errorMessage: ticketStepError ?? 'Ticket creation returned no ID',
        retryCount: { increment: 1 },
      },
    })

    await prisma.hrAuditLog.create({
      data: {
        companyId: hrRequest.companyId,
        requestId: hrRequest.id,
        actor: 'system',
        action: 'request_failed',
        resource: `hr_request:${hrRequest.id}`,
        details: { step: 'create_ticket', error: ticketStepError },
        severity: 'error',
      },
    })

    return NextResponse.json(
      { error: 'Failed to create Autotask ticket', details: ticketStepError },
      { status: 500 }
    )
  }

  // Persist ticketId and ticketNumber
  await prisma.hrRequest.update({
    where: { id: hrRequest.id },
    data: {
      autotaskTicketId: ticketId,
      autotaskTicketNumber: ticketNumber,
    },
  })

  // -----------------------------------------------------------------
  // STEP 2: Add 30-minute time entry to the ticket
  // -----------------------------------------------------------------

  const timeStepStart = new Date()
  const resourceId = parseInt(process.env.AUTOTASK_DEFAULT_RESOURCE_ID ?? '0', 10)
  let timeStepError: string | null = null

  const nowIso = new Date().toISOString()
  const endIso = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const timeEntryPayload: AutotaskTimeEntryPayload = {
    TicketID: ticketId,
    ResourceID: resourceId,
    DateWorked: todayIsoDate(),
    StartDateTime: nowIso,
    EndDateTime: endIso,
    HoursWorked: 0.5,
    SummaryNotes: 'Automated HR request processing - setup and documentation',
  }

  try {
    const timeRes = await fetch(`${baseUrl}/V1.0/TicketTimeEntries`, {
      method: 'POST',
      headers: autotaskHeaders,
      body: JSON.stringify(timeEntryPayload),
    })

    if (!timeRes.ok) {
      const errText = await timeRes.text()
      throw new Error(`Autotask time entry failed (${timeRes.status}): ${errText}`)
    }
  } catch (err) {
    timeStepError = err instanceof Error ? err.message : String(err)
    // Time entry failure is non-fatal — log it but continue
    console.error('[hr/process] Time entry failed (non-fatal):', timeStepError)
  }

  // Record the time entry step
  await prisma.hrRequestStep.create({
    data: {
      requestId: hrRequest.id,
      stepKey: 'add_time_entry',
      stepName: 'Add Time Entry (30 min)',
      status: timeStepError ? 'failed' : 'completed',
      attempt: 1,
      input: { payload: timeEntryPayload },
      output: timeStepError ? null : { hoursWorked: 0.5 },
      error: timeStepError ? { message: timeStepError } : null,
      startedAt: timeStepStart,
      completedAt: new Date(),
    },
  })

  // -----------------------------------------------------------------
  // Finalise the request
  // -----------------------------------------------------------------

  await prisma.hrRequest.update({
    where: { id: hrRequest.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      // If time entry failed, surface it in the error field but still mark completed
      errorMessage: timeStepError
        ? `Ticket created (${ticketNumber}) but time entry failed: ${timeStepError}`
        : null,
    },
  })

  await prisma.hrAuditLog.create({
    data: {
      companyId: hrRequest.companyId,
      requestId: hrRequest.id,
      actor: 'system',
      action: 'request_completed',
      resource: `hr_request:${hrRequest.id}`,
      details: {
        ticketId,
        ticketNumber,
        timeEntryCreated: !timeStepError,
      },
      severity: 'info',
    },
  })

  return NextResponse.json(
    {
      message: 'HR request processed successfully',
      requestId: hrRequest.id,
      ticketId,
      ticketNumber,
      stepsCompleted: timeStepError ? ['create_ticket'] : ['create_ticket', 'add_time_entry'],
    },
    { status: 200 }
  )
}
