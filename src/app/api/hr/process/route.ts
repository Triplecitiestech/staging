import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { Resend } from 'resend'
import { AutotaskClient } from '@/lib/autotask'
import {
  createGraphClient,
  getTenantCredentialsBySlug,
  type GraphGroup,
  type GraphLicenseSku,
} from '@/lib/graph'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
})

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <noreply@triplecitiestech.com>'

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
    if (a.work_email || a.employee_to_offboard) lines.push(`  Work Email:     ${a.work_email ?? a.employee_to_offboard}`)
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

/** Generate a 16-character temporary password: mixed case + digits + specials */
function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special

  // Ensure at least one from each class
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(special)]

  const remaining = Array.from({ length: 12 }, () => pick(all))
  const combined = [...required, ...remaining]

  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }
  return combined.join('')
}

/** Derive the primary email domain from existing tenant users (skip .onmicrosoft.com) */
function deriveDomainFromUsers(upns: string[]): string | null {
  for (const upn of upns) {
    const domain = upn.split('@')[1]
    if (domain && !domain.endsWith('.onmicrosoft.com')) {
      return domain
    }
  }
  return null
}

/** Describe a group for display purposes */
function describeGroup(g: GraphGroup): string {
  if (g.groupTypes?.includes('Unified')) return `${g.displayName} (Microsoft 365 group)`
  if (g.mailEnabled && !g.securityEnabled) return `${g.displayName} (distribution list)`
  if (g.securityEnabled) return `${g.displayName} (security group)`
  return g.displayName
}

// ---------------------------------------------------------------------------
// Step logger helper
// ---------------------------------------------------------------------------

async function logStep(
  pgClient: import('pg').PoolClient,
  requestId: string,
  stepKey: string,
  stepName: string,
  status: 'completed' | 'failed',
  startedAt: Date,
  input?: unknown,
  output?: unknown,
  error?: string,
) {
  await pgClient.query(
    `INSERT INTO hr_request_steps
       (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
     VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW())`,
    [
      requestId,
      stepKey,
      stepName,
      status,
      input ? JSON.stringify(input) : null,
      output ? JSON.stringify(output) : null,
      error ? JSON.stringify({ message: error }) : null,
      startedAt,
      new Date(),
    ]
  )
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
    const a = answers as Record<string, string>
    const baseUrl = getAutotaskBaseUrl()
    const autotaskHeaders = getAutotaskHeaders()
    const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()

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

    // Instantiate AutotaskClient for notes
    let autotask: AutotaskClient | null = null
    try {
      autotask = new AutotaskClient()
    } catch (err) {
      console.warn('[hr/process] AutotaskClient init failed (notes will be skipped):', err instanceof Error ? err.message : err)
    }

    // -----------------------------------------------------------------
    // STEP 1: Create Autotask Ticket
    // -----------------------------------------------------------------

    const ticketStepStart = new Date()
    const originalDescription = formatAnswersAsDescription(hrRequest.type, answers)

    const ticketPayload: AutotaskTicketPayload = {
      CompanyID: autotaskCompanyId,
      Title: buildTicketTitle(hrRequest.type, answers),
      Description: originalDescription,
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

      if (ticketData?.itemId) {
        ticketId = ticketData.itemId
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
          ticketNumber = `T${ticketId}`
        }
      }
    } catch (err) {
      ticketStepError = err instanceof Error ? err.message : String(err)
    }

    await logStep(client, hrRequest.id, 'create_ticket', 'Create Autotask Ticket',
      ticketStepError ? 'failed' : 'completed', ticketStepStart,
      { payload: ticketPayload },
      ticketId ? { ticketId, ticketNumber } : undefined,
      ticketStepError ?? undefined)

    if (ticketStepError || ticketId === null) {
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

    await logStep(client, hrRequest.id, 'add_time_entry', 'Add Time Entry (30 min)',
      timeStepError ? 'failed' : 'completed', timeStepStart,
      { payload: timeEntryPayload },
      timeStepError ? undefined : { hoursWorked: 0.5 },
      timeStepError ?? undefined)

    // -----------------------------------------------------------------
    // STEP 3: M365 Provisioning Pipeline
    // -----------------------------------------------------------------

    const stepsCompleted: string[] = ['create_ticket']
    if (!timeStepError) stepsCompleted.push('add_time_entry')

    // Track overall provisioning outcome
    let primaryActionSucceeded = false
    const provisioningResults: string[] = []
    const failedSteps: string[] = []

    // Convenience to add an Autotask note (non-fatal if it fails)
    const addTicketNote = async (title: string, description: string, publish: 1 | 2 = 2) => {
      if (!autotask || !ticketId) return
      try {
        await autotask.createTicketNote(ticketId, {
          title,
          description,
          noteType: 1,
          publish,
        })
      } catch (err) {
        console.warn(`[hr/process] Failed to add ticket note "${title}":`, err instanceof Error ? err.message : err)
      }
    }

    if (hrRequest.type === 'onboarding') {
      // =============================================================
      // ONBOARDING PIPELINE
      // =============================================================

      // Load M365 credentials
      const creds = hrRequest.company_slug
        ? await getTenantCredentialsBySlug(hrRequest.company_slug)
        : null

      if (!creds) {
        const msg = `No M365 credentials configured for company slug "${hrRequest.company_slug}"`
        console.error('[hr/process]', msg)
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'failed', new Date(), undefined, undefined, msg)
        failedSteps.push('load_m365_creds')
      } else {
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'completed', new Date(), undefined, { tenantId: creds.tenantId })
        stepsCompleted.push('load_m365_creds')

        const graph = createGraphClient(creds)

        // --- Generate UPN ---
        const firstName = (a.first_name ?? '').toLowerCase().replace(/[^a-z]/g, '')
        const lastName = (a.last_name ?? '').toLowerCase().replace(/[^a-z]/g, '')
        const mailNickname = `${firstName}.${lastName}`

        // Derive domain from existing users
        let domain: string | null = null
        try {
          const existingUsers = await graph.getUsers()
          domain = deriveDomainFromUsers(existingUsers.map((u) => u.userPrincipalName))
        } catch {
          console.warn('[hr/process] Could not list users to derive domain')
        }

        if (!domain) {
          const msg = 'Could not determine email domain from tenant users'
          await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'failed', new Date(), undefined, undefined, msg)
          failedSteps.push('create_user')
          await addTicketNote('M365 User Creation Failed', msg)
        } else {
          const upn = `${mailNickname}@${domain}`
          const tempPassword = generateTempPassword()

          // --- Create M365 User ---
          const createStart = new Date()
          let newUserId: string | null = null
          try {
            const newUser = await graph.createUser({
              displayName: fullName,
              userPrincipalName: upn,
              mailNickname,
              password: tempPassword,
              jobTitle: a.job_title ?? undefined,
              department: a.department ?? undefined,
            })
            newUserId = newUser.id
            primaryActionSucceeded = true
            provisioningResults.push(`Work Email: ${upn}`)

            await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'completed', createStart,
              { upn, displayName: fullName }, { userId: newUserId, upn })
            stepsCompleted.push('create_user')

            // Persist the UPN
            await client.query(
              `UPDATE hr_requests SET target_upn = $2, target_user_id = $3, updated_at = NOW() WHERE id = $1`,
              [hrRequest.id, upn, newUserId]
            )

            await addTicketNote('M365 Account Created', `UPN: ${upn}\nDisplay Name: ${fullName}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'failed', createStart, { upn }, undefined, msg)
            failedSteps.push('create_user')
            await addTicketNote('M365 User Creation Failed', `UPN: ${upn}\nError: ${msg}`)
          }

          // --- Assign License (only if user was created) ---
          if (newUserId && a.license_type) {
            const licStart = new Date()
            try {
              const sku = await graph.getLicenseSkuByPartNumber(a.license_type)
              if (!sku) {
                throw new Error(`License SKU not found: ${a.license_type}`)
              }
              await graph.assignLicense(newUserId, sku.skuId)
              const licName = sku.displayName ?? sku.skuPartNumber
              provisioningResults.push(`License: ${licName}`)

              await logStep(client, hrRequest.id, 'assign_license', 'Assign License', 'completed', licStart,
                { skuPartNumber: a.license_type }, { skuId: sku.skuId, displayName: licName })
              stepsCompleted.push('assign_license')
              await addTicketNote('License Assigned', `License: ${licName}\nSKU: ${sku.skuPartNumber}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'assign_license', 'Assign License', 'failed', licStart, { skuPartNumber: a.license_type }, undefined, msg)
              failedSteps.push('assign_license')
              await addTicketNote('License Assignment Failed', `SKU: ${a.license_type}\nError: ${msg}`)
            }
          }

          // --- Add to groups (from groups_to_add JSON array) ---
          const groupsAdded: string[] = []
          if (newUserId && a.groups_to_add) {
            let groupIds: string[] = []
            try {
              groupIds = JSON.parse(a.groups_to_add) as string[]
            } catch {
              // Could be a comma-separated string
              groupIds = a.groups_to_add.split(',').map((s) => s.trim()).filter(Boolean)
            }

            for (const groupId of groupIds) {
              const gStart = new Date()
              try {
                await graph.addUserToGroup(groupId, newUserId)
                groupsAdded.push(groupId)
                await logStep(client, hrRequest.id, `add_to_group_${groupId}`, `Add to Group ${groupId}`, 'completed', gStart,
                  { groupId, userId: newUserId }, { added: true })
                stepsCompleted.push(`add_to_group_${groupId}`)
                await addTicketNote('Added to Group', `Group ID: ${groupId}`)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                await logStep(client, hrRequest.id, `add_to_group_${groupId}`, `Add to Group ${groupId}`, 'failed', gStart,
                  { groupId, userId: newUserId }, undefined, msg)
                failedSteps.push(`add_to_group_${groupId}`)
                await addTicketNote('Group Add Failed', `Group ID: ${groupId}\nError: ${msg}`)
              }
            }
            if (groupsAdded.length > 0) {
              provisioningResults.push(`Groups Added: ${groupsAdded.length} group(s)`)
            }
          }

          // --- Clone permissions from another user ---
          let clonedGroups: GraphGroup[] = []
          if (newUserId && a.clone_permissions === 'yes' && a.clone_from_user) {
            const cloneStart = new Date()
            try {
              const sourceUser = await graph.getUserByEmail(a.clone_from_user)
              if (!sourceUser) {
                throw new Error(`Source user not found: ${a.clone_from_user}`)
              }
              const sourceGroups = await graph.getUserGroups(sourceUser.id)
              // Filter to actual groups (not roles)
              const addableGroups = sourceGroups.filter(
                (g) => g.displayName && (g.securityEnabled || g.mailEnabled || (g.groupTypes && g.groupTypes.length > 0))
              )

              let cloneSuccessCount = 0
              for (const sg of addableGroups) {
                try {
                  await graph.addUserToGroup(sg.id, newUserId)
                  cloneSuccessCount++
                  clonedGroups.push(sg)
                } catch {
                  // Non-fatal per group — may already be a member
                }
              }

              provisioningResults.push(`Clone Source: ${a.clone_from_user} (${cloneSuccessCount} groups cloned)`)
              await logStep(client, hrRequest.id, 'clone_permissions', 'Clone User Permissions', 'completed', cloneStart,
                { sourceUser: a.clone_from_user }, { groupsCloned: cloneSuccessCount, total: addableGroups.length })
              stepsCompleted.push('clone_permissions')
              await addTicketNote('Permissions Cloned', `Source: ${a.clone_from_user}\nGroups cloned: ${cloneSuccessCount}/${addableGroups.length}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'clone_permissions', 'Clone User Permissions', 'failed', cloneStart,
                { sourceUser: a.clone_from_user }, undefined, msg)
              failedSteps.push('clone_permissions')
              await addTicketNote('Permission Clone Failed', `Source: ${a.clone_from_user}\nError: ${msg}`)
            }
          }

          // --- Build provisioning results text for ticket ---
          if (primaryActionSucceeded) {
            const resultLines: string[] = [
              '',
              '=== PROVISIONING RESULTS ===',
              `Work Email: ${upn}`,
            ]

            // License info
            if (a.license_type && !failedSteps.includes('assign_license')) {
              // Get friendly name
              let licDisplayName: string = a.license_type
              try {
                const sku = await graph.getLicenseSkuByPartNumber(a.license_type)
                if (sku?.displayName) licDisplayName = sku.displayName
              } catch { /* use raw part number */ }
              resultLines.push(`License: ${licDisplayName}`)
            }

            // Groups added
            const allGroupDescriptions: string[] = []
            // Resolve group names for groups_to_add
            if (groupsAdded.length > 0) {
              for (const gId of groupsAdded) {
                allGroupDescriptions.push(`  - Group ${gId}`)
              }
            }
            // Cloned groups
            for (const cg of clonedGroups) {
              allGroupDescriptions.push(`  - ${describeGroup(cg)}`)
            }
            if (allGroupDescriptions.length > 0) {
              resultLines.push('Groups Added:')
              resultLines.push(...allGroupDescriptions)
            }

            if (a.clone_from_user && !failedSteps.includes('clone_permissions')) {
              resultLines.push(`Clone Source: ${a.clone_from_user} (${clonedGroups.length} groups cloned)`)
            }

            if (failedSteps.length > 0) {
              resultLines.push(`\nFailed Steps: ${failedSteps.join(', ')}`)
              resultLines.push('Status: Completed with errors')
            } else {
              resultLines.push('Status: All actions completed successfully')
            }

            const provisioningResultsText = resultLines.join('\n')

            // PATCH ticket description
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({
                  id: ticketId,
                  description: originalDescription + '\n\n' + provisioningResultsText,
                }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to update ticket description:', err instanceof Error ? err.message : err)
            }

            // Final customer-visible note (publish=1)
            const completionNote = [
              `Employee ${fullName} has been fully provisioned:`,
              '',
              `New Email: ${upn}`,
              a.license_type ? `License: ${a.license_type}` : null,
              allGroupDescriptions.length > 0 ? `Groups/Lists/Sites: ${allGroupDescriptions.length} added` : null,
              '',
              'Temporary password will be shared securely by your TCT technician.',
            ].filter(Boolean).join('\n')

            await addTicketNote('Onboarding Complete', completionNote, 1)

            // Internal-only note with temp password (publish=2)
            await addTicketNote('Temporary Password (INTERNAL)', `UPN: ${upn}\nTemporary Password: ${tempPassword}`, 2)

            // Send email notification
            if (resend) {
              const recipientEmail = hrRequest.submitted_by_email || a.submitted_by_email
              if (recipientEmail) {
                try {
                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: [recipientEmail],
                    subject: `Employee Onboarding Complete — ${fullName}`,
                    text: [
                      `Hi ${hrRequest.submitted_by_name || 'there'},`,
                      '',
                      `The onboarding for ${fullName} has been completed.`,
                      '',
                      `New Email: ${upn}`,
                      a.license_type ? `License Assigned: ${a.license_type}` : null,
                      allGroupDescriptions.length > 0 ? `Groups Added: ${allGroupDescriptions.length}` : null,
                      '',
                      'The temporary password will be shared securely by your TCT technician.',
                      '',
                      `Autotask Ticket: ${ticketNumber}`,
                      '',
                      '—',
                      'Triple Cities Technology',
                    ].filter((l) => l !== null).join('\n'),
                  })
                } catch (err) {
                  console.warn('[hr/process] Email notification failed (non-fatal):', err instanceof Error ? err.message : err)
                }
              }
            } else if (!resend) {
              console.warn('[hr/process] RESEND_API_KEY not set — skipping email notification')
            }

            // Close ticket (status=5)
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({ id: ticketId, status: 5 }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to close ticket:', err instanceof Error ? err.message : err)
            }
          }
        }
      }
    } else {
      // =============================================================
      // OFFBOARDING PIPELINE
      // =============================================================

      const creds = hrRequest.company_slug
        ? await getTenantCredentialsBySlug(hrRequest.company_slug)
        : null

      if (!creds) {
        const msg = `No M365 credentials configured for company slug "${hrRequest.company_slug}"`
        console.error('[hr/process]', msg)
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'failed', new Date(), undefined, undefined, msg)
        failedSteps.push('load_m365_creds')
      } else {
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'completed', new Date(), undefined, { tenantId: creds.tenantId })
        stepsCompleted.push('load_m365_creds')

        const graph = createGraphClient(creds)
        const workEmail = a.work_email ?? a.employee_to_offboard ?? ''

        // Find user
        const findStart = new Date()
        let targetUserId: string | null = null
        let targetUpn: string | null = null
        try {
          const user = await graph.getUserByEmail(workEmail)
          if (!user) throw new Error(`User not found: ${workEmail}`)
          targetUserId = user.id
          targetUpn = user.userPrincipalName
          await logStep(client, hrRequest.id, 'find_user', 'Find User', 'completed', findStart,
            { email: workEmail }, { userId: targetUserId, upn: targetUpn })
          stepsCompleted.push('find_user')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await logStep(client, hrRequest.id, 'find_user', 'Find User', 'failed', findStart,
            { email: workEmail }, undefined, msg)
          failedSteps.push('find_user')
          await addTicketNote('User Lookup Failed', `Email: ${workEmail}\nError: ${msg}`)
        }

        if (targetUserId) {
          // Persist target
          await client.query(
            `UPDATE hr_requests SET target_upn = $2, target_user_id = $3, updated_at = NOW() WHERE id = $1`,
            [hrRequest.id, targetUpn, targetUserId]
          )

          // Revoke sessions if immediate termination
          if (a.account_action === 'immediate_termination' || a.urgency === 'immediate_termination') {
            const revokeStart = new Date()
            try {
              await graph.revokeSignInSessions(targetUserId)
              await logStep(client, hrRequest.id, 'revoke_sessions', 'Revoke All Sessions', 'completed', revokeStart,
                { userId: targetUserId }, { revoked: true })
              stepsCompleted.push('revoke_sessions')
              await addTicketNote('Sessions Revoked', `All active sessions revoked for ${targetUpn}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'revoke_sessions', 'Revoke All Sessions', 'failed', revokeStart,
                { userId: targetUserId }, undefined, msg)
              failedSteps.push('revoke_sessions')
              await addTicketNote('Session Revocation Failed', `Error: ${msg}`)
            }
          }

          // Disable account
          const disableStart = new Date()
          try {
            await graph.disableAccount(targetUserId)
            primaryActionSucceeded = true
            provisioningResults.push(`Account Disabled: ${targetUpn}`)
            await logStep(client, hrRequest.id, 'disable_account', 'Disable Account', 'completed', disableStart,
              { userId: targetUserId }, { disabled: true })
            stepsCompleted.push('disable_account')
            await addTicketNote('Account Disabled', `Account disabled: ${targetUpn}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'disable_account', 'Disable Account', 'failed', disableStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('disable_account')
            await addTicketNote('Account Disable Failed', `Error: ${msg}`)
          }

          // Remove from all groups
          const removeGrpStart = new Date()
          let removedGroupCount = 0
          try {
            const userGroups = await graph.getUserGroups(targetUserId)
            const removableGroups = userGroups.filter(
              (g) => g.displayName && (g.securityEnabled || g.mailEnabled || (g.groupTypes && g.groupTypes.length > 0))
            )

            for (const grp of removableGroups) {
              try {
                await graph.removeUserFromGroup(grp.id, targetUserId)
                removedGroupCount++
              } catch {
                // Non-fatal per group — might be a dynamic group
              }
            }

            provisioningResults.push(`Groups Removed: ${removedGroupCount}/${removableGroups.length}`)
            await logStep(client, hrRequest.id, 'remove_groups', 'Remove from All Groups', 'completed', removeGrpStart,
              { userId: targetUserId }, { removed: removedGroupCount, total: removableGroups.length })
            stepsCompleted.push('remove_groups')
            await addTicketNote('Removed from Groups', `Removed from ${removedGroupCount}/${removableGroups.length} groups`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'remove_groups', 'Remove from All Groups', 'failed', removeGrpStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('remove_groups')
            await addTicketNote('Group Removal Failed', `Error: ${msg}`)
          }

          // Remove licenses
          const removeLicStart = new Date()
          let removedLicenseCount = 0
          try {
            // Get the user's assigned licenses
            const userDetail = await graph.getUserByEmail(workEmail)
            // Need to call Graph directly for license details
            const skus = await graph.getLicenseSkus()
            // Remove each license the tenant has — the API will only remove ones assigned to the user
            for (const sku of skus) {
              try {
                await graph.removeLicense(targetUserId, sku.skuId)
                removedLicenseCount++
              } catch {
                // License wasn't assigned to this user — ignore
              }
            }
            // Suppress unused variable warning
            void userDetail

            provisioningResults.push(`Licenses Removed: ${removedLicenseCount}`)
            await logStep(client, hrRequest.id, 'remove_licenses', 'Remove Licenses', 'completed', removeLicStart,
              { userId: targetUserId }, { removed: removedLicenseCount })
            stepsCompleted.push('remove_licenses')
            await addTicketNote('Licenses Removed', `Removed ${removedLicenseCount} license(s)`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'remove_licenses', 'Remove Licenses', 'failed', removeLicStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('remove_licenses')
            await addTicketNote('License Removal Failed', `Error: ${msg}`)
          }

          // Build provisioning results for ticket
          if (primaryActionSucceeded) {
            const resultLines = [
              '',
              '=== PROVISIONING RESULTS ===',
              `Account: ${targetUpn}`,
              'Action: Account disabled',
              `Groups Removed: ${removedGroupCount}`,
              `Licenses Removed: ${removedLicenseCount}`,
              failedSteps.length > 0 ? `\nFailed Steps: ${failedSteps.join(', ')}` : null,
              failedSteps.length > 0 ? 'Status: Completed with errors' : 'Status: All actions completed successfully',
            ].filter(Boolean).join('\n')

            // PATCH ticket description
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({
                  id: ticketId,
                  description: originalDescription + '\n\n' + resultLines,
                }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to update ticket description:', err instanceof Error ? err.message : err)
            }

            // Final customer-visible note
            const completionNote = [
              `Employee ${fullName} has been offboarded:`,
              '',
              `Account ${targetUpn} has been disabled.`,
              `Removed from ${removedGroupCount} group(s).`,
              `${removedLicenseCount} license(s) removed.`,
              '',
              'All access has been revoked.',
            ].join('\n')

            await addTicketNote('Offboarding Complete', completionNote, 1)

            // Email notification
            if (resend) {
              const recipientEmail = hrRequest.submitted_by_email || a.submitted_by_email
              if (recipientEmail) {
                try {
                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: [recipientEmail],
                    subject: `Employee Offboarding Complete — ${fullName}`,
                    text: [
                      `Hi ${hrRequest.submitted_by_name || 'there'},`,
                      '',
                      `The offboarding for ${fullName} has been completed.`,
                      '',
                      `Account ${targetUpn} has been disabled.`,
                      `Removed from ${removedGroupCount} group(s).`,
                      `${removedLicenseCount} license(s) removed.`,
                      '',
                      `Autotask Ticket: ${ticketNumber}`,
                      '',
                      '—',
                      'Triple Cities Technology',
                    ].join('\n'),
                  })
                } catch (err) {
                  console.warn('[hr/process] Email notification failed (non-fatal):', err instanceof Error ? err.message : err)
                }
              }
            } else {
              console.warn('[hr/process] RESEND_API_KEY not set — skipping email notification')
            }

            // Close ticket
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({ id: ticketId, status: 5 }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to close ticket:', err instanceof Error ? err.message : err)
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // Finalise the request
    // -----------------------------------------------------------------

    const finalStatus = failedSteps.length > 0 && !primaryActionSucceeded ? 'failed' : 'completed'
    const errorMsg = failedSteps.length > 0
      ? `Steps failed: ${failedSteps.join(', ')}`
      : null

    await client.query(
      `UPDATE hr_requests
       SET status = $2,
           completed_at = NOW(),
           error_message = $3,
           resolved_action_plan = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        hrRequest.id,
        finalStatus,
        errorMsg,
        stepsCompleted.length > 0 ? JSON.stringify({ completedActions: stepsCompleted, failedActions: failedSteps }) : null,
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
        finalStatus === 'completed' ? 'request_completed' : 'request_failed',
        `hr_request:${hrRequest.id}`,
        JSON.stringify({
          ticketId,
          ticketNumber,
          stepsCompleted,
          failedSteps,
          primaryActionSucceeded,
        }),
        finalStatus === 'completed' ? 'info' : 'error',
      ]
    )

    return NextResponse.json(
      {
        message: `HR request processed — ${finalStatus}`,
        requestId: hrRequest.id,
        ticketId,
        ticketNumber,
        stepsCompleted,
        failedSteps,
        primaryActionSucceeded,
      },
      { status: 200 }
    )
  } finally {
    client.release()
  }
}
