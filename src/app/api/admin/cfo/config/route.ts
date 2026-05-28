import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { getDebts, saveDebts, getCategoryOverrides, saveCategoryOverrides, getQbSnapshot, saveQbSnapshot, getArSnapshot, saveArSnapshot, getScheduledOutflows, saveScheduledOutflows, getHiringAssumptions, saveHiringAssumptions } from '@/lib/cfo/store'
import type { DebtsConfig, DebtInput, CategoryMap, QbSnapshot, ArSnapshot, ScheduledOutflowsConfig, ScheduledOutflow } from '@/lib/cfo/types'
import type { HiringAssumptions } from '@/lib/cfo/hiring'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [debts, categories, qbSnapshot, arSnapshot, scheduled, hiring] = await Promise.all([getDebts(), getCategoryOverrides(), getQbSnapshot(), getArSnapshot(), getScheduledOutflows(), getHiringAssumptions()])
  return NextResponse.json({
    debts: debts ?? { debts: [] },
    categories: categories ?? {},
    qbSnapshot: qbSnapshot ?? null,
    arSnapshot: arSnapshot ?? null,
    scheduledOutflows: scheduled ?? { items: [] },
    hiringAssumptions: hiring ?? null,
  })
}

function isValidDebt(d: unknown): d is DebtInput {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  return typeof o.name === 'string'
    && typeof o.balanceCents === 'number'
    && typeof o.aprPct === 'number'
    && typeof o.minPaymentCents === 'number'
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { debts?: DebtsConfig; categories?: CategoryMap; qbSnapshot?: QbSnapshot; arSnapshot?: ArSnapshot; scheduledOutflows?: ScheduledOutflowsConfig; hiringAssumptions?: HiringAssumptions }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.debts) {
    if (!Array.isArray(body.debts.debts) || !body.debts.debts.every(isValidDebt)) {
      return NextResponse.json({ error: 'Each debt needs name, balanceCents, aprPct, minPaymentCents (numbers)' }, { status: 400 })
    }
    await saveDebts({ asOfDate: body.debts.asOfDate ?? new Date().toISOString().slice(0, 10), debts: body.debts.debts })
  }

  if (body.categories) {
    if (typeof body.categories !== 'object') {
      return NextResponse.json({ error: 'categories must be an object map' }, { status: 400 })
    }
    await saveCategoryOverrides(body.categories)
  }

  if (body.qbSnapshot) {
    if (typeof body.qbSnapshot !== 'object') return NextResponse.json({ error: 'qbSnapshot must be an object' }, { status: 400 })
    await saveQbSnapshot(body.qbSnapshot)
  }

  if (body.arSnapshot) {
    if (typeof body.arSnapshot !== 'object') return NextResponse.json({ error: 'arSnapshot must be an object' }, { status: 400 })
    await saveArSnapshot(body.arSnapshot)
  }

  if (body.scheduledOutflows) {
    const items = body.scheduledOutflows.items
    if (!Array.isArray(items) || !items.every((s: ScheduledOutflow) => typeof s.id === 'string' && typeof s.date === 'string' && typeof s.label === 'string' && typeof s.amountCents === 'number')) {
      return NextResponse.json({ error: 'Each scheduled outflow needs id (string), date (ISO), label (string), amountCents (number)' }, { status: 400 })
    }
    await saveScheduledOutflows({ items })
  }

  if (body.hiringAssumptions) {
    const h = body.hiringAssumptions
    if (typeof h !== 'object' || typeof h.us !== 'object' || typeof h.ph !== 'object') {
      return NextResponse.json({ error: 'hiringAssumptions must include us + ph input objects' }, { status: 400 })
    }
    await saveHiringAssumptions(h)
  }

  return NextResponse.json({ ok: true })
}
