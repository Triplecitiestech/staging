import { Pool } from 'pg'
import { redirect } from 'next/navigation'
import { FormLinkPortal } from './FormLinkPortal'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

export default async function FormLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Validate the token server-side
  const client = await pool.connect()
  let linkData: {
    valid: boolean
    companySlug?: string
    type?: string
    preFill?: Record<string, unknown>
    error?: string
  } = { valid: false }

  try {
    const result = await client.query(
      `SELECT fl.id, fl.company_id, fl.type, fl.pre_fill, fl.expires_at, fl.used_at,
              c.slug as company_slug, c."displayName" as company_name
       FROM form_links fl
       JOIN companies c ON c.id = fl.company_id
       WHERE fl.token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      linkData = { valid: false, error: 'This form link is not valid.' }
    } else {
      const link = result.rows[0]
      if (new Date(link.expires_at) < new Date()) {
        linkData = { valid: false, error: 'This form link has expired.' }
      } else if (link.used_at) {
        linkData = { valid: false, error: 'This form link has already been used.' }
      } else {
        linkData = {
          valid: true,
          companySlug: link.company_slug,
          type: link.type,
          preFill: link.pre_fill ?? undefined,
        }
      }
    }
  } catch {
    linkData = { valid: false, error: 'Unable to validate this form link.' }
  } finally {
    client.release()
  }

  // If invalid, show error
  if (!linkData.valid) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Form Link Invalid</h1>
          <p className="text-gray-400 text-sm">{linkData.error}</p>
          <p className="text-gray-500 text-xs mt-4">
            If you believe this is an error, please contact your IT administrator.
          </p>
        </div>
      </div>
    )
  }

  return (
    <FormLinkPortal
      token={token}
      companySlug={linkData.companySlug!}
      type={linkData.type!}
      preFill={linkData.preFill}
    />
  )
}
