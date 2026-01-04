import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { prisma } = await import("@/lib/prisma")
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try to get the actual database schema by inspecting an existing project
    const existingProject = await prisma.project.findFirst({
      include: {
        company: true,
        phases: true
      }
    })

    // Try creating a minimal project to see what fails
    let testError = null
    try {
      const testCompany = await prisma.company.findFirst()
      if (testCompany) {
        await prisma.project.create({
          data: {
            companyId: testCompany.id,
            projectType: 'CUSTOM',
            title: 'TEST_DELETE_ME',
            slug: 'test-delete-me-' + Date.now(),
            status: 'ACTIVE',
            createdBy: session.user.email,
            lastModifiedBy: session.user.email,
            aiGenerated: false,
          }
        })
      }
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; meta?: unknown }
      testError = {
        message: err.message || 'Unknown error',
        code: err.code || 'UNKNOWN',
        meta: err.meta,
        fullError: JSON.stringify(e, null, 2)
      }
    }

    return NextResponse.json({
      existingProjectStructure: existingProject ? Object.keys(existingProject) : null,
      existingProjectSample: existingProject,
      testCreationError: testError,
      schemaInfo: 'Check what fields are required vs optional'
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    return NextResponse.json({
      error: err.message || 'Unknown error',
      fullError: JSON.stringify(error, null, 2)
    }, { status: 500 })
  }
}
