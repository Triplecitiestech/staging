import { NextResponse } from 'next/server'

// Diagnostic endpoint to verify environment variables
export async function GET() {
  const requiredVars = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME,
  }

  const config = {
    resendApiKey: requiredVars.RESEND_API_KEY 
      ? '✅ Set (starts with: ' + requiredVars.RESEND_API_KEY.substring(0, 5) + '...)' 
      : '❌ MISSING - Add in Vercel Settings > Environment Variables',
    contactEmail: requiredVars.NEXT_PUBLIC_CONTACT_EMAIL || '❌ MISSING',
    questionnaireEmail: process.env.NEXT_PUBLIC_QUESTIONNAIRE_EMAIL || '❌ MISSING',
    fromEmail: requiredVars.RESEND_FROM_EMAIL || '❌ MISSING',
    fromName: requiredVars.RESEND_FROM_NAME || '❌ MISSING',
    contactPhone: process.env.NEXT_PUBLIC_CONTACT_PHONE || '⚠️ Optional',
    companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || '⚠️ Optional',
    websiteUrl: process.env.NEXT_PUBLIC_WEBSITE_URL || '⚠️ Optional',
    nodeEnv: process.env.NODE_ENV || 'unknown',
  }

  const missingRequired = Object.entries(requiredVars)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  const allConfigured = missingRequired.length === 0

  return NextResponse.json({
    status: allConfigured 
      ? '✅ All required variables configured' 
      : '❌ Missing required variables',
    missingVariables: missingRequired.length > 0 ? missingRequired : undefined,
    config,
    timestamp: new Date().toISOString(),
    instructions: allConfigured 
      ? 'All environment variables are set! Your contact form should work.'
      : `Missing variables: ${missingRequired.join(', ')}. Add them in Vercel Dashboard > Settings > Environment Variables, then redeploy.`
  })
}

