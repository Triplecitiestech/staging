import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'

// Lightweight check used by the admin nav to decide whether to surface the CFO
// link. Future CFO API routes should call canAccessCfoDashboard(session) the
// same way before returning any financial data.
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ allowed: false }, { status: 401 })
  }

  const allowed = await canAccessCfoDashboard(session)
  return NextResponse.json({ allowed })
}
