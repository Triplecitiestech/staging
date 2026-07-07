import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { getPool } from '@/lib/db-pool'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { validatePricingOverrides } from '@/lib/sales-calculator/config'
import pricingBase from '@/config/sales-calculator/pricing.json'

export const dynamic = 'force-dynamic'

/**
 * Sales calculator pricing overrides.
 *
 * Effective pricing = src/config/sales-calculator/pricing.json (defaults)
 * + the latest overrides row (flat path→number map) from
 * sales_calc_pricing_overrides. Rows are append-only — every save inserts a
 * new row, so history doubles as the audit trail (no hard deletes).
 *
 * GET  — any staff session: latest overrides + whether the caller can edit.
 * PUT  — staff with `system_settings`: validate + insert a new overrides row.
 */

const UNDEFINED_TABLE = '42P01'

export async function GET() {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    const canEdit = hasPermission(session.user.role, 'system_settings', session.user.permissionOverrides)

    try {
      const pool = getPool()
      const { rows } = await pool.query(
        `SELECT overrides, note, updated_by, created_at
           FROM sales_calc_pricing_overrides
          ORDER BY created_at DESC
          LIMIT 1`
      )
      const latest = rows[0]
      return apiOk(
        {
          overrides: (latest?.overrides as Record<string, number>) ?? {},
          note: latest?.note ?? null,
          updatedBy: latest?.updated_by ?? null,
          updatedAt: latest?.created_at ?? null,
          canEdit,
          tableMissing: false,
        },
        reqId
      )
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) {
        // Table not migrated yet — the calculator proceeds on config defaults;
        // the editor shows a run-migrations banner and disables saving.
        return apiOk({ overrides: {}, note: null, updatedBy: null, updatedAt: null, canEdit, tableMissing: true }, reqId)
      }
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc pricing GET]', err.message)
    return apiError('Failed to load pricing overrides', reqId, 500)
  }
}

export async function PUT(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    if (!hasPermission(session.user.role, 'system_settings', session.user.permissionOverrides)) {
      return apiError('Forbidden — pricing edits require the system_settings permission', reqId, 403)
    }

    let body: { overrides?: Record<string, unknown>; note?: unknown }
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body', reqId, 400)
    }
    const overrides = body?.overrides
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return apiError('Body must include an `overrides` object (flat path → number map)', reqId, 400)
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null

    const validation = validatePricingOverrides(overrides, pricingBase)
    if (!validation.ok) {
      return apiError(`Invalid overrides: ${validation.errors.slice(0, 5).join('; ')}`, reqId, 400)
    }

    try {
      const pool = getPool()
      await pool.query(
        `INSERT INTO sales_calc_pricing_overrides (overrides, note, updated_by)
         VALUES ($1::jsonb, $2, $3)`,
        [JSON.stringify(overrides), note, session.user.email]
      )
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) {
        return apiError(
          'Pricing overrides table is missing — POST /api/migrations/run (with the migration secret) once, then retry.',
          reqId,
          503
        )
      }
      throw dbError
    }

    return apiOk({ saved: true, count: validation.count }, reqId)
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc pricing PUT]', err.message)
    return apiError('Failed to save pricing overrides', reqId, 500)
  }
}
