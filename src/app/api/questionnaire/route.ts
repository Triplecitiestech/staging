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

    // Security: Rate limiting (strict for questionnaire)
    if (!RateLimiter.checkLimit(validation.ip, true)) {
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

    const { userPath, responses, email, phone } = await request.json()

    // Security: Sanitize all inputs
    const sanitizedEmail = sanitizeInput(email)
    const sanitizedPhone = phone ? sanitizeInput(phone) : ''
    const sanitizedUserPath = sanitizeInput(userPath)
    const sanitizedResponses = responses ? Object.fromEntries(
      Object.entries(responses).map(([key, value]) => [key, sanitizeInput(value as string)])
    ) : {}

    // Validate required fields
    if (!sanitizedEmail || !sanitizedUserPath) {
      return NextResponse.json(
        { error: 'Email and user path are required' },
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

    // Check if Resend is available
    if (!resend) {
      console.error('❌ RESEND_API_KEY not configured')
      return NextResponse.json(
        { error: 'Email service not configured. Please contact administrator.' },
        { status: 503 }
      )
    }

    // Validate required email configuration
    if (!contactConfig.questionnaireEmail || !contactConfig.fromEmail || !contactConfig.fromName) {
      console.error('❌ Missing required email configuration:', {
        questionnaireEmail: !contactConfig.questionnaireEmail ? 'MISSING' : 'OK',
        fromEmail: !contactConfig.fromEmail ? 'MISSING' : 'OK',
        fromName: !contactConfig.fromName ? 'MISSING' : 'OK'
      })
      return NextResponse.json(
        { error: 'Email service not properly configured. Please contact administrator.' },
        { status: 503 }
      )
    }

    // Security: Escape HTML for email template
    const safeEmail = escapeHtml(sanitizedEmail)
    const safePhone = sanitizedPhone ? escapeHtml(sanitizedPhone) : ''

    // Generate email content based on responses
    const generateEmailContent = () => {
      let content = ''
      
      // Add path-specific content
      if (sanitizedUserPath === 'outsource') {
        content += `
          <div style="background: rgba(6, 182, 212, 0.1); padding: 16px; border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #06b6d4;">
            <h4 style="color: #06b6d4; margin: 0 0 8px 0; font-size: 16px; font-weight: 700;">INTEREST: Outsourcing IT Support</h4>
            <p style="color: #64748b; margin: 0; font-size: 14px;">This client is interested in having Triple Cities Tech handle all their IT needs.</p>
          </div>
        `
      } else if (sanitizedUserPath === 'internal') {
        content += `
          <div style="background: rgba(6, 182, 212, 0.1); padding: 16px; border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #06b6d4;">
            <h4 style="color: #06b6d4; margin: 0 0 8px 0; font-size: 16px; font-weight: 700;">INTEREST: Internal IT Support</h4>
            <p style="color: #64748b; margin: 0; font-size: 14px;">This client wants to enhance their existing IT team with our support.</p>
          </div>
        `
      }

      // Add responses
      const questionLabels: Record<string, string> = {
        company_size: 'Company Size',
        current_it_staff: 'Current IT Staff',
        primary_concerns: 'Primary Concerns',
        current_provider: 'Current IT Provider',
        budget_range: 'Monthly IT Budget',
        it_team_size: 'IT Team Size',
        support_needs: 'Support Needs',
        challenges: 'Current Challenges',
        engagement_type: 'Preferred Engagement Type',
        urgency: 'Timeline',
        email: 'Email Address',
        phone: 'Phone Number'
      }

      Object.entries(sanitizedResponses).forEach(([key, value]) => {
        if (key !== 'email' && key !== 'phone' && value) {
          const label = questionLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          content += `
            <div style="display: flex; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(6, 182, 212, 0.1);">
              <div style="width: 140px; color: #06b6d4; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(label)}</div>
              <div style="color: #1e293b; font-size: 13px; font-weight: 500;">${escapeHtml(value)}</div>
            </div>
          `
        }
      })

      return content
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: `${contactConfig.fromName} <${contactConfig.fromEmail}>`,
      replyTo: sanitizedEmail,
      to: [contactConfig.questionnaireEmail], // Using separate questionnaire email
      subject: `New IT Assessment Submission - ${sanitizedUserPath === 'outsource' ? 'Outsourcing' : 'Internal Support'} Interest`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <!-- Header with Dark Cyan Gradient -->
          <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%); padding: 40px 40px 20px 40px; text-align: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%); animation: pulse 4s ease-in-out infinite;"></div>
            <div style="position: relative; z-index: 1;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.025em; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
                New IT Assessment
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
              <h3 style="color: #06b6d4; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Information</h3>
              
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
            </div>
            
            <!-- Assessment Responses Card -->
            <div style="position: relative; z-index: 1;">
              <h3 style="color: #06b6d4; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Assessment Responses</h3>
              <div style="background: rgba(255, 255, 255, 0.95); padding: 24px; border-radius: 16px; border: 1px solid rgba(6, 182, 212, 0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(6, 182, 212, 0.1); backdrop-filter: blur(10px);">
                ${generateEmailContent()}
              </div>
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
                This message was sent from your IT assessment questionnaire
              </div>
            </div>
          </div>
        </div>
      `,
      text: `
████████████████████████████████████████████
           NEW IT ASSESSMENT
████████████████████████████████████████████

Reply to: ${safeEmail}
${safePhone ? `Phone: ${safePhone}` : ''}

Interest: ${sanitizedUserPath === 'outsource' ? 'Outsourcing IT Support' : 'Internal IT Support'}

ASSESSMENT RESPONSES:
${Object.entries(sanitizedResponses).map(([key, value]) => {
  if (key !== 'email' && key !== 'phone' && value) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    return `${label}: ${value}`
  }
  return ''
}).filter(Boolean).join('\n')}

████████████████████████████████████████████
        TRIPLE CITIES TECH
    Technology solutions built for business
████████████████████████████████████████████
      `,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Assessment submitted successfully',
        data 
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Questionnaire submission error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
