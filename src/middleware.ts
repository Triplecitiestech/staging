import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  FIELD_LOGIN_PATH,
  FIELD_PLAYBOOK_PATH,
  FIELD_RESPONSE_HEADERS,
  FIELD_SESSION_COOKIE,
  isFieldPath,
  isFieldPublicPath,
  isWellFormedSessionToken,
} from '@/lib/field/edge'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Security headers for all responses
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()')

  // Add HSTS header for HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  // Block suspicious requests
  const userAgent = request.headers.get('user-agent') || ''
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /zap/i,
    /burp/i,
    /w3af/i,
    /acunetix/i,
    /nessus/i
  ]

  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Block requests with suspicious query parameters
  const url = request.nextUrl
  const suspiciousParams = [
    'union', 'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'exec', 'execute', 'script', 'javascript', 'vbscript', 'onload', 'onerror',
    'eval', 'expression', 'iframe', 'object', 'embed', 'form', 'input'
  ]

  const paramEntries = Array.from(url.searchParams.entries())
  for (let i = 0; i < paramEntries.length; i++) {
    const [key, value] = paramEntries[i]
    const paramValue = value.toLowerCase()
    if (suspiciousParams.some(param =>
      key.toLowerCase().includes(param) || paramValue.includes(param)
    )) {
      return new NextResponse('Bad Request', { status: 400 })
    }
  }

  // Block requests to sensitive files (but allow /admin routes for our app)
  const sensitivePaths = [
    '/.env',
    '/.git',
    '/.svn',
    '/wp-admin',
    '/wp-content',
    '/wp-includes',
    '/phpmyadmin',
    '/.htaccess',
    '/web.config'
  ]

  if (sensitivePaths.some(path => url.pathname.startsWith(path))) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // App Router paths are case-sensitive, but "RTP" is an acronym customers
  // and staff naturally type capitalized — /RTP used to 404 while /rtp served
  // the page. Normalize any casing to the real path instead.
  if (url.pathname !== '/rtp' && url.pathname.toLowerCase() === '/rtp') {
    const target = url.clone()
    target.pathname = '/rtp'
    return NextResponse.redirect(target, 308)
  }

  // Contractor Portal (/field/*). Every response: noindex + no-store. Protected
  // paths: a missing or malformed field_session cookie → 302 /field/login
  // without touching the database. The hash lookup, expiry, contractor-active
  // and last_seen checks run in the Node runtime (src/lib/field/session.ts) on
  // every protected page/route — `pg` is not available on the Edge runtime.
  // /field/playbook is framed by /field, so it alone allows same-origin framing.
  if (isFieldPath(url.pathname)) {
    for (const [key, value] of Object.entries(FIELD_RESPONSE_HEADERS)) response.headers.set(key, value)
    if (url.pathname === FIELD_PLAYBOOK_PATH) response.headers.set('X-Frame-Options', 'SAMEORIGIN')

    if (!isFieldPublicPath(url.pathname)) {
      const token = request.cookies.get(FIELD_SESSION_COOKIE)?.value
      if (!isWellFormedSessionToken(token)) {
        const target = url.clone()
        target.pathname = FIELD_LOGIN_PATH
        target.search = ''
        const redirect = NextResponse.redirect(target, 302)
        for (const [key, value] of Object.entries(FIELD_RESPONSE_HEADERS)) redirect.headers.set(key, value)
        return redirect
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
