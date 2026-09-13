// GET /field/playbook — content/field/playbook.html, byte-for-byte, to a
// signed-in ACTIVE contractor only. Framed by /field, so this response allows
// same-origin framing (the site default is DENY / frame-ancestors 'none'; the
// middleware and next.config.js both carve this one path out).

import { NextResponse, type NextRequest } from 'next/server'
import { getFieldSession } from '@/lib/field/session'
import { readPlaybookHtml } from '@/lib/field/playbook'
import { writeAudit } from '@/lib/field/store'
import { FIELD_LOGIN_PATH, FIELD_RESPONSE_HEADERS } from '@/lib/field/edge'
import { clientIpFromHeaders } from '@/lib/field/login'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getFieldSession()
  if (!session) {
    return NextResponse.redirect(new URL(FIELD_LOGIN_PATH, request.url), 302)
  }

  let html: string
  try {
    html = await readPlaybookHtml()
  } catch (err) {
    console.error('[field] playbook file unreadable:', err instanceof Error ? err.message : String(err))
    return new NextResponse('Playbook unavailable', { status: 500, headers: FIELD_RESPONSE_HEADERS })
  }

  writeAudit({
    actorType: 'contractor',
    actorId: session.contractorId,
    event: 'playbook_viewed',
    meta: { sessionId: session.sessionId, ip: clientIpFromHeaders(request.headers) },
  }).catch(() => {})

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...FIELD_RESPONSE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
