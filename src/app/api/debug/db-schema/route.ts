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
          }
        })
      }
    } catch (e: any) {
      testError = {
        message: e.message,
        code: e.code,
        meta: e.meta,
        fullError: JSON.stringify(e, null, 2)
      }
    }

    return NextResponse.json({
      existingProjectStructure: existingProject ? Object.keys(existingProject) : null,
      existingProjectSample: existingProject,
      testCreationError: testError,
      schemaInfo: 'Check what fields are required vs optional'
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      fullError: JSON.stringify(error, null, 2)
    }, { status: 500 })
  }
}
