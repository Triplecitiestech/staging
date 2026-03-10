'use client'

import { useState, useEffect } from 'react'

interface ConfigEntry {
  key: string
  value: string
  label: string
  type: 'boolean' | 'number' | 'text' | 'select'
  options?: string[]
  description: string
}

const CONFIG_SCHEMA: Omit<ConfigEntry, 'value'>[] = [
  { key: 'agent_enabled', label: 'Agent Enabled', type: 'boolean', description: 'Enable or disable the SOC agent' },
  { key: 'dry_run', label: 'Dry Run Mode', type: 'boolean', description: 'When enabled, agent analyzes but does not add Autotask notes' },
  { key: 'screening_model', label: 'Screening Model', type: 'select', options: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'], description: 'AI model for initial ticket screening' },
  { key: 'deep_analysis_model', label: 'Deep Analysis Model', type: 'select', options: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'], description: 'AI model for complex incident analysis' },
  { key: 'confidence_auto_close', label: 'Auto-Close Threshold', type: 'number', description: 'Minimum confidence to recommend automatic closure (0-1)' },
  { key: 'confidence_flag_review', label: 'Flag Review Threshold', type: 'number', description: 'Minimum confidence to flag for quick human review (0-1)' },
  { key: 'confidence_floor', label: 'Confidence Floor', type: 'number', description: 'Below this, only informational notes (0-1)' },
  { key: 'correlation_window_minutes', label: 'Correlation Window (min)', type: 'number', description: 'Time window for grouping related alerts' },
  { key: 'max_ai_calls_per_run', label: 'Max AI Calls per Run', type: 'number', description: 'Maximum AI API calls per cron cycle' },
  { key: 'internal_site_ids', label: 'Internal Site IDs (JSON)', type: 'text', description: 'JSON array of Datto RMM site IDs for internal/technician devices' },
]

export default function SocConfigPanel() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/soc/status')
        if (res.ok) {
          const data = await res.json()
          setConfig(data.config || {})
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleSave = async (key: string, value: string) => {
    setSaving(key)
    setError(null)
    try {
      const res = await fetch('/api/soc/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { [key]: value } }),
      })
      if (res.ok) {
        setConfig(prev => ({ ...prev, [key]: value }))
        setSaved(key)
        setTimeout(() => setSaved(null), 2000)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(`Failed to save ${key}: ${data.error || res.status}`)
        setTimeout(() => setError(null), 5000)
      }
    } catch {
      setError(`Network error saving ${key}`)
      setTimeout(() => setError(null), 5000)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
      {CONFIG_SCHEMA.map(schema => {
        const currentValue = config[schema.key] || ''

        return (
          <div key={schema.key} className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{schema.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{schema.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {schema.type === 'boolean' ? (
                  <button
                    onClick={() => handleSave(schema.key, currentValue === 'true' ? 'false' : 'true')}
                    disabled={saving === schema.key}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      currentValue === 'true' ? 'bg-cyan-500' : 'bg-slate-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      currentValue === 'true' ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                ) : schema.type === 'select' ? (
                  <select
                    value={currentValue}
                    onChange={e => handleSave(schema.key, e.target.value)}
                    className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5"
                  >
                    {schema.options?.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <ConfigInput
                    value={currentValue}
                    onSave={val => handleSave(schema.key, val)}
                    saving={saving === schema.key}
                  />
                )}
                {saved === schema.key && (
                  <span className="text-xs text-green-400">Saved</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}

function ConfigInput({ value, onSave, saving }: { value: string; onSave: (v: string) => void; saving: boolean }) {
  const [localValue, setLocalValue] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setLocalValue(value); setDirty(false) }, [value])

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={localValue}
        onChange={e => { setLocalValue(e.target.value); setDirty(true) }}
        className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 w-32"
      />
      {dirty && (
        <button
          onClick={() => { onSave(localValue); setDirty(false) }}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  )
}
