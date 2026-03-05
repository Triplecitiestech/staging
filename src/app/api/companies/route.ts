import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { createRequestLogger } from '@/lib/server-logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Generate secure random password
function generatePassword(length = 16): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + special

  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]

  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  return password.split('').sort(() => Math.random() - 0.5).join('')
}

export async function POST(req: Request) {
  const log = createRequestLogger('POST /api/companies')
  log.info('Request received')

  const session = await auth()
  if (!session) {
    log.warn('Unauthorized request')
    return apiError('Unauthorized', log.requestId, 401)
  }
  log.info('Authenticated', { userId: session.user?.email })

  try {
    const { prisma } = await import('@/lib/prisma')
    const { displayName, primaryContact, contactEmail, contactTitle } = await req.json()

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      log.warn('Missing required field: displayName')
      return apiError('Company name is required', log.requestId, 400, 'MISSING_DISPLAY_NAME')
    }

    // Idempotency: check for Idempotency-Key header
    const idempotencyKey = req.headers.get('Idempotency-Key')
    if (idempotencyKey) {
      log.info('Idempotency key provided', { idempotencyKey })
    }

    // Generate and hash a temporary password
    const timerPassword = log.startTimer('password-hash')
    const tempPassword = generatePassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)
    timerPassword()

    // Generate base slug
    const baseSlug = displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    let slug = baseSlug

    // Check if slug exists and make it unique
    const timerDb = log.startTimer('db-create')
    let counter = 1
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const company = await prisma.company.create({
      data: {
        displayName: displayName.trim(),
        slug,
        primaryContact: primaryContact || null,
        contactEmail: contactEmail || null,
        contactTitle: contactTitle || null,
        passwordHash,
      }
    })
    const dbMs = timerDb()

    log.info('Company created', {
      companyId: company.id,
      slug: company.slug,
      dbTimeMs: dbMs,
      durationMs: log.elapsed(),
    })

    // Send welcome email with portal credentials if contact email is provided
    let emailSent = false
    if (contactEmail && resend) {
      const portalUrl = `${process.env.NEXTAUTH_URL || 'https://www.triplecitiestech.com'}/onboarding/${company.slug}`
      try {
        const emailResult = await resend.emails.send({
          from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
          to: contactEmail,
          subject: 'Welcome to Your Triple Cities Tech Project Portal',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #e2e8f0; margin: 0; padding: 0; background-color: #020617; }
                .container { max-width: 600px; margin: 20px auto; background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
                .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 56px 32px; text-align: center; border-bottom: 3px solid #06b6d4; }
                .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; }
                .content { padding: 40px 32px; }
                .greeting { font-size: 18px; color: #e2e8f0; margin-bottom: 24px; font-weight: 600; }
                .message { color: #cbd5e1; margin-bottom: 30px; font-size: 15px; }
                .credentials-box { background: #0f172a; border: 2px solid #06b6d4; padding: 24px; margin: 32px 0; border-radius: 12px; }
                .credentials-box h3 { margin: 0 0 20px 0; color: #06b6d4; font-size: 18px; font-weight: 700; }
                .credential-item { margin: 16px 0; }
                .credential-label { font-weight: 600; color: #94a3b8; display: block; margin-bottom: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
                .credential-value { font-family: 'Courier New', monospace; background: #1e293b; padding: 14px 16px; border-radius: 8px; border: 1px solid #334155; font-size: 15px; color: #e2e8f0; word-break: break-all; }
                .credential-value a { color: #06b6d4; text-decoration: none; }
                .button { display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #ffffff !important; padding: 18px 56px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 18px; margin: 32px 0; box-shadow: 0 15px 25px -5px rgba(6, 182, 212, 0.5); }
                .footer { background: #0f172a; padding: 32px; text-align: center; color: #94a3b8; font-size: 14px; border-top: 1px solid #334155; }
                .footer a { color: #06b6d4; text-decoration: none; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header"><h1>Welcome to your Triple Cities Tech Project Portal</h1></div>
                <div class="content">
                  <div class="greeting">Hello${primaryContact ? ` ${primaryContact}` : ''},</div>
                  <div class="message"><p>Welcome to your Triple Cities Tech project portal! You can now track the progress of your projects in real-time, view project phases, and stay updated on important milestones.</p></div>
                  <div class="credentials-box">
                    <h3>Your Portal Access Credentials</h3>
                    <div class="credential-item">
                      <span class="credential-label">Portal Link:</span>
                      <div class="credential-value"><a href="${portalUrl}">${portalUrl}</a></div>
                    </div>
                    <div class="credential-item">
                      <span class="credential-label">Password:</span>
                      <div class="credential-value">${tempPassword}</div>
                    </div>
                  </div>
                  <center><a href="${portalUrl}" class="button">Access Your Portal &rarr;</a></center>
                </div>
                <div class="footer">
                  <p><strong>Need Help?</strong></p>
                  <p>Call: <a href="tel:+16073417500">(607) 341-7500</a> | Email: <a href="mailto:support@triplecitiestech.com">support@triplecitiestech.com</a></p>
                  <p style="margin-top: 16px; color: #64748b; font-size: 13px;">&copy; ${new Date().getFullYear()} Triple Cities Tech. All rights reserved.</p>
                </div>
              </div>
            </body>
            </html>
          `
        })
        emailSent = !emailResult.error
        if (emailResult.error) {
          log.warn('Failed to send welcome email', { error: emailResult.error })
        } else {
          log.info('Welcome email sent', { to: contactEmail })
        }
      } catch (emailErr) {
        log.warn('Welcome email error', { error: emailErr instanceof Error ? emailErr.message : 'Unknown' })
      }
    }

    return apiSuccess(
      {
        id: company.id,
        displayName: company.displayName,
        slug: company.slug,
        primaryContact: company.primaryContact,
        contactEmail: company.contactEmail,
        contactTitle: company.contactTitle,
        createdAt: company.createdAt.toISOString(),
        emailSent,
      },
      `/admin/companies`,
      log.requestId,
      201
    )
  } catch (error) {
    log.error('Failed to create company', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: log.elapsed(),
    })
    return apiError(
      'Failed to create company',
      log.requestId,
      500
    )
  }
}

export async function DELETE(req: Request) {
  const log = createRequestLogger('DELETE /api/companies')
  log.info('Request received')

  const session = await auth()
  if (!session) {
    log.warn('Unauthorized request')
    return apiError('Unauthorized', log.requestId, 401)
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return apiError('Company ID required', log.requestId, 400)
    }

    await prisma.company.delete({ where: { id } })

    log.info('Company deleted', { companyId: id, durationMs: log.elapsed() })
    return NextResponse.json({ success: true, requestId: log.requestId })
  } catch (error) {
    log.error('Failed to delete company', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return apiError('Failed to delete company', log.requestId, 500)
  }
}
