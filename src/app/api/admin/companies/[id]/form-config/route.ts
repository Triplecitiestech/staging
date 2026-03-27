import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'

const pool = getPool()

// ---------------------------------------------------------------------------
// GET /api/admin/companies/[id]/form-config?type=onboarding
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: companyId } = await params
  const type = request.nextUrl.searchParams.get('type')

  const client = await pool.connect()
  try {
    // Get company info
    const companyRes = await client.query(
      `SELECT id, "displayName", slug FROM companies WHERE id = $1`,
      [companyId]
    )
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const company = companyRes.rows[0]

    // Get customer config
    let configQuery = `SELECT id, type, base_schema_id, is_enabled, section_overrides, question_overrides, created_at, updated_at
                       FROM customer_form_configs WHERE company_id = $1`
    const configParams: string[] = [companyId]

    if (type) {
      configQuery += ` AND type = $2`
      configParams.push(type)
    }

    const configRes = await client.query(configQuery, configParams)

    // Get custom sections
    const customSectionsRes = await client.query(
      `SELECT cs.id, cs.config_id, cs.key, cs.title, cs.description, cs.sort_order, cs.is_enabled
       FROM customer_custom_sections cs
       JOIN customer_form_configs cfc ON cfc.id = cs.config_id
       WHERE cs.company_id = $1`,
      [companyId]
    )

    // Get custom questions
    const customQuestionsRes = await client.query(
      `SELECT cq.id, cq.config_id, cq.section_key, cq.key, cq.type, cq.label, cq.help_text, cq.placeholder,
              cq.is_required, cq.default_value, cq.sort_order, cq.is_enabled,
              cq.validation, cq.static_options, cq.data_source, cq.visibility_rules, cq.automation_key
       FROM customer_custom_questions cq
       JOIN customer_form_configs cfc ON cfc.id = cq.config_id
       WHERE cq.company_id = $1`,
      [companyId]
    )

    return NextResponse.json({
      company,
      configs: configRes.rows,
      customSections: customSectionsRes.rows,
      customQuestions: customQuestionsRes.rows,
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/companies/[id]/form-config
// Body: { type, baseSchemaId, sectionOverrides, questionOverrides, customSections, customQuestions }
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: companyId } = await params
  const body = await request.json()
  const { type, baseSchemaId, sectionOverrides, questionOverrides, customSections, customQuestions } = body

  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!baseSchemaId) {
    return NextResponse.json({ error: 'baseSchemaId is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // Upsert customer_form_configs
    const configRes = await client.query<{ id: string }>(
      `INSERT INTO customer_form_configs (company_id, type, base_schema_id, section_overrides, question_overrides, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
       ON CONFLICT (company_id, type) DO UPDATE SET
         base_schema_id = $3,
         section_overrides = $4::jsonb,
         question_overrides = $5::jsonb,
         updated_at = NOW()
       RETURNING id`,
      [
        companyId,
        type,
        baseSchemaId,
        JSON.stringify(sectionOverrides ?? []),
        JSON.stringify(questionOverrides ?? []),
      ]
    )
    const configId = configRes.rows[0].id

    // Replace custom sections
    await client.query(
      `DELETE FROM customer_custom_sections WHERE config_id = $1`,
      [configId]
    )
    if (Array.isArray(customSections)) {
      for (const s of customSections) {
        await client.query(
          `INSERT INTO customer_custom_sections (company_id, config_id, key, title, description, sort_order, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [companyId, configId, s.key, s.title, s.description ?? null, s.sortOrder ?? s.sort_order ?? 100, s.isEnabled ?? s.is_enabled ?? true]
        )
      }
    }

    // Replace custom questions
    await client.query(
      `DELETE FROM customer_custom_questions WHERE config_id = $1`,
      [configId]
    )
    if (Array.isArray(customQuestions)) {
      for (const q of customQuestions) {
        await client.query(
          `INSERT INTO customer_custom_questions (company_id, config_id, section_key, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17)`,
          [
            companyId, configId, q.sectionKey ?? q.section_key,
            q.key, q.type, q.label,
            q.helpText ?? q.help_text ?? null,
            q.placeholder ?? null,
            q.isRequired ?? q.is_required ?? false,
            q.defaultValue ?? q.default_value ?? null,
            q.sortOrder ?? q.sort_order ?? 100,
            q.isEnabled ?? q.is_enabled ?? true,
            q.validation ? JSON.stringify(q.validation) : null,
            q.staticOptions ?? q.static_options ? JSON.stringify(q.staticOptions ?? q.static_options) : null,
            q.dataSource ?? q.data_source ? JSON.stringify(q.dataSource ?? q.data_source) : null,
            q.visibilityRules ?? q.visibility_rules ? JSON.stringify(q.visibilityRules ?? q.visibility_rules) : null,
            q.automationKey ?? q.automation_key ?? null,
          ]
        )
      }
    }

    return NextResponse.json({ success: true, configId })
  } finally {
    client.release()
  }
}
