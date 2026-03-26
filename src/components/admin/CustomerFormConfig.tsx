'use client'

import { useState, useEffect, useCallback } from 'react'
import { FormRenderer, MergedFormConfig } from '@/components/onboarding/FormRenderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionOverride {
  sectionKey: string
  hidden?: boolean
  sortOrder?: number
  titleOverride?: string
}

interface QuestionOverride {
  questionKey: string
  hidden?: boolean
  labelOverride?: string
  helpTextOverride?: string
  requiredOverride?: boolean
  defaultOverride?: string
}

interface CustomSection {
  key: string
  title: string
  description?: string | null
  sortOrder: number
  isEnabled: boolean
}

interface CustomQuestion {
  key: string
  sectionKey: string
  type: string
  label: string
  helpText?: string | null
  placeholder?: string | null
  isRequired: boolean
  defaultValue?: string | null
  sortOrder: number
  isEnabled: boolean
  staticOptions?: { value: string; label: string }[] | null
}

interface FormConfig {
  id: string
  type: string
  base_schema_id: string
  section_overrides: SectionOverride[]
  question_overrides: QuestionOverride[]
}

interface SchemaSection {
  key: string
  title: string
  description?: string | null
  sort_order: number
  questions: {
    key: string
    type: string
    label: string
    help_text?: string | null
    is_required: boolean
    sort_order: number
    static_options?: { value: string; label: string }[] | null
    visibility_rules?: Record<string, unknown> | null
  }[]
}

// ---------------------------------------------------------------------------
// Custom Question Editor (inline)
// ---------------------------------------------------------------------------

const QUESTION_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Date' },
  { value: 'radio', label: 'Radio' },
]

function CustomQuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: CustomQuestion
  onChange: (q: CustomQuestion) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasOptions = ['select', 'multi_select', 'radio'].includes(question.type)

  const addOption = () => {
    const options = question.staticOptions ?? []
    const newOpt = { value: `option_${options.length + 1}`, label: '' }
    onChange({ ...question, staticOptions: [...options, newOpt] })
  }

  return (
    <div className="px-3 py-2 rounded-md bg-cyan-500/5 border border-cyan-500/10 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 text-xs">
            {expanded ? '▼' : '▶'}
          </button>
          <input
            value={question.label}
            onChange={(e) => onChange({ ...question, label: e.target.value })}
            className="bg-transparent text-sm text-white border-b border-white/10 focus:outline-none focus:border-cyan-500/50 flex-1 min-w-0"
            placeholder="Question label..."
          />
          <select
            value={question.type}
            onChange={(e) => onChange({ ...question, type: e.target.value })}
            className="bg-gray-800 text-[10px] text-gray-300 rounded px-1.5 py-0.5 border border-white/10"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">Custom</span>
        </div>
        <button onClick={onRemove} className="text-red-400/60 hover:text-red-400 text-xs ml-2 shrink-0">
          Remove
        </button>
      </div>

      {expanded && (
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={question.isRequired}
                onChange={(e) => onChange({ ...question, isRequired: e.target.checked })}
                className="rounded border-gray-600 bg-gray-800 text-cyan-500"
              />
              <span className="text-xs text-gray-400">Required</span>
            </label>
          </div>
          <input
            value={question.helpText ?? ''}
            onChange={(e) => onChange({ ...question, helpText: e.target.value || null })}
            placeholder="Help text (shown below the field)..."
            className="w-full bg-gray-800/50 text-xs text-gray-300 rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-cyan-500/30"
          />
          <input
            value={question.placeholder ?? ''}
            onChange={(e) => onChange({ ...question, placeholder: e.target.value || null })}
            placeholder="Placeholder text..."
            className="w-full bg-gray-800/50 text-xs text-gray-300 rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-cyan-500/30"
          />

          {hasOptions && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Options</span>
                <button onClick={addOption} className="text-[10px] text-cyan-400 hover:text-cyan-300">+ Add Option</button>
              </div>
              {(question.staticOptions ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={opt.label}
                    onChange={(e) => {
                      const updated = [...(question.staticOptions ?? [])]
                      const autoValue = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
                      updated[i] = { ...updated[i], label: e.target.value, value: autoValue || updated[i].value }
                      onChange({ ...question, staticOptions: updated })
                    }}
                    placeholder={`Option ${i + 1}...`}
                    className="flex-1 bg-gray-800/50 text-xs text-gray-300 rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-cyan-500/30"
                  />
                  <button
                    onClick={() => {
                      const updated = (question.staticOptions ?? []).filter((_, j) => j !== i)
                      onChange({ ...question, staticOptions: updated })
                    }}
                    className="text-red-400/50 hover:text-red-400 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomerFormConfig
// ---------------------------------------------------------------------------

export function CustomerFormConfig({
  companyId,
  companyName,
}: {
  companyId: string
  companyName: string
}) {
  const [activeTab, setActiveTab] = useState<'onboarding' | 'offboarding'>('onboarding')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configs, setConfigs] = useState<FormConfig[]>([])
  const [customSections, setCustomSections] = useState<CustomSection[]>([])
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([])
  const [schemas, setSchemas] = useState<{ id: string; name: string; type: string; version: number; status: string; sections: SchemaSection[] }[]>([])
  const [sectionOverrides, setSectionOverrides] = useState<SectionOverride[]>([])
  const [questionOverrides, setQuestionOverrides] = useState<QuestionOverride[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, schemasRes] = await Promise.all([
        fetch(`/api/admin/companies/${companyId}/form-config`),
        fetch(`/api/admin/forms/schemas?type=${activeTab}`),
      ])
      if (configRes.ok) {
        const data = await configRes.json()
        setConfigs(data.configs ?? [])
        const typedConfig = (data.configs ?? []).find((c: FormConfig) => c.type === activeTab)
        setSectionOverrides(typedConfig?.section_overrides ?? [])
        setQuestionOverrides(typedConfig?.question_overrides ?? [])
        setCustomSections(
          (data.customSections ?? [])
            .filter((s: { config_id: string }) => s.config_id === typedConfig?.id)
            .map((s: Record<string, unknown>) => ({
              key: s.key,
              title: s.title,
              description: s.description,
              sortOrder: s.sort_order ?? 100,
              isEnabled: s.is_enabled ?? true,
            }))
        )
        setCustomQuestions(
          (data.customQuestions ?? [])
            .filter((q: { config_id: string }) => q.config_id === typedConfig?.id)
            .map((q: Record<string, unknown>) => ({
              key: q.key,
              sectionKey: q.section_key,
              type: q.type,
              label: q.label,
              helpText: q.help_text,
              placeholder: q.placeholder,
              isRequired: q.is_required ?? false,
              defaultValue: q.default_value,
              sortOrder: q.sort_order ?? 100,
              isEnabled: q.is_enabled ?? true,
              staticOptions: q.static_options,
            }))
        )
      }
      if (schemasRes.ok) {
        const data = await schemasRes.json()
        // Load detail for published schema
        const published = (data.schemas ?? []).find((s: { status: string }) => s.status === 'published')
        if (published) {
          const detailRes = await fetch(`/api/admin/forms/schemas/${published.id}`)
          if (detailRes.ok) {
            const detail = await detailRes.json()
            setSchemas([detail])
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }, [companyId, activeTab])

  useEffect(() => {
    loadData()
  }, [loadData])

  const publishedSchema = schemas[0]
  const globalSections: SchemaSection[] = publishedSchema?.sections ?? []

  const toggleSectionHidden = (sectionKey: string) => {
    setSectionOverrides((prev) => {
      const existing = prev.find((o) => o.sectionKey === sectionKey)
      if (existing) {
        return prev.map((o) => o.sectionKey === sectionKey ? { ...o, hidden: !o.hidden } : o)
      }
      return [...prev, { sectionKey, hidden: true }]
    })
  }

  const toggleQuestionHidden = (questionKey: string) => {
    setQuestionOverrides((prev) => {
      const existing = prev.find((o) => o.questionKey === questionKey)
      if (existing) {
        return prev.map((o) => o.questionKey === questionKey ? { ...o, hidden: !o.hidden } : o)
      }
      return [...prev, { questionKey, hidden: true }]
    })
  }

  const updateQuestionOverride = (questionKey: string, field: keyof QuestionOverride, value: unknown) => {
    setQuestionOverrides((prev) => {
      const existing = prev.find((o) => o.questionKey === questionKey)
      if (existing) {
        return prev.map((o) => o.questionKey === questionKey ? { ...o, [field]: value } : o)
      }
      return [...prev, { questionKey, [field]: value } as QuestionOverride]
    })
  }

  const addCustomSection = () => {
    const key = `custom_section_${Date.now()}`
    setCustomSections((prev) => [...prev, { key, title: 'New Custom Section', sortOrder: 100, isEnabled: true }])
  }

  const addCustomQuestion = (sectionKey: string) => {
    const key = `custom_q_${Date.now()}`
    setCustomQuestions((prev) => [...prev, {
      key,
      sectionKey,
      type: 'text',
      label: 'New Custom Question',
      isRequired: false,
      sortOrder: 100,
      isEnabled: true,
    }])
  }

  const handleSave = async () => {
    if (!publishedSchema) return
    setSaving(true)
    try {
      await fetch(`/api/admin/companies/${companyId}/form-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          baseSchemaId: publishedSchema.id,
          sectionOverrides,
          questionOverrides,
          customSections,
          customQuestions,
        }),
      })
    } finally {
      setSaving(false)
    }
  }

  // Build preview config
  const previewConfig: MergedFormConfig | null = publishedSchema
    ? {
        schemaId: publishedSchema.id,
        type: activeTab,
        version: publishedSchema.version,
        sections: [
          ...globalSections
            .filter((s) => {
              const override = sectionOverrides.find((o) => o.sectionKey === s.key)
              return !override?.hidden
            })
            .map((s) => ({
              key: s.key,
              title: sectionOverrides.find((o) => o.sectionKey === s.key)?.titleOverride ?? s.title,
              description: s.description,
              sortOrder: s.sort_order,
              questions: [
                ...s.questions
                  .filter((q) => {
                    const override = questionOverrides.find((o) => o.questionKey === q.key)
                    return !override?.hidden
                  })
                  .map((q) => {
                    const override = questionOverrides.find((o) => o.questionKey === q.key)
                    return {
                      key: q.key,
                      type: q.type,
                      label: override?.labelOverride ?? q.label,
                      helpText: override?.helpTextOverride ?? q.help_text,
                      isRequired: override?.requiredOverride ?? q.is_required,
                      sortOrder: q.sort_order,
                      staticOptions: q.static_options,
                      visibilityRules: q.visibility_rules,
                    }
                  }),
                ...customQuestions
                  .filter((cq) => cq.sectionKey === s.key)
                  .map((cq) => ({
                    key: cq.key,
                    type: cq.type,
                    label: cq.label,
                    helpText: cq.helpText,
                    isRequired: cq.isRequired,
                    sortOrder: cq.sortOrder,
                    staticOptions: cq.staticOptions,
                  })),
              ],
            })),
          ...customSections.map((cs) => ({
            key: cs.key,
            title: cs.title,
            description: cs.description,
            sortOrder: cs.sortOrder,
            questions: customQuestions
              .filter((cq) => cq.sectionKey === cs.key)
              .map((cq) => ({
                key: cq.key,
                type: cq.type,
                label: cq.label,
                helpText: cq.helpText,
                isRequired: cq.isRequired,
                sortOrder: cq.sortOrder,
                staticOptions: cq.staticOptions,
              })),
          })),
        ],
      }
    : null

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg w-fit">
        {(['onboarding', 'offboarding'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
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
          <div className="h-16 bg-gray-800/50 rounded-lg animate-pulse" />
          <div className="h-16 bg-gray-800/50 rounded-lg animate-pulse" />
        </div>
      ) : !publishedSchema ? (
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 text-center">
          <p className="text-gray-400">No published {activeTab} schema found. Create one in the Form Builder first.</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Base schema: <span className="text-gray-300">{publishedSchema.name}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPreviewOpen(true)} className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
                Preview as Customer
              </button>
              <button onClick={addCustomSection} className="text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30">
                + Custom Section
              </button>
              <button onClick={handleSave} disabled={saving} className="text-xs text-white bg-cyan-500 hover:bg-cyan-600 px-4 py-1.5 rounded-md disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Global sections */}
          <div className="space-y-3">
            {globalSections.map((section) => {
              const sOverride = sectionOverrides.find((o) => o.sectionKey === section.key)
              const isHidden = sOverride?.hidden ?? false

              return (
                <div key={section.key} className={`bg-gray-800/50 border rounded-lg overflow-hidden ${isHidden ? 'border-red-500/20 opacity-60' : 'border-white/10'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{section.title}</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-400 border border-gray-500/20">Global</span>
                      {isHidden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Hidden</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addCustomQuestion(section.key)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300"
                      >
                        + Add Question
                      </button>
                      <button
                        onClick={() => toggleSectionHidden(section.key)}
                        className={`text-[10px] ${isHidden ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {isHidden ? 'Show' : 'Hide'}
                      </button>
                    </div>
                  </div>
                  {!isHidden && (
                    <div className="p-3 space-y-1.5">
                      {section.questions.map((q) => {
                        const qOverride = questionOverrides.find((o) => o.questionKey === q.key)
                        const qHidden = qOverride?.hidden ?? false

                        return (
                          <div key={q.key} className={`flex items-center justify-between px-3 py-2 rounded-md ${qHidden ? 'bg-red-500/5 opacity-60' : 'bg-gray-900/30'}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-300">
                                {qOverride?.labelOverride ?? q.label}
                              </span>
                              <span className="text-[10px] text-gray-600">{q.type}</span>
                              {q.is_required && <span className="text-[10px] text-red-400">*</span>}
                              {qHidden && <span className="text-[10px] text-red-400">(hidden)</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Override label..."
                                value={qOverride?.labelOverride ?? ''}
                                onChange={(e) => updateQuestionOverride(q.key, 'labelOverride', e.target.value || undefined)}
                                className="bg-transparent border-b border-white/10 text-xs text-gray-400 w-32 px-1 py-0.5 focus:outline-none focus:border-cyan-500/50"
                              />
                              <button
                                onClick={() => toggleQuestionHidden(q.key)}
                                className={`text-[10px] ${qHidden ? 'text-emerald-400' : 'text-red-400'}`}
                              >
                                {qHidden ? 'Show' : 'Hide'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {/* Custom questions in this section */}
                      {customQuestions
                        .filter((cq) => cq.sectionKey === section.key)
                        .map((cq, i) => (
                          <CustomQuestionEditor
                            key={cq.key}
                            question={cq}
                            onChange={(updated) => setCustomQuestions((prev) => prev.map((q) => q.key === cq.key ? updated : q))}
                            onRemove={() => setCustomQuestions((prev) => prev.filter((q) => q.key !== cq.key))}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Custom sections */}
            {customSections.map((cs) => (
              <div key={cs.key} className="bg-gray-800/50 border border-cyan-500/20 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <input
                      value={cs.title}
                      onChange={(e) => setCustomSections((prev) => prev.map((s) => s.key === cs.key ? { ...s, title: e.target.value } : s))}
                      className="bg-transparent text-sm font-semibold text-white border-b border-white/10 focus:outline-none focus:border-cyan-500/50"
                    />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Custom</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addCustomQuestion(cs.key)} className="text-[10px] text-cyan-400">+ Add Question</button>
                    <button onClick={() => setCustomSections((prev) => prev.filter((s) => s.key !== cs.key))} className="text-[10px] text-red-400">Remove</button>
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  {customQuestions
                    .filter((cq) => cq.sectionKey === cs.key)
                    .map((cq) => (
                      <CustomQuestionEditor
                        key={cq.key}
                        question={cq}
                        onChange={(updated) => setCustomQuestions((prev) => prev.map((q) => q.key === cq.key ? updated : q))}
                        onRemove={() => setCustomQuestions((prev) => prev.filter((q) => q.key !== cq.key))}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Preview */}
      {previewOpen && previewConfig && (
        <FormRenderer
          config={previewConfig}
          companySlug="preview"
          submitterEmail="admin@preview.com"
          submitterName="Preview"
          onSubmit={() => setPreviewOpen(false)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
