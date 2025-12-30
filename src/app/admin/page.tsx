import Link from 'next/link'

export default function AdminPage() {
  // For now, show placeholder until we implement authentication
  // TODO: Add NextAuth + Microsoft OAuth authentication
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Admin Dashboard
          </h1>
          <p className="text-gray-600 mb-6">
            Microsoft OAuth authentication coming soon
          </p>
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
