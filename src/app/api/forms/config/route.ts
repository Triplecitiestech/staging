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
// ---------------------------------------------------------------------------

/** Idempotent migration: replace first_name/last_name/work_email with user_select in offboarding */
async function migrateOffboardingUserSelect(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'offboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  const existing = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'employee_to_offboard' LIMIT 1`,
    [schemaId]
  )
  if (existing.rows.length > 0) return

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
     VALUES ($1, $2, 'employee_to_offboard', 'user_select', 'Select Employee', 'Search for the employee being offboarded', true, 0,
       $3::jsonb)
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
    `UPDATE form_questions SET sort_order = 1 WHERE schema_id = $1 AND key = 'last_day'`,
    [schemaId]
  )
}

/** Idempotent migration: add credential_delivery and work_country/work_location_detail to onboarding */
async function migrateOnboardingQuestions(client: PoolClient): Promise<void> {
  const schemaRes = await client.query<{ id: string }>(
    `SELECT id FROM form_schemas WHERE type = 'onboarding' AND status = 'published' LIMIT 1`
  )
  if (schemaRes.rows.length === 0) return
  const schemaId = schemaRes.rows[0].id

  const existing = await client.query(
    `SELECT id FROM form_questions WHERE schema_id = $1 AND key = 'work_country' LIMIT 1`,
    [schemaId]
  )
  if (existing.rows.length > 0) return

  const empSectionRes = await client.query<{ id: string }>(
    `SELECT id FROM form_sections WHERE schema_id = $1 AND key = 'employee_details' LIMIT 1`,
    [schemaId]
  )
  if (empSectionRes.rows.length === 0) return
  const empSectionId = empSectionRes.rows[0].id

  await client.query(
    `DELETE FROM form_questions WHERE schema_id = $1 AND key = 'work_location'`,
    [schemaId]
  )

  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
     VALUES ($1, $2, 'work_country', 'select', 'Work Country',
       'Select the country where this employee will primarily work. This affects compliance settings and SaaS Alerts geolocation whitelisting.',
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
        { value: 'OTHER', label: 'Other (specify below)' },
      ]),
    ]
  )

  await client.query(
    `INSERT INTO form_questions (section_id, schema_id, key, type, label, placeholder, sort_order)
     VALUES ($1, $2, 'work_location_detail', 'text', 'City / State / Office Location',
       'e.g. Binghamton, NY / São Paulo / Remote', 6)
     ON CONFLICT (schema_id, key) DO NOTHING`,
    [empSectionId, schemaId]
  )

  await client.query(
    `UPDATE form_questions SET sort_order = 7 WHERE schema_id = $1 AND key = 'personal_email'`,
    [schemaId]
  )
  await client.query(
    `UPDATE form_questions SET sort_order = 8 WHERE schema_id = $1 AND key = 'phone'`,
    [schemaId]
  )

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
    await client.query(
      `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, is_required, sort_order, static_options)
       VALUES ($1, $2, 'credential_delivery', 'radio',
         'Where should we send the new account login information?',
         'The new employee''s username, temporary password, and setup instructions will be sent to the selected recipient.',
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

    await client.query(
      `UPDATE form_questions SET sort_order = 1 WHERE schema_id = $1 AND key = 'additional_notes' AND section_id = $2`,
      [schemaId, specialSectionId]
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
