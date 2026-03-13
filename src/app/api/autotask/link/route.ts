import { NextRequest, NextResponse } from 'next/server'
import { getAutotaskProjectUrl, getAutotaskTaskUrl, getAutotaskTicketUrl } from '@/lib/autotask'

/**
 * GET /api/autotask/link?type=project&id=123
 * Redirects to the Autotask web UI for a project, task, or ticket.
 * Server-side redirect so we can use env vars for zone detection.
 * No auth required — this just builds a URL from env vars and redirects.
 */
export async function GET(request: NextRequest) {
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
    case 'ticket':
      url = getAutotaskTicketUrl(id)
      break
    default:
      return NextResponse.json({ error: 'Invalid type. Use "project", "task", or "ticket".' }, { status: 400 })
  }

  return NextResponse.redirect(url)
}
