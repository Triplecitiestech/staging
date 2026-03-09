import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

/**
 * Ensures the customer portal columns exist on company_contacts table.
 * Safe to call multiple times (idempotent).
 */
async function ensureContactPortalColumns() {
  const columns = [
    { name: 'customerRole', sql: `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "customerRole" TEXT NOT NULL DEFAULT 'CLIENT_USER'` },
    { name: 'inviteStatus', sql: `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "inviteStatus" TEXT NOT NULL DEFAULT 'NOT_INVITED'` },
    { name: 'invitedAt', sql: `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP` },
    { name: 'inviteAcceptedAt', sql: `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" TIMESTAMP` },
    { name: 'lastPortalLogin', sql: `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "lastPortalLogin" TIMESTAMP` },
  ]

  // Create enums if they don't exist
  const enums = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerRole') THEN CREATE TYPE "CustomerRole" AS ENUM ('CLIENT_MANAGER', 'CLIENT_USER', 'CLIENT_VIEWER'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InviteStatus') THEN CREATE TYPE "InviteStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACCEPTED', 'DECLINED'); END IF; END $$`,
  ]

  for (const sql of enums) {
    try { await prisma.$executeRawUnsafe(sql) } catch { /* enum may already exist */ }
  }
  for (const col of columns) {
    try { await prisma.$executeRawUnsafe(col.sql) } catch { /* column may already exist */ }
  }
}

/**
 * GET /api/contacts/invite — Get invite preview HTML for a contact
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contactId = request.nextUrl.searchParams.get('contactId')
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  await ensureContactPortalColumns()

  const contact = await prisma.companyContact.findUnique({
    where: { id: contactId },
    include: { company: { select: { displayName: true, slug: true } } },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const html = generateInviteEmailHtml({
    contactName: contact.name,
    companyName: contact.company.displayName,
    companySlug: contact.company.slug,
    portalUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'}/onboarding/${contact.company.slug}`,
  })

  return NextResponse.json({ html, contact: { id: contact.id, name: contact.name, email: contact.email, companyName: contact.company.displayName } })
}

/**
 * POST /api/contacts/invite — Send portal invite to one or more contacts
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureContactPortalColumns()

  const { contactIds, staffEmail } = await request.json()

  if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds array is required' }, { status: 400 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 503 })
  }

  const resend = new Resend(resendKey)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
  const results: { contactId: string; success: boolean; error?: string }[] = []

  for (const contactId of contactIds) {
    try {
      const contact = await prisma.companyContact.findUnique({
        where: { id: contactId },
        include: { company: { select: { displayName: true, slug: true } } },
      })

      if (!contact) {
        results.push({ contactId, success: false, error: 'Contact not found' })
        continue
      }

      const portalUrl = `${baseUrl}/onboarding/${contact.company.slug}`

      const html = generateInviteEmailHtml({
        contactName: contact.name,
        companyName: contact.company.displayName,
        companySlug: contact.company.slug,
        portalUrl,
      })

      const { error } = await resend.emails.send({
        from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
        to: contact.email,
        subject: `You're Invited to the ${contact.company.displayName} Customer Portal — Triple Cities Tech`,
        html,
      })

      if (error) {
        results.push({ contactId, success: false, error: error.message })
        continue
      }

      // Update invite status
      await prisma.$executeRawUnsafe(
        `UPDATE "company_contacts" SET "inviteStatus" = 'INVITED', "invitedAt" = NOW() WHERE id = $1`,
        contactId,
      )

      results.push({ contactId, success: true })
    } catch (err) {
      results.push({ contactId, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    sentBy: staffEmail || session.user?.email,
  })
}

/**
 * PATCH /api/contacts/invite — Update contact role
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ensureContactPortalColumns()

  const { contactId, customerRole } = await request.json()
  const validRoles = ['CLIENT_MANAGER', 'CLIENT_USER', 'CLIENT_VIEWER']

  if (!contactId || !validRoles.includes(customerRole)) {
    return NextResponse.json({ error: 'contactId and valid customerRole required' }, { status: 400 })
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "company_contacts" SET "customerRole" = $1 WHERE id = $2`,
    customerRole, contactId,
  )

  return NextResponse.json({ success: true })
}

// ============================================================
// Email template
// ============================================================

interface InviteEmailParams {
  contactName: string
  companyName: string
  companySlug: string
  portalUrl: string
}

function generateInviteEmailHtml(params: InviteEmailParams): string {
  const { contactName, companyName, portalUrl } = params

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the ${companyName} Customer Portal</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 32px; text-align: center; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 0; font-size: 14px; color: #94a3b8; }
    .content { padding: 32px; }
    .greeting { font-size: 16px; margin-bottom: 20px; }
    .greeting strong { color: #0f172a; }
    .intro { font-size: 15px; color: #475569; margin-bottom: 24px; line-height: 1.7; }
    .features { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .features h3 { margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #0f172a; }
    .feature-list { list-style: none; padding: 0; margin: 0; }
    .feature-list li { padding: 6px 0; font-size: 14px; color: #475569; display: flex; align-items: center; gap: 8px; }
    .feature-list li::before { content: '\\2713'; color: #06b6d4; font-weight: 700; font-size: 14px; }
    .cta-section { text-align: center; margin: 32px 0; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: white !important; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .how-to { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .how-to h3 { margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #0f172a; }
    .steps { list-style: none; padding: 0; margin: 0; counter-reset: steps; }
    .steps li { padding: 6px 0; font-size: 14px; color: #475569; counter-increment: steps; display: flex; gap: 10px; }
    .steps li::before { content: counter(steps); background: #06b6d4; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .notice { font-size: 13px; color: #64748b; background: #f8fafc; border-left: 3px solid #06b6d4; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0; }
    .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #94a3b8; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Triple Cities Tech</h1>
      <p>Customer Portal Invitation</p>
    </div>
    <div class="content">
      <p class="greeting">Hi <strong>${contactName}</strong>,</p>
      <p class="intro">
        You have been invited to join the <strong>${companyName}</strong> customer portal on Triple Cities Tech. This secure portal gives you direct access to your company's IT services, projects, and support.
      </p>

      <div class="features">
        <h3>What You Can Do</h3>
        <ul class="feature-list">
          <li>View the status of your company's active projects and phases</li>
          <li>Track and submit support tickets</li>
          <li>View ticket history and communication timeline</li>
          <li>Access customer-specific announcements and updates</li>
          <li>Review project milestones and deliverables</li>
        </ul>
      </div>

      <div class="cta-section">
        <a href="${portalUrl}" class="cta-button">Access Your Portal</a>
      </div>

      <div class="how-to">
        <h3>How to Get Started</h3>
        <ol class="steps">
          <li>Click the &quot;Access Your Portal&quot; button above</li>
          <li>Enter the company password provided by your IT administrator or Triple Cities Tech</li>
          <li>You'll see your dashboard with all projects, tickets, and updates</li>
        </ol>
      </div>

      <div class="notice">
        <strong>Security Note:</strong> Your portal access is limited to ${companyName}'s data only. You will never see information belonging to other organizations. Internal team notes and administrative data are not visible to portal users.
      </div>
    </div>
    <div class="footer">
      <p>Triple Cities Tech &bull; Managed IT Services</p>
      <p><a href="https://www.triplecitiestech.com">triplecitiestech.com</a> &bull; <a href="mailto:support@triplecitiestech.com">support@triplecitiestech.com</a></p>
      <p style="margin-top: 8px; font-size: 11px; color: #cbd5e1;">If you did not expect this invitation, please ignore this email or contact our support team.</p>
    </div>
  </div>
</body>
</html>`
}
