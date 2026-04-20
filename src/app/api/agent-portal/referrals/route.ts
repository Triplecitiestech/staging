import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi, agentPortalUrl } from '@/lib/agent-auth'
import { sendReferralNotification } from '@/lib/agent-email'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

const VALID_EMPLOYEE_RANGES = new Set(['1-10', '11-25', '26-50', '51-100', '100+'])
const VALID_INDUSTRIES = new Set([
  'Healthcare', 'Professional Services', 'Construction', 'Nonprofit',
  'Manufacturing', 'Retail', 'Other',
])

function emailLooksValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function trim(v: unknown, max = 500): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

export async function GET() {
  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  const referrals = await prisma.salesReferral.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      contactName: true,
      contactEmail: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ referrals })
}

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const businessName = trim(body.businessName, 200)
  const contactName = trim(body.contactName, 200)
  const contactEmail = trim(body.contactEmail, 200).toLowerCase()
  const contactPhone = trim(body.contactPhone, 50)
  const addressLine1 = trim(body.addressLine1, 250)
  const city = trim(body.city, 100)
  const state = trim(body.state, 100)
  const zip = trim(body.zip, 20)
  const employeeCountRange = trim(body.employeeCountRange, 20)
  const industry = trim(body.industry, 50)
  const notes = trim(body.notes, 5000)
  const initialDateStr = trim(body.initialConversationDate, 50)
  const consent = body.consent === true

  if (!businessName) return NextResponse.json({ error: 'Business name is required.' }, { status: 400 })
  if (!contactName) return NextResponse.json({ error: 'Contact name is required.' }, { status: 400 })
  if (!contactEmail || !emailLooksValid(contactEmail)) {
    return NextResponse.json({ error: 'A valid contact email is required.' }, { status: 400 })
  }
  if (employeeCountRange && !VALID_EMPLOYEE_RANGES.has(employeeCountRange)) {
    return NextResponse.json({ error: 'Invalid employee count range.' }, { status: 400 })
  }
  if (industry && !VALID_INDUSTRIES.has(industry)) {
    return NextResponse.json({ error: 'Invalid industry selection.' }, { status: 400 })
  }
  if (!consent) {
    return NextResponse.json({
      error: 'You must confirm you have permission to share this contact\'s information.',
    }, { status: 400 })
  }

  let initialConversationDate: Date | null = null
  if (initialDateStr) {
    const d = new Date(initialDateStr)
    if (!isNaN(d.getTime())) initialConversationDate = d
  }

  const referral = await prisma.salesReferral.create({
    data: {
      agentId: agent.id,
      businessName,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      addressLine1: addressLine1 || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      employeeCountRange: employeeCountRange || null,
      industry: industry || null,
      notes: notes || null,
      initialConversationDate,
      status: 'SUBMITTED',
      statusHistory: {
        create: {
          oldStatus: null,
          newStatus: 'SUBMITTED',
          changedByType: 'agent',
          changedByIdentifier: agent.id,
          note: 'Submitted via agent portal',
        },
      },
    },
    select: { id: true },
  })

  // Notify the configured admin inbox. Fire-and-forget — don't block on email
  // failures, but log them. The referral is recorded either way.
  const notifyTo = process.env.SALES_REFERRAL_NOTIFY_EMAIL || 'sales@triplecitiestech.com'
  sendReferralNotification(notifyTo, {
    agentName: `${agent.firstName} ${agent.lastName}`,
    agentEmail: agent.email,
    businessName,
    contactName,
    contactEmail,
    contactPhone: contactPhone || null,
    notes: notes || null,
    adminUrl: agentPortalUrl(`/admin/sales-referrals/${referral.id}`),
  }).then(r => {
    if (!r.ok) console.error('[agent-portal] referral notification email failed:', r.error)
  })

  return NextResponse.json({ success: true, referralId: referral.id })
}
