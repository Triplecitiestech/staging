import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { disconnect } from '@/lib/cfo/qb-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await disconnect()
  return NextResponse.json({ ok: true })
}
