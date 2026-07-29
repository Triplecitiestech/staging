// src/app/api/reports/delivery-economics/route.ts
//
// GET  — read the stored history, or one snapshot's full report.
//        ?history=1        list snapshots (headline figures only)
//        ?id=<uuid>        one snapshot with its full report
//        (default)         the most recent snapshot
// POST  — recompute NOW from Autotask + Datto and append a snapshot. This is
//        what the dashboard's Refresh button calls, and what the weekly cron
//        calls. Appending (never overwriting) is the point: the trend is the
//        finding, so history must accumulate.
//
// Auth: staff session OR the migration secret, matching the other report
// routes (tbr-export, wan-reliability) so a cron can drive it headlessly.

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { checkSecretAuth } from '@/lib/api-auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { generateDeliveryEconomicsReport } from '@/lib/reporting/delivery-economics/service'
import { getSnapshot, listSnapshots, saveSnapshot } from '@/lib/reporting/delivery-economics/snapshots'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_WINDOW_DAYS = 180
const MIGRATION_HINT =
  'delivery_economics_snapshots is missing — POST /api/migrations/run (with the migration secret) once, then retry.'

async function authorise(request: NextRequest): Promise<{ ok: true; actor: string } | { ok: false }> {
  const session = await auth()
  if (session?.user?.email) return { ok: true, actor: session.user.email }
  if (await checkSecretAuth(request)) return { ok: true, actor: 'automation' }
  return { ok: false }
}

export async function GET(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const authd = await authorise(request)
    if (!authd.ok) return apiError('Unauthorized', reqId, 401)

    const params = request.nextUrl.searchParams
    if (params.get('history')) {
      const { value, tableMissing } = await listSnapshots(Number(params.get('limit')) || 52)
      return apiOk({ snapshots: value, tableMissing, ...(tableMissing ? { hint: MIGRATION_HINT } : {}) }, reqId)
    }

    const { value, tableMissing } = await getSnapshot(params.get('id') ?? undefined)
    return apiOk(
      {
        snapshot: value,
        tableMissing,
        ...(tableMissing ? { hint: MIGRATION_HINT } : {}),
        ...(!value && !tableMissing ? { hint: 'No snapshot yet — POST this endpoint to capture the first one.' } : {}),
      },
      reqId
    )
  } catch (error) {
    console.error('[delivery-economics GET]', (error as Error).message)
    return apiError('Failed to read delivery economics snapshots', reqId, 500)
  }
}

export async function POST(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const authd = await authorise(request)
    if (!authd.ok) return apiError('Unauthorized', reqId, 401)

    const params = request.nextUrl.searchParams
    const days = Math.min(Math.max(Number(params.get('days')) || DEFAULT_WINDOW_DAYS, 30), 400)
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)

    const report = await generateDeliveryEconomicsReport({ from, to })
    const { saved, tableMissing } = await saveSnapshot(report, authd.actor)

    // The report is returned either way — a missing table costs you the history,
    // not the analysis.
    return apiOk(
      { report, saved, tableMissing, ...(tableMissing ? { hint: MIGRATION_HINT } : {}) },
      reqId
    )
  } catch (error) {
    console.error('[delivery-economics POST]', (error as Error).message)
    return apiError('Failed to generate delivery economics report', reqId, 500)
  }
}
