'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormFieldQuestion {
  key: string
  type: string
  label: string
  helpText?: string | null
  placeholder?: string | null
  isRequired: boolean
  defaultValue?: string | null
  validation?: { minLength?: number; maxLength?: number; pattern?: string } | null
  options?: { value: string; label: string }[]
}

interface FormFieldProps {
  question: FormFieldQuestion
  value: unknown
  onChange: (key: string, value: unknown) => void
  error?: string | null
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputClass =
  'w-full bg-gray-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors'

const labelClass = 'block text-sm font-medium text-gray-300 mb-1.5'

const helpClass = 'text-xs text-gray-500 mt-1'

const errorClass = 'text-xs text-red-400 mt-1'

// ---------------------------------------------------------------------------
// FormField component
// ---------------------------------------------------------------------------

export function FormField({ question, value, onChange, error }: FormFieldProps) {
  const { key, type, label, helpText, placeholder, isRequired, options } = question

  // Display-only types
  if (type === 'heading') {
    return (
      <div className="pt-2 pb-1">
        <h3 className="text-base font-semibold text-white">{label}</h3>
        {helpText && <p className="text-sm text-gray-400 mt-0.5">{helpText}</p>}
      </div>
    )
  }

  if (type === 'info') {
    return (
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3.5">
        <p className="text-sm text-gray-300">{label}</p>
        {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
      </div>
    )
  }

  // Text input types
  if (type === 'text' || type === 'email' || type === 'phone') {
    const inputType = type === 'phone' ? 'tel' : type
    return (
      <div>
        <label htmlFor={key} className={labelClass}>
          {label}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </label>
        <input
          id={key}
          type={inputType}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder={placeholder ?? undefined}
          className={inputClass}
        />
        {helpText && <p className={helpClass}>{helpText}</p>}
        {error && <p className={errorClass}>{error}</p>}
      </div>
    )
  }

  if (type === 'textarea') {
    return (
      <div>
        <label htmlFor={key} className={labelClass}>
          {label}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </label>
        <textarea
          id={key}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder={placeholder ?? undefined}
          rows={4}
          className={inputClass + ' resize-y'}
        />
        {helpText && <p className={helpClass}>{helpText}</p>}
        {error && <p className={errorClass}>{error}</p>}
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div>
        <label htmlFor={key} className={labelClass}>
          {label}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </label>
        <input
          id={key}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          className={inputClass + ' [color-scheme:dark]'}
        />
        {helpText && <p className={helpClass}>{helpText}</p>}
        {error && <p className={errorClass}>{error}</p>}
      </div>
    )
  }

  if (type === 'select') {
    return <SelectField question={question} value={value} onChange={onChange} error={error} />
  }

  if (type === 'multi_select') {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <div>
        <label className={labelClass}>
          {label}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </label>
        {helpText && <p className={helpClass + ' mb-2'}>{helpText}</p>}
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {(options ?? []).map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-800/30 border border-white/5 hover:border-white/10 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value)
                  onChange(key, next)
                }}
                className="w-4 h-4 rounded border-white/20 bg-gray-700 text-cyan-500 focus:ring-cyan-500/30 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300">{opt.label}</span>
            </label>
          ))}
        </div>
        {error && <p className={errorClass}>{error}</p>}
      </div>
    )
  }

  if (type === 'radio') {
    return (
      <div>
        <label className={labelClass}>
          {label}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </label>
        {helpText && <p className={helpClass + ' mb-2'}>{helpText}</p>}
        <div className="space-y-1.5">
          {(options ?? []).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                value === opt.value
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                  : 'bg-gray-800/30 border-white/5 hover:border-white/10 text-gray-300'
              }`}
            >
              <input
                type="radio"
                name={key}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(key, opt.value)}
                className="w-4 h-4 border-white/20 bg-gray-700 text-cyan-500 focus:ring-cyan-500/30 focus:ring-offset-0"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
        {error && <p className={errorClass}>{error}</p>}
      </div>
    )
  }

  if (type === 'checkbox') {
    return (
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(key, e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-gray-700 text-cyan-500 focus:ring-cyan-500/30 focus:ring-offset-0"
          />
          <span className="text-sm text-gray-300">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </span>
        </label>
        {helpText && <p className={helpClass + ' ml-6'}>{helpText}</p>}
        {error && <p className={errorClass + ' ml-6'}>{error}</p>}
      </div>
    )
  }

  // Fallback for unknown types
  return (
    <div>
      <label htmlFor={key} className={labelClass}>
        {label}
        {isRequired && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        id={key}
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder ?? undefined}
        className={inputClass}
      />
      {helpText && <p className={helpClass}>{helpText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Select field with search for large option lists
// ---------------------------------------------------------------------------

function SelectField({
  question,
  value,
  onChange,
  error,
}: {
  question: FormFieldQuestion
  value: unknown
  onChange: (key: string, value: unknown) => void
  error?: string | null
}) {
  const { key, label, helpText, isRequired, options } = question
  const [search, setSearch] = useState('')
  const showSearch = (options ?? []).length > 8

  const filtered = (options ?? []).filter(
    (opt) =>
      !search || opt.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <label htmlFor={key} className={labelClass}>
        {label}
        {isRequired && <span className="text-red-400 ml-1">*</span>}
      </label>
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search options..."
          className={inputClass + ' mb-1.5'}
        />
      )}
      <select
        id={key}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(key, e.target.value)}
        className={inputClass + ' appearance-none'}
      >
        <option value="">Select...</option>
        {filtered.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helpText && <p className={helpClass}>{helpText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  )
}
