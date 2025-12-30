'use client'

import { useState } from 'react'

export default function SetupPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [migrationSecret, setMigrationSecret] = useState('')

  const runMigration = async () => {
    if (!migrationSecret) {
      setStatus('error')
      setMessage('Please enter the migration secret')
      return
    }

    setStatus('running')
    setMessage('Running database migration...')

    try {
      const response = await fetch('/api/setup/migrate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${migrationSecret}`
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setStatus('success')
        setMessage('✅ Database migration completed successfully!\n\nAll tables have been created:\n- staff_users\n- companies\n- projects\n- phases\n- phase_tasks\n- audit_logs\n- project_templates\n\nNext: Delete this page and the /api/setup/migrate endpoint for security.')
      } else {
        setStatus('error')
        setMessage(`❌ Migration failed: ${data.error || 'Unknown error'}\n\n${data.stderr || ''}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-gray-800 rounded-lg shadow-2xl p-8 border border-gray-700">
        <h1 className="text-3xl font-bold text-white mb-2">Database Setup</h1>
        <p className="text-gray-400 mb-8">
          One-time setup to create all database tables
        </p>

        <div className="mb-6">
          <label htmlFor="secret" className="block text-sm font-medium text-gray-300 mb-2">
            Migration Secret
          </label>
          <input
            id="secret"
            type="password"
            value={migrationSecret}
            onChange={(e) => setMigrationSecret(e.target.value)}
            placeholder="Enter MIGRATION_SECRET from Vercel"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            disabled={status === 'running'}
          />
          <p className="mt-2 text-xs text-gray-500">
            Get this from: Vercel Dashboard → Settings → Environment Variables → MIGRATION_SECRET
          </p>
        </div>

        <button
          onClick={runMigration}
          disabled={status === 'running' || !migrationSecret}
          className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed transition-all"
        >
          {status === 'running' ? 'Running Migration...' : 'Run Database Migration'}
        </button>

        {message && (
          <div className={`mt-6 p-4 rounded-lg border whitespace-pre-line ${
            status === 'success'
              ? 'bg-green-900/30 border-green-500/50 text-green-200'
              : status === 'error'
              ? 'bg-red-900/30 border-red-500/50 text-red-200'
              : 'bg-blue-900/30 border-blue-500/50 text-blue-200'
          }`}>
            {message}
          </div>
        )}

        {status === 'success' && (
          <div className="mt-6 p-4 bg-amber-900/30 border border-amber-500/50 rounded-lg">
            <p className="text-sm font-semibold text-amber-300 mb-2">⚠️ Security Reminder:</p>
            <p className="text-sm text-amber-200">
              After migration succeeds, delete these files for security:
            </p>
            <ul className="mt-2 text-xs text-amber-200 space-y-1 ml-4">
              <li>• /src/app/admin/setup/page.tsx (this page)</li>
              <li>• /src/app/api/setup/migrate/route.ts</li>
              <li>• Remove MIGRATION_SECRET from Vercel environment variables</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
