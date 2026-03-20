import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HrRequestSummary {
  id: string
  type: 'onboarding' | 'offboarding'
  status: string
  submittedByEmail: string
  submittedByName: string | null
  autotaskTicketNumber: string | null
  employeeName: string
  createdAt: string
  completedAt: string | null
  stepCount: number
  completedStepCount: number
}

// ---------------------------------------------------------------------------
// GET /api/hr/requests
// Returns the 20 most recent HR requests for the authenticated company.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest): Promise<NextResponse> {
  // 1. Validate session
  const session = await getAuthenticatedCompany()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Resolve company
  const company = await prisma.company.findFirst({
    where: { slug: session.companySlug },
  })

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // 3. Fetch recent requests with step counts
  const requests = await prisma.hrRequest.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      steps: {
        select: { status: true },
      },
    },
  })

  // 4. Shape the response
  const summaries: HrRequestSummary[] = requests.map((r) => {
    const answers = (r.answers ?? {}) as Record<string, string>
    const firstName = answers.first_name ?? ''
    const lastName = answers.last_name ?? ''
    const employeeName = `${firstName} ${lastName}`.trim() || 'Unknown Employee'

    return {
      id: r.id,
      type: r.type as 'onboarding' | 'offboarding',
      status: r.status,
      submittedByEmail: r.submittedByEmail,
      submittedByName: r.submittedByName,
      autotaskTicketNumber: r.autotaskTicketNumber,
      employeeName,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      stepCount: r.steps.length,
      completedStepCount: r.steps.filter((s) => s.status === 'completed').length,
    }
  })

  return NextResponse.json({ requests: summaries }, { status: 200 })
}
