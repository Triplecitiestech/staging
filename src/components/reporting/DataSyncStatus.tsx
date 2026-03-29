'use client'

import { useState } from 'react'

interface DataSyncStatusProps {
  /** Name of the source system (e.g., "Autotask PSA") */
  source: string
  /** How often data syncs (e.g., "Every 2 hours") */
  syncFrequency: string
  /** ISO timestamp of the last sync, or null if never synced */
  lastSyncAt: string | null
  /** Additional context about data coverage */
  dataRange?: { from: string; to: string }
  /** Number of records in the dataset */
  recordCount?: number
  /** If provided, enables a manual sync button that calls this function */
  onSyncNow?: () => Promise<void>
  /** Whether sync is currently running */
  syncing?: boolean
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getStalenessLevel(isoDate: string): 'fresh' | 'aging' | 'stale' {
  const ageMs = Date.now() - new Date(isoDate).getTime()
  const hours = ageMs / (60 * 60 * 1000)
  if (hours < 3) return 'fresh'
  if (hours < 6) return 'aging'
  return 'stale'
}

const stalenessConfig = {
  fresh: { dot: 'bg-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
  aging: { dot: 'bg-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5' },
  stale: { dot: 'bg-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
}

/**
 * DataSyncStatus — shows data source, sync frequency, last sync time,
 * and an optional manual sync button. Designed for any page that displays
 * data from an external system that syncs on a schedule.
 */
export default function DataSyncStatus({
  source,
  syncFrequency,
  lastSyncAt,
  dataRange,
  recordCount,
  onSyncNow,
  syncing = false,
}: DataSyncStatusProps) {
  const [syncRequested, setSyncRequested] = useState(false)

  const staleness = lastSyncAt ? getStalenessLevel(lastSyncAt) : 'stale'
  const style = stalenessConfig[staleness]

  const handleSync = async () => {
    if (!onSyncNow || syncing || syncRequested) return
    setSyncRequested(true)
    try {
      await onSyncNow()
    } finally {
      setSyncRequested(false)
    }
  }

  const isSyncing = syncing || syncRequested

  return (
    <div className={`rounded-lg px-4 py-3 border ${style.border} ${style.bg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        {/* Source + status dot */}
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot} ${staleness === 'fresh' ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-slate-300">
            Data from <span className="text-white">{source}</span>
          </span>
        </div>

        {/* Sync frequency */}
        <span className="text-xs text-slate-500">
          Syncs {syncFrequency.toLowerCase()}
        </span>

        {/* Last sync */}
        <span className="text-xs text-slate-400">
          {lastSyncAt ? (
            <>
              Last synced: <span className="text-slate-300">{formatRelativeTime(lastSyncAt)}</span>
              <span className="text-slate-600 ml-1">({new Date(lastSyncAt).toLocaleString()})</span>
            </>
          ) : (
            <span className="text-rose-400">Never synced</span>
          )}
        </span>

        {/* Data range + count */}
        {(dataRange || recordCount !== undefined) && (
          <span className="text-xs text-slate-500 hidden lg:inline">
            {dataRange && <>{dataRange.from} to {dataRange.to}</>}
            {dataRange && recordCount !== undefined && ' · '}
            {recordCount !== undefined && <>{recordCount.toLocaleString()} records</>}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sync now button */}
        {onSyncNow && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {isSyncing ? (
              <>
                <span className="animate-spin inline-block h-3 w-3 border-[1.5px] border-slate-500 border-t-white rounded-full" />
                Syncing...
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
