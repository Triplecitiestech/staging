// /api/field/admin/contractors — staff-only.
//   GET  → every contractor with last login and the current open code (the
//          plaintext is DECRYPTED here from code_ciphertext, so staff can text
//          it; it is never stored in clear).
//   POST → { name, email, phone? } creates a contractor (audit: contractor_invited).

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { apiError, apiOk, generateRequestId } from '@/lib/api-response'
import { checkCsrf, isValidEmail, isValidPhone, sanitizeInput } from '@/lib/security'
import { decryptSecret } from '@/lib/crypto'
import {
  createContractor,
  isMissingTableError,
  isUniqueViolation,
  listContractorsForAdmin,
  writeAudit,
  type FieldContractorAdminRow,
} from '@/lib/field/store'
import { normaliseEmail } from '@/lib/field/tokens'

export const dynamic = 'force-dynamic'

async function staffEmail(): Promise<string | null> {
  const session = await auth()
  return session?.user?.email ?? null
}

function serialise(row: FieldContractorAdminRow) {
  let code: string | null = null
  let unavailableReason: string | null = null
  if (row.openCode) {
    if (!row.openCode.codeCiphertext) {
      unavailableReason = 'Issued without an encryption key configured; only the hash exists.'
    } else {
      try {
        code = decryptSecret(row.openCode.codeCiphertext)
      } catch {
        unavailableReason = 'Could not decrypt with the current encryption key.'
      }
    }
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    lastDelivery: row.lastDelivery
      ? { result: row.lastDelivery.result, at: row.lastDelivery.at.toISOString() }
      : null,
    openCode: row.openCode
      ? { code, expiresAt: row.openCode.expiresAt.toISOString(), attempts: row.openCode.attempts, unavailableReason }
      : null,
  }
}

export async function GET() {
  const reqId = generateRequestId()
  if (!(await staffEmail())) return apiError('Unauthorized', reqId, 401)

  try {
    const rows = await listContractorsForAdmin()
    return apiOk({ contractors: rows.map(serialise) }, reqId)
  } catch (err) {
    if (isMissingTableError(err)) return apiOk({ contractors: [], tableMissing: true }, reqId)
    console.error('[field] admin list failed:', err instanceof Error ? err.message : String(err))
    return apiError('Failed to load contractors', reqId, 500)
  }
}

export async function POST(request: NextRequest) {
  const reqId = generateRequestId()
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const actor = await staffEmail()
  if (!actor) return apiError('Unauthorized', reqId, 401)

  let body: { name?: unknown; email?: unknown; phone?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid request body', reqId, 400)
  }

  const name = sanitizeInput(body.name).trim().slice(0, 120)
  const email = normaliseEmail(body.email)
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
  const phone = phoneRaw ? sanitizeInput(phoneRaw).slice(0, 32) : null

  if (!name) return apiError('Name is required.', reqId, 400)
  if (!email || !isValidEmail(email)) return apiError('A valid email is required.', reqId, 400)
  if (phone && !isValidPhone(phone)) return apiError('Phone number looks invalid.', reqId, 400)

  try {
    const contractor = await createContractor({ name, email, phone, createdBy: actor })
    await writeAudit({
      actorType: 'staff',
      actorId: actor,
      event: 'contractor_invited',
      meta: { contractorId: contractor.id, email: contractor.email },
    })
    return apiOk({ contractor: serialise({ ...contractor, lastLoginAt: null, openCode: null, lastDelivery: null }) }, reqId, 201)
  } catch (err) {
    if (isUniqueViolation(err)) return apiError('A contractor with that email already exists.', reqId, 409, 'duplicate_email')
    if (isMissingTableError(err)) return apiError('The field_* tables do not exist yet. POST /api/migrations/run first.', reqId, 503, 'not_configured')
    console.error('[field] admin create failed:', err instanceof Error ? err.message : String(err))
    return apiError('Failed to create contractor', reqId, 500)
  }
}
