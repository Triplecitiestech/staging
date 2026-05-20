import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { connectionInfo, isConfigured } from '@/lib/cfo/qb-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ configured: isConfigured(), ...(await connectionInfo()) })
}
