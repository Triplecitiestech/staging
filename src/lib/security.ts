// Security utilities for Triple Cities Tech

import { NextRequest } from 'next/server'
import crypto from 'crypto'

// CSRF Token Management
export class CSRFProtection {
  private static tokens = new Map<string, { token: string; expires: number }>()
  private static readonly TOKEN_LIFETIME = 15 * 60 * 1000 // 15 minutes

  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  static storeToken(sessionId: string, token: string): void {
    this.tokens.set(sessionId, {
      token,
      expires: Date.now() + this.TOKEN_LIFETIME
    })
  }

  static validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId)
    if (!stored) return false
    
    if (Date.now() > stored.expires) {
      this.tokens.delete(sessionId)
      return false
    }
    
    return stored.token === token
  }

  static cleanup(): void {
    const now = Date.now()
    this.tokens.forEach((data, sessionId) => {
      if (now > data.expires) {
        this.tokens.delete(sessionId)
      }
    })
  }
}

// Enhanced Input Sanitization
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return ''
  
  return input
    // Remove script tags and dangerous content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<link\b[^<]*(?:(?!<\/link>)<[^<]*)*<\/link>/gi, '')
    .replace(/<meta\b[^<]*(?:(?!<\/meta>)<[^<]*)*<\/meta>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove javascript: and data: URLs
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/data:application\/javascript/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove dangerous protocols
    .replace(/vbscript:/gi, '')
    .replace(/file:/gi, '')
    .replace(/ftp:/gi, '')
    // Normalize whitespace and trim
    .replace(/\s+/g, ' ')
    .trim()
}

// Enhanced HTML Escaping
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return ''
  return str.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char))
}

// Enhanced Email Validation
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  if (email.length > 254) return false
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email)
}

// Enhanced Phone Validation
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false
  if (phone.length > 20) return false
  
  // Remove all non-digit characters for validation
  const digitsOnly = phone.replace(/\D/g, '')
  
  // Must be between 7 and 15 digits (international standard)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false
  
  // Check for common patterns
  const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/
  return phoneRegex.test(phone)
}

// Rate Limiting with IP-based tracking
export class RateLimiter {
  private static requests = new Map<string, { count: number; firstRequest: number; lastRequest: number }>()
  private static readonly WINDOW_MS = 15 * 60 * 1000 // 15 minutes
  private static readonly MAX_REQUESTS = 10 // Reasonable limit for production
  private static readonly MAX_REQUESTS_STRICT = 5 // For sensitive endpoints

  static checkLimit(ip: string, strict: boolean = false): boolean {
    const now = Date.now()
    const maxRequests = strict ? this.MAX_REQUESTS_STRICT : this.MAX_REQUESTS
    
    // Cleanup old entries
    this.cleanup()
    
    if (!this.requests.has(ip)) {
      this.requests.set(ip, { count: 1, firstRequest: now, lastRequest: now })
      return true
    }

    const userData = this.requests.get(ip)!
    
    // Reset if window has passed
    if (now - userData.firstRequest > this.WINDOW_MS) {
      this.requests.set(ip, { count: 1, firstRequest: now, lastRequest: now })
      return true
    }

    // Check if user has exceeded limit
    if (userData.count >= maxRequests) {
      return false
    }

    // Increment counter
    userData.count++
    userData.lastRequest = now
    return true
  }

  static getRemainingRequests(ip: string, strict: boolean = false): number {
    const userData = this.requests.get(ip)
    if (!userData) return strict ? this.MAX_REQUESTS_STRICT : this.MAX_REQUESTS
    
    const maxRequests = strict ? this.MAX_REQUESTS_STRICT : this.MAX_REQUESTS
    return Math.max(0, maxRequests - userData.count)
  }

  static getResetTime(ip: string): number {
    const userData = this.requests.get(ip)
    if (!userData) return 0
    
    return userData.firstRequest + this.WINDOW_MS
  }

  private static cleanup(): void {
    const now = Date.now()
    this.requests.forEach((data, ip) => {
      if (now - data.firstRequest > this.WINDOW_MS) {
        this.requests.delete(ip)
      }
    })
  }
}

// Extract client IP from request headers (multi-platform support)
function getClientIP(request: NextRequest): string {
  // Try different headers in order of reliability
  // Different platforms use different headers:
  // - Vercel: x-forwarded-for, x-real-ip
  // - Netlify: x-nf-client-connection-ip, x-forwarded-for
  // - Cloudflare: cf-connecting-ip
  // - AWS: x-forwarded-for
  
  const forwardedFor = request.headers.get('x-forwarded-for')
  const netlifyIp = request.headers.get('x-nf-client-connection-ip')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')
  
  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2, ...)
  // Always take the FIRST IP (the original client)
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim())
    return ips[0] || '127.0.0.1'
  }
  
  // Netlify-specific header (most reliable on Netlify)
  if (netlifyIp) {
    return netlifyIp.trim()
  }
  
  // Standard real IP header
  if (realIp) {
    return realIp.trim()
  }
  
  // Cloudflare-specific header
  if (cfIp) {
    return cfIp.trim()
  }
  
  // Fallback to localhost (development)
  return '127.0.0.1'
}

// Validate IP address format
function isValidIPFormat(ip: string): boolean {
  // Allow localhost addresses
  const localhostAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']
  if (localhostAddresses.includes(ip)) {
    return true
  }
  
  // IPv4 pattern: 0.0.0.0 to 255.255.255.255
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  
  // IPv6 pattern (comprehensive, including shortened forms)
  const ipv6Regex = /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9]))$/
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

// Request Validation
export function validateRequest(request: NextRequest): {
  isValid: boolean
  ip: string
  userAgent: string
  errors: string[]
} {
  const errors: string[] = []
  
  // Get client IP using multi-platform extraction
  const ip = getClientIP(request)
  
  // Get User-Agent
  const userAgent = request.headers.get('user-agent') || 'Unknown'
  
  // Validate IP format (security check)
  if (!isValidIPFormat(ip)) {
    // Log for debugging but don't block - some edge cases might have unusual formats
    console.warn(`[Security] Unusual IP format detected: "${ip}"`)
    // In production, you might want to be more strict:
    // errors.push('Invalid IP address format')
  }
  
  // Check for suspicious User-Agent patterns
  const suspiciousPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /java/i
  ]
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent))
  if (isSuspicious && !userAgent.includes('Mozilla')) {
    errors.push('Suspicious User-Agent detected')
  }
  
  return {
    isValid: errors.length === 0,
    ip,
    userAgent,
    errors
  }
}

// Content Security Policy Helper
export function generateCSP(isDev: boolean = false): string {
  const baseCSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://vercel.live https://vercel.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self' https://vercel.live https://vercel.com"
  ]

  if (isDev) {
    baseCSP.push("'unsafe-eval'", "ws://localhost:*", "wss://localhost:*")
  } else {
    baseCSP.push("upgrade-insecure-requests")
  }

  return baseCSP.join('; ')
}

// Security Headers
export const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  }
]

// Logging for security events
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    event,
    severity,
    details,
    source: 'security'
  }
  
  // In production, this should be sent to a proper logging service
  console.log(`[SECURITY-${severity.toUpperCase()}] ${JSON.stringify(logEntry)}`)
  
  // For critical events, you might want to send alerts
  if (severity === 'critical') {
    // Send alert to monitoring service
    console.error(`[CRITICAL SECURITY EVENT] ${event}`, details)
  }
}
