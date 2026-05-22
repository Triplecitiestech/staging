import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { getDebts, saveDebts, getCategoryOverrides, saveCategoryOverrides, getQbSnapshot, saveQbSnapshot, getArSnapshot, saveArSnapshot } from '@/lib/cfo/store'
import type { DebtsConfig, DebtInput, CategoryMap, QbSnapshot, ArSnapshot } from '@/lib/cfo/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [debts, categories, qbSnapshot, arSnapshot] = await Promise.all([getDebts(), getCategoryOverrides(), getQbSnapshot(), getArSnapshot()])
  return NextResponse.json({ debts: debts ?? { debts: [] }, categories: categories ?? {}, qbSnapshot: qbSnapshot ?? null, arSnapshot: arSnapshot ?? null })
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

  let body: { debts?: DebtsConfig; categories?: CategoryMap; qbSnapshot?: QbSnapshot; arSnapshot?: ArSnapshot }
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

  return NextResponse.json({ ok: true })
}
