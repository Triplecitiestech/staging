import Link from 'next/link'
import AgentHeader from '@/components/agents/AgentHeader'
import type { TrainingViewer } from '@/lib/agent-training-access'

// Header for the training pages. Agents get the normal agent-portal header;
// staff previewing the material get a slim read-only bar instead — the agent
// nav and "Sign out" would be broken for a staff user with no agent session.
export default function TrainingChrome({ viewer }: { viewer: TrainingViewer }) {
  if (viewer.kind === 'agent') {
    return <AgentHeader agentName={viewer.firstName} />
  }

  return (
    <header className="bg-black/30 backdrop-blur-md border-b border-cyan-500/30 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 text-xs font-medium rounded border bg-cyan-500/20 text-cyan-200 border-cyan-500/30 whitespace-nowrap">
              Admin Preview
            </span>
            <span className="hidden sm:inline text-sm text-slate-300 truncate">
              Agent training — the read-only view your agents see.
            </span>
          </div>
          <Link
            href="/admin/sales-agents"
            className="text-xs text-slate-300 hover:text-white px-3 py-1.5 border border-white/15 rounded-md transition-colors whitespace-nowrap"
          >
            ← Back to Sales Agents
          </Link>
        </div>
      </div>
    </header>
  )
}
