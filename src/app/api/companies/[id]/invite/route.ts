import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Generate a secure random password
function generatePassword(length = 16): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // Removed I, O
  const lowercase = 'abcdefghjkmnpqrstuvwxyz' // Removed i, l, o
  const numbers = '23456789' // Removed 0, 1
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + special

  let password = ''
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]

  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import('@/lib/prisma')
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { regenerate } = body

    // Fetch company
    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        displayName: true,
        primaryContact: true,
        contactEmail: true,
        passwordHash: true,
      }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    if (!company.contactEmail) {
      return NextResponse.json({
        error: 'Company has no contact email. Please add an email address first.'
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(company.contactEmail)) {
      return NextResponse.json({
        error: 'Invalid email address format'
      }, { status: 400 })
    }

    // Generate new password if regenerating or always generate for simplicity
    let password: string | null = null
    if (regenerate || true) {
      password = generatePassword()
      const passwordHash = await bcrypt.hash(password, 10)

      await prisma.company.update({
        where: { id },
        data: { passwordHash }
      })
    }

    if (!resend) {
      return NextResponse.json({
        error: 'Email service not configured. Please set RESEND_API_KEY.'
      }, { status: 500 })
    }

    // Portal URL
    const portalUrl = `${process.env.NEXTAUTH_URL || 'https://www.triplecitiestech.com'}/onboarding/${company.slug}`

    // Send email
    const emailResult = await resend.emails.send({
      from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
      to: company.contactEmail,
      subject: 'Triple Cities Tech Project Portal',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap');

            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              line-height: 1.6;
              color: #e2e8f0;
              margin: 0;
              padding: 0;
              background-color: #020617;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: #1e293b;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .header {
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
              padding: 56px 32px;
              text-align: center;
              border-bottom: 3px solid #06b6d4;
            }
            .header h1 {
              color: #ffffff;
              margin: 0;
              font-size: 32px;
              font-weight: 900;
              letter-spacing: -0.025em;
              text-shadow: 0 2px 10px rgba(6, 182, 212, 0.3);
            }
            .content {
              padding: 40px 32px;
              background: #1e293b;
            }
            .greeting {
              font-size: 18px;
              color: #e2e8f0;
              margin-bottom: 24px;
              font-weight: 600;
            }
            .message {
              color: #cbd5e1;
              margin-bottom: 30px;
              font-size: 15px;
            }
            .message p {
              margin-bottom: 16px;
            }
            .credentials-box {
              background: #0f172a;
              border: 2px solid #06b6d4;
              padding: 24px;
              margin: 32px 0;
              border-radius: 12px;
            }
            .credentials-box h3 {
              margin: 0 0 20px 0;
              color: #06b6d4;
              font-size: 18px;
              font-weight: 700;
            }
            .credential-item {
              margin: 16px 0;
            }
            .credential-label {
              font-weight: 600;
              color: #94a3b8;
              display: block;
              margin-bottom: 8px;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .credential-value {
              font-family: 'Courier New', monospace;
              background: #1e293b;
              padding: 14px 16px;
              border-radius: 8px;
              border: 1px solid #334155;
              font-size: 15px;
              color: #e2e8f0;
              word-break: break-all;
            }
            .credential-value a {
              color: #06b6d4;
              text-decoration: none;
              word-break: break-all;
            }
            .credential-value a:hover {
              color: #22d3ee;
              text-decoration: underline;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
              color: #ffffff !important;
              padding: 18px 56px;
              text-decoration: none;
              border-radius: 12px;
              font-weight: 700;
              font-size: 18px;
              margin: 32px 0;
              box-shadow: 0 15px 25px -5px rgba(6, 182, 212, 0.5);
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border: 2px solid #06b6d4;
            }
            .features-list {
              background: #0f172a;
              border-radius: 12px;
              padding: 24px;
              margin-top: 32px;
            }
            .features-list ul {
              list-style: none;
              padding: 0;
              margin: 16px 0 0 0;
            }
            .features-list li {
              color: #cbd5e1;
              padding: 8px 0 8px 28px;
              position: relative;
              font-size: 15px;
            }
            .features-list li:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #06b6d4;
              font-weight: bold;
              font-size: 18px;
            }
            .footer {
              background: #0f172a;
              padding: 32px;
              text-align: center;
              color: #94a3b8;
              font-size: 14px;
              border-top: 1px solid #334155;
            }
            .contact-info {
              margin-bottom: 24px;
            }
            .contact-info p {
              margin: 8px 0;
              color: #cbd5e1;
            }
            .contact-info strong {
              color: #e2e8f0;
              font-size: 16px;
            }
            .contact-info a {
              color: #06b6d4;
              text-decoration: none;
              font-weight: 600;
            }
            .copyright {
              margin-top: 24px;
              padding-top: 24px;
              border-top: 1px solid #334155;
              color: #64748b;
              font-size: 13px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to your Triple Cities Tech Project Portal</h1>
            </div>

            <div class="content">
              <div class="greeting">
                Hello${company.primaryContact ? ` ${company.primaryContact}` : ''},
              </div>

              <div class="message">
                <p>Welcome to your Triple Cities Tech project portal! You can now track the progress of your projects in real-time, view project phases, and stay updated on important milestones.</p>
              </div>

              <div class="credentials-box">
                <h3>Your Portal Access Credentials</h3>
                <div class="credential-item">
                  <span class="credential-label">Portal Link:</span>
                  <div class="credential-value"><a href="${portalUrl}">${portalUrl}</a></div>
                </div>
                ${password ? `
                <div class="credential-item">
                  <span class="credential-label">Password:</span>
                  <div class="credential-value">${password}</div>
                </div>
                ` : `
                <div class="credential-item">
                  <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
                    <em>Use your existing password to log in.</em>
                  </p>
                </div>
                `}
              </div>

              <center>
                <a href="${portalUrl}" class="button">Access Your Portal →</a>
              </center>

              <div class="features-list">
                <p style="color: #e2e8f0; font-weight: 600; margin: 0 0 16px 0;"><strong>What you can do in the portal:</strong></p>
                <ul>
                  <li>View real-time project progress</li>
                  <li>Track completed tasks and milestones</li>
                  <li>See project phase status and timelines</li>
                  <li>Access important project notes</li>
                </ul>
              </div>
            </div>

            <div class="footer">
              <div class="contact-info">
                <p><strong>Need Help or Have Questions?</strong></p>
                <p>
                  Our team is here to assist you!<br>
                  Call us: <a href="tel:+16073417500">(607) 341-7500</a><br>
                  Email us: <a href="mailto:support@triplecitiestech.com">support@triplecitiestech.com</a>
                </p>
              </div>
              <div class="copyright">
                © ${new Date().getFullYear()} Triple Cities Tech. All rights reserved.
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    })

    if (emailResult.error) {
      return NextResponse.json({
        error: 'Failed to send email',
        details: emailResult.error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${company.contactEmail}`,
      emailId: emailResult.data?.id
    })

  } catch (error) {
    console.error('Invite error:', error)
    return NextResponse.json({
      error: 'Failed to send invite',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
