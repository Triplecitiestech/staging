import { NextRequest, NextResponse } from 'next/server'
import { clearAgentSessionCookie } from '@/lib/agent-session'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  await clearAgentSessionCookie()
  return NextResponse.json({ success: true })
}
