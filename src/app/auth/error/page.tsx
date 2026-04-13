import { cookies } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface SignInDebug {
  reason?: string
  detail?: string | null
  ts?: string
}

function describeReason(reason: string | undefined): string {
  switch (reason) {
    case 'deactivated':
      return "Your TCT staff account is marked inactive. Ask an admin to reactivate it."
    case 'no_email':
      return "Azure AD didn't include an email address for you. Ask an admin to verify the app registration has the 'email' scope."
    case 'exception':
      return 'The server hit an unexpected error while signing you in. The exact message appears below — please copy it to your admin.'
    default:
      return ''
  }
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  const errorMessages: Record<string, string> = {
    AccessDenied: 'You do not have permission to access the admin dashboard. Please contact your administrator.',
    Configuration: 'There is a problem with the server configuration.',
    Verification: 'The verification token has expired or has already been used.',
    Default: 'An error occurred during authentication.',
  }

  const error = params.error || 'Default'
  const message = errorMessages[error] || errorMessages.Default

  let debug: SignInDebug | null = null
  try {
    const store = await cookies()
    const raw = store.get('tct_signin_debug')?.value
    if (raw) debug = JSON.parse(raw)
  } catch {
    // ignore malformed debug cookie
  }

  const reasonExplain = describeReason(debug?.reason)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Authentication Error
          </h1>

          <p className="text-gray-600 mb-6">{message}</p>

          {debug && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-left text-sm">
              <p className="font-semibold text-red-900 mb-1">Diagnostic (share with your admin):</p>
              <p className="text-red-800">
                <span className="font-medium">Reason:</span> {debug.reason}
              </p>
              {reasonExplain && (
                <p className="text-red-800 mt-1">{reasonExplain}</p>
              )}
              {debug.detail && (
                <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-900 overflow-x-auto whitespace-pre-wrap break-words">
                  {debug.detail}
                </pre>
              )}
              {debug.ts && (
                <p className="text-red-700 mt-2 text-xs">
                  Captured at {debug.ts}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/admin"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
