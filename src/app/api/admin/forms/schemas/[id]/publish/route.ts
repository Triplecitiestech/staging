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
// POST /api/admin/forms/schemas/[id]/publish
// ---------------------------------------------------------------------------

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session.user?.role, 'system_settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const client = await pool.connect()
  try {
    // Get the draft schema
    const schemaRes = await client.query<{ type: string; status: string }>(
      `SELECT type, status FROM form_schemas WHERE id = $1`,
      [id]
    )
    if (schemaRes.rows.length === 0) {
      return NextResponse.json({ error: 'Schema not found' }, { status: 404 })
    }

    const schema = schemaRes.rows[0]
    if (schema.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft schemas can be published' }, { status: 400 })
    }

    // Archive current published schema for this type
    await client.query(
      `UPDATE form_schemas SET status = 'archived', archived_at = NOW(), updated_at = NOW()
       WHERE type = $1 AND status = 'published'`,
      [schema.type]
    )

    // Publish the draft
    await client.query(
      `UPDATE form_schemas SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    )

    return NextResponse.json({ success: true, message: 'Schema published successfully' })
  } finally {
    client.release()
  }
}
