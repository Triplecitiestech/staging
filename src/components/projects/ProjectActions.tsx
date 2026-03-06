'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ProjectActionsProps {
  projectId: string
  autotaskProjectId?: string | null
}

export default function ProjectActions({ projectId, autotaskProjectId }: ProjectActionsProps) {
  const router = useRouter()
  const [deduping, setDeduping] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<string | null>(null)

  const handleDeduplicate = async () => {
    if (!confirm('This will remove duplicate phases (same title). Continue?')) return
    setDeduping(true)
    try {
      const res = await fetch('/api/phases/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      alert(data.message || 'Done')
      router.refresh()
    } catch {
      alert('Failed to remove duplicates')
    } finally {
      setDeduping(false)
    }
  }

  const handleSync = async () => {
    if (!autotaskProjectId) return
    setSyncing(true)
    setSyncLog(null)
    try {
      const res = await fetch(`/api/autotask/sync-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, autotaskProjectId }),
      })
      const data = await res.json()
      setSyncLog(data.log || JSON.stringify(data, null, 2))
      router.refresh()
    } catch {
      setSyncLog('Sync failed — check console for details')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        onClick={handleDeduplicate}
        disabled={deduping}
        className="px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-md hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
        title="Remove duplicate phases"
      >
        {deduping ? 'Cleaning...' : 'Remove Duplicates'}
      </button>

      {autotaskProjectId && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          title="Force sync from Autotask"
        >
          {syncing ? 'Syncing...' : 'Sync from Autotask'}
        </button>
      )}

      {syncLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSyncLog(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Sync Log</h3>
              <button onClick={() => setSyncLog(null)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-800 p-4 rounded">{syncLog}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
