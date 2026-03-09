import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marketing/audiences/[id] — Get audience details with resolved members
 * DELETE /api/marketing/audiences/[id] — Soft-delete an audience
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prisma } = await import('@/lib/prisma');

    const audience = await prisma.audience.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, providerType: true } },
      },
    });

    if (!audience) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 });
    }

    // Resolve current members from the audience's filter criteria
    let members: Array<{ name: string; email: string; companyName?: string }> = [];
    let resolveError: string | undefined;
    try {
      const { getAudienceProvider } = await import('@/lib/marketing/audience-providers');
      const provider = getAudienceProvider(audience.source.providerType);
      const filterCriteria = audience.filterCriteria as Record<string, unknown>;
      const recipients = await provider.resolveRecipients(filterCriteria);
      members = recipients.map(r => ({
        name: r.name,
        email: r.email,
        companyName: r.companyName,
      }));
    } catch (err) {
      console.error(`[Audience ${id}] Failed to resolve members:`, err);
      resolveError = err instanceof Error ? err.message : 'Failed to resolve members';
    }

    return NextResponse.json({
      audience,
      members,
      resolveError,
    });
  } catch (error) {
    console.error('Failed to fetch audience details:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch audience: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prisma } = await import('@/lib/prisma');

    // Check if audience exists
    const audience = await prisma.audience.findUnique({ where: { id } });
    if (!audience) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 });
    }

    // Check if any campaigns reference this audience
    const campaignCount = await prisma.communicationCampaign.count({
      where: { audienceId: id },
    });

    if (campaignCount > 0) {
      // Soft-delete: mark as inactive instead of deleting
      await prisma.audience.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        deleted: true,
        softDelete: true,
        message: `Audience deactivated (${campaignCount} campaign(s) reference it)`,
      });
    }

    // Hard delete if no campaigns reference it
    await prisma.audience.delete({ where: { id } });
    return NextResponse.json({ deleted: true, softDelete: false });
  } catch (error) {
    console.error('Failed to delete audience:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to delete audience: ${message}` },
      { status: 500 }
    );
  }
}
