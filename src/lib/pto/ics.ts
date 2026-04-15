/**
 * Generate an .ics (iCalendar) attachment for a PTO event.
 *
 * Adding this to the approval notification email means the employee
 * gets a real calendar invite regardless of whether Microsoft Graph
 * sends one — Outlook, Gmail, Apple Mail, etc. all recognise .ics
 * attachments and offer one-click add-to-calendar.
 */

function ymdCompact(ymd: string): string {
  // 2026-04-14 → 20260414
  return ymd.replace(/-/g, '')
}

function dayAfter(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function dtStamp(): string {
  // 20260414T120000Z
  const n = new Date()
  const y = n.getUTCFullYear()
  const m = String(n.getUTCMonth() + 1).padStart(2, '0')
  const d = String(n.getUTCDate()).padStart(2, '0')
  const h = String(n.getUTCHours()).padStart(2, '0')
  const mi = String(n.getUTCMinutes()).padStart(2, '0')
  const s = String(n.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}T${h}${mi}${s}Z`
}

function escapeIcs(s: string): string {
  // RFC 5545 escape: backslash, semicolon, comma, and newline
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// RFC 5545 requires lines over 75 octets to be folded with CRLF+space
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let remaining = line
  parts.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  while (remaining.length > 74) {
    parts.push(' ' + remaining.slice(0, 74))
    remaining = remaining.slice(74)
  }
  if (remaining.length) parts.push(' ' + remaining)
  return parts.join('\r\n')
}

export interface IcsEventParams {
  uid: string // unique ID, e.g. request id + '@triplecitiestech.com'
  startDate: string // YYYY-MM-DD (inclusive)
  endDate: string   // YYYY-MM-DD (inclusive)
  summary: string
  description?: string
  organizerEmail: string
  organizerName?: string
  attendeeEmail: string
  attendeeName?: string
  method?: 'REQUEST' | 'CANCEL' | 'PUBLISH'
  isAllDay?: boolean
}

export function buildIcsEvent(p: IcsEventParams): string {
  const method = p.method ?? 'REQUEST'
  const isAllDay = p.isAllDay ?? true
  const dtStart = isAllDay
    ? `DTSTART;VALUE=DATE:${ymdCompact(p.startDate)}`
    : `DTSTART:${ymdCompact(p.startDate)}T090000Z`
  // For all-day events, DTEND is the day AFTER the last day (exclusive)
  const dtEnd = isAllDay
    ? `DTEND;VALUE=DATE:${ymdCompact(dayAfter(p.endDate))}`
    : `DTEND:${ymdCompact(p.endDate)}T170000Z`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Triple Cities Tech//PTO//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    foldLine(`UID:${escapeIcs(p.uid)}`),
    `DTSTAMP:${dtStamp()}`,
    dtStart,
    dtEnd,
    foldLine(`SUMMARY:${escapeIcs(p.summary)}`),
    foldLine(
      `DESCRIPTION:${escapeIcs(p.description ?? '')}`
    ),
    foldLine(
      `ORGANIZER${p.organizerName ? `;CN=${escapeIcs(p.organizerName)}` : ''}:mailto:${p.organizerEmail}`
    ),
    foldLine(
      `ATTENDEE${p.attendeeName ? `;CN=${escapeIcs(p.attendeeName)}` : ''};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${p.attendeeEmail}`
    ),
    'TRANSP:TRANSPARENT',
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${method === 'CANCEL' ? '1' : '0'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}
