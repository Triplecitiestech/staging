'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface SocRule {
  id: string
  name: string
  description: string | null
  ruleType: string
  pattern: Record<string, unknown>
  action: string
  isActive: boolean
  priority: number
  matchCount: number
  lastMatchAt: string | null
  createdAt: string
}

interface TrendGroup {
  pattern: string
  count: number
  verdicts: Record<string, number>
  sources: Record<string, number>
  avgConfidence: number
  sampleTitles: string[]
}

interface TrendRecommendation {
  description: string
  rule: Record<string, unknown>
}

interface TrendsData {
  trends: TrendGroup[]
  recommendations: TrendRecommendation[]
  stats: {
    totalAnalyzed: number
    period: number
    verdicts?: Record<string, number>
    sources?: Record<string, number>
  }
}

export default function SocRulesManager() {
  const [rules, setRules] = useState<SocRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SocRule | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'create' | 'trends'>('rules')
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [trendsLoading, setTrendsLoading] = useState(false)

  const fetchRules = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/soc/rules', { signal })
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || [])
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchRules(controller.signal)
    return () => controller.abort()
  }, [fetchRules])

  const fetchTrends = useCallback(async () => {
    setTrendsLoading(true)
    try {
      const res = await fetch('/api/soc/trends?days=30')
      if (res.ok) {
        setTrends(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setTrendsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'trends' && !trends) fetchTrends()
  }, [activeTab, trends, fetchTrends])

  const handleToggle = async (rule: SocRule) => {
    try {
      await fetch('/api/soc/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      })
      await fetchRules()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return
    try {
      await fetch('/api/soc/rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchRules()
    } catch {
      // ignore
    }
  }

  const handleSave = async (formData: {
    name: string; description: string; ruleType: string;
    pattern: string; action: string; priority: number;
  }) => {
    setSaving(true)
    try {
      const parsed = JSON.parse(formData.pattern)
      if (editing) {
        await fetch('/api/soc/rules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...formData, pattern: parsed }),
        })
      } else {
        await fetch('/api/soc/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, pattern: parsed }),
        })
      }
      setEditing(null)
      setCreating(false)
      setActiveTab('rules')
      await fetchRules()
    } catch {
      alert('Invalid JSON in pattern field')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateFromRecommendation = (rec: TrendRecommendation) => {
    const rule = rec.rule as Record<string, unknown>
    setEditing(null)
    setCreating(true)
    setActiveTab('rules')
    // Pre-fill the form by setting creating with the recommendation data
    setEditing({
      id: '',
      name: String(rule.name || ''),
      description: String(rec.description || rule.description || ''),
      ruleType: String(rule.ruleType || 'suppression'),
      pattern: (rule.pattern as Record<string, unknown>) || {},
      action: String(rule.action || 'auto_close_recommend'),
      isActive: true,
      priority: Number(rule.priority) || 100,
      matchCount: 0,
      lastMatchAt: null,
      createdAt: '',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (editing || creating) {
    return (
      <RuleForm
        rule={editing}
        saving={saving}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setCreating(false) }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {[
          { key: 'rules' as const, label: 'Rules', count: rules.length },
          { key: 'create' as const, label: 'AI Rule Builder' },
          { key: 'trends' as const, label: 'Trend Analysis' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-800/50 text-white border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
            {'count' in tab && tab.count != null && (
              <span className="ml-1.5 text-xs text-slate-500">({tab.count})</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        {activeTab === 'rules' && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
          >
            + New Rule
          </button>
        )}
      </div>

      {/* Rules list */}
      {activeTab === 'rules' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p>No rules configured yet.</p>
              <p className="text-xs mt-2">Use the AI Rule Builder tab to create rules from natural language, or click + New Rule for manual creation.</p>
            </div>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{rule.name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        rule.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-400 rounded-full capitalize">
                        {rule.ruleType}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-slate-400 mt-1">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>Priority: {rule.priority}</span>
                      <span>Matches: {rule.matchCount}</span>
                      <span>Action: {rule.action}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(rule)}
                      className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors"
                    >
                      {rule.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => setEditing(rule)}
                      className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Rule Builder */}
      {activeTab === 'create' && (
        <AIRuleBuilder onRuleCreated={() => { fetchRules(); setActiveTab('rules') }} />
      )}

      {/* Trend Analysis */}
      {activeTab === 'trends' && (
        <TrendAnalysis
          trends={trends}
          loading={trendsLoading}
          onRefresh={fetchTrends}
          onCreateRule={handleCreateFromRecommendation}
        />
      )}
    </div>
  )
}

// ── AI Rule Builder with Speech-to-Text ──

function AIRuleBuilder({ onRuleCreated }: { onRuleCreated: () => void }) {
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedRule, setGeneratedRule] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const hasSpeechApi = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const handleGenerate = async () => {
    if (!input.trim()) return
    setGenerating(true)
    setError(null)
    setGeneratedRule(null)

    try {
      const res = await fetch('/api/soc/rules/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: input }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate rule')
      } else {
        setGeneratedRule(data.rule)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveRule = async () => {
    if (!generatedRule) return
    setSaving(true)
    try {
      const res = await fetch('/api/soc/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generatedRule),
      })
      if (res.ok) {
        setGeneratedRule(null)
        setInput('')
        onRuleCreated()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to save rule')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-white mb-1">AI Rule Builder</h3>
          <p className="text-xs text-slate-400">Describe a rule in plain English and AI will generate the configuration. Use the microphone button for speech-to-text.</p>
        </div>

        <div className="relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='e.g. "Suppress SaaS Alerts for impossible travel from our technicians" or "Escalate any ticket mentioning ransomware or data exfiltration"'
            rows={3}
            className="w-full bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2 pr-12 focus:border-cyan-500 focus:outline-none resize-none"
          />
          {hasSpeechApi && (
            <button
              onClick={toggleListening}
              className={`absolute right-2 top-2 p-2 rounded-lg transition-colors ${
                listening
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={listening ? 'Stop recording' : 'Start speech-to-text'}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating || !input.trim()}
            className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Rule'}
          </button>
          {listening && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Listening...
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Generated rule preview */}
      {generatedRule && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6 space-y-4">
          <h4 className="text-sm font-medium text-cyan-400">Generated Rule Preview</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-500">Name</span>
              <p className="text-white">{String(generatedRule.name)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Type</span>
              <p className="text-white capitalize">{String(generatedRule.ruleType)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Action</span>
              <p className="text-white">{String(generatedRule.action)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Priority</span>
              <p className="text-white">{String(generatedRule.priority || 100)}</p>
            </div>
          </div>
          {generatedRule.description ? (
            <div>
              <span className="text-xs text-slate-500">Description</span>
              <p className="text-sm text-slate-300">{String(generatedRule.description)}</p>
            </div>
          ) : null}
          <div>
            <span className="text-xs text-slate-500">Pattern</span>
            <pre className="mt-1 bg-slate-900 border border-white/10 rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto">
              {JSON.stringify(generatedRule.pattern, null, 2)}
            </pre>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveRule}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Rule'}
            </button>
            <button
              onClick={() => setGeneratedRule(null)}
              className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Trend Analysis ──

function TrendAnalysis({
  trends,
  loading,
  onRefresh,
  onCreateRule,
}: {
  trends: TrendsData | null
  loading: boolean
  onRefresh: () => void
  onCreateRule: (rec: TrendRecommendation) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (!trends) {
    return (
      <div className="bg-slate-800/50 border border-white/10 rounded-lg p-8 text-center">
        <p className="text-slate-400">No trend data available.</p>
        <button onClick={onRefresh} className="text-sm text-cyan-400 hover:underline mt-2">Load Trends</button>
      </div>
    )
  }

  const { stats } = trends

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-4">
          <p className="text-xs text-slate-500">Analyzed ({stats.period}d)</p>
          <p className="text-2xl font-bold text-white">{stats.totalAnalyzed}</p>
        </div>
        {stats.verdicts && Object.entries(stats.verdicts).map(([verdict, count]) => (
          <div key={verdict} className="bg-slate-800/50 border border-white/10 rounded-lg p-4">
            <p className="text-xs text-slate-500 capitalize">{verdict.replace('_', ' ')}</p>
            <p className={`text-2xl font-bold ${
              verdict === 'false_positive' ? 'text-green-400'
              : verdict === 'escalate' ? 'text-red-400'
              : verdict === 'suspicious' ? 'text-rose-400'
              : 'text-blue-400'
            }`}>{count}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      {trends.recommendations.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-medium text-cyan-400">AI-Recommended Rules</h3>
            <p className="text-xs text-slate-500 mt-0.5">Based on recurring false positive patterns</p>
          </div>
          <div className="divide-y divide-white/5">
            {trends.recommendations.map((rec, i) => (
              <div key={i} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{String(rec.rule.name)}</p>
                    <p className="text-xs text-slate-400 mt-1">{rec.description}</p>
                    {rec.rule.pattern ? (
                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                        {(rec.rule.pattern as Record<string, unknown>).titlePatterns ? (
                          <span>Patterns: {((rec.rule.pattern as Record<string, unknown>).titlePatterns as string[]).join(', ')}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onCreateRule(rec)}
                    className="px-3 py-1.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors flex-shrink-0"
                  >
                    Create Rule
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ticket pattern trends */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">Recurring Ticket Patterns</h3>
            <p className="text-xs text-slate-500 mt-0.5">Grouped by normalized title (2+ occurrences)</p>
          </div>
          <button onClick={onRefresh} className="text-xs text-cyan-400 hover:underline">Refresh</button>
        </div>
        {trends.trends.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No recurring patterns found in the last {stats.period} days.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {trends.trends.map((trend, i) => {
              const fpPct = trend.count > 0 ? Math.round(((trend.verdicts.false_positive || 0) / trend.count) * 100) : 0
              return (
                <div key={i} className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-mono truncate">{trend.pattern}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                        <span className="text-white font-medium">{trend.count}x</span>
                        <span>
                          {Object.entries(trend.verdicts).map(([v, c]) => (
                            <span key={v} className={`mr-2 ${
                              v === 'false_positive' ? 'text-green-400'
                              : v === 'escalate' ? 'text-red-400'
                              : v === 'suspicious' ? 'text-rose-400'
                              : 'text-blue-400'
                            }`}>{c} {v.replace('_', ' ')}</span>
                          ))}
                        </span>
                        <span>Avg confidence: {Math.round(trend.avgConfidence * 100)}%</span>
                        {fpPct >= 70 && (
                          <span className="text-green-400 font-medium">{fpPct}% FP rate - good suppression candidate</span>
                        )}
                      </div>
                      {trend.sampleTitles.length > 0 && (
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          Sample: {trend.sampleTitles[0]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Rule Form (manual editing) ──

function RuleForm({
  rule,
  saving,
  onSave,
  onCancel,
}: {
  rule: SocRule | null
  saving: boolean
  onSave: (data: { name: string; description: string; ruleType: string; pattern: string; action: string; priority: number }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [ruleType, setRuleType] = useState(rule?.ruleType || 'suppression')
  const [pattern, setPattern] = useState(rule?.pattern ? JSON.stringify(rule.pattern, null, 2) : '{\n  "titlePatterns": [],\n  "sourceMatch": "",\n  "minTicketsInWindow": 1\n}')
  const [action, setAction] = useState(rule?.action || 'auto_close_recommend')
  const [priority, setPriority] = useState(rule?.priority || 100)

  const inputClass = 'w-full bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:border-cyan-500 focus:outline-none'

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-medium text-white">{rule?.id ? 'Edit Rule' : 'Create Rule'}</h3>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={ruleType} onChange={e => setRuleType(e.target.value)} className={inputClass}>
            <option value="suppression">Suppression</option>
            <option value="correlation">Correlation</option>
            <option value="escalation">Escalation</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Action</label>
          <select value={action} onChange={e => setAction(e.target.value)} className={inputClass}>
            <option value="auto_close_recommend">Auto Close Recommend</option>
            <option value="suppress">Suppress</option>
            <option value="escalate">Escalate</option>
            <option value="flag">Flag</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Priority</label>
          <input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value))} className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Pattern (JSON)</label>
        <textarea
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          rows={6}
          className={`${inputClass} font-mono`}
        />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => onSave({ name, description, ruleType, pattern, action, priority })}
          disabled={saving || !name}
          className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
