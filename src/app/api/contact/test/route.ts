import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { contactConfig } from '@/config/contact'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const diagnostics = {
    resendConfigured: !!process.env.RESEND_API_KEY,
    contactEmail: contactConfig.email ? 'CONFIGURED' : 'MISSING',
    fromEmail: contactConfig.fromEmail ? 'CONFIGURED' : 'MISSING',
    fromName: contactConfig.fromName ? 'CONFIGURED' : 'MISSING',

    // Show actual values for debugging (will remove after)
    contactEmailValue: contactConfig.email,
    fromEmailValue: contactConfig.fromEmail,
    fromNameValue: contactConfig.fromName
  }

  return NextResponse.json(diagnostics)
}
