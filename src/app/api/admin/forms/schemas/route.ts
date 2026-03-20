import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// GET /api/admin/forms/schemas?type=onboarding
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'system_settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const type = request.nextUrl.searchParams.get('type')

  const client = await pool.connect()
  try {
    let query = `SELECT id, type, version, status, name, description, created_by, published_at, archived_at, created_at, updated_at
                 FROM form_schemas`
    const params: string[] = []

    if (type) {
      query += ` WHERE type = $1`
      params.push(type)
    }

    query += ` ORDER BY type, version DESC`

    const result = await client.query(query, params)
    return NextResponse.json({ schemas: result.rows })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/forms/schemas
// Body: { type, name, cloneFromId? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'system_settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { type, name, cloneFromId } = body as { type: string; name: string; cloneFromId?: string }

  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // Get next version number
    const versionRes = await client.query<{ max: number }>(
      `SELECT COALESCE(MAX(version), 0) as max FROM form_schemas WHERE type = $1`,
      [type]
    )
    const nextVersion = versionRes.rows[0].max + 1

    // Create the new schema
    const schemaRes = await client.query<{ id: string }>(
      `INSERT INTO form_schemas (type, version, status, name, created_by)
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING id`,
      [type, nextVersion, name, session.user?.email ?? null]
    )
    const schemaId = schemaRes.rows[0].id

    // Clone from existing schema if requested
    if (cloneFromId) {
      // Clone sections
      const sectionsRes = await client.query(
        `SELECT key, title, description, sort_order, is_enabled FROM form_sections WHERE schema_id = $1`,
        [cloneFromId]
      )

      for (const s of sectionsRes.rows) {
        const newSectionRes = await client.query<{ id: string }>(
          `INSERT INTO form_sections (schema_id, key, title, description, sort_order, is_enabled)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [schemaId, s.key, s.title, s.description, s.sort_order, s.is_enabled]
        )
        const newSectionId = newSectionRes.rows[0].id

        // Clone questions for this section
        const oldSectionRes = await client.query<{ id: string }>(
          `SELECT id FROM form_sections WHERE schema_id = $1 AND key = $2`,
          [cloneFromId, s.key]
        )
        if (oldSectionRes.rows.length > 0) {
          const oldSectionId = oldSectionRes.rows[0].id
          await client.query(
            `INSERT INTO form_questions (section_id, schema_id, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key)
             SELECT $1, $2, key, type, label, help_text, placeholder, is_required, default_value, sort_order, is_enabled, validation, static_options, data_source, visibility_rules, automation_key
             FROM form_questions WHERE section_id = $3 AND schema_id = $4`,
            [newSectionId, schemaId, oldSectionId, cloneFromId]
          )
        }
      }
    }

    return NextResponse.json({ id: schemaId, version: nextVersion }, { status: 201 })
  } finally {
    client.release()
  }
}
