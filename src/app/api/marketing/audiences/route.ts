import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marketing/audiences — List all audiences
 * POST /api/marketing/audiences — Create a new audience
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const audiences = await prisma.audience.findMany({
      where: { isActive: true },
      include: {
        source: { select: { id: true, name: true, providerType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ audiences });
  } catch (error) {
    console.error('Failed to fetch audiences:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch audiences: ${message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();

    const { name, description, sourceId, filterCriteria, createdBy } = body;

    if (!name || !sourceId || !filterCriteria || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: name, sourceId, filterCriteria, createdBy' },
        { status: 400 }
      );
    }

    // Verify source exists
    const source = await prisma.audienceSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return NextResponse.json(
        { error: `Audience source not found for id: ${sourceId}. Try refreshing the page.` },
        { status: 404 }
      );
    }

    // Resolve recipient count — don't let resolution failure block audience creation
    let recipientCount = 0;
    let resolveWarning: string | undefined;
    try {
      const { getAudienceProvider } = await import('@/lib/marketing/audience-providers');
      const provider = getAudienceProvider(source.providerType);
      const recipients = await provider.resolveRecipients(filterCriteria);
      recipientCount = recipients.length;

      // Warn if contact groups were selected but resolved to 0 recipients
      if (recipientCount === 0 && filterCriteria.contactGroupIds?.length > 0) {
        resolveWarning = `Selected contact group(s) resolved to 0 recipients. The Autotask ContactGroupContacts API may not have members for these groups, or contacts may lack email addresses.`;
      }
    } catch (resolveError) {
      console.error('Recipient resolution failed (creating audience anyway):', resolveError);
      resolveWarning = `Audience created but recipient count could not be resolved: ${
        resolveError instanceof Error ? resolveError.message : 'Unknown error'
      }`;
    }

    const audience = await prisma.audience.create({
      data: {
        name,
        description: description || null,
        sourceId,
        providerType: source.providerType,
        filterCriteria,
        recipientCount,
        createdBy,
      },
      include: {
        source: { select: { id: true, name: true, providerType: true } },
      },
    });

    return NextResponse.json({ audience, warning: resolveWarning }, { status: 201 });
  } catch (error) {
    console.error('Failed to create audience:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create audience: ${message}` },
      { status: 500 }
    );
  }
}
