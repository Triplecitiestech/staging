import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import {
  parseSavedQuoteBody,
  savedQuoteRowToListItem,
  SAVED_QUOTE_INPUT_VERSION,
  SAVED_QUOTE_LIST_COLUMNS,
  type SavedQuoteRow,
} from '@/lib/sales-calculator/saved-quotes'

export const dynamic = 'force-dynamic'

/**
 * Sales calculator saved quotes (list + create).
 *
 * Quotes store the discovery INPUT (not prices) in raw-pg
 * sales_calc_saved_quotes; loading one recomputes against current pricing +
 * overrides. Soft delete only (deleted_at). Any staff session can list,
 * save, edit and delete — this is a shared sales team workspace, with
 * created_by/updated_by recording who touched what.
 *
 * GET  — list active quotes, newest edit first.
 * POST — save the current calculator state as a new named quote.
 */

const UNDEFINED_TABLE = '42P01'

export async function GET() {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }

    try {
      const pool = getPool()
      const { rows } = await pool.query<SavedQuoteRow>(
        `SELECT ${SAVED_QUOTE_LIST_COLUMNS}
           FROM sales_calc_saved_quotes
          WHERE deleted_at IS NULL
          ORDER BY updated_at DESC
          LIMIT 200`
      )
      return apiOk({ quotes: rows.map(savedQuoteRowToListItem), tableMissing: false }, reqId)
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) {
        // Table not migrated yet — UI shows a run-migrations banner and
        // disables saving; the calculator itself keeps working.
        return apiOk({ quotes: [], tableMissing: true }, reqId)
      }
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc quotes GET]', err.message)
    return apiError('Failed to load saved quotes', reqId, 500)
  }
}

export async function POST(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }

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
        `INSERT INTO sales_calc_saved_quotes
           (name, customer_name, input, input_version, selected_package_id, summary, note, created_by, updated_by)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $8)
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
        ]
      )
      return apiOk({ quote: savedQuoteRowToListItem(rows[0]) }, reqId, 201)
    } catch (dbError) {
      const err = dbError as Error & { code?: string }
      if (err.code === UNDEFINED_TABLE) {
        return apiError(
          'Saved quotes table is missing — POST /api/migrations/run (with the migration secret) once, then retry.',
          reqId,
          503
        )
      }
      throw dbError
    }
  } catch (error) {
    const err = error as Error
    console.error('[sales-calc quotes POST]', err.message)
    return apiError('Failed to save quote', reqId, 500)
  }
}
