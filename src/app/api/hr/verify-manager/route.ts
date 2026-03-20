import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter
// Tracks: how many times an email+slug pair has been checked in the last hour.
// This resets on each server restart — for production, use Redis or a DB table.
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in ms
const CLEANUP_INTERVAL  = 15 * 60 * 1000 // Clean up stale entries every 15 min

// Periodic cleanup to prevent memory leak in long-running instances
if (typeof global !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    Array.from(rateLimitMap.entries()).forEach(([key, entry]) => {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.delete(key)
      }
    })
  }, CLEANUP_INTERVAL)
}

function checkRateLimit(email: string, companySlug: string): boolean {
  const key = `${email.toLowerCase()}:${companySlug.toLowerCase()}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // New window
    rateLimitMap.set(key, { count: 1, windowStart: now })
    return true // Within limit
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false // Over limit
  }

  entry.count += 1
  return true // Within limit
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyManagerBody {
  companySlug: string
  email: string
}

// ---------------------------------------------------------------------------
// POST /api/hr/verify-manager
// Public endpoint (no session required) — validates manager identity
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let body: VerifyManagerBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { companySlug, email } = body

  if (!companySlug || typeof companySlug !== 'string') {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedSlug  = companySlug.toLowerCase().trim()

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  // 2. Rate limit check
  if (!checkRateLimit(normalizedEmail, normalizedSlug)) {
    return NextResponse.json(
      {
        verified: false,
        message: 'Too many verification attempts. Please try again in an hour.',
      },
      { status: 429 }
    )
  }

  try {
    // 3. Look up company
    const company = await prisma.company.findFirst({
      where: { slug: normalizedSlug },
    })

    if (!company) {
      // Return same 403 as "not a manager" to avoid leaking company existence
      return NextResponse.json(
        { verified: false, message: 'This email is not authorized for employee management requests.' },
        { status: 403 }
      )
    }

    // 4. Look up contact — accept CLIENT_MANAGER role OR isPrimary=true as a fallback
    // (isPrimary covers the case where contacts were synced before customerRole was set)
    const contact = await prisma.companyContact.findFirst({
      where: {
        companyId: company.id,
        email:     { equals: normalizedEmail, mode: 'insensitive' },
        isActive:  true,
        OR: [
          { customerRole: 'CLIENT_MANAGER' },
          { isPrimary: true },
        ],
      },
    })

    if (!contact) {
      return NextResponse.json(
        {
          verified: false,
          message: 'This email is not authorized for employee management requests. Ask your TCT representative to grant you Manager access.',
        },
        { status: 403 }
      )
    }

    // 5. Verified!
    return NextResponse.json(
      {
        verified: true,
        name:     contact.name ?? normalizedEmail,
        role:     contact.customerRole,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[hr/verify-manager] DB error:', err)
    return NextResponse.json(
      { verified: false, message: 'Verification service temporarily unavailable. Please try again.' },
      { status: 500 }
    )
  }
}
