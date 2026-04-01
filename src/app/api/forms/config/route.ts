import { NextRequest, NextResponse } from 'next/server'
import { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'
import { getTenantCredentialsBySlug, createGraphClient } from '@/lib/graph'

// ---------------------------------------------------------------------------
// Raw pg pool — matches existing HR route convention
// ---------------------------------------------------------------------------

const pool = getPool()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserOption {
  value: string
  label: string
  displayName: string
  givenName?: string
  surname?: string
  userPrincipalName: string
  mail?: string
  department?: string
  jobTitle?: string
}

interface FormQuestion {
  key: string
  type: string
  label: string
  helpText?: string | null
  placeholder?: string | null
  isRequired: boolean
  defaultValue?: string | null
  sortOrder: number
  isEnabled: boolean
  validation?: Record<string, unknown> | null
  staticOptions?: Array<{ value: string; label: string }> | null
  dataSource?: Record<string, unknown> | null
  resolvedOptions?: Array<{ value: string; label: string }> | null
  resolvedUserOptions?: UserOption[] | null
  autoFill?: Record<string, string> | null
  visibilityRules?: Record<string, unknown> | null
  automationKey?: string | null
  dataSourceError?: string | null
}

interface FormSection {
  key: string
  title: string
  description?: string | null
  sortOrder: number
  isEnabled: boolean
  questions: FormQuestion[]
}

interface FormConfig {
  schemaId: string
  type: string
  version: number
  name: string
  description?: string | null
  sections: FormSection[]
}

// ---------------------------------------------------------------------------
// M365 data source resolution
// ---------------------------------------------------------------------------

type GraphClient = ReturnType<typeof createGraphClient>

/** Map M365 SKU part numbers to user-friendly descriptions */
function getLicenseDescription(partNumber: string): string {
  const pn = partNumber.toUpperCase()
  if (pn.includes('BUSINESS_PREMIUM') || pn.includes('SPB')) {
    return 'Full Office apps, email, Teams, advanced security, and device management. Best for: most employees. This is the standard we recommend for almost all customers.'
  }
  if (pn.includes('BUSINESS_STANDARD') || pn === 'O365_BUSINESS_PREMIUM') {
    return 'Desktop Office apps, email, Teams, and webinar hosting. Best for: office workers who need desktop apps but not advanced security.'
  }
  if (pn.includes('BUSINESS_BASIC') || pn === 'O365_BUSINESS_ESSENTIALS') {
    return 'Web-only Office apps, email, Teams, and 1TB OneDrive. Best for: frontline workers, part-time staff, or users who only need web access.'
  }
  if (pn.includes('EXCHANGESTANDARD') || pn.includes('EXCHANGE_S_STANDARD')) {
    return 'Business email only — no Office apps or Teams. Best for: shared mailboxes or users who only need email.'
  }
  if (pn.includes('EXCHANGEENTERPRISE') || pn.includes('EXCHANGE_S_ENTERPRISE')) {
    return 'Business email with advanced compliance, archiving, and legal hold. Best for: compliance-heavy roles.'
  }
  if (pn.includes('ENTERPRISEPACK') || pn === 'SPE_E3') {
    return 'Enterprise-grade Office apps, email, Teams, unlimited OneDrive, and advanced compliance. Best for: larger organizations.'
  }
  if (pn.includes('ENTERPRISEPREMIUM') || pn === 'SPE_E5') {
    return 'Everything in E3 plus advanced analytics, security, and voice capabilities. Best for: executives, security-focused roles.'
  }
  if (pn.includes('FLOW_FREE') || pn.includes('POWER_BI') || pn.includes('TEAMS_EXPLORATORY')) {
    return 'Free add-on license.'
  }
  return 'Contact your account manager at Triple Cities Tech for details on this license.'
}

interface DataSourceResult {
  options: Array<{ value: string; label: string; helpText?: string }>
  error?: string
}

/** Map Graph API error codes/messages to user-friendly permission descriptions */
function classifyGraphError(endpoint: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('insufficient privileges') || lower.includes('authorization_requestdenied') || lower.includes('403')) {
    const permissionMap: Record<string, string> = {
      users: 'User.Read.All',
      devices: 'DeviceManagementManagedDevices.Read.All',
      licenses: 'Organization.Read.All',
      securityGroups: 'Group.Read.All',
      distributionLists: 'Group.Read.All',
      m365Groups: 'Group.Read.All',
      sharepointSites: 'Sites.Read.All',
    }
    const perm = permissionMap[endpoint] || 'required permission'
    return `Missing Graph API permission: ${perm}. Grant this Application permission in the Azure AD app registration and click "Grant admin consent".`
  }

  if (lower.includes('token') || lower.includes('invalid_client') || lower.includes('401')) {
    return 'M365 credentials are invalid or expired. Update the client secret in the tech onboarding wizard.'
  }

  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('network')) {
    return 'Could not reach Microsoft Graph API. This may be a temporary network issue — try refreshing.'
  }

  return `Failed to load data: ${msg.slice(0, 120)}`
}

async function resolveDataSource(
  dataSource: Record<string, unknown>,
  graphClient: GraphClient
): Promise<DataSourceResult> {
  const endpoint = dataSource.endpoint as string
  const valueField = dataSource.valueField as string
  const labelField = dataSource.labelField as string
  const labelSuffix = dataSource.labelSuffix as string | undefined

  try {
    let items: Array<Record<string, unknown>> = []

    switch (endpoint) {
      case 'licenses': {
        const skus = await graphClient.getLicenseSkus()
        // Show all licenses with enabled seats (including fully allocated ones)
        // Exclude free add-ons like FLOW_FREE unless they're the only option
        const FREE_ADDONS = new Set([
          'FLOW_FREE', 'POWERAPPS_VIRAL', 'POWER_BI_STANDARD',
          'MICROSOFT_BUSINESS_CENTER', 'CCIBOTS_PRIVPREV_VIRAL',
          'STREAM', 'WINDOWS_STORE',
        ])
        const paid = skus.filter((sku) => {
          const partNumber = (sku.skuPartNumber ?? '').toUpperCase()
          return sku.prepaidUnits.enabled > 0 && !FREE_ADDONS.has(partNumber)
        })
        // If no paid licenses, fall back to showing all with enabled seats
        const filtered = paid.length > 0 ? paid : skus.filter(s => s.prepaidUnits.enabled > 0)

        return {
          options: filtered.map((sku) => {
            const available = Math.max(0, sku.prepaidUnits.enabled - sku.consumedUnits)
            const total = sku.prepaidUnits.enabled
            const partNumber = (sku.skuPartNumber ?? '').toUpperCase()
            let label = sku.displayName ?? sku.skuPartNumber
            // Show seat count: "Microsoft 365 Business Premium (2 of 50 available)"
            label += ` (${available} of ${total} available)`
            // Add Recommended badge for Business Premium
            if (partNumber.includes('BUSINESS_PREMIUM') || partNumber.includes('SPB')) {
              label += ' — Recommended'
            }
            // License descriptions and role alignment
            const helpText = getLicenseDescription(partNumber)
            return { value: sku[valueField as keyof typeof sku] as string, label, helpText }
          }),
        }
      }
      case 'securityGroups':
        items = (await graphClient.getSecurityGroups()) as unknown as Array<Record<string, unknown>>
        break
      case 'distributionLists':
        items = (await graphClient.getDistributionLists()) as unknown as Array<Record<string, unknown>>
        break
      case 'm365Groups':
        items = (await graphClient.getM365Groups()) as unknown as Array<Record<string, unknown>>
        break
      case 'sharepointSites':
        items = (await graphClient.getSharePointSites()) as unknown as Array<Record<string, unknown>>
        break
      case 'users':
        items = (await graphClient.getUsers()) as unknown as Array<Record<string, unknown>>
        break
      case 'devices':
        items = (await graphClient.getManagedDevices()) as unknown as Array<Record<string, unknown>>
        break
      default:
        console.warn(`[forms/config] Unknown data source endpoint: ${endpoint}`)
        return []
    }

    return {
      options: items.map((item) => {
        let label = String(item[labelField] ?? '')
        if (labelSuffix) {
          let suffix = labelSuffix
          // Replace template vars like {userPrincipalName} with actual values
          suffix = suffix.replace(/\{(\w+)\}/g, (_, field) => String(item[field] ?? ''))
          label += ' ' + suffix
        }
        return { value: String(item[valueField] ?? ''), label }
      }),
    }
  } catch (err) {
    const errorMsg = classifyGraphError(endpoint, err)
    console.error(`[forms/config] Failed to resolve data source "${endpoint}":`, err)
    return { options: [], error: errorMsg }
  }
}

interface UserDataSourceResult {
  users: UserOption[]
  error?: string
}

/** Resolve users data source with full user properties for user_select fields */
async function resolveUserDataSource(
  dataSource: Record<string, unknown>,
  graphClient: GraphClient
): Promise<UserDataSourceResult> {
  const labelField = dataSource.labelField as string
  const labelSuffix = dataSource.labelSuffix as string | undefined

  try {
    const users = await graphClient.getUsers()
    return {
      users: users.map((u) => {
        let label = String((u as unknown as Record<string, unknown>)[labelField] ?? '')
        if (labelSuffix) {
          let suffix = labelSuffix
          suffix = suffix.replace(/\{(\w+)\}/g, (_, field) => String((u as unknown as Record<string, unknown>)[field] ?? ''))
          label += ' ' + suffix
        }
        return {
          value: u.userPrincipalName,
          label,
          displayName: u.displayName,
          givenName: u.givenName ?? undefined,
          surname: u.surname ?? undefined,
          userPrincipalName: u.userPrincipalName,
          mail: u.mail ?? undefined,
          department: u.department ?? undefined,
          jobTitle: u.jobTitle ?? undefined,
        }
      }),
    }
  } catch (err) {
    const errorMsg = classifyGraphError('users', err)
    console.error('[forms/config] Failed to resolve user data source:', err)
    return { users: [], error: errorMsg }
  }
}

// ---------------------------------------------------------------------------
// Merge algorithm
// ---------------------------------------------------------------------------

interface SectionOverride {
  sectionKey: string
  hidden?: boolean
  sortOrder?: number
  titleOverride?: string
}

interface QuestionOverride {
  questionKey: string
  hidden?: boolean
  labelOverride?: string
  helpTextOverride?: string
  requiredOverride?: boolean
  defaultOverride?: string
}

function mergeSections(
  globalSections: FormSection[],
  sectionOverrides: SectionOverride[],
  questionOverrides: QuestionOverride[],
  customQuestions: Array<FormQuestion & { sectionKey: string }>,
  customSections: FormSection[]
): FormSection[] {
  // Filter hidden sections, apply overrides
  const merged = globalSections
    .filter((s) => {
      const override = sectionOverrides.find((o) => o.sectionKey === s.key)
      return !(override?.hidden)
    })
    .map((s) => {
      const override = sectionOverrides.find((o) => o.sectionKey === s.key)

      // Filter hidden questions, apply question overrides
      const questions = s.questions
        .filter((q) => {
          const qOverride = questionOverrides.find((o) => o.questionKey === q.key)
          return !(qOverride?.hidden)
        })
        .map((q) => {
          const qOverride = questionOverrides.find((o) => o.questionKey === q.key)
          if (!qOverride) return q
          return {
            ...q,
            label: qOverride.labelOverride ?? q.label,
            helpText: qOverride.helpTextOverride ?? q.helpText,
            isRequired: qOverride.requiredOverride ?? q.isRequired,
            defaultValue: qOverride.defaultOverride ?? q.defaultValue,
          }
        })
        // Append custom questions for this section
        .concat(customQuestions.filter((cq) => cq.sectionKey === s.key))
        .sort((a, b) => a.sortOrder - b.sortOrder)

      return {
        ...s,
        title: override?.titleOverride ?? s.title,
        sortOrder: override?.sortOrder ?? s.sortOrder,
        questions,
      }
    })
    // Append custom sections
    .concat(customSections)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return merged
}

// ---------------------------------------------------------------------------
// Idempotent schema migrations (run on every request)
// Each migration checks whether it has already run before making changes.
// ---------------------------------------------------------------------------

/** Idempotent migration: replace first_name/last_name/work_email with user_select in offboarding */
async function migrateOffboardingUserSelect(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'offboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  // Always clean up legacy first_name/last_name/work_email questions even if user_select exists
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key IN ('first_name', 'last_name', 'work_email')`,
    [schemaId]
  )

  const existing = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'employee_to_offboard' LIMIT 1`,
    [schemaId]
  )
  if (existing.rows.length > 0) return

  console.log('[forms/config] Running migration: offboarding user_select')

  const sectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'employee_details' LIMIT 1`,
    [schemaId]
  )
  if (sectionRes.rows.length === 0) return
  const sectionId = sectionRes.rows[0].id

  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key IN ('first_name', 'last_name', 'work_email')`,
    [schemaId]
  )

  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, data_source)
     VALUES ($1, $2, 'employee_to_offboard', 'user_select', 'Select Employee',
       'Search by name or email to find the employee being offboarded. Their account details will be auto-filled.',
       true, 0, $3::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      sectionId,
      schemaId,
      JSON.stringify({
        endpoint: 'users',
        valueField: 'userPrincipalName',
        labelField: 'displayName',
        labelSuffix: '({userPrincipalName})',
        cacheTtl: 300,
        autoFill: {
          first_name: 'givenName',
          last_name: 'surname',
          work_email: 'userPrincipalName',
        },
      }),
    ]
  )

  await client.query(
    `UPDATE form_questions SET sort_order = 1, help_text = 'If today or in the past, all offboarding actions will execute immediately. If set to a future date, a ticket will be created now but all access removal actions will execute automatically at 12:01 AM EST on this date.' WHERE schema_id = $1 AND key = 'last_day'`,
    [schemaId]
  )

  // Update urgency_type options and help text to explain scheduling behavior
  await client.query(
    `UPDATE form_questions
     SET help_text = 'Immediate termination executes all actions right now regardless of last working day. Other options follow the scheduled date.',
         static_options = $2::jsonb
     WHERE schema_id = $1 AND key = 'urgency_type'`,
    [
      schemaId,
      JSON.stringify([
        { value: 'immediate_termination', label: 'Immediate Termination — block access and remove everything now' },
        { value: 'standard', label: 'Standard — actions will execute on the last working day at 12:01 AM EST' },
        { value: 'planned_departure', label: 'Planned Departure — employee is aware, actions execute on last working day' },
      ]),
    ]
  )

  console.log('[forms/config] Migration complete: offboarding user_select')
}

/** Idempotent migration: redesign offboarding Steps 3-4 for better UX flow */
async function migrateOffboardingSteps34(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'offboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  // Check if migration already ran (shared_mailbox_access question exists)
  const alreadyDone = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'shared_mailbox_access' LIMIT 1`,
    [schemaId]
  )
  if (alreadyDone.rows.length > 0) return

  console.log('[forms/config] Running migration: offboarding Steps 3-4 redesign')

  // --- Step 3: data_handling section ---
  const dataHandlingSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'data_handling' LIMIT 1`,
    [schemaId]
  )
  if (dataHandlingSectionRes.rows.length === 0) return
  const dataHandlingSectionId = dataHandlingSectionRes.rows[0].id

  // Update data_handling options (keep original labels, no price details)
  await client.query(
    `UPDATE form_questions
     SET static_options = $2::jsonb
     WHERE schema_id = $1 AND key = 'data_handling'`,
    [
      schemaId,
      JSON.stringify([
        { value: 'keep_accessible', label: 'Convert to shared mailbox — keep accessible' },
        { value: 'forward_to_manager', label: 'Forward email to their manager' },
        { value: 'forward_to_specific', label: 'Forward email to a specific person' },
        { value: 'delete_after_30', label: 'Delete account after 30-day hold' },
      ]),
    ]
  )

  // Add shared_mailbox_access (multi-select of users, visible when keep_accessible)
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, data_source, visibility_rules)
     VALUES ($1, $2, 'shared_mailbox_access', 'multi_select', 'Who should have access to the shared mailbox?',
       'Select one or more people who will be able to read and send from this mailbox.',
       false, 2, $3::jsonb, $4::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      dataHandlingSectionId,
      schemaId,
      JSON.stringify({
        endpoint: 'users',
        valueField: 'userPrincipalName',
        labelField: 'displayName',
        cacheTtl: 300,
      }),
      JSON.stringify({
        operator: 'and',
        conditions: [{ field: 'data_handling', op: 'eq', value: 'keep_accessible' }],
      }),
    ]
  )

  // --- Step 4: access_transfer section — restructure ---
  const accessTransferSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'access_transfer' LIMIT 1`,
    [schemaId]
  )
  if (accessTransferSectionRes.rows.length === 0) return
  const accessTransferSectionId = accessTransferSectionRes.rows[0].id

  // Remove delegate_access_to (redundant — shared mailbox access covers it)
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'delegate_access_to'`,
    [schemaId]
  )

  // Remove onedrive_archive (being merged into file_handling)
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'onedrive_archive'`,
    [schemaId]
  )

  // Replace transfer_onedrive_to with file_handling radio
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'transfer_onedrive_to'`,
    [schemaId]
  )

  // Add file_handling radio (exclusive choice)
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
     VALUES ($1, $2, 'file_handling', 'radio', 'OneDrive File Handling',
       'Choose what happens to the departing employee''s OneDrive files.',
       true, 0, $3::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      accessTransferSectionId,
      schemaId,
      JSON.stringify([
        { value: 'transfer_to_user', label: 'Transfer files to another employee', helpText: 'Instant — the selected person will receive an email with a link to access the files. No files are moved or copied.' },
        { value: 'archive_to_sharepoint', label: 'Archive files to SharePoint', helpText: 'Files will be copied to an HR SharePoint site. This may take time for large file sets and will be reviewed by TCT staff.' },
        { value: 'no_action', label: 'No file transfer needed', helpText: 'Files will remain in the account during the 30-day hold period, then be deleted.' },
      ]),
    ]
  )

  // Always update file_handling options (in case question already existed from prior migration run)
  await client.query(
    `UPDATE form_questions SET static_options = $2::jsonb
     WHERE schema_id = $1 AND key = 'file_handling'`,
    [
      schemaId,
      JSON.stringify([
        { value: 'transfer_to_user', label: 'Transfer files to another employee', helpText: 'Instant — the selected person will receive an email with a link to access the files. No files are moved or copied.' },
        { value: 'archive_to_sharepoint', label: 'Archive files to SharePoint', helpText: 'Files will be copied to an HR SharePoint site. This may take time for large file sets and will be reviewed by TCT staff.' },
        { value: 'no_action', label: 'No file transfer needed', helpText: 'Files will remain in the account during the 30-day hold period, then be deleted.' },
      ]),
    ]
  )

  // Add transfer_files_to user select (visible when transfer_to_user)
  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, sort_order, data_source, visibility_rules)
     VALUES ($1, $2, 'transfer_files_to', 'select', 'Transfer files to',
       'This person will be notified by email with instructions to access the files.',
       1, $3::jsonb, $4::jsonb)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [
      accessTransferSectionId,
      schemaId,
      JSON.stringify({
        endpoint: 'users',
        valueField: 'userPrincipalName',
        labelField: 'displayName',
        cacheTtl: 300,
      }),
      JSON.stringify({
        operator: 'and',
        conditions: [{ field: 'file_handling', op: 'eq', value: 'transfer_to_user' }],
      }),
    ]
  )

  // Move remove_from_groups to sort_order 2
  await client.query(
    `UPDATE form_questions SET sort_order = 2 WHERE schema_id = $1 AND key = 'remove_from_groups'`,
    [schemaId]
  )

  // Update section description
  await client.query(
    `UPDATE form_sections SET title = 'Files & Group Access', description = 'Handle the employee''s files and group memberships'
     WHERE id = $1`,
    [accessTransferSectionId]
  )

  console.log('[forms/config] Migration complete: offboarding Steps 3-4 redesign')
}

/** Idempotent migration: add credential_delivery, work_country, desired_username, billing_ack, merge sections, help text */
async function migrateOnboardingQuestions(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'onboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  // --- Phase A: Add work_country (multi_select), work_location_detail, replace work_location ---
  const countryExists = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'work_country' LIMIT 1`,
    [schemaId]
  )

  const empSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'employee_details' LIMIT 1`,
    [schemaId]
  )
  if (empSectionRes.rows.length === 0) return
  const empSectionId = empSectionRes.rows[0].id

  if (countryExists.rows.length === 0) {
    console.log('[forms/config] Running migration: onboarding work_country + work_location_detail')
    await client.query(
      `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'work_location'`,
      [schemaId]
    )

    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
       VALUES ($1, $2, 'work_country', 'multi_select', 'Work Countries',
         'Select ALL countries where this employee will work. The first country selected will be set as the primary usageLocation in Microsoft 365 (affects licensing and compliance).',
         true, 5, $3::jsonb)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [
        empSectionId,
        schemaId,
        JSON.stringify([
          { value: 'US', label: 'United States' },
          { value: 'BR', label: 'Brazil' },
          { value: 'CA', label: 'Canada' },
          { value: 'GB', label: 'United Kingdom' },
          { value: 'DE', label: 'Germany' },
          { value: 'FR', label: 'France' },
          { value: 'AU', label: 'Australia' },
          { value: 'IN', label: 'India' },
          { value: 'MX', label: 'Mexico' },
          { value: 'JP', label: 'Japan' },
          { value: 'PH', label: 'Philippines' },
          { value: 'CO', label: 'Colombia' },
          { value: 'AR', label: 'Argentina' },
          { value: 'CL', label: 'Chile' },
          { value: 'OTHER', label: 'Other (specify in notes)' },
        ]),
      ]
    )

    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order)
       VALUES ($1, $2, 'work_location_detail', 'text', 'City / State / Office Location',
         'Helps us configure time zone defaults and local compliance settings.',
         'e.g. Binghamton, NY / São Paulo / Remote', 6)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [empSectionId, schemaId]
    )
  } else {
    // Upgrade existing work_country from select to multi_select if needed
    await client.query(
      `UPDATE form_questions SET type = 'multi_select', label = 'Work Countries',
       help_text = 'Select ALL countries where this employee will work. The first country selected will be set as the primary usageLocation in Microsoft 365 (affects licensing and compliance).'
       WHERE schema_id = $1 AND key = 'work_country' AND type = 'select'`,
      [schemaId]
    )
  }

  // --- Phase B: Add desired_username field ---
  const usernameExists = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'desired_username' LIMIT 1`,
    [schemaId]
  )
  if (usernameExists.rows.length === 0) {
    console.log('[forms/config] Running migration: onboarding desired_username')
    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, sort_order)
       VALUES ($1, $2, 'desired_username', 'text', 'Desired Username (optional)',
         'If you have a preferred username for this employee, enter it here. Otherwise we will generate one as firstname.lastname@yourdomain.com.',
         'e.g. jsmith or jane.smith', 9)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [empSectionId, schemaId]
    )
  }

  // --- Phase C: Update help text on existing fields ---
  await client.query(
    `UPDATE form_questions SET help_text = 'Legal first name as it should appear in the company directory and email address.'
     WHERE schema_id = $1 AND key = 'first_name' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Legal last name as it should appear in the company directory and email address.'
     WHERE schema_id = $1 AND key = 'last_name' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'If set to today or a past date, the account will be created and ready immediately. If set to a future date, the account will be created now but LOCKED — it will be automatically unlocked at 12:01 AM EST on this date. Login credentials will be shared in advance so the employee is ready on day one.'
     WHERE schema_id = $1 AND key = 'start_date'`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Used to set the user''s title in Microsoft 365 and the company directory.'
     WHERE schema_id = $1 AND key = 'job_title' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Used to organize users in the company directory. Must match an existing department name if applicable.'
     WHERE schema_id = $1 AND key = 'department' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'We will send the new employee''s login credentials and setup instructions to this address.'
     WHERE schema_id = $1 AND key = 'personal_email'`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Optional — we may call to coordinate account setup or verify identity.'
     WHERE schema_id = $1 AND key = 'phone' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )

  // --- Phase D: Merge access_profile and m365_license sections into role_and_license ---
  const mergedSectionExists = await client.query(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'role_and_license' LIMIT 1`,
    [schemaId]
  )
  if (mergedSectionExists.rows.length === 0) {
    console.log('[forms/config] Running migration: merge access_profile + m365_license → role_and_license')

    // Create the merged section
    await client.query(
      `INSERT INTO form_sections (schema_id, key, title, description, sort_order)
       VALUES ($1, 'role_and_license', 'Role & License', 'What kind of access does this employee need, and which Microsoft 365 license should they receive?', 1)`,
      [schemaId]
    )

    const newSectionRes = await client.query<{ id: string }>(
      `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'role_and_license' LIMIT 1`,
      [schemaId]
    )
    if (newSectionRes.rows.length > 0) {
      const newSectionId = newSectionRes.rows[0].id

      // Move questions from access_profile section
      const apSectionRes = await client.query<{ id: string }>(
        `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'access_profile' LIMIT 1`,
        [schemaId]
      )
      if (apSectionRes.rows.length > 0) {
        await client.query(
          `UPDATE form_questions SET section_id = $1, sort_order = 0,
           help_text = 'This determines the default set of groups and permissions the employee receives. You can customize further in the Access & Permissions step.'
           WHERE schema_id = $2 AND key = 'access_profile'`,
          [newSectionId, schemaId]
        )
        // Disable old section
        await client.query(
          `UPDATE form_sections SET is_enabled = false WHERE schema_id = $1 AND key = 'access_profile'`,
          [schemaId]
        )
      }

      // Move questions from m365_license section
      const licSectionRes = await client.query<{ id: string }>(
        `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'm365_license' LIMIT 1`,
        [schemaId]
      )
      if (licSectionRes.rows.length > 0) {
        await client.query(
          `UPDATE form_questions SET section_id = $1, sort_order = 1,
           help_text = 'Each license has a monthly cost. Choose the license that matches the employee''s needs. Available counts are shown next to each option.'
           WHERE schema_id = $2 AND key = 'license_type'`,
          [newSectionId, schemaId]
        )
        // Disable old section
        await client.query(
          `UPDATE form_sections SET is_enabled = false WHERE schema_id = $1 AND key = 'm365_license'`,
          [schemaId]
        )
      }

      // Re-number remaining sections
      await client.query(
        `UPDATE form_sections SET sort_order = 2 WHERE schema_id = $1 AND key = 'access_permissions'`,
        [schemaId]
      )
      await client.query(
        `UPDATE form_sections SET sort_order = 3 WHERE schema_id = $1 AND key = 'special_instructions'`,
        [schemaId]
      )
    }
  }

  // --- Phase E: Update help text on access_permissions questions ---
  await client.query(
    `UPDATE form_questions SET help_text = 'Security groups control access to shared resources like file shares, printers, and internal applications.'
     WHERE schema_id = $1 AND key = 'security_groups' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Distribution lists are email groups. Members receive all messages sent to the list address.'
     WHERE schema_id = $1 AND key = 'distribution_lists' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Microsoft Teams channels for collaboration. The employee will be added as a member of each selected team.'
     WHERE schema_id = $1 AND key = 'teams_groups' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'SharePoint sites the employee needs access to for document collaboration.'
     WHERE schema_id = $1 AND key = 'sharepoint_sites' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET help_text = 'Cloning copies all group memberships from an existing user — useful when the new employee has a similar role.'
     WHERE schema_id = $1 AND key = 'clone_permissions' AND (help_text IS NULL OR help_text = '')`,
    [schemaId]
  )

  // --- Phase F: Add credential_delivery to special_instructions ---
  const specialSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'special_instructions' LIMIT 1`,
    [schemaId]
  )
  if (specialSectionRes.rows.length === 0) return
  const specialSectionId = specialSectionRes.rows[0].id

  const credExisting = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'credential_delivery' LIMIT 1`,
    [schemaId]
  )
  if (credExisting.rows.length === 0) {
    console.log('[forms/config] Running migration: onboarding credential_delivery')
    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
       VALUES ($1, $2, 'credential_delivery', 'radio',
         'Where should we send the new account login information?',
         'The new employee''s username, temporary password, and setup instructions will be sent to the selected recipient. Choose carefully — this email will contain sensitive credentials.',
         true, 0, $3::jsonb)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [
        specialSectionId,
        schemaId,
        JSON.stringify([
          { value: 'submitter', label: "Send to me (I'll share with the employee)" },
          { value: 'personal_email', label: "Send directly to the employee's personal email" },
        ]),
      ]
    )
  }

  // --- Phase G: Add billing acknowledgment checkbox ---
  const billingExists = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'billing_acknowledgment' LIMIT 1`,
    [schemaId]
  )
  if (billingExists.rows.length === 0) {
    console.log('[forms/config] Running migration: onboarding billing_acknowledgment')
    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order)
       VALUES ($1, $2, 'billing_acknowledgment', 'checkbox',
         'I understand that adding a Microsoft 365 license may result in additional monthly charges on our next invoice.',
         'Reach out to your account manager at Triple Cities Tech for more details on licensing costs.',
         true, 1)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [specialSectionId, schemaId]
    )
  }
  // Always update billing text to latest wording
  await client.query(
    `UPDATE form_questions SET
       label = 'I understand that adding a Microsoft 365 license may result in additional monthly charges on our next invoice.',
       help_text = 'Reach out to your account manager at Triple Cities Tech for more details on licensing costs.'
     WHERE schema_id = $1 AND key = 'billing_acknowledgment'`,
    [schemaId]
  )

  // Ensure additional_notes is last in special_instructions
  await client.query(
    `UPDATE form_questions SET sort_order = 2,
     help_text = 'Include any special software needs, VPN access requirements, building access badges, equipment requests, or anything else we should know.'
     WHERE schema_id = $1 AND key = 'additional_notes' AND section_id = $2`,
    [schemaId, specialSectionId]
  )

  // --- Phase H: Update sort orders for personal_email and phone ---
  await client.query(
    `UPDATE form_questions SET sort_order = 7 WHERE schema_id = $1 AND key = 'personal_email'`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET sort_order = 8 WHERE schema_id = $1 AND key = 'phone'`,
    [schemaId]
  )

  // --- Phase I: Remove static access_profile, make dynamic license picker primary ---
  // The static "Access Profile" radio (Standard Office Worker, Power User, etc.) doesn't
  // reflect the tenant's actual licenses. Replace with the dynamic license_type picker
  // which fetches real SKUs from the tenant's Graph API.

  // Delete the static access_profile question if it still exists (idempotent)
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'access_profile'`,
    [schemaId]
  )

  // Find the license step section — could be role_and_license (from Phase D) or account_setup
  const licenseSectionRes = await client.query<{ id: string; key: string }>(
    `SELECT id, key FROM form_sections
     WHERE schema_id = $1 AND key IN ('role_and_license', 'account_setup') AND is_enabled = true
     ORDER BY CASE WHEN key = 'role_and_license' THEN 0 ELSE 1 END
     LIMIT 1`,
    [schemaId]
  )
  if (licenseSectionRes.rows.length > 0) {
    const licSectionId = licenseSectionRes.rows[0].id

    // Update section title/description to reflect that it's now just the license picker
    await client.query(
      `UPDATE form_sections SET title = 'Microsoft 365 License',
       description = 'Which Microsoft 365 license should this employee receive?'
       WHERE id = $1`,
      [licSectionId]
    )

    // Move the license_type question into this section if it isn't already,
    // and make it sort_order 0 (primary question). Use radio type for descriptions.
    // Hide it when clone_permissions === 'yes' — license will be copied from the source user.
    await client.query(
      `UPDATE form_questions SET section_id = $1, sort_order = 0,
       type = 'radio',
       label = 'License Type',
       help_text = 'Only licenses with available seats on your tenant are shown.',
       is_required = false,
       visibility_rules = $3::jsonb
       WHERE schema_id = $2 AND key = 'license_type'`,
      [licSectionId, schemaId, JSON.stringify({
        operator: 'and',
        conditions: [{ field: 'clone_permissions', op: 'neq', value: 'yes' }],
      })]
    )

    // Move clone_permissions and clone_from_user into this section (Step 2)
    // so users are asked about cloning before selecting individual groups
    await client.query(
      `UPDATE form_questions SET section_id = $1, sort_order = -2
       WHERE schema_id = $2 AND key = 'clone_permissions'`,
      [licSectionId, schemaId]
    )
    await client.query(
      `UPDATE form_questions SET section_id = $1, sort_order = -1
       WHERE schema_id = $2 AND key = 'clone_from_user'`,
      [licSectionId, schemaId]
    )

    // Update the section title/description to reflect the combined step
    await client.query(
      `UPDATE form_sections SET title = 'Microsoft 365 Setup',
       description = 'Configure the new employee''s Microsoft 365 account — clone an existing user or select a license manually.'
       WHERE id = $1`,
      [licSectionId]
    )
  }
}

/** Idempotent migration: offboarding UX improvements
 *  - Remove remove_from_groups question (always done automatically)
 *  - Remove "Remote wipe" from device_handling options
 *  - Remove wipe_confirmation question
 *  - Update file_handling archive option to clarify copy behavior + HR site + folder naming
 *  - Update additional_notes to ask about other systems/websites access
 *  - Update access_transfer section title
 */
async function migrateOffboardingUXImprovements(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'offboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  // Check if migration already ran: remove_from_groups should be gone
  const alreadyDone = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'offboarding_ux_v2_done' LIMIT 1`,
    [schemaId]
  )
  // Use a sentinel approach: check if remove_from_groups still exists
  const rfgExists = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'remove_from_groups' LIMIT 1`,
    [schemaId]
  )
  if (rfgExists.rows.length === 0 && alreadyDone.rows.length === 0) {
    // Already migrated via a previous run — skip
    return
  }

  console.log('[forms/config] Running migration: offboarding UX improvements')

  // 1. Remove remove_from_groups (groups are always removed automatically)
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'remove_from_groups'`,
    [schemaId]
  )

  // 2. Update device_handling: remove "Remote wipe" option, keep others
  await client.query(
    `UPDATE form_questions SET static_options = $2::jsonb
     WHERE schema_id = $1 AND key = 'device_handling'`,
    [
      schemaId,
      JSON.stringify([
        { value: 'return_to_office', label: 'Return devices to the office', helpText: 'Employee will return all company-owned devices to the office. Our team will collect and re-image them.' },
        { value: 'ship_to_tct', label: 'Ship devices to Triple Cities Tech', helpText: 'We will coordinate shipping for the devices to be returned and re-imaged.' },
        { value: 'no_company_devices', label: 'No company-managed devices', helpText: 'Employee does not have any company-owned devices to return.' },
      ]),
    ]
  )

  // 3. Remove wipe_confirmation question
  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'wipe_confirmation'`,
    [schemaId]
  )

  // 4. Update file_handling archive_to_sharepoint option to clarify copy + HR site + folder naming
  await client.query(
    `UPDATE form_questions SET static_options = $2::jsonb
     WHERE schema_id = $1 AND key = 'file_handling'`,
    [
      schemaId,
      JSON.stringify([
        { value: 'transfer_to_user', label: 'Transfer files to another employee', helpText: 'Instant — the selected person will receive an email with a link to access the files. No files are moved or copied.' },
        { value: 'archive_to_sharepoint', label: 'Copy files to SharePoint for safekeeping', helpText: 'Files will be COPIED (not moved) to your company\'s HR SharePoint site in a folder named "[Employee Name] — Offboarding [Date]". The original files remain in the user\'s OneDrive during the 30-day retention period. The HR site URL will be shown in your confirmation summary.' },
        { value: 'no_action', label: 'No file transfer needed', helpText: 'Files will remain in the account during the 30-day hold period, then be deleted.' },
      ]),
    ]
  )

  // 5. Update additional_notes to ask about other systems access
  await client.query(
    `UPDATE form_questions SET
       label = 'Additional Notes & Other Systems',
       help_text = 'Are there any other systems, websites, or applications that we manage or have access to that should be revoked? For example: Salesforce, UPS WorldShip, QuickBooks, vendor portals, etc. Include any other instructions or context for our team.',
       placeholder = 'e.g. Please remove access to Salesforce, UPS WorldShip, and the company VPN. Also revoke their badge access if possible.'
     WHERE schema_id = $1 AND key = 'additional_notes'`,
    [schemaId]
  )

  // 6. Update access_transfer section title since groups question is removed
  await client.query(
    `UPDATE form_sections SET title = 'File Handling', description = 'What should happen to the departing employee''s files?'
     WHERE schema_id = $1 AND key = 'access_transfer'`,
    [schemaId]
  )

  console.log('[forms/config] Migration complete: offboarding UX improvements')
}

/** Idempotent migration: V2 form refinements
 *  ONBOARDING:
 *  - Rename work_location_detail to "Work Location (Home / Office)"
 *  - Update license help text for non-technical users
 *  - Rename distribution_lists label to "Email Distribution Lists"
 *  - Simplify computer section: remove hardware specs, add "New computer required" simple option
 *  - Fix computer_situation conditional cleanup
 *  OFFBOARDING:
 *  - Clarify OneDrive: "Provide access to another employee" (not transfer)
 *  - Add 30-day deletion note to file handling
 *  - Clarify SharePoint: files are copied, not moved
 *  - Fix grammar on hold period text
 */
async function migrateFormRefinementsV2(client: PoolClient): Promise<void> {
  // --- ONBOARDING REFINEMENTS ---
  const onSchemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'onboarding' AND status = 'published' LIMIT 1`
  )
  if (onSchemaRes.rows.length > 0) {
    const schemaId = onSchemaRes.rows[0].id

    // Sentinel: check if already ran
    const sentinel = await client.query(
      `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'work_location_detail' AND label = 'Work Location (Home / Office)' LIMIT 1`,
      [schemaId]
    )
    if (sentinel.rows.length === 0) {
      console.log('[forms/config] Running migration: form refinements V2')

      // 1. Rename work_location_detail
      await client.query(
        `UPDATE form_questions SET
           label = 'Work Location (Home / Office)',
           help_text = 'Where will this employee primarily work? This helps us configure their setup appropriately.',
           placeholder = 'e.g. Home / Main Office / Binghamton, NY'
         WHERE schema_id = $1 AND key = 'work_location_detail'`,
        [schemaId]
      )

      // 2. Update license help text for non-technical users
      await client.query(
        `UPDATE form_questions SET
           help_text = 'Choose the license that best fits this employee''s role. If you''re unsure, select the option closest to their needs and our team will confirm.'
         WHERE schema_id = $1 AND key = 'license_type'`,
        [schemaId]
      )

      // 3. Rename distribution_lists label
      await client.query(
        `UPDATE form_questions SET
           label = 'Email Distribution Lists',
           help_text = 'Email distribution lists send messages to all members. Select any lists this employee should receive emails from.'
         WHERE schema_id = $1 AND key = 'distribution_lists'`,
        [schemaId]
      )

      // 4. Update security_groups help text (simpler)
      await client.query(
        `UPDATE form_questions SET
           help_text = 'Security groups control access to shared files, folders, and applications. Select any groups this employee needs.'
         WHERE schema_id = $1 AND key = 'security_groups'`,
        [schemaId]
      )

      // 5. Update teams_groups help text (simpler)
      await client.query(
        `UPDATE form_questions SET
           help_text = 'Microsoft Teams channels for group messaging and collaboration.'
         WHERE schema_id = $1 AND key = 'teams_groups'`,
        [schemaId]
      )

      // 6. Simplify computer section: update computer_situation options
      await client.query(
        `UPDATE form_questions SET
           label = 'Computer Setup',
           help_text = 'Does this employee need a new computer, or will they use an existing one?',
           static_options = $2::jsonb
         WHERE schema_id = $1 AND key = 'computer_situation'`,
        [
          schemaId,
          JSON.stringify([
            { value: 'existing_company', label: 'Use an existing company computer' },
            { value: 'new_computer', label: 'New computer required', helpText: 'A member from our Sales team will be notified and will reach out to collect more details.' },
            { value: 'personal_byod', label: 'Employee will use their own computer (work from home)' },
            { value: 'none', label: 'No computer needed' },
          ]),
        ]
      )

      // 7. Update existing_device: prefer hostname, add "I don't know" option, add help text
      await client.query(
        `UPDATE form_questions SET
           label = 'Which computer will they use?',
           help_text = 'Select the computer by its name. You can find the computer name in Settings > System > About on the device. If you''re unsure, select "I don''t know" and we''ll help identify it.'
         WHERE schema_id = $1 AND key = 'existing_device'`,
        [schemaId]
      )

      // 8. Remove detailed hardware selection (new_computer_type, computer_spec)
      await client.query(
        `DELETE FROM form_questions WHERE schema_id = $1 AND key IN ('new_computer_type', 'computer_spec')`,
        [schemaId]
      )
    }

    // --- Always-run: update computer_situation to include Sales team note ---
    await client.query(
      `UPDATE form_questions SET
         static_options = $2::jsonb
       WHERE schema_id = $1 AND key = 'computer_situation'`,
      [
        schemaId,
        JSON.stringify([
          { value: 'existing_company', label: 'Use an existing company computer' },
          { value: 'new_computer', label: 'New computer required', helpText: 'A member from our Sales team will be notified and will reach out to collect more details.' },
          { value: 'personal_byod', label: 'Employee will use their own computer (work from home)' },
          { value: 'none', label: 'No computer needed' },
        ]),
      ]
    )

    // --- Always-run cleanup: remove legacy work_location if it still exists ---
    await client.query(
      `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'work_location'`,
      [schemaId]
    )

    // --- Convert work_location_detail from text to select with Home/Office options ---
    await client.query(
      `UPDATE form_questions SET
         type = 'select',
         label = 'Work Location',
         help_text = 'Where will this employee primarily work?',
         placeholder = 'Select a work location...',
         static_options = $2::jsonb
       WHERE schema_id = $1 AND key = 'work_location_detail'`,
      [
        schemaId,
        JSON.stringify([
          { value: 'office', label: 'Office' },
          { value: 'home', label: 'Home (Remote)' },
          { value: 'hybrid', label: 'Hybrid (Office + Home)' },
          { value: 'field', label: 'Field / On-site at client locations' },
        ]),
      ]
    )
  }

  // --- OFFBOARDING REFINEMENTS ---
  const offSchemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'offboarding' AND status = 'published' LIMIT 1`
  )
  if (offSchemaRes.rows.length > 0) {
    const schemaId = offSchemaRes.rows[0].id

    // Sentinel
    const sentinel = await client.query(
      `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'file_handling' AND static_options::text LIKE '%Provide access to another employee%' LIMIT 1`,
      [schemaId]
    )
    if (sentinel.rows.length === 0) {
      console.log('[forms/config] Running migration: offboarding refinements V2')

      // 1. Update file_handling options with correct wording
      await client.query(
        `UPDATE form_questions SET static_options = $2::jsonb
         WHERE schema_id = $1 AND key = 'file_handling'`,
        [
          schemaId,
          JSON.stringify([
            {
              value: 'transfer_to_user',
              label: 'Provide access to another employee',
              helpText: 'The selected person will receive an email with a link to access the departing employee\'s OneDrive files. Files are not transferred or moved — access is granted via a sharing link. The data remains in the original account.',
            },
            {
              value: 'archive_to_sharepoint',
              label: 'Copy files to SharePoint for safekeeping',
              helpText: 'Files will be copied (not moved) to your company\'s HR SharePoint site. The original files remain in the user\'s OneDrive during the retention period.',
            },
            {
              value: 'no_action',
              label: 'No file action needed',
              helpText: 'Files remain in the account during a 30-day hold period and will then be deleted.',
            },
          ]),
        ]
      )

      // 2. Update shared_mailbox_access label for clarity
      await client.query(
        `UPDATE form_questions SET
           label = 'Who should have access to the shared mailbox?',
           help_text = 'Select one or more people who will be able to read and send from this mailbox after conversion.'
         WHERE schema_id = $1 AND key = 'shared_mailbox_access'`,
        [schemaId]
      )

      // 3. Update data_handling options for clearer language
      await client.query(
        `UPDATE form_questions SET
           label = 'Email Account Handling',
           help_text = 'Choose what happens to the departing employee''s email account.',
           static_options = $2::jsonb
         WHERE schema_id = $1 AND key = 'data_handling'`,
        [
          schemaId,
          JSON.stringify([
            { value: 'keep_accessible', label: 'Convert to shared mailbox (keep accessible)' },
            { value: 'forward_to_manager', label: 'Forward email to their manager' },
            { value: 'forward_to_specific', label: 'Forward email to a specific person' },
            { value: 'delete_after_30', label: 'Delete account after 30-day hold' },
          ]),
        ]
      )

      // 4. Update device_handling options
      await client.query(
        `UPDATE form_questions SET
           label = 'Company Device Return',
           help_text = 'How will the departing employee return company-owned devices?',
           static_options = $2::jsonb
         WHERE schema_id = $1 AND key = 'device_handling'`,
        [
          schemaId,
          JSON.stringify([
            { value: 'return_to_office', label: 'Employee will return devices to the office' },
            { value: 'ship_to_tct', label: 'Ship devices to Triple Cities Tech' },
            { value: 'no_company_devices', label: 'No company devices to return' },
          ]),
        ]
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Migration: Hide access_permissions questions when cloning a user
// When clone_permissions = 'yes', all group/team/site pickers should be hidden
// because those will be copied from the source user automatically.
// ---------------------------------------------------------------------------

async function migrateCloneSkipsAccessPermissions(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'onboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  // Sentinel: check if security_groups already has clone visibility rule
  const sentinel = await client.query(
    `SELECT visibility_rules FROM form_questions WHERE schema_id = $1 AND key = 'security_groups' LIMIT 1`,
    [schemaId]
  )
  if (sentinel.rows.length > 0 && sentinel.rows[0].visibility_rules) {
    const rules = typeof sentinel.rows[0].visibility_rules === 'string'
      ? JSON.parse(sentinel.rows[0].visibility_rules)
      : sentinel.rows[0].visibility_rules
    if (rules?.conditions?.some((c: { field: string }) => c.field === 'clone_permissions')) {
      return // Already migrated
    }
  }

  console.log('[forms/config] Running migration: hide access_permissions questions when cloning')

  const cloneVisibility = JSON.stringify({
    operator: 'and',
    conditions: [{ field: 'clone_permissions', op: 'neq', value: 'yes' }],
  })

  // Add visibility rules to all group/team/site picker questions
  for (const key of ['security_groups', 'distribution_lists', 'teams_groups', 'sharepoint_sites']) {
    await client.query(
      `UPDATE form_questions SET visibility_rules = $1::jsonb
       WHERE schema_id = $2 AND key = $3`,
      [cloneVisibility, schemaId, key]
    )
  }
}

// ---------------------------------------------------------------------------
// GET /api/forms/config?companySlug=X&type=onboarding&email=Y
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const companySlug = searchParams.get('companySlug')
  const type = searchParams.get('type')
  const email = searchParams.get('email')

  if (!companySlug || !type || !email) {
    return NextResponse.json(
      { error: 'companySlug, type, and email are required query parameters' },
      { status: 400 }
    )
  }

  if (!['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json(
      { error: 'type must be "onboarding" or "offboarding"' },
      { status: 400 }
    )
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedSlug = companySlug.toLowerCase().trim()

  const client = await pool.connect()
  try {
    // Run idempotent migrations on every request
    await migrateOffboardingUserSelect(client)
    await migrateOffboardingSteps34(client)
    await migrateOnboardingQuestions(client)
    await migrateOffboardingUXImprovements(client)
    await migrateFormRefinementsV2(client)
    await migrateCloneSkipsAccessPermissions(client)

    // 1. Find company by slug
    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
      [normalizedSlug]
    )
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    const companyId = companyRes.rows[0].id

    // 2. Validate requesting email is an active contact
    const contactRes = await client.query<{ id: string }>(
      `SELECT id FROM company_contacts
       WHERE "companyId" = $1
         AND LOWER(email) = $2
         AND "isActive" = true
       LIMIT 1`,
      [companyId, normalizedEmail]
    )
    if (contactRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'Email is not an active contact for this company' },
        { status: 403 }
      )
    }

    // 3. Load published global schema for this type
    // Check if customer has a config pinned to a specific schema first
    const customerConfigRes = await client.query<{
      id: string
      base_schema_id: string
      is_enabled: boolean
      section_overrides: SectionOverride[]
      question_overrides: QuestionOverride[]
    }>(
      `SELECT id, base_schema_id, is_enabled, section_overrides, question_overrides
       FROM customer_form_configs
       WHERE company_id = $1 AND type = $2
       LIMIT 1`,
      [companyId, type]
    )

    const customerConfig = customerConfigRes.rows[0] ?? null

    // Use customer's pinned schema or latest published
    let schemaQuery: string
    let schemaParams: unknown[]
    if (customerConfig?.base_schema_id) {
      schemaQuery = `SELECT id, type, version, name, description FROM form_schemas WHERE id = $1 LIMIT 1`
      schemaParams = [customerConfig.base_schema_id]
    } else {
      schemaQuery = `SELECT id, type, version, name, description FROM form_schemas WHERE type = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`
      schemaParams = [type]
    }

    const schemaRes = await client.query<{
      id: string
      type: string
      version: number
      name: string
      description: string | null
    }>(schemaQuery, schemaParams)

    if (schemaRes.rows.length === 0) {
      return NextResponse.json(
        { error: `No published form schema found for type "${type}"` },
        { status: 404 }
      )
    }

    const schema = schemaRes.rows[0]

    // 4. Load sections for this schema
    const sectionsRes = await client.query<{
      id: string
      key: string
      title: string
      description: string | null
      sort_order: number
      is_enabled: boolean
    }>(
      `SELECT id, key, title, description, sort_order, is_enabled
       FROM form_sections
       WHERE schema_id = $1 AND is_enabled = true
       ORDER BY sort_order`,
      [schema.id]
    )

    // 5. Load questions for this schema
    const questionsRes = await client.query<{
      id: string
      section_id: string
      key: string
      type: string
      label: string
      help_text: string | null
      placeholder: string | null
      is_required: boolean
      default_value: string | null
      sort_order: number
      is_enabled: boolean
      validation: Record<string, unknown> | null
      static_options: Array<{ value: string; label: string }> | null
      data_source: Record<string, unknown> | null
      visibility_rules: Record<string, unknown> | null
      automation_key: string | null
    }>(
      `SELECT id, section_id, key, type, label, help_text, placeholder,
              is_required, default_value, sort_order, is_enabled,
              validation, static_options, data_source, visibility_rules, automation_key
       FROM form_questions
       WHERE schema_id = $1 AND is_enabled = true
       ORDER BY sort_order`,
      [schema.id]
    )

    // Build section → questions map
    const globalSections: FormSection[] = sectionsRes.rows.map((s) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      sortOrder: s.sort_order,
      isEnabled: s.is_enabled,
      questions: questionsRes.rows
        .filter((q) => q.section_id === s.id)
        .map((q) => ({
          key: q.key,
          type: q.type,
          label: q.label,
          helpText: q.help_text,
          placeholder: q.placeholder,
          isRequired: q.is_required,
          defaultValue: q.default_value,
          sortOrder: q.sort_order,
          isEnabled: q.is_enabled,
          validation: q.validation,
          staticOptions: q.static_options,
          dataSource: q.data_source,
          autoFill: (q.data_source as Record<string, unknown> | null)?.autoFill as Record<string, string> | null ?? null,
          visibilityRules: q.visibility_rules,
          automationKey: q.automation_key,
        })),
    }))

    // 6. Load customer custom sections and questions (if config exists)
    let customSections: FormSection[] = []
    let customQuestions: Array<FormQuestion & { sectionKey: string }> = []
    let sectionOverrides: SectionOverride[] = []
    let questionOverrides: QuestionOverride[] = []

    if (customerConfig) {
      sectionOverrides = customerConfig.section_overrides ?? []
      questionOverrides = customerConfig.question_overrides ?? []

      // Custom sections
      const customSectionsRes = await client.query<{
        id: string
        key: string
        title: string
        description: string | null
        sort_order: number
        is_enabled: boolean
      }>(
        `SELECT id, key, title, description, sort_order, is_enabled
         FROM customer_custom_sections
         WHERE config_id = $1 AND is_enabled = true
         ORDER BY sort_order`,
        [customerConfig.id]
      )

      // Custom questions
      const customQuestionsRes = await client.query<{
        id: string
        section_key: string
        key: string
        type: string
        label: string
        help_text: string | null
        placeholder: string | null
        is_required: boolean
        default_value: string | null
        sort_order: number
        is_enabled: boolean
        validation: Record<string, unknown> | null
        static_options: Array<{ value: string; label: string }> | null
        data_source: Record<string, unknown> | null
        visibility_rules: Record<string, unknown> | null
        automation_key: string | null
      }>(
        `SELECT id, section_key, key, type, label, help_text, placeholder,
                is_required, default_value, sort_order, is_enabled,
                validation, static_options, data_source, visibility_rules, automation_key
         FROM customer_custom_questions
         WHERE config_id = $1 AND is_enabled = true
         ORDER BY sort_order`,
        [customerConfig.id]
      )

      customSections = customSectionsRes.rows.map((s) => ({
        key: s.key,
        title: s.title,
        description: s.description,
        sortOrder: s.sort_order,
        isEnabled: s.is_enabled,
        questions: customQuestionsRes.rows
          .filter((q) => q.section_key === s.key)
          .map((q) => ({
            key: q.key,
            type: q.type,
            label: q.label,
            helpText: q.help_text,
            placeholder: q.placeholder,
            isRequired: q.is_required,
            defaultValue: q.default_value,
            sortOrder: q.sort_order,
            isEnabled: q.is_enabled,
            validation: q.validation,
            staticOptions: q.static_options,
            dataSource: q.data_source,
            autoFill: (q.data_source as Record<string, unknown> | null)?.autoFill as Record<string, string> | null ?? null,
            visibilityRules: q.visibility_rules,
            automationKey: q.automation_key,
          })),
      }))

      customQuestions = customQuestionsRes.rows
        // Only include questions that belong to global sections (not custom sections)
        .filter((q) => !customSectionsRes.rows.some((s) => s.key === q.section_key))
        .map((q) => ({
          sectionKey: q.section_key,
          key: q.key,
          type: q.type,
          label: q.label,
          helpText: q.help_text,
          placeholder: q.placeholder,
          isRequired: q.is_required,
          defaultValue: q.default_value,
          sortOrder: q.sort_order,
          isEnabled: q.is_enabled,
          validation: q.validation,
          staticOptions: q.static_options,
          dataSource: q.data_source,
          autoFill: (q.data_source as Record<string, unknown> | null)?.autoFill as Record<string, string> | null ?? null,
          visibilityRules: q.visibility_rules,
          automationKey: q.automation_key,
        }))
    }

    // 7. Merge everything
    const mergedSections = mergeSections(
      globalSections,
      sectionOverrides,
      questionOverrides,
      customQuestions,
      customSections
    )

    // 8. Resolve M365 data sources
    const tenantCreds = await getTenantCredentialsBySlug(normalizedSlug)
    if (tenantCreds) {
      const graphClient = createGraphClient(tenantCreds)

      // Collect all questions with data sources across all sections
      const resolvePromises: Array<Promise<void>> = []
      for (const section of mergedSections) {
        for (const question of section.questions) {
          if (question.dataSource) {
            if (question.type === 'user_select') {
              // user_select gets full user objects for auto-fill
              resolvePromises.push(
                resolveUserDataSource(question.dataSource as Record<string, unknown>, graphClient).then(
                  (result) => {
                    question.resolvedUserOptions = result.users
                    question.resolvedOptions = result.users.map((u) => ({ value: u.value, label: u.label }))
                    if (result.error) question.dataSourceError = result.error
                  }
                )
              )
            } else {
              resolvePromises.push(
                resolveDataSource(question.dataSource as Record<string, unknown>, graphClient).then(
                  (result) => {
                    question.resolvedOptions = result.options
                    if (result.error) question.dataSourceError = result.error
                  }
                )
              )
            }
          }
        }
      }

      // Resolve all data sources in parallel
      await Promise.all(resolvePromises)
    }

    // 9. Build response
    const config: FormConfig = {
      schemaId: schema.id,
      type: schema.type,
      version: schema.version,
      name: schema.name,
      description: schema.description,
      sections: mergedSections,
    }

    return NextResponse.json(config)
  } catch (err) {
    console.error('[forms/config] Error:', err)
    return NextResponse.json(
      { error: 'Failed to load form configuration' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
