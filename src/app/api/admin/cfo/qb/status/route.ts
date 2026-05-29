import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { connectionInfo, isConfigured } from '@/lib/cfo/qb-auth'
import { isEncryptionKeyConfigured } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // encryptionKeyState lets the UI verify the key is live (set + valid 32-byte
  // base64 + actually deployed) WITHOUT having to run the full OAuth flow.
  const rawKey = process.env.ENCRYPTION_MASTER_KEY_V1
  const encryptionKeyState: 'ok' | 'missing' | 'invalid' = !rawKey
    ? 'missing'
    : isEncryptionKeyConfigured() ? 'ok' : 'invalid'
  return NextResponse.json({ configured: isConfigured(), encryptionKeyState, ...(await connectionInfo()) })
}
