'use client'

import { useState, useEffect } from 'react'

interface AuditEntry {
  id: string
  staffEmail: string
  staffName: string | null
  actionType: string
  entityType: string
  notes: string | null
  changes: Record<string, unknown> | null
  createdAt: string
}

export default function ActivityLog({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    fetch(`/api/audit-log?projectId=${projectId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setLogs(data)
      })
      .catch(() => {})
  }, [isOpen, projectId])

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'AI_GENERATED': return 'AI Generated'
      case 'CREATED': return 'Created'
      case 'UPDATED': return 'Updated'
      case 'STATUS_CHANGED': return 'Status Changed'
      case 'DELETED': return 'Deleted'
      case 'TEMPLATE_APPLIED': return 'Template Applied'
      default: return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'AI_GENERATED': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      case 'CREATED': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'UPDATED': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      case 'STATUS_CHANGED': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'DELETED': return 'bg-red-500/20 text-red-300 border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  return (
    <div className="mt-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full"
      >
        <h2 className="text-xl font-bold text-white">Activity Log</h2>
        <svg className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4">
          {logs.length === 0 ? (
            <p className="text-slate-400 text-sm">No activity logged yet</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-900/50 border border-white/5 rounded-lg">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border whitespace-nowrap mt-0.5 ${getActionColor(log.actionType)}`}>
                    {getActionLabel(log.actionType)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{log.notes || `${log.actionType} ${log.entityType}`}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {log.staffName || log.staffEmail} &middot; {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
