'use client'

import { useState, useMemo, useCallback } from 'react'
import { FormField, type UserOption } from './FormField'
import { evaluateVisibility } from './VisibilityEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergedQuestion {
  key: string
  type: string
  label: string
  helpText?: string | null
  placeholder?: string | null
  isRequired: boolean
  defaultValue?: string | null
  sortOrder: number
  validation?: { minLength?: number; maxLength?: number; pattern?: string } | null
  staticOptions?: { value: string; label: string; helpText?: string }[] | null
  resolvedOptions?: { value: string; label: string; helpText?: string }[] | null
  visibilityRules?: Record<string, unknown> | null
  automationKey?: string | null
  dataSource?: Record<string, unknown> | null
  autoFill?: Record<string, string> | null
  resolvedUserOptions?: UserOption[] | null
}

export interface MergedSection {
  key: string
  title: string
  description?: string | null
  sortOrder: number
  questions: MergedQuestion[]
}

export interface MergedFormConfig {
  schemaId: string
  type: string
  version: number
  name?: string
  sections: MergedSection[]
}

export interface FormRendererProps {
  config: MergedFormConfig
  companySlug: string
  submitterEmail: string
  submitterName: string
  preFill?: Record<string, unknown>
  isPreview?: boolean
  onSubmit: (requestId: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// FormRenderer
// ---------------------------------------------------------------------------

export function FormRenderer({
  config,
  companySlug,
  submitterEmail,
  submitterName,
  preFill,
  isPreview = false,
  onSubmit,
  onClose,
}: FormRendererProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = { ...preFill }
    // Apply default values from questions
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (q.defaultValue && init[q.key] === undefined) {
          init[q.key] = q.defaultValue
        }
      }
    }
    return init
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Total steps = sections + review step
  const totalSteps = config.sections.length + 1
  const isReviewStep = currentStep === config.sections.length
  const currentSection = config.sections[currentStep] ?? null

  // Get visible questions for a section
  const getVisibleQuestions = useCallback(
    (section: MergedSection) =>
      section.questions.filter((q) => {
        if (q.type === 'heading' || q.type === 'info') return true
        return evaluateVisibility(q.visibilityRules, answers)
      }),
    [answers]
  )

  // Resolve options for a question (resolvedOptions take priority)
  const getOptions = (q: MergedQuestion) =>
    q.resolvedOptions ?? q.staticOptions ?? []

  // Handle answer change — also clears dependent fields that become hidden
  const handleChange = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => {
        const next = { ...prev, [key]: value }
        // Find all questions across all sections that have visibility rules
        // referencing the changed field, and clear their values if they become hidden
        for (const section of config.sections) {
          for (const q of section.questions) {
            if (q.key === key) continue
            if (!q.visibilityRules) continue
            const rules = q.visibilityRules as { conditions?: { field: string }[] }
            const dependsOnChangedField = rules.conditions?.some(
              (c) => c.field === key
            )
            if (dependsOnChangedField && !evaluateVisibility(q.visibilityRules, next)) {
              delete next[q.key]
            }
          }
        }
        return next
      })
      // Clear field error when user changes value
      setErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return prev
      })
    },
    [config.sections]
  )

  // Validate current step
  const validateStep = useCallback(() => {
    if (!currentSection) return true
    const visibleQuestions = getVisibleQuestions(currentSection)
    const newErrors: Record<string, string> = {}

    for (const q of visibleQuestions) {
      if (q.type === 'heading' || q.type === 'info') continue
      const val = answers[q.key]

      // Required check
      if (q.isRequired) {
        if (val === undefined || val === null || val === '') {
          newErrors[q.key] = 'This field is required'
          continue
        }
        if (Array.isArray(val) && val.length === 0) {
          newErrors[q.key] = 'Please select at least one option'
          continue
        }
      }

      // Validation rules
      if (q.validation && val !== undefined && val !== null && val !== '') {
        const strVal = String(val)
        if (q.validation.minLength && strVal.length < q.validation.minLength) {
          newErrors[q.key] = `Must be at least ${q.validation.minLength} characters`
        }
        if (q.validation.maxLength && strVal.length > q.validation.maxLength) {
          newErrors[q.key] = `Must be at most ${q.validation.maxLength} characters`
        }
        if (q.validation.pattern) {
          try {
            const re = new RegExp(q.validation.pattern)
            if (!re.test(strVal)) {
              newErrors[q.key] = 'Invalid format'
            }
          } catch {
            // Skip invalid regex patterns
          }
        }
      }

      // Email validation
      if (q.type === 'email' && val && typeof val === 'string' && val.length > 0) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          newErrors[q.key] = 'Please enter a valid email address'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [currentSection, getVisibleQuestions, answers])

  // Navigation
  const handleNext = () => {
    if (isPreview || validateStep()) {
      setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
    }
  }

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  // Submit — strip out answers for hidden fields before sending
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)

    // Build clean answers: only include values for currently visible questions
    const cleanAnswers: Record<string, unknown> = {}
    for (const section of config.sections) {
      const visible = getVisibleQuestions(section)
      for (const q of visible) {
        if (q.type === 'heading' || q.type === 'info') continue
        if (answers[q.key] !== undefined && answers[q.key] !== null && answers[q.key] !== '') {
          cleanAnswers[q.key] = answers[q.key]
        }
      }
    }

    try {
      const res = await fetch('/api/hr/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: config.type,
          answers: cleanAnswers,
          submittedByEmail: submitterEmail,
          submittedByName: submitterName,
          companySlug,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error ?? 'Submission failed')
        return
      }

      onSubmit(data.requestId)
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // Review step: collect all visible answered questions grouped by section
  const reviewData = useMemo(() => {
    return config.sections.map((section) => ({
      title: section.title,
      questions: getVisibleQuestions(section)
        .filter((q) => q.type !== 'heading' && q.type !== 'info')
        .map((q) => ({
          label: q.label,
          value: formatReviewValue(answers[q.key], getOptions(q), q.type),
        }))
        .filter((q) => q.value),
    }))
  }, [config.sections, getVisibleQuestions, answers])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gray-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">
                {config.type === 'onboarding' ? 'Employee Onboarding' : 'Employee Offboarding'}
              </h2>
              {isPreview && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 uppercase tracking-wide">
                  Preview
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {currentStep + 1} of {totalSteps}
              {!isReviewStep && currentSection ? ` — ${currentSection.title}` : ' — Review & Submit'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-2.5 bg-gray-900/80">
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < currentStep
                    ? 'bg-cyan-500'
                    : i === currentStep
                    ? 'bg-cyan-500/60'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isReviewStep ? (
            <ReviewStep data={reviewData} onEditStep={setCurrentStep} />
          ) : currentSection ? (
            <div className="space-y-5">
              {currentSection.description && (
                <p className="text-sm text-gray-400">{currentSection.description}</p>
              )}
              {getVisibleQuestions(currentSection).map((q) => (
                <FormField
                  key={q.key}
                  question={{
                    ...q,
                    options: getOptions(q),
                    ...(q.type === 'user_select' ? {
                      userOptions: q.resolvedUserOptions ?? undefined,
                      autoFillMap: q.autoFill ?? undefined,
                    } : {}),
                  }}
                  value={answers[q.key]}
                  onChange={handleChange}
                  error={errors[q.key]}
                />
              ))}
            </div>
          ) : null}

          {submitError && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{submitError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <button
            onClick={currentStep === 0 ? onClose : handleBack}
            className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-2"
          >
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>
          {isReviewStep ? (
            isPreview ? (
              <button
                onClick={onClose}
                className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all"
              >
                Close Preview
              </button>
            ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </button>
            )
          ) : (
            <button
              onClick={handleNext}
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all flex items-center gap-2"
            >
              Next
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

interface ReviewData {
  title: string
  questions: { label: string; value: string }[]
}

function ReviewStep({
  data,
  onEditStep,
}: {
  data: ReviewData[]
  onEditStep: (step: number) => void
}) {
  return (
    <div className="space-y-5">
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3.5">
        <p className="text-sm text-gray-300">
          Please review your answers below before submitting. Click any section header to edit.
        </p>
      </div>
      {data.map((section, i) => (
        <div key={i} className="bg-gray-800/30 border border-white/5 rounded-lg overflow-hidden">
          <button
            onClick={() => onEditStep(i)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
          >
            <h4 className="text-sm font-semibold text-white">{section.title}</h4>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {section.questions.length > 0 && (
            <div className="px-4 pb-3 space-y-2">
              {section.questions.map((q, j) => (
                <div key={j} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                  <span className="text-xs text-gray-500 sm:w-40 flex-shrink-0">{q.label}</span>
                  <span className="text-sm text-gray-300">{q.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatReviewValue(
  value: unknown,
  options: { value: string; label: string }[],
  type: string
): string {
  if (value === undefined || value === null || value === '') return ''

  if (type === 'checkbox') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        const opt = options.find((o) => o.value === v)
        return opt?.label ?? v
      })
      .join(', ')
  }

  // For select/radio, show the label
  if (options.length > 0) {
    const opt = options.find((o) => o.value === value)
    if (opt) return opt.label
  }

  return String(value)
}
