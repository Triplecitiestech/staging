import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
})

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
  itemId?: number
  item?: {
    id: number
    ticketNumber: string
  }
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

function formatActionTypeName(actionType: string): string {
  const names: Record<string, string> = {
    revoke_sessions: 'Revoke All Sessions',
    disable_account: 'Disable Account',
    convert_to_shared: 'Convert Mailbox to Shared',
    forward_email: 'Set Up Email Forwarding',
    transfer_onedrive: 'Transfer OneDrive Files',
    remove_groups: 'Remove from All Groups',
    remove_licenses: 'Remove Licenses',
    wipe_devices: 'Remote Wipe Devices',
    create_user: 'Create M365 User',
    assign_license: 'Assign License',
    add_to_groups: 'Add to Groups',
    clone_permissions: 'Clone User Permissions',
  }
  return names[actionType] ?? actionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// POST /api/hr/process
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate internal secret — optional if env var not set
  const expectedSecret = process.env.INTERNAL_SECRET ?? ''
  if (expectedSecret) {
    const providedSecret = request.headers.get('x-internal-secret') ?? ''
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    console.warn('[hr/process] INTERNAL_SECRET not set — skipping auth check')
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

  const client = await pool.connect()
  try {
    // 3. Load the HR request with company join
    const reqResult = await client.query(
      `SELECT
         r.id, r.company_id, r.company_slug, r.type, r.status,
         r.submitted_by_email, r.submitted_by_name, r.answers,
         r.autotask_ticket_id, r.autotask_ticket_number,
         r.target_upn, r.target_user_id, r.idempotency_key,
         r.error_message, r.retry_count,
         r.started_at, r.completed_at, r.created_at, r.updated_at,
         r.resolved_action_plan,
         c."autotaskCompanyId", c."displayName"
       FROM hr_requests r
       JOIN companies c ON c.id = r.company_id
       WHERE r.id = $1`,
      [body.requestId]
    )

    if (reqResult.rows.length === 0) {
      return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
    }

    const hrRequest = reqResult.rows[0]

    // 4. Guard against re-processing
    if (hrRequest.status === 'completed' || hrRequest.status === 'running') {
      return NextResponse.json(
        { message: `Request already in state: ${hrRequest.status}` },
        { status: 200 }
      )
    }

    // 5. Update status to running
    await client.query(
      `UPDATE hr_requests SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [hrRequest.id]
    )

    const answers = (typeof hrRequest.answers === 'string' ? JSON.parse(hrRequest.answers) : hrRequest.answers) as Record<string, unknown>
    const baseUrl = getAutotaskBaseUrl()
    const autotaskHeaders = getAutotaskHeaders()

    // autotaskCompanyId is stored as String? — Autotask REST expects an integer
    const rawCompanyId = hrRequest.autotaskCompanyId
    const autotaskCompanyId: number = rawCompanyId ? parseInt(rawCompanyId, 10) : 0

    if (!rawCompanyId || isNaN(autotaskCompanyId)) {
      await client.query(
        `UPDATE hr_requests
         SET status = 'failed',
             error_message = $2,
             retry_count = COALESCE(retry_count, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [hrRequest.id, `Company "${hrRequest.displayName}" has no Autotask Company ID configured`]
      )
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

      // Autotask REST API v1.0 returns { itemId: number } on creation
      // Some versions return { item: { id, ticketNumber } }
      if (ticketData?.itemId) {
        ticketId = ticketData.itemId
        // ticketNumber isn't returned in the creation response — need to fetch it
        ticketNumber = null
      } else if (ticketData?.item?.id) {
        ticketId = ticketData.item.id
        ticketNumber = ticketData.item.ticketNumber ?? null
      } else {
        throw new Error(`Unexpected Autotask response shape: ${JSON.stringify(ticketData)}`)
      }

      // Fetch the ticket to get the ticketNumber if we don't have it
      if (ticketId && !ticketNumber) {
        try {
          const getRes = await fetch(`${baseUrl}/V1.0/Tickets/${ticketId}`, {
            method: 'GET',
            headers: autotaskHeaders,
          })
          if (getRes.ok) {
            const getData = await getRes.json()
            ticketNumber = getData?.item?.ticketNumber ?? `T${ticketId}`
          }
        } catch {
          // Non-fatal — use a fallback ticket number
          ticketNumber = `T${ticketId}`
        }
      }
    } catch (err) {
      ticketStepError = err instanceof Error ? err.message : String(err)
    }

    // Record the ticket creation step
    await client.query(
      `INSERT INTO hr_request_steps
         (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, NOW())`,
      [
        hrRequest.id,
        'create_ticket',
        'Create Autotask Ticket',
        ticketStepError ? 'failed' : 'completed',
        1,
        JSON.stringify({ payload: ticketPayload }),
        ticketId ? JSON.stringify({ ticketId, ticketNumber }) : null,
        ticketStepError ? JSON.stringify({ message: ticketStepError }) : null,
        ticketStepStart,
        new Date(),
      ]
    )

    if (ticketStepError || ticketId === null) {
      // Mark as failed and bail
      await client.query(
        `UPDATE hr_requests
         SET status = 'failed',
             error_message = $2,
             retry_count = COALESCE(retry_count, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [hrRequest.id, ticketStepError ?? 'Ticket creation returned no ID']
      )

      await client.query(
        `INSERT INTO hr_audit_logs
           (company_id, request_id, actor, action, resource, details, severity, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
        [
          hrRequest.company_id,
          hrRequest.id,
          'system',
          'request_failed',
          `hr_request:${hrRequest.id}`,
          JSON.stringify({ step: 'create_ticket', error: ticketStepError ?? undefined }),
          'error',
        ]
      )

      return NextResponse.json(
        { error: 'Failed to create Autotask ticket', details: ticketStepError },
        { status: 500 }
      )
    }

    // Persist ticketId and ticketNumber
    await client.query(
      `UPDATE hr_requests
       SET autotask_ticket_id = $2,
           autotask_ticket_number = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [hrRequest.id, ticketId, ticketNumber]
    )

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
      console.error('[hr/process] Time entry failed (non-fatal):', timeStepError)
    }

    // Record the time entry step
    await client.query(
      `INSERT INTO hr_request_steps
         (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, NOW())`,
      [
        hrRequest.id,
        'add_time_entry',
        'Add Time Entry (30 min)',
        timeStepError ? 'failed' : 'completed',
        1,
        JSON.stringify({ payload: timeEntryPayload }),
        timeStepError ? null : JSON.stringify({ hoursWorked: 0.5 }),
        timeStepError ? JSON.stringify({ message: timeStepError }) : null,
        timeStepStart,
        new Date(),
      ]
    )

    // -----------------------------------------------------------------
    // STEP 3: Evaluate automation mappings and log planned actions
    // -----------------------------------------------------------------

    const automationSteps: string[] = []
    try {
      // Load automation mappings for this type + company (and global where company_id IS NULL)
      const mappingsRes = await client.query<{
        id: string
        trigger_key: string
        trigger_value: string | null
        action_type: string
        action_config: Record<string, unknown>
        priority: number
      }>(
        `SELECT id, trigger_key, trigger_value, action_type, action_config, priority
         FROM automation_mappings
         WHERE type = $1
           AND (company_id = $2 OR company_id IS NULL)
           AND is_enabled = true
         ORDER BY priority ASC`,
        [hrRequest.type, hrRequest.company_id]
      )

      for (const mapping of mappingsRes.rows) {
        const answerValue = answers[mapping.trigger_key]

        // Check if trigger matches
        let triggered = false
        if (mapping.trigger_value === null) {
          // NULL trigger_value means "any non-empty value"
          triggered = answerValue !== undefined && answerValue !== null && answerValue !== ''
        } else {
          triggered = String(answerValue) === mapping.trigger_value
        }

        if (!triggered) continue

        // Resolve template variables in action_config
        const resolvedConfig = JSON.parse(
          JSON.stringify(mapping.action_config).replace(
            /\{\{answers\.(\w+)\}\}/g,
            (_, key) => String(answers[key] ?? '')
          )
        )

        // Log as a planned step (not executed — technician handles manually)
        const stepKey = mapping.action_type
        const stepName = formatActionTypeName(mapping.action_type)

        await client.query(
          `INSERT INTO hr_request_steps
             (request_id, step_key, step_name, status, attempt, input, output, started_at, completed_at, created_at)
           VALUES ($1, $2, $3, 'planned', 1, $4::jsonb, NULL, NOW(), NULL, NOW())`,
          [
            hrRequest.id,
            stepKey,
            stepName,
            JSON.stringify({ action: mapping.action_type, config: resolvedConfig }),
          ]
        )

        automationSteps.push(stepKey)
      }
    } catch (automationErr) {
      console.error('[hr/process] Automation mapping evaluation failed (non-fatal):', automationErr)
    }

    // -----------------------------------------------------------------
    // Finalise the request
    // -----------------------------------------------------------------

    const stepsCompleted = ['create_ticket']
    if (!timeStepError) stepsCompleted.push('add_time_entry')

    await client.query(
      `UPDATE hr_requests
       SET status = 'completed',
           completed_at = NOW(),
           error_message = $2,
           resolved_action_plan = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        hrRequest.id,
        timeStepError
          ? `Ticket created (${ticketNumber}) but time entry failed: ${timeStepError}`
          : null,
        automationSteps.length > 0 ? JSON.stringify({ plannedActions: automationSteps }) : null,
      ]
    )

    await client.query(
      `INSERT INTO hr_audit_logs
         (company_id, request_id, actor, action, resource, details, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
      [
        hrRequest.company_id,
        hrRequest.id,
        'system',
        'request_completed',
        `hr_request:${hrRequest.id}`,
        JSON.stringify({
          ticketId,
          ticketNumber,
          timeEntryCreated: !timeStepError,
          plannedActions: automationSteps,
        }),
        'info',
      ]
    )

    return NextResponse.json(
      {
        message: 'HR request processed successfully',
        requestId: hrRequest.id,
        ticketId,
        ticketNumber,
        stepsCompleted,
        plannedActions: automationSteps,
      },
      { status: 200 }
    )
  } finally {
    client.release()
  }
}
