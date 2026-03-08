'use client'

import { useState } from 'react'

interface Props {
  context: string
  data?: unknown
}

export default function ReportAIAssistant({ context, data }: Props) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const askAI = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await fetch('/api/reports/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), context, data }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `Failed (HTTP ${res.status})`)
      } else {
        setResponse(json.response)
      }
    } catch {
      setError('Failed to reach the AI assistant')
    }
    setLoading(false)
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-700/20 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">&#x2728;</span>
          <div>
            <span className="text-sm font-medium text-white">AI Report Assistant</span>
            <span className="text-xs text-slate-500 ml-2">Ask questions about your data or generate custom reports</span>
          </div>
        </div>
        <span className="text-slate-500 text-sm">{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-700/50">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && askAI()}
              placeholder="e.g., Summarize technician performance this month, or Which companies have declining health?"
              className="flex-1 px-3 py-2 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={askAI}
              disabled={loading || !prompt.trim()}
              className="px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2 mb-3">
            {getQuickPrompts(context).map((qp) => (
              <button
                key={qp}
                onClick={() => { setPrompt(qp); }}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors"
              >
                {qp}
              </button>
            ))}
          </div>

          {error && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-3">
              {error}
            </div>
          )}

          {response && (
            <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-4">
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{response}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getQuickPrompts(context: string): string[] {
  switch (context) {
    case 'dashboard':
      return [
        'Summarize overall performance',
        'Which areas need attention?',
        'Compare this period to last',
        'Generate executive summary',
      ]
    case 'technicians':
      return [
        'Who is the top performer?',
        'Which technician needs improvement?',
        'Compare workload distribution',
        'Summarize team performance',
      ]
    case 'companies':
      return [
        'Which companies need attention?',
        'Summarize SLA compliance',
        'Top support consumers',
        'Generate company report',
      ]
    case 'health':
      return [
        'Which customers are at risk?',
        'Summarize health trends',
        'What factors are driving low scores?',
        'Generate health summary',
      ]
    case 'analytics':
      return [
        'What anomalies should I focus on?',
        'Summarize key insights',
        'What are the predictions?',
        'Generate analytics brief',
      ]
    case 'business-review':
      return [
        'Summarize latest reviews',
        'Which companies need a review?',
        'Draft review talking points',
        'Compare review periods',
      ]
    default:
      return ['Summarize the data', 'What needs attention?', 'Generate a report']
  }
}
