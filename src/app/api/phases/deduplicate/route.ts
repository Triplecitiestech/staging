import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/phases/deduplicate
 * Removes duplicate phases in a project (keeps the first occurrence, deletes later duplicates with same title).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = await request.json()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const phases = await prisma.phase.findMany({
      where: { projectId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { orderIndex: 'asc' },
    })

    // Group by normalized title
    const seen = new Map<string, string>() // normalized title → first phase ID
    const duplicateIds: string[] = []

    for (const phase of phases) {
      const key = phase.title.trim().toLowerCase()
      if (seen.has(key)) {
        duplicateIds.push(phase.id)
      } else {
        seen.set(key, phase.id)
      }
    }

    if (duplicateIds.length === 0) {
      return NextResponse.json({ message: 'No duplicate phases found', deleted: 0 })
    }

    // Delete duplicates (cascade deletes their tasks too)
    await prisma.phase.deleteMany({
      where: { id: { in: duplicateIds } },
    })

    return NextResponse.json({
      message: `Deleted ${duplicateIds.length} duplicate phase(s)`,
      deleted: duplicateIds.length,
    })
  } catch (error) {
    console.error('Error deduplicating phases:', error)
    return NextResponse.json(
      { error: 'Failed to deduplicate', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
