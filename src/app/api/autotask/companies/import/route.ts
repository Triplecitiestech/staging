import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/autotask/companies/import
 * Import a company from Autotask and sync its contacts, projects, and tickets.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { autotaskCompanyId, companyId } = body;

    if (!autotaskCompanyId) {
      return NextResponse.json({ error: 'autotaskCompanyId required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();

    // Fetch company data from Autotask
    const atCompany = await client.getCompany(parseInt(autotaskCompanyId, 10));

    // Find or create local company
    let company;
    if (companyId) {
      // Link existing company to Autotask
      company = await prisma.company.update({
        where: { id: companyId },
        data: {
          autotaskCompanyId: String(atCompany.id),
          displayName: atCompany.companyName,
        },
      });
    } else {
      // Check if company already exists with this Autotask ID
      company = await prisma.company.findFirst({
        where: { autotaskCompanyId: String(atCompany.id) },
      });

      if (!company) {
        const slug = atCompany.companyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        // Generate a random password hash for imported companies
        const bcrypt = await import('bcryptjs');
        const crypto = await import('crypto');
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        company = await prisma.company.create({
          data: {
            displayName: atCompany.companyName,
            slug,
            autotaskCompanyId: String(atCompany.id),
            passwordHash,
          },
        });
      }
    }

    const syncResults = { contacts: 0, projects: 0, errors: [] as string[] };

    // Sync contacts
    try {
      const contacts = await client.getContactsByCompany(atCompany.id);
      for (const contact of contacts) {
        try {
          await prisma.companyContact.upsert({
            where: {
              companyId_email: {
                companyId: company.id,
                email: contact.emailAddress || `nomail-${contact.id}@placeholder.local`,
              },
            },
            create: {
              companyId: company.id,
              name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
              email: contact.emailAddress || `nomail-${contact.id}@placeholder.local`,
              title: contact.title || null,
              phone: contact.phone || null,
              autotaskContactId: String(contact.id),
              isActive: true,
            },
            update: {
              name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
              title: contact.title || null,
              phone: contact.phone || null,
              autotaskContactId: String(contact.id),
              isActive: true,
            },
          });
          syncResults.contacts++;
        } catch (contactErr) {
          syncResults.errors.push(`Contact ${contact.id}: ${contactErr instanceof Error ? contactErr.message : 'Unknown error'}`);
        }
      }
    } catch (contactsErr) {
      syncResults.errors.push(`Contacts sync: ${contactsErr instanceof Error ? contactsErr.message : 'Unknown error'}`);
    }

    // Sync projects
    try {
      const projects = await client.getProjectsByCompany(atCompany.id);
      for (const project of projects) {
        try {
          const projectSlug = `at-proj-${project.id}`;
          await prisma.project.upsert({
            where: { slug: projectSlug },
            create: {
              title: project.projectName,
              slug: projectSlug,
              companyId: company.id,
              projectType: 'CUSTOM',
              status: project.status === 5 ? 'COMPLETED' : 'ACTIVE',
              autotaskProjectId: String(project.id),
              createdBy: 'autotask-import',
              lastModifiedBy: 'autotask-import',
            },
            update: {
              title: project.projectName,
              companyId: company.id,
              status: project.status === 5 ? 'COMPLETED' : 'ACTIVE',
              lastModifiedBy: 'autotask-import',
            },
          });
          syncResults.projects++;
        } catch (projErr) {
          syncResults.errors.push(`Project ${project.id}: ${projErr instanceof Error ? projErr.message : 'Unknown error'}`);
        }
      }
    } catch (projectsErr) {
      syncResults.errors.push(`Projects sync: ${projectsErr instanceof Error ? projectsErr.message : 'Unknown error'}`);
    }

    return NextResponse.json({
      success: true,
      company: { id: company.id, displayName: company.displayName, slug: company.slug },
      sync: syncResults,
    });
  } catch (error) {
    console.error('[Autotask Company Import] Error:', error);
    return NextResponse.json(
      { error: 'Failed to import company', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
