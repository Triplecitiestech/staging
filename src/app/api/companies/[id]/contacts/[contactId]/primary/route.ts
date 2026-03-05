import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

interface RouteContext {
  params: Promise<{ id: string; contactId: string }>
}

// PATCH - set this contact as the primary
export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { id: companyId, contactId } = await context.params

    // Unset all other contacts as non-primary
    await prisma.companyContact.updateMany({
      where: { companyId, isPrimary: true },
      data: { isPrimary: false },
    })

    // Set the selected contact as primary
    const contact = await prisma.companyContact.update({
      where: { id: contactId },
      data: { isPrimary: true },
    })

    return NextResponse.json(contact)
  } catch (error) {
    console.error('Failed to set primary contact:', error)
    return NextResponse.json({ error: 'Failed to set primary contact' }, { status: 500 })
  }
}
