import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60 * 60 * 1000
const CLEANUP_INTERVAL  = 15 * 60 * 1000

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
    rateLimitMap.set(key, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count += 1
  return true
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
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  if (!checkRateLimit(normalizedEmail, normalizedSlug)) {
    return NextResponse.json(
      { verified: false, message: 'Too many verification attempts. Please try again in an hour.' },
      { status: 429 }
    )
  }

  const client = await pool.connect()
  try {
    // 1. Find company by slug
    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
      [normalizedSlug]
    )

    if (companyRes.rows.length === 0) {
      return NextResponse.json(
        { verified: false, message: 'This email is not authorized for employee management requests.' },
        { status: 403 }
      )
    }

    const companyId = companyRes.rows[0].id

    // 2. Find active contact by email — accept CLIENT_MANAGER role OR isPrimary
    const contactRes = await client.query<{
      name: string
      "customerRole": string
      "isPrimary": boolean
    }>(
      `SELECT name, "customerRole", "isPrimary"
       FROM company_contacts
       WHERE "companyId" = $1
         AND LOWER(email) = $2
         AND "isActive" = true
       LIMIT 1`,
      [companyId, normalizedEmail]
    )

    if (contactRes.rows.length === 0) {
      return NextResponse.json(
        { verified: false, message: 'This email is not authorized for employee management requests. Ask your TCT representative to grant you Manager access.' },
        { status: 403 }
      )
    }

    const contact = contactRes.rows[0]
    const isAuthorized = contact.customerRole === 'CLIENT_MANAGER' || contact.isPrimary

    if (!isAuthorized) {
      return NextResponse.json(
        { verified: false, message: 'This email is not authorized for employee management requests. Ask your TCT representative to grant you Manager access.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { verified: true, name: contact.name ?? normalizedEmail, role: contact.customerRole },
      { status: 200 }
    )
  } catch (err) {
    console.error('[hr/verify-manager] DB error:', err)
    return NextResponse.json(
      { verified: false, message: 'Verification service temporarily unavailable. Please try again.' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
