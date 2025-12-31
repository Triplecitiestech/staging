import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

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
      subject: 'Your Triple Cities Tech Project Portal Access',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              color: #333;
              margin-bottom: 20px;
            }
            .message {
              color: #666;
              margin-bottom: 30px;
            }
            .credentials-box {
              background: #f8f9fa;
              border-left: 4px solid #06b6d4;
              padding: 20px;
              margin: 30px 0;
              border-radius: 4px;
            }
            .credentials-box h3 {
              margin: 0 0 15px 0;
              color: #333;
              font-size: 16px;
            }
            .credential-item {
              margin: 10px 0;
            }
            .credential-label {
              font-weight: 600;
              color: #666;
              display: block;
              margin-bottom: 5px;
              font-size: 14px;
            }
            .credential-value {
              font-family: 'Courier New', monospace;
              background: white;
              padding: 12px;
              border-radius: 4px;
              border: 1px solid #e0e0e0;
              font-size: 16px;
              color: #333;
              word-break: break-all;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
              color: white;
              padding: 16px 40px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
              box-shadow: 0 4px 6px rgba(6, 182, 212, 0.3);
            }
            .button:hover {
              background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
            }
            .footer {
              background: #f8f9fa;
              padding: 30px;
              text-align: center;
              color: #666;
              font-size: 14px;
              border-top: 1px solid #e0e0e0;
            }
            .contact-info {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
            }
            .contact-info a {
              color: #06b6d4;
              text-decoration: none;
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
                <h3>📋 Your Portal Access Credentials</h3>
                <div class="credential-item">
                  <span class="credential-label">Portal Link:</span>
                  <div class="credential-value">${portalUrl}</div>
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

              <div class="message" style="margin-top: 30px;">
                <p><strong>What you can do in the portal:</strong></p>
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
                  📞 Call us: <a href="tel:+16073417500">(607) 341-7500</a><br>
                  ✉️ Email us: <a href="mailto:support@triplecitiestech.com">support@triplecitiestech.com</a>
                </p>
              </div>
              <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                © ${new Date().getFullYear()} Triple Cities Tech. All rights reserved.
              </p>
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
