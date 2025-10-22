// Validate required environment variables
const validateEnvVars = () => {
  const required = {
    'NEXT_PUBLIC_CONTACT_EMAIL': process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    'RESEND_FROM_EMAIL': process.env.RESEND_FROM_EMAIL,
    'RESEND_FROM_NAME': process.env.RESEND_FROM_NAME,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    console.error('Please check your .env.local file')
  }
}

// Run validation in development
if (process.env.NODE_ENV === 'development') {
  validateEnvVars()
}

export const contactConfig = {
  // Email recipients - NO HARDCODED VALUES
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
  questionnaireEmail: process.env.NEXT_PUBLIC_QUESTIONNAIRE_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
  
  // Sender configuration - NO HARDCODED VALUES
  fromEmail: process.env.RESEND_FROM_EMAIL || '',
  fromName: process.env.RESEND_FROM_NAME || '',
  
  // Company information - NO HARDCODED VALUES
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || '',
  company: process.env.NEXT_PUBLIC_COMPANY_NAME || '',
  website: process.env.NEXT_PUBLIC_WEBSITE_URL || ''
}
