import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const body = await req.json()
    const { projectId, actionType, entityType, notes, changes, phaseId } = body

    if (!projectId || !actionType || !entityType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const log = await prisma.auditLog.create({
      data: {
        projectId,
        phaseId: phaseId || null,
        staffEmail: session.user.email,
        staffName: session.user.name || null,
        actionType,
        entityType,
        notes: notes || null,
        changes: changes || null,
      },
    })

    return NextResponse.json(log)
  } catch (error) {
    console.error('Audit log error:', error)
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const projectId = req.nextUrl.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const logs = await prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(logs)
  } catch (error) {
    console.error('Audit log fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
