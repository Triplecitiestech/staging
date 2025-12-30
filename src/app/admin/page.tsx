import Link from 'next/link'
import { auth } from '@/auth'
import { SignInButton, SignOutButton } from '@/components/auth/AuthButtons'

export default async function AdminPage() {
  const session = await auth()

  // If not authenticated, show sign-in page
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Admin Dashboard
            </h1>
            <p className="text-gray-600 mb-6">
              Sign in with your Microsoft account to access the admin dashboard
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    )
  }

  // User is authenticated - show dashboard
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Admin Dashboard
          </h1>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Signed in as</p>
            <p className="font-semibold text-gray-900">{session.user?.name}</p>
            <p className="text-sm text-gray-600">{session.user?.email}</p>
            {session.user?.role && (
              <p className="text-xs text-blue-600 mt-1 uppercase">{session.user.role}</p>
            )}
          </div>

          <div className="space-y-4">
            <Link
              href="/admin/setup"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Database Setup
            </Link>
            <Link
              href="/"
              className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Back to Home
            </Link>
            <SignOutButton />
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Coming Soon
            </h2>
            <ul className="text-sm text-gray-600 space-y-2 text-left">
              <li>✓ Database seeded with initial data</li>
              <li>⏳ Microsoft OAuth authentication</li>
              <li>⏳ Project management dashboard</li>
              <li>⏳ AI-powered project generation</li>
              <li>⏳ Customer portal management</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
