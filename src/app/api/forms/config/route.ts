import { NextRequest, NextResponse } from 'next/server'
import { Pool, PoolClient } from 'pg'
import { getTenantCredentialsBySlug, createGraphClient } from '@/lib/graph'

// ---------------------------------------------------------------------------
// Raw pg pool — matches existing HR route convention
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

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

async function resolveDataSource(
  dataSource: Record<string, unknown>,
  graphClient: GraphClient
): Promise<Array<{ value: string; label: string }>> {
  const endpoint = dataSource.endpoint as string
  const valueField = dataSource.valueField as string
  const labelField = dataSource.labelField as string
  const labelSuffix = dataSource.labelSuffix as string | undefined

  try {
    let items: Array<Record<string, unknown>> = []

    switch (endpoint) {
      case 'licenses': {
        const skus = await graphClient.getLicenseSkus()
        return skus.map((sku) => {
          const available = sku.prepaidUnits.enabled - sku.consumedUnits
          let label = sku.displayName ?? sku.skuPartNumber
          if (labelSuffix) {
            label += ' ' + labelSuffix.replace('{available}', String(Math.max(0, available)))
          }
          return { value: sku[valueField as keyof typeof sku] as string, label }
        })
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

    return items.map((item) => {
      let label = String(item[labelField] ?? '')
      if (labelSuffix) {
        let suffix = labelSuffix
        // Replace template vars like {userPrincipalName} with actual values
        suffix = suffix.replace(/\{(\w+)\}/g, (_, field) => String(item[field] ?? ''))
        label += ' ' + suffix
      }
      return { value: String(item[valueField] ?? ''), label }
    })
  } catch (err) {
    console.error(`[forms/config] Failed to resolve data source "${endpoint}":`, err)
    return []
  }
}

/** Resolve users data source with full user properties for user_select fields */
async function resolveUserDataSource(
  dataSource: Record<string, unknown>,
  graphClient: GraphClient
): Promise<UserOption[]> {
  const labelField = dataSource.labelField as string
  const labelSuffix = dataSource.labelSuffix as string | undefined

  try {
    const users = await graphClient.getUsers()
    return users.map((u) => {
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
    })
  } catch (err) {
    console.error('[forms/config] Failed to resolve user data source:', err)
    return []
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
    `UPDATE form_questions SET sort_order = 1, help_text = 'The last day this employee will have access. For immediate terminations, set to today.' WHERE schema_id = $1 AND key = 'last_day'`,
    [schemaId]
  )

  console.log('[forms/config] Migration complete: offboarding user_select')
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
    `UPDATE form_questions SET help_text = 'When should the employee''s account be ready? We recommend 1-2 business days before their first day.'
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
         'I understand that adding a Microsoft 365 license will result in additional monthly charges on our next invoice.',
         'The selected license will be billed at Microsoft''s current rate. You can view current pricing in your Microsoft 365 admin center.',
         true, 1)
       ON CONFLICT (schema_id, key) DO NOTHING`,
      [specialSectionId, schemaId]
    )
  }

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
    // and make it sort_order 0 (primary question).
    // Hide it when clone_permissions === 'yes' — license will be copied from the source user.
    await client.query(
      `UPDATE form_questions SET section_id = $1, sort_order = 0,
       label = 'License Type',
       help_text = 'Select the Microsoft 365 license for this employee. Only licenses available in your tenant are shown. Available counts are displayed next to each option.',
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
    await migrateOnboardingQuestions(client)

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
                  (userOptions) => {
                    question.resolvedUserOptions = userOptions
                    question.resolvedOptions = userOptions.map((u) => ({ value: u.value, label: u.label }))
                  }
                )
              )
            } else {
              resolvePromises.push(
                resolveDataSource(question.dataSource as Record<string, unknown>, graphClient).then(
                  (options) => {
                    question.resolvedOptions = options
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
