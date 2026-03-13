import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/soc/rules — List all SOC rules */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rules = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_rules ORDER BY priority ASC, "createdAt" DESC
  `;

  return NextResponse.json({ rules });
}

/** POST /api/soc/rules — Create a new rule */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, ruleType, pattern, action, priority } = body;

  if (!name || !ruleType || !pattern || !action) {
    return NextResponse.json({ error: 'name, ruleType, pattern, and action are required' }, { status: 400 });
  }

  const [rule] = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO soc_rules (id, name, description, "ruleType", pattern, action, priority, "createdBy")
    VALUES (gen_random_uuid()::text, ${name}, ${description || null}, ${ruleType}, ${JSON.stringify(pattern)}::jsonb, ${action}, ${priority || 100}, ${session.user.email})
    RETURNING id
  `;

  return NextResponse.json({ success: true, id: rule.id });
}

/** PUT /api/soc/rules — Update an existing rule */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, description, ruleType, pattern, action, isActive, priority } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(`
    UPDATE soc_rules SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      "ruleType" = COALESCE($4, "ruleType"),
      pattern = COALESCE($5::jsonb, pattern),
      action = COALESCE($6, action),
      "isActive" = COALESCE($7, "isActive"),
      priority = COALESCE($8, priority),
      "updatedAt" = now()
    WHERE id = $1
  `, id, name || null, description, ruleType || null,
    pattern ? JSON.stringify(pattern) : null,
    action || null, isActive ?? null, priority ?? null,
  );

  return NextResponse.json({ success: true });
}

/** DELETE /api/soc/rules — Delete a rule */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['SUPER_ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden: requires Super Admin role' }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM soc_rules WHERE id = $1`, id);
  return NextResponse.json({ success: true });
}
