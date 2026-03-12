'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  context: string
  data?: unknown
}

export default function ReportAIAssistant({ context, data }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const askAI = async () => {
    if (!input.trim() || loading) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, context, data }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `Failed (HTTP ${res.status})`)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: json.response }])
      }
    } catch {
      setError('Failed to reach the AI assistant')
    }
    setLoading(false)
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
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
          {/* Quick prompts — only show when no messages yet */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {getQuickPrompts(context).map((qp) => (
                <button
                  key={qp}
                  onClick={() => setInput(qp)}
                  className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>
          )}

          {/* Chat messages */}
          {messages.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-4 mb-3 max-h-96 overflow-y-auto space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30'
                      : 'bg-slate-800/80 text-slate-300 border border-slate-700/50'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-3">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && askAI()}
              placeholder={messages.length > 0 ? 'Ask a follow-up question...' : 'e.g., Summarize technician performance this month'}
              className="flex-1 px-3 py-2 text-sm bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={askAI}
              disabled={loading || !input.trim()}
              className="px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="px-3 py-2 text-sm border border-slate-600/50 text-slate-400 rounded-lg hover:bg-slate-700/50 hover:text-white transition-colors"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
          </div>
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
