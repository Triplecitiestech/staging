import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marketing/audiences/sources — List audience sources
 * POST /api/marketing/audiences/sources — Initialize default sources
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const sources = await prisma.audienceSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Failed to fetch audience sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audience sources' },
      { status: 500 }
    );
  }
}

/**
 * POST — Ensure default Autotask source exists (idempotent setup)
 */
export async function POST(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();
    const { action } = body;

    if (action === 'init-defaults') {
      // Create default Autotask source if it doesn't exist
      const existing = await prisma.audienceSource.findFirst({
        where: { providerType: 'AUTOTASK' },
      });

      if (!existing) {
        await prisma.audienceSource.create({
          data: {
            name: 'Autotask PSA',
            providerType: 'AUTOTASK',
            config: {},
            isActive: true,
          },
        });
      }

      const sources = await prisma.audienceSource.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({ sources, initialized: !existing });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to manage audience sources:', error);
    return NextResponse.json(
      { error: 'Failed to manage audience sources' },
      { status: 500 }
    );
  }
}
