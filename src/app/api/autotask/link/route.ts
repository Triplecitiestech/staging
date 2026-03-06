import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAutotaskProjectUrl, getAutotaskTaskUrl } from '@/lib/autotask'

/**
 * GET /api/autotask/link?type=project&id=123
 * Redirects to the Autotask web UI for a project or task.
 * Server-side redirect so we can use env vars for zone detection.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = request.nextUrl.searchParams.get('type')
  const id = request.nextUrl.searchParams.get('id')

  if (!type || !id) {
    return NextResponse.json({ error: 'type and id parameters required' }, { status: 400 })
  }

  let url: string
  switch (type) {
    case 'project':
      url = getAutotaskProjectUrl(id)
      break
    case 'task':
      url = getAutotaskTaskUrl(id)
      break
    default:
      return NextResponse.json({ error: 'Invalid type. Use "project" or "task".' }, { status: 400 })
  }

  return NextResponse.redirect(url)
}
