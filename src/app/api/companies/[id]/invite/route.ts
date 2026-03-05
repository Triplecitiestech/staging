import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'
import { getWelcomeEmailHtml } from '@/lib/email-templates'

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
      html: getWelcomeEmailHtml({
        contactName: company.primaryContact,
        portalUrl,
        password,
      })
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
