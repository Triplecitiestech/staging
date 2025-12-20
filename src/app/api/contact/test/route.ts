import { NextResponse } from 'next/server'
import { contactConfig } from '@/config/contact'

export async function GET() {
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
