'use client'

import { useState, useEffect, useCallback } from 'react'

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

export default function SocRulesManager() {
  const [rules, setRules] = useState<SocRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SocRule | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/soc/rules')
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

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
      await fetchRules()
    } catch {
      alert('Invalid JSON in pattern field')
    } finally {
      setSaving(false)
    }
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
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
        >
          + New Rule
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
        {rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No suppression rules configured.</div>
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
    </div>
  )
}

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
      <h3 className="text-lg font-medium text-white">{rule ? 'Edit Rule' : 'Create Rule'}</h3>

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
