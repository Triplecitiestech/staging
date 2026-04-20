import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const referrals = await prisma.salesReferral.findMany({
    orderBy: { createdAt: 'desc' },
    include: { agent: { select: { firstName: true, lastName: true, email: true } } },
  })

  const headers = [
    'Submitted', 'Last Updated', 'Agent', 'Agent Email',
    'Business Name', 'Contact Name', 'Contact Email', 'Contact Phone',
    'Address', 'City', 'State', 'Zip',
    'Employees', 'Industry', 'Status',
    'Contract Monthly Value', 'Commission Due', 'Commission Paid',
    'Initial Conversation', 'Notes',
  ]

  const lines = [headers.join(',')]
  for (const r of referrals) {
    lines.push([
      r.createdAt.toISOString(),
      r.updatedAt.toISOString(),
      `${r.agent.firstName} ${r.agent.lastName}`,
      r.agent.email,
      r.businessName,
      r.contactName,
      r.contactEmail,
      r.contactPhone,
      r.addressLine1,
      r.city,
      r.state,
      r.zip,
      r.employeeCountRange,
      r.industry,
      r.status,
      r.contractMonthlyValue ? r.contractMonthlyValue.toString() : '',
      r.commissionDueDate ? r.commissionDueDate.toISOString().slice(0, 10) : '',
      r.commissionPaidDate ? r.commissionPaidDate.toISOString().slice(0, 10) : '',
      r.initialConversationDate ? r.initialConversationDate.toISOString().slice(0, 10) : '',
      r.notes,
    ].map(csvEscape).join(','))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="referrals-${stamp}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
