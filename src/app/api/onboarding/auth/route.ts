import { NextRequest, NextResponse } from 'next/server'
import { validateCompanyPassword, companyExists } from '@/lib/onboarding-data'
import { createSession, setSessionCookie } from '@/lib/onboarding-session'
import { RateLimiter, validateRequest, logSecurityEvent, sanitizeInput } from '@/lib/security'
import type { OnboardingAuthRequest, OnboardingAuthResponse } from '@/types/onboarding'

// Additional rate limiting specifically for onboarding auth
// More strict than general contact form: 5 attempts per 15 minutes per IP + company combo
class OnboardingRateLimiter {
  private static attempts = new Map<string, { count: number; firstAttempt: number; failures: number }>()
  private static readonly WINDOW_MS = 15 * 60 * 1000 // 15 minutes
  private static readonly MAX_ATTEMPTS = 5
  private static readonly LOCKOUT_THRESHOLD = 3 // Consecutive failures before increasing delay

  static checkLimit(ip: string, companySlug: string): { allowed: boolean; retryAfter?: number; delay?: number } {
    const key = `${ip}:${companySlug}`
    const now = Date.now()

    // Cleanup old entries
    this.cleanup()

    const record = this.attempts.get(key)

    if (!record) {
      this.attempts.set(key, { count: 1, firstAttempt: now, failures: 0 })
      return { allowed: true }
    }

    // Reset if window has passed
    if (now - record.firstAttempt > this.WINDOW_MS) {
      this.attempts.set(key, { count: 1, firstAttempt: now, failures: 0 })
      return { allowed: true }
    }

    // Check if limit exceeded
    if (record.count >= this.MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((record.firstAttempt + this.WINDOW_MS - now) / 1000)
      return { allowed: false, retryAfter }
    }

    // Calculate delay based on consecutive failures (exponential backoff)
    const delay = record.failures >= this.LOCKOUT_THRESHOLD
      ? Math.min(5000, 1000 * Math.pow(2, record.failures - this.LOCKOUT_THRESHOLD))
      : 0

    record.count++
    return { allowed: true, delay }
  }

  static recordFailure(ip: string, companySlug: string): void {
    const key = `${ip}:${companySlug}`
    const record = this.attempts.get(key)
    if (record) {
      record.failures++
    }
  }

  static resetFailures(ip: string, companySlug: string): void {
    const key = `${ip}:${companySlug}`
    const record = this.attempts.get(key)
    if (record) {
      record.failures = 0
    }
  }

  private static cleanup(): void {
    const now = Date.now()
    this.attempts.forEach((data, key) => {
      if (now - data.firstAttempt > this.WINDOW_MS) {
        this.attempts.delete(key)
      }
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Security: Validate request
    const validation = validateRequest(request)
    if (!validation.isValid) {
      logSecurityEvent('Invalid onboarding auth request', {
        ip: validation.ip,
        userAgent: validation.userAgent,
        errors: validation.errors
      }, 'medium')

      return NextResponse.json(
        { success: false, message: 'Invalid request' } as OnboardingAuthResponse,
        { status: 400 }
      )
    }

    // Security: General rate limiting
    if (!RateLimiter.checkLimit(validation.ip, true)) {
      logSecurityEvent('General rate limit exceeded for onboarding auth', {
        ip: validation.ip,
        userAgent: validation.userAgent
      }, 'high')

      return NextResponse.json(
        {
          success: false,
          message: 'Too many requests. Please try again later.'
        } as OnboardingAuthResponse,
        { status: 429 }
      )
    }

    // Parse request body
    const body: OnboardingAuthRequest = await request.json()
    const { companyName, password } = body

    // Validate inputs
    if (!companyName || !password) {
      return NextResponse.json(
        { success: false, message: 'Company name and password are required' } as OnboardingAuthResponse,
        { status: 400 }
      )
    }

    // Sanitize company name (convert to lowercase slug format)
    const companySlug = sanitizeInput(companyName).toLowerCase().trim()

    console.log('[Auth API] Login attempt:', {
      companySlug,
      passwordLength: password.length,
      ip: validation.ip
    })

    // Security: Onboarding-specific rate limiting
    const rateLimitCheck = OnboardingRateLimiter.checkLimit(validation.ip, companySlug)

    if (!rateLimitCheck.allowed) {
      logSecurityEvent('Onboarding auth rate limit exceeded', {
        ip: validation.ip,
        company: companySlug,
        retryAfter: rateLimitCheck.retryAfter
      }, 'high')

      return NextResponse.json(
        {
          success: false,
          message: 'Too many failed attempts. Please try again later.'
        } as OnboardingAuthResponse,
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '900'
          }
        }
      )
    }

    // Apply exponential backoff delay if there have been recent failures
    if (rateLimitCheck.delay && rateLimitCheck.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, rateLimitCheck.delay))
    }

    // Check if company exists
    if (!companyExists(companySlug)) {
      // Record failure but don't reveal that company doesn't exist
      OnboardingRateLimiter.recordFailure(validation.ip, companySlug)

      logSecurityEvent('Onboarding auth attempt for non-existent company', {
        ip: validation.ip,
        company: companySlug
      }, 'medium')

      return NextResponse.json(
        { success: false, message: 'Invalid password' } as OnboardingAuthResponse,
        { status: 401 }
      )
    }

    // Validate password
    const isValid = validateCompanyPassword(companySlug, password)

    if (!isValid) {
      // Record failure for brute-force protection
      OnboardingRateLimiter.recordFailure(validation.ip, companySlug)

      logSecurityEvent('Failed onboarding auth attempt', {
        ip: validation.ip,
        company: companySlug,
        userAgent: validation.userAgent
      }, 'medium')

      return NextResponse.json(
        { success: false, message: 'Invalid password' } as OnboardingAuthResponse,
        { status: 401 }
      )
    }

    // Success! Reset failure counter
    OnboardingRateLimiter.resetFailures(validation.ip, companySlug)

    // Create session
    const sessionToken = createSession(companySlug)

    // Set secure cookie
    await setSessionCookie(sessionToken)

    logSecurityEvent('Successful onboarding auth', {
      ip: validation.ip,
      company: companySlug
    }, 'low')

    return NextResponse.json(
      {
        success: true,
        message: 'Authentication successful'
      } as OnboardingAuthResponse,
      { status: 200 }
    )

  } catch (error) {
    console.error('Onboarding auth error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' } as OnboardingAuthResponse,
      { status: 500 }
    )
  }
}
