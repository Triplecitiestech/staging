import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AutotaskClient } from '@/lib/autotask'

export const dynamic = 'force-dynamic'

/**
 * GET /api/autotask/activity?taskId={autotaskTaskId}
 * Fetches notes and time entries for an Autotask task, combined into a chronological activity feed.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const taskId = request.nextUrl.searchParams.get('taskId')
    if (!taskId) {
      return NextResponse.json({ error: 'taskId parameter required' }, { status: 400 })
    }

    const atTaskId = parseInt(taskId, 10)
    if (isNaN(atTaskId)) {
      return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 })
    }

    const client = new AutotaskClient()

    // Fetch notes and time entries in parallel
    const [notes, timeEntries] = await Promise.all([
      client.getTaskNotes(atTaskId),
      client.getTaskTimeEntries(atTaskId),
    ])

    // Build a resource ID → name cache from the activity data
    const resourceIds = new Set<number>()
    notes.forEach(n => { if (n.creatorResourceID) resourceIds.add(n.creatorResourceID) })
    timeEntries.forEach(t => { if (t.resourceID) resourceIds.add(t.resourceID) })

    const resourceMap: Record<number, string> = {}
    await Promise.all(
      Array.from(resourceIds).map(async (id) => {
        try {
          const resource = await client.getResource(id)
          resourceMap[id] = `${resource.firstName} ${resource.lastName}`.trim()
        } catch {
          resourceMap[id] = `Resource #${id}`
        }
      })
    )

    // Combine into a unified activity feed
    interface ActivityItem {
      id: string
      type: 'note' | 'time_entry'
      title: string
      description: string
      authorName: string
      authorResourceId: number | null
      createdAt: string
      isInternal: boolean
      hoursWorked?: number
      dateWorked?: string
    }

    const activities: ActivityItem[] = []

    for (const note of notes) {
      activities.push({
        id: `note-${note.id}`,
        type: 'note',
        title: note.title || 'Note',
        description: note.description || '',
        authorName: note.creatorResourceID ? (resourceMap[note.creatorResourceID] || `Resource #${note.creatorResourceID}`) : 'System',
        authorResourceId: note.creatorResourceID || null,
        createdAt: note.createDateTime || note.lastActivityDate || new Date().toISOString(),
        isInternal: note.publish === 2,
      })
    }

    for (const entry of timeEntries) {
      activities.push({
        id: `time-${entry.id}`,
        type: 'time_entry',
        title: `${entry.dateWorked ? new Date(entry.dateWorked).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''} (${entry.hoursWorked} hours)`,
        description: entry.summaryNotes || entry.internalNotes || '',
        authorName: resourceMap[entry.resourceID] || `Resource #${entry.resourceID}`,
        authorResourceId: entry.resourceID,
        createdAt: entry.createDateTime || entry.dateWorked || new Date().toISOString(),
        isInternal: !!entry.internalNotes && !entry.summaryNotes,
        hoursWorked: entry.hoursWorked,
        dateWorked: entry.dateWorked,
      })
    }

    // Sort chronologically (newest first)
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      activities,
      noteCount: notes.length,
      timeEntryCount: timeEntries.length,
    })
  } catch (error) {
    console.error('Error fetching Autotask activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
