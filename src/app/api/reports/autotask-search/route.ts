import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { AutotaskClient } from '@/lib/autotask';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/reports/autotask-search?type=companies&q=<search>
 * GET /api/reports/autotask-search?type=resources&q=<search>
 *
 * Searches Autotask for companies or resources and indicates which ones
 * are already imported into the local database.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'companies';
  const query = request.nextUrl.searchParams.get('q') || '';

  try {
    const client = new AutotaskClient();

    if (type === 'companies') {
      // Search Autotask companies
      const atCompanies = query.length >= 2
        ? await client.searchCompanies(query)
        : [];

      // Get all local companies with their Autotask IDs
      const localCompanies = await prisma.company.findMany({
        where: { autotaskCompanyId: { not: null } },
        select: { id: true, autotaskCompanyId: true, displayName: true },
      });
      const importedAtIds = new Set(
        localCompanies.map(c => c.autotaskCompanyId).filter(Boolean)
      );

      return NextResponse.json({
        results: atCompanies.map(c => ({
          autotaskId: c.id,
          name: c.companyName,
          isImported: importedAtIds.has(String(c.id)),
          localId: localCompanies.find(lc => lc.autotaskCompanyId === String(c.id))?.id || null,
        })),
        total: atCompanies.length,
      });
    }

    if (type === 'resources') {
      // Get all active resources from Autotask
      const atResources = await client.getActiveResources();

      // Get local resources
      const localResources = await prisma.resource.findMany({
        select: { autotaskResourceId: true },
      });
      const importedResIds = new Set(localResources.map(r => r.autotaskResourceId));

      // Filter by query if provided
      const filtered = query
        ? atResources.filter(r => {
            const q = query.toLowerCase();
            const name = `${r.firstName} ${r.lastName}`.toLowerCase();
            return name.includes(q) || r.email.toLowerCase().includes(q);
          })
        : atResources;

      // Filter out API/system users
      const API_PATTERNS = [/\bapi\b/i, /\badministrator\b/i, /\bdashboard user\b/i];
      const humanResources = filtered.filter(r => {
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        return !API_PATTERNS.some(p => p.test(fullName) || p.test(r.email));
      });

      return NextResponse.json({
        results: humanResources.map(r => ({
          autotaskId: r.id,
          name: `${r.firstName} ${r.lastName}`.trim(),
          email: r.email,
          isImported: importedResIds.has(r.id),
        })),
        total: humanResources.length,
      });
    }

    return NextResponse.json({ error: 'Invalid type. Use "companies" or "resources".' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reports/autotask-search
 * Body: { type: "company", autotaskId: 12345 }
 * Body: { type: "resource", autotaskId: 12345 }
 *
 * Imports a company or resource from Autotask into the local database.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, autotaskId } = body as { type: string; autotaskId: number };

    if (!autotaskId) {
      return NextResponse.json({ error: 'autotaskId is required' }, { status: 400 });
    }

    const client = new AutotaskClient();

    if (type === 'company') {
      // Check if already imported
      const existing = await prisma.company.findFirst({
        where: { autotaskCompanyId: String(autotaskId) },
      });
      if (existing) {
        return NextResponse.json({ success: true, action: 'already_exists', id: existing.id });
      }

      // Fetch from Autotask
      const atCompany = await client.getCompany(autotaskId);

      // Create in local DB — generate slug from name, placeholder password hash
      const baseSlug = atCompany.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      // Ensure unique slug
      let slug = baseSlug;
      let counter = 0;
      while (await prisma.company.findUnique({ where: { slug } })) {
        counter++;
        slug = `${baseSlug}-${counter}`;
      }

      const company = await prisma.company.create({
        data: {
          displayName: atCompany.companyName,
          slug,
          passwordHash: '$2b$10$placeholder-not-for-login', // No portal access until explicitly configured
          autotaskCompanyId: String(atCompany.id),
          autotaskLastSync: new Date(),
        },
      });

      return NextResponse.json({ success: true, action: 'imported', id: company.id, name: atCompany.companyName });
    }

    if (type === 'resource') {
      // Check if already imported
      const existing = await prisma.resource.findUnique({
        where: { autotaskResourceId: autotaskId },
      });
      if (existing) {
        return NextResponse.json({ success: true, action: 'already_exists', id: existing.id });
      }

      // Fetch from Autotask
      const atResource = await client.getResource(autotaskId);

      // Create in local DB
      const resource = await prisma.resource.create({
        data: {
          autotaskResourceId: atResource.id,
          firstName: atResource.firstName,
          lastName: atResource.lastName,
          email: atResource.email,
          isActive: atResource.isActive,
          autotaskLastSync: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        action: 'imported',
        id: resource.id,
        name: `${atResource.firstName} ${atResource.lastName}`.trim(),
      });
    }

    return NextResponse.json({ error: 'Invalid type. Use "company" or "resource".' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}
