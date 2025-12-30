import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export async function POST(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { displayName, primaryContact, contactEmail, contactTitle } = await req.json()

    const company = await prisma.company.create({
      data: {
        displayName,
        slug: displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        primaryContact: primaryContact || null,
        contactEmail: contactEmail || null,
        contactTitle: contactTitle || null,
        passwordHash: 'temp', // Placeholder - should be set properly later
      }
    })

    return NextResponse.json(company)
  } catch {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
    }

    await prisma.company.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting company:', error)
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 })
  }
}
