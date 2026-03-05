import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - migrate existing Company.primaryContact/contactEmail into CompanyContact records
export async function POST() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        primaryContact: true,
        contactEmail: true,
        contactTitle: true,
      },
    })

    let created = 0
    let skipped = 0

    for (const company of companies) {
      if (!company.primaryContact || !company.contactEmail) {
        skipped++
        continue
      }

      // Check if a CompanyContact already exists for this email
      const existing = await prisma.companyContact.findUnique({
        where: {
          companyId_email: {
            companyId: company.id,
            email: company.contactEmail,
          },
        },
      })

      if (existing) {
        skipped++
        continue
      }

      await prisma.companyContact.create({
        data: {
          companyId: company.id,
          name: company.primaryContact,
          email: company.contactEmail,
          title: company.contactTitle || null,
          isPrimary: true,
          isActive: true,
        },
      })
      created++
    }

    return NextResponse.json({
      success: true,
      message: `Migrated ${created} contacts, skipped ${skipped}`,
      created,
      skipped,
      total: companies.length,
    })
  } catch (error) {
    console.error('Contact migration failed:', error)
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 })
  }
}
