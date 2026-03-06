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
    return NextResponse.json(
      { error: 'Failed to fetch audiences' },
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
      return NextResponse.json({ error: 'Audience source not found' }, { status: 404 });
    }

    // Resolve recipient count
    const { getAudienceProvider } = await import('@/lib/marketing/audience-providers');
    const provider = getAudienceProvider(source.providerType);
    const recipients = await provider.resolveRecipients(filterCriteria);

    const audience = await prisma.audience.create({
      data: {
        name,
        description: description || null,
        sourceId,
        providerType: source.providerType,
        filterCriteria,
        recipientCount: recipients.length,
        createdBy,
      },
      include: {
        source: { select: { id: true, name: true, providerType: true } },
      },
    });

    return NextResponse.json({ audience }, { status: 201 });
  } catch (error) {
    console.error('Failed to create audience:', error);
    return NextResponse.json(
      { error: 'Failed to create audience' },
      { status: 500 }
    );
  }
}
