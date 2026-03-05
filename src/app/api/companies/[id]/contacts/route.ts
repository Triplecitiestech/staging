import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET contacts for a company
export async function GET(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = await context.params

    const contacts = await prisma.companyContact.findMany({
      where: { companyId: id },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }]
    })

    return NextResponse.json(contacts)
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}

// POST new contact for a company
export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { id } = await context.params
    const data = await req.json()

    if (!data.name || !data.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Verify company exists
    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const contact = await prisma.companyContact.create({
      data: {
        companyId: id,
        name: data.name,
        email: data.email,
        title: data.title || null,
        phone: data.phone || null,
        isPrimary: data.isPrimary ?? false,
      }
    })

    return NextResponse.json(contact)
  } catch (error) {
    console.error('Failed to create contact:', error)
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'A contact with this email already exists for this company' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    )
  }
}
