'use client'

import { useState } from 'react'

const SYNC_STEPS = [
  { key: 'cleanup', label: 'Cleanup empty companies' },
  { key: 'companies', label: 'Sync companies' },
  { key: 'projects&page=1', label: 'Sync projects (page 1)' },
  { key: 'contacts', label: 'Sync contacts' },
  { key: 'merge', label: 'Merge duplicates' },
  { key: 'resync&page=1', label: 'Resync phases/tasks (page 1)' },
]

export default function AutotaskSyncPanel() {
  const [syncing, setSyncing] = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const runFullSync = async () => {
    setSyncing(true)
    setLogs([])
    setError(null)

    for (const step of SYNC_STEPS) {
      setCurrentStep(step.label)
      setLogs(prev => [...prev, `--- ${step.label} ---`])

      try {
        const res = await fetch(`/api/autotask/trigger?secret=${encodeURIComponent('__FROM_ADMIN__')}&step=${step.key}`, {
          headers: { 'x-admin-sync': 'true' },
        })
        const data = await res.json()

        if (!res.ok) {
          setLogs(prev => [...prev, `ERROR: ${data.error || res.statusText}`])
          // Continue with next step
        } else {
          const summary = data.message || data.summary || JSON.stringify(data).slice(0, 200)
          setLogs(prev => [...prev, summary])

          // Handle paginated steps (projects, resync)
          if (data.nextPage) {
            let nextUrl = data.nextPage
            let page = 2
            while (nextUrl && page <= 20) {
              setLogs(prev => [...prev, `  Fetching page ${page}...`])
              const pageStep = step.key.includes('projects') ? `projects&page=${page}` : `resync&page=${page}`
              const pageRes = await fetch(`/api/autotask/trigger?secret=${encodeURIComponent('__FROM_ADMIN__')}&step=${pageStep}`, {
                headers: { 'x-admin-sync': 'true' },
              })
              const pageData = await pageRes.json()
              const pageSummary = pageData.message || pageData.summary || 'Page synced'
              setLogs(prev => [...prev, `  ${pageSummary}`])
              nextUrl = pageData.nextPage
              page++
            }
          }
        }
      } catch (err) {
        setLogs(prev => [...prev, `NETWORK ERROR: ${err instanceof Error ? err.message : 'Unknown'}`])
      }
    }

    setCurrentStep('')
    setSyncing(false)
    setLogs(prev => [...prev, '', `Full sync completed at ${new Date().toLocaleString()}`])
  }

  const runSingleStep = async (stepKey: string, label: string) => {
    setSyncing(true)
    setCurrentStep(label)
    setLogs(prev => [...prev, `--- ${label} ---`])

    try {
      const res = await fetch(`/api/autotask/trigger?secret=${encodeURIComponent('__FROM_ADMIN__')}&step=${stepKey}`, {
        headers: { 'x-admin-sync': 'true' },
      })
      const data = await res.json()
      const summary = data.message || data.summary || JSON.stringify(data).slice(0, 300)
      setLogs(prev => [...prev, summary])
    } catch (err) {
      setLogs(prev => [...prev, `ERROR: ${err instanceof Error ? err.message : 'Unknown'}`])
    }

    setCurrentStep('')
    setSyncing(false)
  }

  return (
    <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 backdrop-blur-sm border border-emerald-500/30 rounded-lg p-6 mb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Autotask Sync
          </h2>
          <p className="text-sm text-emerald-300 mt-1">Sync companies, projects, phases, tasks, and contacts from Autotask</p>
        </div>
        <button
          onClick={runFullSync}
          disabled={syncing}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {syncing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {currentStep || 'Syncing...'}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Run Full Sync
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {SYNC_STEPS.map(step => (
          <button
            key={step.key}
            onClick={() => runSingleStep(step.key, step.label)}
            disabled={syncing}
            className="px-3 py-2 text-xs font-medium bg-slate-900/50 border border-emerald-500/20 rounded-md text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/40 disabled:opacity-50 transition-colors"
          >
            {step.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-slate-900/80 border border-white/10 rounded-md p-4 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Sync Log</span>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{logs.join('\n')}</pre>
        </div>
      )}
    </div>
  )
}
