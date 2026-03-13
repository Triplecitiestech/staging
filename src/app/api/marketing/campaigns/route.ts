import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Prisma, CampaignStatus } from '@prisma/client';

/**
 * GET /api/marketing/campaigns — List campaigns (auth required, SUPER_ADMIN/ADMIN)
 * POST /api/marketing/campaigns — Create a new campaign (auth required, SUPER_ADMIN/ADMIN)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires Super Admin or Admin role' }, { status: 403 });
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
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires Super Admin or Admin role' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();

    const { name, contentType, visibility, deliveryMode, topic, audienceId, createdBy } = body;

    if (!name || !contentType || !topic || !audienceId || !createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: name, contentType, topic, audienceId, createdBy' },
        { status: 400 }
      );
    }

    // Validate visibility (default to PUBLIC for backwards compatibility)
    const validVisibilities = ['PUBLIC', 'CUSTOMER', 'INTERNAL'];
    const campaignVisibility = validVisibilities.includes(visibility) ? visibility : 'PUBLIC';

    // Validate delivery mode (default to BLOG_AND_EMAIL for backwards compatibility)
    const validDeliveryModes = ['BLOG_AND_EMAIL', 'EMAIL_ONLY', 'BLOG_ONLY'];
    const campaignDeliveryMode = validDeliveryModes.includes(deliveryMode) ? deliveryMode : 'BLOG_AND_EMAIL';

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
        visibility: campaignVisibility,
        deliveryMode: campaignDeliveryMode,
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
        details: { contentType, visibility: campaignVisibility, deliveryMode: campaignDeliveryMode, audienceId },
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('Failed to create campaign:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create campaign: ${message}` },
      { status: 500 }
    );
  }
}
