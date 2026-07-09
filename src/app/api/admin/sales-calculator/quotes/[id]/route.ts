import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import {
  parseSavedQuoteBody,
  savedQuoteRowToDetail,
  savedQuoteRowToListItem,
  SAVED_QUOTE_INPUT_VERSION,
  SAVED_QUOTE_LIST_COLUMNS,
  type SavedQuoteRow,
} from '@/lib/sales-calculator/saved-quotes'

export const dynamic = 'force-dynamic'

/**
 * Single saved quote.
 *
 * GET    — full quote incl. the stored discovery input (for loading).
 * PUT    — overwrite name/input/etc. of an existing quote (editing).
 * DELETE — soft delete (deleted_at); rows are never hard-deleted.
 */

const UNDEFINED_TABLE = '42P01'
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function tableMissingError(reqId: string) {
  return apiError(
    'Saved quotes table is missing — POST /api/migrations/run (with the migration secret) once, then retry.',
    reqId,
    503
  )
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    const { id } = await params
    if (!UUID_RE.test(id)) return apiError('Invalid quote id', reqId, 400)

    try {
      const pool = getPool()
      const { rows } = await pool.query<SavedQuoteRow>(
        `SELECT ${SAVED_QUOTE_LIST_COLUMNS}, input, input_version
           FROM sales_calc_saved_quotes
          WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      )
      if (!rows[0]) return apiError('Quote not found', reqId, 404)
      return apiOk({ quote: savedQuoteRowToDetail(rows[0]) }, reqId)
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) return tableMissingError(reqId)
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc quote GET]', err.message)
    return apiError('Failed to load quote', reqId, 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    const { id } = await params
    if (!UUID_RE.test(id)) return apiError('Invalid quote id', reqId, 400)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body', reqId, 400)
    }
    const parsed = parseSavedQuoteBody(body)
    if (!parsed.ok) return apiError(parsed.error, reqId, 400)
    const q = parsed.value

    try {
      const pool = getPool()
      const { rows } = await pool.query<SavedQuoteRow>(
        `UPDATE sales_calc_saved_quotes
            SET name = $1,
                customer_name = $2,
                input = $3::jsonb,
                input_version = $4,
                selected_package_id = $5,
                summary = $6::jsonb,
                note = $7,
                updated_by = $8,
                updated_at = NOW()
          WHERE id = $9 AND deleted_at IS NULL
          RETURNING ${SAVED_QUOTE_LIST_COLUMNS}`,
        [
          q.name,
          q.customerName,
          JSON.stringify(q.input),
          SAVED_QUOTE_INPUT_VERSION,
          q.selectedPackageId,
          q.summary ? JSON.stringify(q.summary) : null,
          q.note,
          session.user.email,
          id,
        ]
      )
      if (!rows[0]) return apiError('Quote not found', reqId, 404)
      return apiOk({ quote: savedQuoteRowToListItem(rows[0]) }, reqId)
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) return tableMissingError(reqId)
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc quote PUT]', err.message)
    return apiError('Failed to update quote', reqId, 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    const { id } = await params
    if (!UUID_RE.test(id)) return apiError('Invalid quote id', reqId, 400)

    try {
      const pool = getPool()
      const { rowCount } = await pool.query(
        `UPDATE sales_calc_saved_quotes
            SET deleted_at = NOW(), updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND deleted_at IS NULL`,
        [session.user.email, id]
      )
      if (!rowCount) return apiError('Quote not found', reqId, 404)
      return apiOk({ deleted: true }, reqId)
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) return tableMissingError(reqId)
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc quote DELETE]', err.message)
    return apiError('Failed to delete quote', reqId, 500)
  }
}
