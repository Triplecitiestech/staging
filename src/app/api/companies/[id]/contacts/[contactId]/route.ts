import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

interface RouteContext {
  params: Promise<{ id: string; contactId: string }>
}

// DELETE - remove a contact
export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { contactId } = await context.params

    await prisma.companyContact.delete({
      where: { id: contactId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete contact:', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
