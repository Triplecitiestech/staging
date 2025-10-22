import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { contactConfig } from '@/config/contact'
import { 
  sanitizeInput, 
  escapeHtml, 
  isValidEmail, 
  isValidPhone, 
  RateLimiter, 
  validateRequest,
  logSecurityEvent 
} from '@/lib/security'

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: NextRequest) {
  try {
    // Security: Validate request
    const validation = validateRequest(request)
    if (!validation.isValid) {
      logSecurityEvent('Invalid request detected', {
        ip: validation.ip,
        userAgent: validation.userAgent,
        errors: validation.errors
      }, 'medium')
      
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Security: Rate limiting
    if (!RateLimiter.checkLimit(validation.ip, false)) {
      logSecurityEvent('Rate limit exceeded', {
        ip: validation.ip,
        userAgent: validation.userAgent
      }, 'medium')
      
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((RateLimiter.getResetTime(validation.ip) - Date.now()) / 1000)
        },
        { status: 429 }
      )
    }

    const { name, email, phone, company, message } = await request.json()

    // Security: Sanitize all inputs
    const sanitizedName = sanitizeInput(name)
    const sanitizedEmail = sanitizeInput(email)
    const sanitizedPhone = phone ? sanitizeInput(phone) : ''
    const sanitizedCompany = company ? sanitizeInput(company) : ''
    const sanitizedMessage = sanitizeInput(message)

    // Validate required fields
    if (!sanitizedName || !sanitizedEmail || !sanitizedMessage) {
      return NextResponse.json(
        { error: 'Name, email, and message are required' },
        { status: 400 }
      )
    }

    // Security: Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Security: Validate phone format if provided
    if (sanitizedPhone && !isValidPhone(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone format' },
        { status: 400 }
      )
    }

    // Security: Validate input lengths
    if (sanitizedName.length > 100) {
      return NextResponse.json(
        { error: 'Name must be less than 100 characters' },
        { status: 400 }
      )
    }

    if (sanitizedEmail.length > 254) {
      return NextResponse.json(
        { error: 'Email must be less than 254 characters' },
        { status: 400 }
      )
    }

    if (sanitizedPhone && sanitizedPhone.length > 20) {
      return NextResponse.json(
        { error: 'Phone must be less than 20 characters' },
        { status: 400 }
      )
    }

    if (sanitizedCompany && sanitizedCompany.length > 100) {
      return NextResponse.json(
        { error: 'Company must be less than 100 characters' },
        { status: 400 }
      )
    }

    if (sanitizedMessage.length > 2000) {
      return NextResponse.json(
        { error: 'Message must be less than 2000 characters' },
        { status: 400 }
      )
    }

    // Check if Resend is available
    if (!resend) {
      console.error('❌ RESEND_API_KEY not configured')
      return NextResponse.json(
        { error: 'Email service not configured. Please contact administrator.' },
        { status: 503 }
      )
    }

    // Validate required email configuration
    if (!contactConfig.email || !contactConfig.fromEmail || !contactConfig.fromName) {
      console.error('❌ Missing required email configuration:', {
        email: !contactConfig.email ? 'MISSING' : 'OK',
        fromEmail: !contactConfig.fromEmail ? 'MISSING' : 'OK',
        fromName: !contactConfig.fromName ? 'MISSING' : 'OK'
      })
      return NextResponse.json(
        { error: 'Email service not properly configured. Please contact administrator.' },
        { status: 503 }
      )
    }

    // Security: Escape HTML for email template
    const safeName = escapeHtml(sanitizedName)
    const safeEmail = escapeHtml(sanitizedEmail)
    const safePhone = sanitizedPhone ? escapeHtml(sanitizedPhone) : ''
    const safeCompany = sanitizedCompany ? escapeHtml(sanitizedCompany) : ''
    const safeMessage = escapeHtml(sanitizedMessage)

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: `${contactConfig.fromName} <${contactConfig.fromEmail}>`,
      replyTo: sanitizedEmail, // This allows you to reply directly to the sender
      to: [contactConfig.email], // Using configured email address
      subject: `New Contact Form Submission from ${safeName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <!-- Header with Dark Cyan Gradient -->
          <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%); padding: 40px 40px 20px 40px; text-align: center; position: relative; overflow: hidden;">
            <!-- Radiant Background Effect -->
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%); animation: pulse 4s ease-in-out infinite;"></div>
            <div style="position: relative; z-index: 1;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.025em; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
                New Contact Form
              </h1>
              <p style="color: rgba(255, 255, 255, 0.9); font-size: 14px; margin: 12px 0 0 0; font-weight: 500;">
                Reply to: <a href="mailto:${safeEmail}" style="color: #ffffff; text-decoration: none; font-weight: 600; border-bottom: 2px solid rgba(255, 255, 255, 0.6); padding-bottom: 1px;">${safeEmail}</a>
              </p>
            </div>
          </div>
          
          <!-- Content with Radiant Black Background -->
          <div style="padding: 40px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); position: relative; overflow: hidden;">
            <!-- Radiant Background Effects -->
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%); animation: pulse 6s ease-in-out infinite;"></div>
            <div style="position: absolute; top: 20%; right: -20%; width: 100%; height: 100%; background: radial-gradient(circle, rgba(6, 182, 212, 0.03) 0%, transparent 60%); animation: pulse 8s ease-in-out infinite reverse;"></div>
            <div style="position: absolute; bottom: -30%; left: 20%; width: 80%; height: 80%; background: radial-gradient(circle, rgba(6, 182, 212, 0.04) 0%, transparent 50%); animation: pulse 10s ease-in-out infinite;"></div>
            
            <!-- Contact Details Card -->
            <div style="position: relative; z-index: 1; margin-bottom: 32px; padding: 24px; background: rgba(255, 255, 255, 0.95); border-radius: 16px; border: 1px solid rgba(6, 182, 212, 0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(6, 182, 212, 0.1); backdrop-filter: blur(10px);">
              <h3 style="color: #06b6d4; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Details</h3>
              
              <div style="display: flex; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(6, 182, 212, 0.2);">
                <div style="width: 80px; color: #06b6d4; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Name</div>
                <div style="color: #1e293b; font-size: 14px; font-weight: 500;">${safeName}</div>
              </div>
              
              <div style="display: flex; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(6, 182, 212, 0.2);">
                <div style="width: 80px; color: #06b6d4; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email</div>
                <div style="color: #1e293b; font-size: 14px; font-weight: 500;">${safeEmail}</div>
              </div>
              
              ${safePhone ? `
              <div style="display: flex; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(6, 182, 212, 0.2);">
                <div style="width: 80px; color: #06b6d4; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Phone</div>
                <div style="color: #1e293b; font-size: 14px; font-weight: 500;">${safePhone}</div>
              </div>
              ` : ''}
              
              ${safeCompany ? `
              <div style="display: flex; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(6, 182, 212, 0.2);">
                <div style="width: 80px; color: #06b6d4; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Company</div>
                <div style="color: #1e293b; font-size: 14px; font-weight: 500;">${safeCompany}</div>
              </div>
              ` : ''}
            </div>
            
            <!-- Message Card -->
            <div style="position: relative; z-index: 1;">
              <h3 style="color: #06b6d4; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Message</h3>
              <div style="background: rgba(255, 255, 255, 0.95); padding: 24px; border-radius: 16px; color: #1e293b; font-size: 14px; line-height: 1.7; white-space: pre-wrap; border: 1px solid rgba(6, 182, 212, 0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(6, 182, 212, 0.1); backdrop-filter: blur(10px);">${safeMessage}</div>
            </div>
          </div>
          
          <!-- Footer with Dark Cyan Accent -->
          <div style="padding: 24px 40px 40px 40px; text-align: center; border-top: 1px solid #e2e8f0; background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);">
            <div style="color: #06b6d4; font-size: 18px; font-weight: 700; margin-bottom: 6px; letter-spacing: 2px; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
              TRIPLE CITIES TECH
            </div>
            <div style="color: #94a3b8; font-size: 13px; font-weight: 500; margin-bottom: 16px;">
              Technology solutions built for business
            </div>
            <div style="padding-top: 16px; border-top: 1px solid rgba(6, 182, 212, 0.2);">
              <div style="color: #64748b; font-size: 11px; font-weight: 400;">
                This message was sent from your website contact form
              </div>
            </div>
          </div>
        </div>
      `,
      text: `
████████████████████████████████████████████
           NEW CONTACT FORM
████████████████████████████████████████████

Reply to: ${safeEmail}

NAME: ${safeName}
EMAIL: ${safeEmail}
${safePhone ? `PHONE: ${safePhone}` : ''}
${safeCompany ? `COMPANY: ${safeCompany}` : ''}

MESSAGE:
${safeMessage}

████████████████████████████████████████████
        TRIPLE CITIES TECH
    Technology solutions built for business
████████████████████████████████████████████
      `,
    })

    if (error) {
      console.error('❌ Resend error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: 'Failed to send email', details: error.message || 'Unknown error' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Contact form submitted successfully',
        data 
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
