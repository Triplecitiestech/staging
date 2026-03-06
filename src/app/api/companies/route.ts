import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { createRequestLogger } from '@/lib/server-logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getWelcomeEmailHtml } from '@/lib/email-templates'

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
  if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    log.warn('Insufficient permissions', { role: session.user?.role })
    return apiError('Forbidden: requires ADMIN or MANAGER role', log.requestId, 403)
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

    // Auto-create a CompanyContact record for the primary contact
    if (contactEmail && primaryContact) {
      try {
        await prisma.companyContact.create({
          data: {
            companyId: company.id,
            name: primaryContact,
            email: contactEmail,
            title: contactTitle || null,
            isPrimary: true,
          }
        })
      } catch (contactErr) {
        // Table may not exist yet or contact already exists - not critical
        console.warn('Failed to create CompanyContact record:', contactErr)
      }
    }

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
          html: getWelcomeEmailHtml({ contactName: primaryContact || null, portalUrl, password: tempPassword })
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
  if (session.user?.role !== 'ADMIN') {
    log.warn('Insufficient permissions for delete', { role: session.user?.role })
    return apiError('Forbidden: requires ADMIN role', log.requestId, 403)
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
