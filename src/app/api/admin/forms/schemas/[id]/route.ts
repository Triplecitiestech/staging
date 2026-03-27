import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'

const pool = getPool()

// ---------------------------------------------------------------------------
// GET /api/admin/forms/schemas/[id] — Get schema with sections + questions
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const client = await pool.connect()
  try {
    const schemaRes = await client.query(
      `SELECT id, type, version, status, name, description, created_by, published_at, archived_at, created_at, updated_at
       FROM form_schemas WHERE id = $1`,
      [id]
    )
    if (schemaRes.rows.length === 0) {
      return NextResponse.json({ error: 'Schema not found' }, { status: 404 })
    }

    const schema = schemaRes.rows[0]

    const sectionsRes = await client.query(
      `SELECT id, key, title, description, sort_order, is_enabled
       FROM form_sections WHERE schema_id = $1 ORDER BY sort_order`,
      [id]
    )

    const questionsRes = await client.query(
      `SELECT id, section_id, key, type, label, help_text, placeholder, is_required, default_value,
              sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key
       FROM form_questions WHERE schema_id = $1 ORDER BY sort_order`,
      [id]
    )

    const sections = sectionsRes.rows.map((s: Record<string, unknown>) => ({
      ...s,
      questions: questionsRes.rows.filter((q: Record<string, unknown>) => q.section_id === s.id),
    }))

    return NextResponse.json({ ...schema, sections })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/forms/schemas/[id] — Update draft schema
// Body: { name?, description?, sections: [{ key, title, description, sortOrder, questions: [...] }] }
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

  const { id } = await params
  const body = await request.json()

  const client = await pool.connect()
  try {
    // Verify it's a draft
    const schemaRes = await client.query(
      `SELECT status FROM form_schemas WHERE id = $1`,
      [id]
    )
    if (schemaRes.rows.length === 0) {
      return NextResponse.json({ error: 'Schema not found' }, { status: 404 })
    }
    if (schemaRes.rows[0].status !== 'draft') {
      return NextResponse.json({ error: 'Can only edit draft schemas' }, { status: 400 })
    }

    // Update schema metadata
    if (body.name || body.description !== undefined) {
      await client.query(
        `UPDATE form_schemas SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = NOW() WHERE id = $1`,
        [id, body.name ?? null, body.description ?? null]
      )
    }

    // Update sections + questions if provided
    if (Array.isArray(body.sections)) {
      // Delete existing sections and questions (cascade)
      await client.query(`DELETE FROM form_sections WHERE schema_id = $1`, [id])

      for (const section of body.sections) {
        const sectionRes = await client.query<{ id: string }>(
          `INSERT INTO form_sections (schema_id, key, title, description, sort_order, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [id, section.key, section.title, section.description ?? null, section.sortOrder ?? section.sort_order ?? 0, section.isEnabled ?? section.is_enabled ?? true]
        )
        const sectionId = sectionRes.rows[0].id

        if (Array.isArray(section.questions)) {
          for (const q of section.questions) {
            await client.query(
              `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16)`,
              [
                sectionId, id, q.key, q.type, q.label,
                q.help_text ?? q.helpText ?? null,
                q.placeholder ?? null,
                q.is_required ?? q.isRequired ?? false,
                q.default_value ?? q.defaultValue ?? null,
                q.sort_order ?? q.sortOrder ?? 0,
                q.is_enabled ?? q.isEnabled ?? true,
                q.validation ? JSON.stringify(q.validation) : null,
                q.static_options ?? q.staticOptions ? JSON.stringify(q.static_options ?? q.staticOptions) : null,
                q.data_source ?? q.dataSource ? JSON.stringify(q.data_source ?? q.dataSource) : null,
                q.visibility_rules ?? q.visibilityRules ? JSON.stringify(q.visibility_rules ?? q.visibilityRules) : null,
                q.automation_key ?? q.automationKey ?? null,
              ]
            )
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/forms/schemas/[id] — Delete draft only
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'manage_companies')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const client = await pool.connect()
  try {
    const res = await client.query(
      `DELETE FROM form_schemas WHERE id = $1 AND status = 'draft' RETURNING id`,
      [id]
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Schema not found or not a draft' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } finally {
    client.release()
  }
}
