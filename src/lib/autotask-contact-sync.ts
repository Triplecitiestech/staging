/**
 * Reusable Autotask → local DB contact sync.
 *
 * Extracted from src/app/api/autotask/trigger/route.ts so the same logic
 * can power:
 *   - GET /api/autotask/trigger?step=contacts            (existing secret-auth path)
 *   - POST /api/admin/contacts/sync                       (admin-session path used by Pipeline Status)
 *   - sync_contacts job in /api/reports/jobs/run         (consistent with other pipeline jobs)
 *
 * Side effects: writes company_contacts rows, may update companies.primaryContact / contactEmail,
 * appends an AutotaskSyncLog row.
 */

import { prisma } from '@/lib/prisma'
import { AutotaskClient } from '@/lib/autotask'
import { createJobTracker } from '@/lib/reporting/job-status'
import { JOB_NAMES } from '@/lib/reporting/types'

export interface ContactSyncResult {
  created: number
  updated: number
  companiesProcessed: number
  errors: string[]
  durationMs: number
}

/**
 * Ensure the company_contacts table and its constraints exist. Idempotent —
 * safe to call on every invocation.
 */
async function ensureContactsTable(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM company_contacts LIMIT 1`
    return
  } catch {
    // Table doesn't exist — create it below.
  }

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PhoneType" AS ENUM ('MOBILE', 'WORK');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "company_contacts" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "title" TEXT,
      "phone" TEXT,
      "phoneType" "PhoneType",
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "autotaskContactId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
    );
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_companyId_email_key" ON "company_contacts"("companyId", "email");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_autotaskContactId_key" ON "company_contacts"("autotaskContactId");
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)
}

/**
 * Sync Autotask contacts for every locally-tracked company that has an
 * autotaskCompanyId. Optionally scope to a single company by passing companyId.
 */
export async function syncAutotaskContacts(options?: {
  client?: AutotaskClient
  /** When provided, only sync contacts for this single local company id */
  companyId?: string
}): Promise<ContactSyncResult> {
  await ensureContactsTable()

  const client = options?.client ?? new AutotaskClient()
  const startTime = Date.now()
  const errors: string[] = []
  let created = 0
  let updated = 0

  // Only update Pipeline Status row for the "all companies" bulk run, not
  // the per-company onboarding-flow variant (that one has its own UI feedback).
  const finishJob = options?.companyId ? null : createJobTracker(JOB_NAMES.SYNC_CONTACTS)

  const companies = await prisma.company.findMany({
    where: {
      autotaskCompanyId: { not: null },
      ...(options?.companyId ? { id: options.companyId } : {}),
    },
    select: { id: true, autotaskCompanyId: true, displayName: true },
  })

  for (const company of companies) {
    if (!company.autotaskCompanyId) continue
    try {
      const atContacts = await client.getContactsByCompany(parseInt(company.autotaskCompanyId, 10))

      for (const atContact of atContacts) {
        try {
          const name = `${atContact.firstName} ${atContact.lastName}`.trim()
          const email = atContact.emailAddress || `contact-${atContact.id}@placeholder.local`
          const atId = String(atContact.id)

          const existing = await prisma.companyContact.findFirst({
            where: { autotaskContactId: atId },
            select: { id: true, title: true, phone: true, phoneType: true },
          })

          if (existing) {
            await prisma.companyContact.update({
              where: { id: existing.id },
              data: {
                name,
                email,
                title: atContact.title || existing.title,
                phone: atContact.mobilePhone || atContact.phone || existing.phone,
                phoneType: atContact.mobilePhone ? 'MOBILE' : atContact.phone ? 'WORK' : existing.phoneType,
              },
            })
            updated++
          } else {
            const emailExists = await prisma.companyContact.findFirst({
              where: { companyId: company.id, email },
              select: { id: true },
            })

            if (emailExists) {
              await prisma.companyContact.update({
                where: { id: emailExists.id },
                data: { name, autotaskContactId: atId },
              })
              updated++
            } else {
              await prisma.companyContact.create({
                data: {
                  companyId: company.id,
                  name,
                  email,
                  title: atContact.title,
                  phone: atContact.mobilePhone || atContact.phone,
                  phoneType: atContact.mobilePhone ? 'MOBILE' : atContact.phone ? 'WORK' : undefined,
                  autotaskContactId: atId,
                },
              })
              created++
            }
          }
        } catch (err) {
          errors.push(`Contact ${atContact.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Update company primaryContact / contactEmail with first real contact
      if (atContacts.length > 0) {
        const primaryContact = atContacts.find(c => c.emailAddress && !c.emailAddress.includes('@placeholder.local')) || atContacts[0]
        if (primaryContact) {
          const contactName = `${primaryContact.firstName} ${primaryContact.lastName}`.trim()
          const contactEmail = primaryContact.emailAddress || null
          try {
            await prisma.company.update({
              where: { id: company.id },
              data: {
                primaryContact: contactName,
                ...(contactEmail ? { contactEmail } : {}),
              },
            })
          } catch {
            // Non-critical — don't fail the sync
          }
        }
      }
    } catch (err) {
      errors.push(`Contacts for ${company.displayName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const durationMs = Date.now() - startTime

  try {
    await prisma.autotaskSyncLog.create({
      data: {
        syncType: 'contacts',
        status: errors.length === 0 ? 'success' : 'partial',
        contactsCreated: created,
        contactsUpdated: updated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        durationMs,
        completedAt: new Date(),
      },
    })
  } catch {
    // Don't fail the sync if logging fails
  }

  // Update Pipeline Status row so "Sync Contacts" shows last-run time and status
  if (finishJob) {
    try {
      await finishJob({
        status: errors.length === 0 ? 'success' : 'partial',
        ...(errors.length > 0 ? { error: errors.slice(0, 3).join('; ') } : {}),
        meta: {
          contactsCreated: created,
          contactsUpdated: updated,
          companiesProcessed: companies.length,
        },
      })
    } catch {
      // Tracker writes are best-effort — never fail the sync because of UI accounting
    }
  }

  return { created, updated, companiesProcessed: companies.length, errors, durationMs }
}
