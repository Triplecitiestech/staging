import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH - update company details
export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = await context.params
    const data = await req.json()

    const updateData: Record<string, string | null> = {}
    if (data.displayName !== undefined) updateData.displayName = data.displayName
    if (data.primaryContact !== undefined) updateData.primaryContact = data.primaryContact || null
    if (data.contactTitle !== undefined) updateData.contactTitle = data.contactTitle || null
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail || null

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(company)
  } catch (error) {
    console.error('Failed to update company:', error)
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
  }
}
