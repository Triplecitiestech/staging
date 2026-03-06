import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Prisma, CampaignStatus } from '@prisma/client';

/**
 * GET /api/marketing/campaigns — List campaigns (auth required, ADMIN/MANAGER)
 * POST /api/marketing/campaigns — Create a new campaign (auth required, ADMIN/MANAGER)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires ADMIN or MANAGER role' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const status = request.nextUrl.searchParams.get('status');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    const where: Prisma.CommunicationCampaignWhereInput = {};
    if (status) {
      where.status = status as CampaignStatus;
    }

    const campaigns = await prisma.communicationCampaign.findMany({
      where,
      include: {
        audience: {
          select: { id: true, name: true, recipientCount: true, providerType: true },
        },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Failed to fetch campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires ADMIN or MANAGER role' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();

    const { name, contentType, topic, audienceId, createdBy } = body;

    if (!name || !contentType || !topic || !audienceId || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: name, contentType, topic, audienceId, createdBy' },
        { status: 400 }
      );
    }

    // Verify audience exists
    const audience = await prisma.audience.findUnique({
      where: { id: audienceId },
    });

    if (!audience) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 });
    }

    const campaign = await prisma.communicationCampaign.create({
      data: {
        name,
        contentType,
        topic,
        audienceId,
        status: 'DRAFT',
        createdBy,
        lastModifiedBy: createdBy,
      },
      include: {
        audience: {
          select: { id: true, name: true, recipientCount: true },
        },
      },
    });

    // Create audit log
    await prisma.campaignAuditLog.create({
      data: {
        campaignId: campaign.id,
        action: 'created',
        staffEmail: createdBy,
        details: { contentType, audienceId },
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('Failed to create campaign:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}
