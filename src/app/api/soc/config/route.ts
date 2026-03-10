import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/soc/config — Read all SOC config */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.$queryRaw<{ key: string; value: string; updatedAt: Date; updatedBy: string | null }[]>`
    SELECT key, value, "updatedAt", "updatedBy" FROM soc_config ORDER BY key
  `;

  return NextResponse.json({ config: rows });
}

/** PUT /api/soc/config — Update SOC config keys */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates = body.updates as Record<string, string>;

  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates object required' }, { status: 400 });
  }

  const email = session.user.email;
  const updated: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    await prisma.$executeRawUnsafe(`
      UPDATE soc_config SET value = $1, "updatedAt" = now(), "updatedBy" = $2 WHERE key = $3
    `, String(value), email, key);
    updated.push(key);
  }

  return NextResponse.json({ success: true, updated });
}
