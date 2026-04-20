// Agent portal auth helpers — used by both pages and API routes.
// Keeps the session-cookie + DB lookup pattern in one place.

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getCurrentAgentId } from '@/lib/agent-session'

export type CurrentAgent = {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
}

const PASSWORD_TOKEN_LIFETIME_MS = 48 * 60 * 60 * 1000 // 48 hours

export async function getCurrentAgent(): Promise<CurrentAgent | null> {
  const agentId = await getCurrentAgentId()
  if (!agentId) return null
  const agent = await prisma.salesAgent.findUnique({
    where: { id: agentId },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
  })
  if (!agent || !agent.isActive) return null
  return agent
}

export async function requireAgentApi(): Promise<CurrentAgent | NextResponse> {
  const agent = await getCurrentAgent()
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return agent
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generatePasswordToken(): { token: string; expiresAt: Date } {
  // 32 random bytes → 64-char hex token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + PASSWORD_TOKEN_LIFETIME_MS)
  return { token, expiresAt }
}

export const PASSWORD_MIN_LENGTH = 12

export function validatePasswordStrength(pw: string): string | null {
  if (typeof pw !== 'string') return 'Password is required.'
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  let classes = 0
  if (/[a-z]/.test(pw)) classes++
  if (/[A-Z]/.test(pw)) classes++
  if (/\d/.test(pw)) classes++
  if (/[^A-Za-z0-9]/.test(pw)) classes++
  if (classes < 3) return 'Password must include at least three of: lowercase, uppercase, number, symbol.'
  return null
}

// Centralized agent-portal base URL builder. Always returns absolute URL.
export function agentPortalUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${base}${clean}`
}
