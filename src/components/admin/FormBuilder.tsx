'use client'

import { useState, useEffect, useCallback } from 'react'
import { FormRenderer, MergedFormConfig } from '@/components/onboarding/FormRenderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormSchema {
  id: string
  type: string
  version: number
  status: string
  name: string
  description: string | null
  created_by: string | null
  published_at: string | null
  created_at: string
}

interface FormQuestion {
  id?: string
  key: string
  type: string
  label: string
  help_text?: string | null
  placeholder?: string | null
  is_required: boolean
  default_value?: string | null
  sort_order: number
  is_enabled: boolean
  validation?: Record<string, unknown> | null
  static_options?: { value: string; label: string }[] | null
  data_source?: Record<string, unknown> | null
  visibility_rules?: Record<string, unknown> | null
  automation_key?: string | null
}

interface FormSection {
  id?: string
  key: string
  title: string
  description?: string | null
  sort_order: number
  is_enabled: boolean
  questions: FormQuestion[]
}

interface SchemaDetail extends FormSchema {
  sections: FormSection[]
}

// ---------------------------------------------------------------------------
// FormBuilder
// ---------------------------------------------------------------------------

export function FormBuilder() {
  const [activeTab, setActiveTab] = useState<'onboarding' | 'offboarding'>('onboarding')
  const [schemas, setSchemas] = useState<FormSchema[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSchema, setSelectedSchema] = useState<SchemaDetail | null>(null)
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0)
  const [editingSchema, setEditingSchema] = useState<SchemaDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Fetch schemas
  const loadSchemas = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/forms/schemas?type=${activeTab}`)
      if (res.ok) {
        const data = await res.json()
        setSchemas(data.schemas ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadSchemas()
  }, [loadSchemas])

  // Load schema detail
  const loadSchemaDetail = async (id: string) => {
    const res = await fetch(`/api/admin/forms/schemas/${id}`)
    if (res.ok) {
      const data = await res.json()
      setSelectedSchema(data)
      setEditingSchema(null)
      setSelectedSectionIdx(0)
    }
  }

  // Create new draft
  const handleCreateDraft = async () => {
    const published = schemas.find((s) => s.status === 'published')
    const res = await fetch('/api/admin/forms/schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: activeTab,
        name: `${activeTab === 'onboarding' ? 'Onboarding' : 'Offboarding'} Draft`,
        cloneFromId: published?.id ?? undefined,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      await loadSchemas()
      await loadSchemaDetail(data.id)
    }
  }

  // Clone a schema
  const handleClone = async (schema: FormSchema) => {
    const res = await fetch('/api/admin/forms/schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: schema.type,
        name: `${schema.name} (Copy)`,
        cloneFromId: schema.id,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      await loadSchemas()
      await loadSchemaDetail(data.id)
    }
  }

  // Delete draft from list
  const handleDeleteFromList = async (schema: FormSchema) => {
    if (schema.status !== 'draft') return
    if (!confirm(`Delete draft "${schema.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/forms/schemas/${schema.id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedSchema?.id === schema.id) {
        setSelectedSchema(null)
        setEditingSchema(null)
      }
      await loadSchemas()
    }
  }

  // Publish draft
  const handlePublish = async () => {
    if (!selectedSchema || selectedSchema.status !== 'draft') return
    const res = await fetch(`/api/admin/forms/schemas/${selectedSchema.id}/publish`, { method: 'POST' })
    if (res.ok) {
      await loadSchemas()
      await loadSchemaDetail(selectedSchema.id)
    }
  }

  // Delete draft
  const handleDeleteDraft = async () => {
    if (!selectedSchema || selectedSchema.status !== 'draft') return
    const res = await fetch(`/api/admin/forms/schemas/${selectedSchema.id}`, { method: 'DELETE' })
    if (res.ok) {
      setSelectedSchema(null)
      setEditingSchema(null)
      await loadSchemas()
    }
  }

  // Start editing
  const startEditing = () => {
    if (selectedSchema?.status !== 'draft') return
    setEditingSchema(JSON.parse(JSON.stringify(selectedSchema)))
  }

  // Save edits
  const saveEdits = async () => {
    if (!editingSchema) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/forms/schemas/${editingSchema.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingSchema.name,
          description: editingSchema.description,
          sections: editingSchema.sections.map((s) => ({
            key: s.key,
            title: s.title,
            description: s.description,
            sortOrder: s.sort_order,
            isEnabled: s.is_enabled,
            questions: s.questions.map((q) => ({
              key: q.key,
              type: q.type,
              label: q.label,
              helpText: q.help_text,
              placeholder: q.placeholder,
              isRequired: q.is_required,
              defaultValue: q.default_value,
              sortOrder: q.sort_order,
              isEnabled: q.is_enabled,
              validation: q.validation,
              staticOptions: q.static_options,
              dataSource: q.data_source,
              visibilityRules: q.visibility_rules,
              automationKey: q.automation_key,
            })),
          })),
        }),
      })
      if (res.ok) {
        await loadSchemaDetail(editingSchema.id)
      }
    } finally {
      setSaving(false)
    }
  }

  // Add section
  const addSection = () => {
    if (!editingSchema) return
    const key = `section_${Date.now()}`
    const updated = { ...editingSchema }
    updated.sections = [
      ...updated.sections,
      {
        key,
        title: 'New Section',
        description: null,
        sort_order: updated.sections.length,
        is_enabled: true,
        questions: [],
      },
    ]
    setEditingSchema(updated)
    setSelectedSectionIdx(updated.sections.length - 1)
  }

  // Remove section
  const removeSection = (idx: number) => {
    if (!editingSchema) return
    const updated = { ...editingSchema }
    updated.sections = updated.sections.filter((_, i) => i !== idx)
    setEditingSchema(updated)
    setSelectedSectionIdx(Math.min(selectedSectionIdx, Math.max(0, updated.sections.length - 1)))
  }

  // Add question to current section
  const addQuestion = () => {
    if (!editingSchema) return
    const section = editingSchema.sections[selectedSectionIdx]
    if (!section) return
    const key = `q_${Date.now()}`
    const updated = { ...editingSchema }
    updated.sections = [...updated.sections]
    updated.sections[selectedSectionIdx] = {
      ...section,
      questions: [
        ...section.questions,
        {
          key,
          type: 'text',
          label: 'New Question',
          is_required: false,
          sort_order: section.questions.length,
          is_enabled: true,
        },
      ],
    }
    setEditingSchema(updated)
  }

  // Remove question
  const removeQuestion = (qIdx: number) => {
    if (!editingSchema) return
    const section = editingSchema.sections[selectedSectionIdx]
    if (!section) return
    const updated = { ...editingSchema }
    updated.sections = [...updated.sections]
    updated.sections[selectedSectionIdx] = {
      ...section,
      questions: section.questions.filter((_, i) => i !== qIdx),
    }
    setEditingSchema(updated)
  }

  // Update question field
  const updateQuestion = (qIdx: number, field: string, value: unknown) => {
    if (!editingSchema) return
    const section = editingSchema.sections[selectedSectionIdx]
    if (!section) return
    const updated = { ...editingSchema }
    updated.sections = [...updated.sections]
    const questions = [...section.questions]
    questions[qIdx] = { ...questions[qIdx], [field]: value }
    updated.sections[selectedSectionIdx] = { ...section, questions }
    setEditingSchema(updated)
  }

  // Move question
  const moveQuestion = (qIdx: number, direction: -1 | 1) => {
    if (!editingSchema) return
    const section = editingSchema.sections[selectedSectionIdx]
    if (!section) return
    const newIdx = qIdx + direction
    if (newIdx < 0 || newIdx >= section.questions.length) return
    const updated = { ...editingSchema }
    updated.sections = [...updated.sections]
    const questions = [...section.questions]
    ;[questions[qIdx], questions[newIdx]] = [questions[newIdx], questions[qIdx]]
    questions.forEach((q, i) => (q.sort_order = i))
    updated.sections[selectedSectionIdx] = { ...section, questions }
    setEditingSchema(updated)
  }

  // Move section
  const moveSection = (idx: number, direction: -1 | 1) => {
    if (!editingSchema) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= editingSchema.sections.length) return
    const updated = { ...editingSchema }
    const sections = [...updated.sections]
    ;[sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]]
    sections.forEach((s, i) => (s.sort_order = i))
    updated.sections = sections
    setEditingSchema(updated)
    setSelectedSectionIdx(newIdx)
  }

  // Preview config
  const previewConfig: MergedFormConfig | null = selectedSchema
    ? {
        schemaId: selectedSchema.id,
        type: selectedSchema.type,
        version: selectedSchema.version,
        sections: (editingSchema ?? selectedSchema).sections.map((s) => ({
          key: s.key,
          title: s.title,
          description: s.description,
          sortOrder: s.sort_order,
          questions: s.questions.map((q) => ({
            key: q.key,
            type: q.type,
            label: q.label,
            helpText: q.help_text,
            placeholder: q.placeholder,
            isRequired: q.is_required,
            defaultValue: q.default_value,
            sortOrder: q.sort_order,
            staticOptions: q.static_options,
            visibilityRules: q.visibility_rules,
            automationKey: q.automation_key,
          })),
        })),
      }
    : null

  const displaySchema = editingSchema ?? selectedSchema
  const currentSection = displaySchema?.sections[selectedSectionIdx]
  const isDraft = selectedSchema?.status === 'draft'

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg w-fit">
        {(['onboarding', 'offboarding'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedSchema(null); setEditingSchema(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-12 bg-gray-800/50 rounded-lg animate-pulse" />
          <div className="h-12 bg-gray-800/50 rounded-lg animate-pulse" />
        </div>
      ) : (
        <>
          {/* Schema list */}
          <div className="mb-6 space-y-2">
            {schemas.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                  selectedSchema?.id === s.id
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                    : 'bg-gray-800/50 border-white/10 text-gray-300 hover:border-white/20'
                }`}
              >
                <button
                  onClick={() => loadSchemaDetail(s.id)}
                  className="flex-1 flex items-center text-left min-w-0"
                >
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">v{s.version}</span>
                </button>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClone(s) }}
                    title="Clone this form"
                    className="text-gray-500 hover:text-cyan-400 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {s.status === 'draft' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFromList(s) }}
                      title="Delete draft"
                      className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
            <button
              onClick={handleCreateDraft}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Draft
            </button>
          </div>

          {/* Schema detail */}
          {displaySchema && (
            <div className="bg-gray-800/50 border border-white/10 rounded-lg overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">{displaySchema.name}</h3>
                  <StatusBadge status={selectedSchema?.status ?? 'draft'} />
                </div>
                <div className="flex gap-2">
                  {isDraft && !editingSchema && (
                    <button onClick={startEditing} className="text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30">
                      Edit
                    </button>
                  )}
                  {editingSchema && (
                    <>
                      <button onClick={() => setEditingSchema(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5">
                        Cancel
                      </button>
                      <button onClick={saveEdits} disabled={saving} className="text-xs text-white bg-cyan-500 hover:bg-cyan-600 px-3 py-1.5 rounded-md disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  )}
                  {isDraft && !editingSchema && (
                    <>
                      <button onClick={handlePublish} className="text-xs text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-md">
                        Publish
                      </button>
                      <button onClick={handleDeleteDraft} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5">
                        Delete
                      </button>
                    </>
                  )}
                  <button onClick={() => setPreviewOpen(true)} className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
                    Preview
                  </button>
                </div>
              </div>

              {/* Two-panel layout */}
              <div className="flex min-h-[400px]">
                {/* Left: Sections */}
                <div className="w-64 border-r border-white/10 p-3 space-y-1">
                  {displaySchema.sections.map((s, i) => (
                    <div key={s.key} className="flex items-center gap-1">
                      {editingSchema && (
                        <div className="flex flex-col">
                          <button onClick={() => moveSection(i, -1)} className="text-gray-500 hover:text-white text-xs p-0.5" disabled={i === 0}>&#9650;</button>
                          <button onClick={() => moveSection(i, 1)} className="text-gray-500 hover:text-white text-xs p-0.5" disabled={i === displaySchema.sections.length - 1}>&#9660;</button>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedSectionIdx(i)}
                        className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors truncate ${
                          selectedSectionIdx === i
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {s.title}
                      </button>
                      {editingSchema && (
                        <button onClick={() => removeSection(i)} className="text-red-400/60 hover:text-red-400 text-xs p-1">&#10005;</button>
                      )}
                    </div>
                  ))}
                  {editingSchema && (
                    <button onClick={addSection} className="w-full text-left px-3 py-2 rounded-md text-xs text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                      + Add Section
                    </button>
                  )}
                </div>

                {/* Right: Questions */}
                <div className="flex-1 p-4">
                  {currentSection ? (
                    <>
                      {editingSchema ? (
                        <div className="mb-4 space-y-2">
                          <input
                            value={currentSection.title}
                            onChange={(e) => {
                              const updated = { ...editingSchema }
                              updated.sections = [...updated.sections]
                              updated.sections[selectedSectionIdx] = { ...currentSection, title: e.target.value }
                              setEditingSchema(updated)
                            }}
                            className="bg-gray-700/50 border border-white/10 rounded px-3 py-1.5 text-sm text-white w-full focus:outline-none focus:border-cyan-500/50"
                            placeholder="Section title"
                          />
                        </div>
                      ) : (
                        <h4 className="text-sm font-semibold text-white mb-4">{currentSection.title}</h4>
                      )}

                      <div className="space-y-2">
                        {currentSection.questions.map((q, qi) => (
                          <div key={q.key} className="flex items-start gap-2 bg-gray-900/50 border border-white/5 rounded-lg p-3">
                            {editingSchema && (
                              <div className="flex flex-col gap-0.5 pt-1">
                                <button onClick={() => moveQuestion(qi, -1)} className="text-gray-500 hover:text-white text-xs" disabled={qi === 0}>&#9650;</button>
                                <button onClick={() => moveQuestion(qi, 1)} className="text-gray-500 hover:text-white text-xs" disabled={qi === currentSection.questions.length - 1}>&#9660;</button>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {editingSchema ? (
                                <div className="space-y-1.5">
                                  <input
                                    value={q.label}
                                    onChange={(e) => updateQuestion(qi, 'label', e.target.value)}
                                    className="bg-gray-800/50 border border-white/10 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-cyan-500/50"
                                  />
                                  <div className="flex gap-2">
                                    <select
                                      value={q.type}
                                      onChange={(e) => updateQuestion(qi, 'type', e.target.value)}
                                      className="bg-gray-800/50 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                    >
                                      {['text', 'textarea', 'email', 'phone', 'date', 'select', 'multi_select', 'radio', 'checkbox', 'heading', 'info'].map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                      ))}
                                    </select>
                                    <label className="flex items-center gap-1 text-xs text-gray-400">
                                      <input
                                        type="checkbox"
                                        checked={q.is_required}
                                        onChange={(e) => updateQuestion(qi, 'is_required', e.target.checked)}
                                        className="w-3 h-3 rounded border-white/20 bg-gray-700 text-cyan-500"
                                      />
                                      Required
                                    </label>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-300">{q.label}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-500">{q.type}</span>
                                  {q.is_required && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Required</span>
                                  )}
                                  {q.visibility_rules && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">Conditional</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {editingSchema && (
                              <button onClick={() => removeQuestion(qi)} className="text-red-400/60 hover:text-red-400 text-xs p-1 flex-shrink-0">&#10005;</button>
                            )}
                          </div>
                        ))}
                        {editingSchema && (
                          <button onClick={addQuestion} className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-colors text-xs">
                            + Add Question
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Select a section to view questions</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview modal */}
      {previewOpen && previewConfig && (
        <FormRenderer
          config={previewConfig}
          companySlug="preview"
          submitterEmail="admin@preview.com"
          submitterName="Preview"
          isPreview
          onSubmit={() => setPreviewOpen(false)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    draft: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    archived: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${map[status] ?? map.draft}`}>
      {status}
    </span>
  )
}
