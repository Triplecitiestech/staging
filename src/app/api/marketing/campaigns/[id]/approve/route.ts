import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * POST /api/marketing/campaigns/[id]/approve — Approve campaign (auth required, ADMIN/MANAGER)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;
    const body = await request.json();
    const { staffEmail, action, rejectionReason } = body;

    if (!staffEmail) {
      return NextResponse.json({ error: 'staffEmail is required' }, { status: 400 });
    }

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'CONTENT_READY') {
      return NextResponse.json(
        { error: `Campaign must be in CONTENT_READY status to approve/reject (current: ${campaign.status})` },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      const updated = await prisma.communicationCampaign.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: staffEmail,
          lastModifiedBy: staffEmail,
        },
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'approved',
          staffEmail,
        },
      });

      return NextResponse.json({ campaign: updated });
    } else if (action === 'reject') {
      const updated = await prisma.communicationCampaign.update({
        where: { id },
        data: {
          status: 'DRAFT',
          rejectionReason: rejectionReason || 'Content rejected — needs revision',
          lastModifiedBy: staffEmail,
        },
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'rejected',
          staffEmail,
          details: { reason: rejectionReason },
        },
      });

      return NextResponse.json({ campaign: updated });
    }

    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  } catch (error) {
    console.error('Failed to process approval:', error);
    return NextResponse.json(
      { error: 'Failed to process approval' },
      { status: 500 }
    );
  }
}
