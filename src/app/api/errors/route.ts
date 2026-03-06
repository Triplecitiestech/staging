import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logError } from '@/lib/error-logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/errors — Log a client-side error
 * GET /api/errors — List recent errors (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, stack, path, source, metadata } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    await logError({
      source: source || 'client',
      message: String(message).substring(0, 2000),
      stack: stack ? String(stack).substring(0, 5000) : undefined,
      path: path || request.headers.get('referer') || undefined,
      metadata,
    });

    return NextResponse.json({ logged: true });
  } catch (error) {
    console.error('[Error API] Failed to log error:', error);
    return NextResponse.json({ error: 'Failed to log error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');

    const resolved = request.nextUrl.searchParams.get('resolved') === 'true';
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 200);

    const errors = await prisma.errorLog.findMany({
      where: { resolved },
      orderBy: { lastSeen: 'desc' },
      take: limit,
    });

    const stats = {
      total: await prisma.errorLog.count(),
      unresolved: await prisma.errorLog.count({ where: { resolved: false } }),
      last24h: await prisma.errorLog.count({
        where: { lastSeen: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    };

    return NextResponse.json({ errors, stats });
  } catch (error) {
    console.error('[Error API] Failed to fetch errors:', error);
    return NextResponse.json({ errors: [], stats: {} }, { status: 500 });
  }
}
