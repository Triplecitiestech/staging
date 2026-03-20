import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// GET /api/hr/requests/[id]
// Returns the full HR request including all steps.
// Validates that the request belongs to the authenticated company.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 1. Validate session
  const session = await getAuthenticatedCompany()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
  }

  // 2. Resolve company
  const company = await prisma.company.findFirst({
    where: { slug: session.companySlug },
  })

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // 3. Load the HR request with full steps
  const hrRequest = await prisma.hrRequest.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!hrRequest) {
    return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
  }

  // 4. Verify ownership — prevent cross-company data leakage
  if (hrRequest.companyId !== company.id) {
    // Return 404 (not 403) to avoid revealing existence of other companies' requests
    return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
  }

  // 5. Shape and return the response
  const answers = (hrRequest.answers ?? {}) as Record<string, string>
  const firstName = answers.first_name ?? ''
  const lastName = answers.last_name ?? ''

  return NextResponse.json(
    {
      request: {
        id: hrRequest.id,
        type: hrRequest.type,
        status: hrRequest.status,
        submittedByEmail: hrRequest.submittedByEmail,
        submittedByName: hrRequest.submittedByName,
        answers: hrRequest.answers,
        resolvedActionPlan: hrRequest.resolvedActionPlan,
        autotaskTicketId: hrRequest.autotaskTicketId,
        autotaskTicketNumber: hrRequest.autotaskTicketNumber,
        targetUpn: hrRequest.targetUpn,
        errorMessage: hrRequest.errorMessage,
        retryCount: hrRequest.retryCount,
        startedAt: hrRequest.startedAt?.toISOString() ?? null,
        completedAt: hrRequest.completedAt?.toISOString() ?? null,
        createdAt: hrRequest.createdAt.toISOString(),
        updatedAt: hrRequest.updatedAt.toISOString(),
        employeeName: `${firstName} ${lastName}`.trim() || 'Unknown Employee',
        steps: hrRequest.steps.map((s) => ({
          id: s.id,
          stepKey: s.stepKey,
          stepName: s.stepName,
          status: s.status,
          attempt: s.attempt,
          input: s.input,
          output: s.output,
          error: s.error,
          startedAt: s.startedAt?.toISOString() ?? null,
          completedAt: s.completedAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        })),
      },
    },
    { status: 200 }
  )
}
