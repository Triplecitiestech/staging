/**
 * Small colored indicator for a sync status ('ok' | 'pending' | 'error' | 'skipped' | null).
 */
export default function SyncBadge({
  label,
  status,
  error,
}: {
  label: string
  status: string | null
  error?: string | null
}) {
  let cls = 'bg-slate-500/20 text-slate-300 border-slate-500/30'
  let display = 'not synced'
  if (status === 'ok') {
    cls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    display = 'synced'
  } else if (status === 'pending') {
    cls = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    display = 'syncing…'
  } else if (status === 'error') {
    cls = 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    display = 'failed'
  } else if (status === 'skipped') {
    cls = 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    display = 'skipped'
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}
      title={error ?? undefined}
    >
      <span>{label}</span>
      <span className="opacity-70">·</span>
      <span>{display}</span>
    </span>
  )
}
