import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTemplates } from '@/lib/sales-agents/agreement-templates'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ templates: getTemplates() })
}
