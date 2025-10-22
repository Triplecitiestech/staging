import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

  url.searchParams.forEach((value, key) => {
    const paramValue = value.toLowerCase()
    if (suspiciousParams.some(param => 
      key.toLowerCase().includes(param) || paramValue.includes(param)
    )) {
      return new NextResponse('Bad Request', { status: 400 })
    }
  })

  // Block requests to sensitive files
  const sensitivePaths = [
    '/.env',
    '/.git',
    '/.svn',
    '/wp-admin',
    '/wp-content',
    '/wp-includes',
    '/admin',
    '/phpmyadmin',
    '/.htaccess',
    '/web.config',
    '/robots.txt',
    '/sitemap.xml'
  ]

  if (sensitivePaths.some(path => url.pathname.startsWith(path))) {
    return new NextResponse('Not Found', { status: 404 })
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
