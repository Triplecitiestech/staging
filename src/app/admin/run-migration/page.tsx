'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RunMigrationPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const router = useRouter()

  const runMigration = async () => {
    setStatus('running')
    setMessage('Step 1/2: Removing foreign key constraints...')

    try {
      // Step 1: Remove foreign keys
      const response1 = await fetch('/api/migrations/remove-fkeys', {
        method: 'POST',
        credentials: 'include'
      })

      const data1 = await response1.json()

      if (!response1.ok) {
        setStatus('error')
        setMessage('Step 1 failed: ' + (data1.error || 'Migration failed'))
        console.error('Migration error:', data1)
        return
      }

      setMessage('Step 2/2: Adding parentTaskId column...')

      // Step 2: Add parentTaskId column
      const response2 = await fetch('/api/migrations/add-parent-task', {
        method: 'POST',
        credentials: 'include'
      })

      const data2 = await response2.json()

      if (response2.ok) {
        setStatus('success')
        setMessage('All migrations completed successfully!')
      } else {
        setStatus('error')
        setMessage('Step 2 failed: ' + (data2.error || 'Migration failed'))
        console.error('Migration error:', data2)
      }
    } catch (error) {
      setStatus('error')
      setMessage('Network error: ' + (error instanceof Error ? error.message : 'Unknown error'))
      console.error('Migration error:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-white mb-4">Database Migration</h1>
        <p className="text-slate-300 mb-6">
          This will run two migrations:
          <br />1. Remove foreign key constraints from projects, project_templates, and audit_logs tables
          <br />2. Add parentTaskId column to phase_tasks table for subtask support
        </p>

        {status === 'idle' && (
          <button
            onClick={runMigration}
            className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
          >
            Run Migration
          </button>
        )}

        {status === 'running' && (
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-300 text-center">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
              <p className="text-green-300 text-center font-medium">{message}</p>
            </div>
            <Link
              href="/admin/projects/new"
              className="block w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium text-center"
            >
              Create a Project
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-300">{message}</p>
            </div>
            <button
              onClick={runMigration}
              className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        <div className="mt-6">
          <Link href="/admin" className="text-cyan-400 hover:text-cyan-300 text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
