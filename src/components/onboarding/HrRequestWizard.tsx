'use client'

import { useState, FormEvent } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HrRequestWizardProps {
  type: 'onboarding' | 'offboarding'
  companySlug: string
  submitterEmail: string
  submitterName: string
  onClose: () => void
  onSuccess: (requestId: string) => void
}

type OnboardingAnswers = {
  first_name: string
  last_name: string
  start_date: string
  job_title: string
  department: string
  work_location: string
  personal_email: string
  phone: string
  license_type: string
  groups_to_add: string
  clone_permissions: 'yes' | 'no'
  clone_from_user: string
  additional_notes: string
}

type OffboardingAnswers = {
  first_name: string
  last_name: string
  work_email: string
  last_day: string
  account_action: string
  forward_email: string
  delegate_access: string
  remove_from_groups: 'yes' | 'no'
  wipe_devices: 'yes' | 'no'
  additional_notes: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LICENSE_OPTIONS = [
  'Microsoft 365 Business Basic',
  'Microsoft 365 Business Standard',
  'Microsoft 365 Business Premium',
  'Microsoft 365 Apps for Business',
  'Other - specify in notes',
]

const ACCOUNT_ACTIONS = [
  { value: 'block_keep_mailbox',    label: 'Block sign-in and keep mailbox for handover' },
  { value: 'convert_shared',        label: 'Convert to shared mailbox' },
  { value: 'permanently_delete',    label: 'Permanently delete account and mailbox' },
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-500 text-white'
                  : isDone
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-gray-700/50 text-gray-500 border border-white/10'
              }`}
            >
              {isDone ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step
              )}
            </div>
            {step < total && (
              <div
                className={`h-px w-8 transition-all duration-200 ${
                  isDone ? 'bg-cyan-500/40' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-300 mb-2">
      {children}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
  )
}

function TextInput({
  id,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  error,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  error?: string
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-800/50 border text-white rounded-lg px-4 py-3 focus:outline-none placeholder-gray-500 text-sm transition-colors duration-150 ${
          error
            ? 'border-red-500/50 focus:border-red-500'
            : 'border-white/10 focus:border-cyan-500/50'
        }`}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

function TextareaInput({
  id,
  value,
  onChange,
  placeholder = '',
  rows = 3,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-gray-800/50 border border-white/10 text-white rounded-lg px-4 py-3 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500 text-sm resize-none transition-colors duration-150"
    />
  )
}

function SelectInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  error?: string
}) {
  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-gray-800/50 border text-white rounded-lg px-4 py-3 focus:outline-none text-sm transition-colors duration-150 appearance-none ${
          error
            ? 'border-red-500/50 focus:border-red-500'
            : 'border-white/10 focus:border-cyan-500/50'
        } ${!value ? 'text-gray-500' : ''}`}
      >
        {placeholder && (
          <option value="" disabled className="text-gray-500 bg-gray-900">
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o} className="bg-gray-900 text-white">
            {o}
          </option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
  error,
}: {
  name: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  error?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div
            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors duration-150 ${
              value === opt.value
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-white/20 group-hover:border-white/40'
            }`}
            onClick={() => onChange(opt.value)}
          >
            {value === opt.value && (
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            )}
          </div>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors duration-150">
            {opt.label}
          </span>
        </label>
      ))}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onboarding wizard steps
// ---------------------------------------------------------------------------

function OnboardingStep1({
  answers,
  onChange,
  errors,
}: {
  answers: OnboardingAnswers
  onChange: (key: keyof OnboardingAnswers, value: string) => void
  errors: Partial<Record<keyof OnboardingAnswers, string>>
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>First Name</FieldLabel>
          <TextInput
            id="first_name"
            value={answers.first_name}
            onChange={(v) => onChange('first_name', v)}
            placeholder="Jane"
            error={errors.first_name}
          />
        </div>
        <div>
          <FieldLabel required>Last Name</FieldLabel>
          <TextInput
            id="last_name"
            value={answers.last_name}
            onChange={(v) => onChange('last_name', v)}
            placeholder="Smith"
            error={errors.last_name}
          />
        </div>
      </div>

      <div>
        <FieldLabel required>Start Date</FieldLabel>
        <TextInput
          id="start_date"
          type="date"
          value={answers.start_date}
          onChange={(v) => onChange('start_date', v)}
          error={errors.start_date}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Job Title</FieldLabel>
          <TextInput
            id="job_title"
            value={answers.job_title}
            onChange={(v) => onChange('job_title', v)}
            placeholder="Account Manager"
          />
        </div>
        <div>
          <FieldLabel>Department</FieldLabel>
          <TextInput
            id="department"
            value={answers.department}
            onChange={(v) => onChange('department', v)}
            placeholder="Sales"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Work Location</FieldLabel>
        <TextInput
          id="work_location"
          value={answers.work_location}
          onChange={(v) => onChange('work_location', v)}
          placeholder="Binghamton, NY / Remote"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Personal Email (for welcome message)</FieldLabel>
          <TextInput
            id="personal_email"
            type="email"
            value={answers.personal_email}
            onChange={(v) => onChange('personal_email', v)}
            placeholder="jane@gmail.com"
          />
        </div>
        <div>
          <FieldLabel>Phone Number</FieldLabel>
          <TextInput
            id="phone"
            value={answers.phone}
            onChange={(v) => onChange('phone', v)}
            placeholder="607-555-0100"
          />
        </div>
      </div>
    </div>
  )
}

function OnboardingStep2({
  answers,
  onChange,
  errors,
}: {
  answers: OnboardingAnswers
  onChange: (key: keyof OnboardingAnswers, value: string) => void
  errors: Partial<Record<keyof OnboardingAnswers, string>>
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel required>License Type</FieldLabel>
        <SelectInput
          id="license_type"
          value={answers.license_type}
          onChange={(v) => onChange('license_type', v)}
          options={LICENSE_OPTIONS}
          placeholder="Select a license type..."
          error={errors.license_type}
        />
      </div>

      <div>
        <FieldLabel>Groups / Distribution Lists / Teams to Add</FieldLabel>
        <TextareaInput
          id="groups_to_add"
          value={answers.groups_to_add}
          onChange={(v) => onChange('groups_to_add', v)}
          placeholder="e.g. All Staff, Sales Team, Marketing DL&#10;List each on a new line or comma-separated"
          rows={3}
        />
      </div>

      <div>
        <FieldLabel>Clone permissions from an existing user?</FieldLabel>
        <RadioGroup
          name="clone_permissions"
          value={answers.clone_permissions}
          onChange={(v) => onChange('clone_permissions', v as 'yes' | 'no')}
          options={[
            { value: 'yes', label: 'Yes — clone another user\'s groups and permissions' },
            { value: 'no',  label: 'No — set up fresh' },
          ]}
        />
      </div>

      {answers.clone_permissions === 'yes' && (
        <div className="ml-4 pl-4 border-l border-cyan-500/20">
          <FieldLabel>Clone from user (email address)</FieldLabel>
          <TextInput
            id="clone_from_user"
            type="email"
            value={answers.clone_from_user}
            onChange={(v) => onChange('clone_from_user', v)}
            placeholder="existing.user@yourcompany.com"
            error={errors.clone_from_user}
          />
        </div>
      )}

      <div>
        <FieldLabel>Additional Notes</FieldLabel>
        <TextareaInput
          id="additional_notes"
          value={answers.additional_notes}
          onChange={(v) => onChange('additional_notes', v)}
          placeholder="Any other information we should know..."
          rows={3}
        />
      </div>
    </div>
  )
}

function OnboardingStep3({
  answers,
  confirmed,
  onConfirm,
  onSubmit,
  submitting,
  submitError,
}: {
  answers: OnboardingAnswers
  confirmed: boolean
  onConfirm: (v: boolean) => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}) {
  const cloneText =
    answers.clone_permissions === 'yes' && answers.clone_from_user
      ? `Yes — clone from ${answers.clone_from_user}`
      : 'No'

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="bg-gray-700/30 border border-white/10 rounded-lg p-4 flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Employee Details
        </p>
        <SummaryRow label="Name"           value={`${answers.first_name} ${answers.last_name}`.trim()} />
        <SummaryRow label="Start Date"     value={answers.start_date} />
        <SummaryRow label="Job Title"      value={answers.job_title} />
        <SummaryRow label="Department"     value={answers.department} />
        <SummaryRow label="Work Location"  value={answers.work_location} />
        <SummaryRow label="Personal Email" value={answers.personal_email} />
        <SummaryRow label="Phone"          value={answers.phone} />

        <div className="border-t border-white/10 pt-2.5 mt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Microsoft 365 Setup
          </p>
          <SummaryRow label="License Type"       value={answers.license_type} />
          <SummaryRow label="Groups / Teams"     value={answers.groups_to_add} />
          <SummaryRow label="Clone Permissions"  value={cloneText} />
          <SummaryRow label="Additional Notes"   value={answers.additional_notes} />
        </div>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <div
          className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors duration-150 ${
            confirmed
              ? 'border-cyan-500 bg-cyan-500'
              : 'border-white/20 group-hover:border-white/40'
          }`}
          onClick={() => onConfirm(!confirmed)}
        >
          {confirmed && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirm(e.target.checked)}
          className="sr-only"
        />
        <span className="text-sm text-gray-300 leading-relaxed">
          I confirm this onboarding request is authorized and the information above is accurate.
        </span>
      </label>

      {submitError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{submitError}</p>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!confirmed || submitting}
        className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting request...
          </>
        ) : (
          'Submit Onboarding Request'
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offboarding wizard steps
// ---------------------------------------------------------------------------

function OffboardingStep1({
  answers,
  onChange,
  errors,
}: {
  answers: OffboardingAnswers
  onChange: (key: keyof OffboardingAnswers, value: string) => void
  errors: Partial<Record<keyof OffboardingAnswers, string>>
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>First Name</FieldLabel>
          <TextInput
            id="first_name"
            value={answers.first_name}
            onChange={(v) => onChange('first_name', v)}
            placeholder="John"
            error={errors.first_name}
          />
        </div>
        <div>
          <FieldLabel required>Last Name</FieldLabel>
          <TextInput
            id="last_name"
            value={answers.last_name}
            onChange={(v) => onChange('last_name', v)}
            placeholder="Doe"
            error={errors.last_name}
          />
        </div>
      </div>

      <div>
        <FieldLabel required>Work Email (Microsoft 365 address)</FieldLabel>
        <TextInput
          id="work_email"
          type="email"
          value={answers.work_email}
          onChange={(v) => onChange('work_email', v)}
          placeholder="john.doe@yourcompany.com"
          error={errors.work_email}
        />
        <p className="text-xs text-gray-500 mt-1">
          This is the UPN used to sign in to Microsoft 365 — usually their company email address.
        </p>
      </div>

      <div>
        <FieldLabel required>Last Day of Work</FieldLabel>
        <TextInput
          id="last_day"
          type="date"
          value={answers.last_day}
          onChange={(v) => onChange('last_day', v)}
          error={errors.last_day}
        />
      </div>
    </div>
  )
}

function OffboardingStep2({
  answers,
  onChange,
  errors,
}: {
  answers: OffboardingAnswers
  onChange: (key: keyof OffboardingAnswers, value: string) => void
  errors: Partial<Record<keyof OffboardingAnswers, string>>
}) {
  const showForwarding = ['block_keep_mailbox', 'convert_shared'].includes(answers.account_action)
  const showDelegate  = answers.account_action === 'convert_shared'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel required>Account Action</FieldLabel>
        <RadioGroup
          name="account_action"
          value={answers.account_action}
          onChange={(v) => onChange('account_action', v)}
          options={ACCOUNT_ACTIONS}
          error={errors.account_action}
        />
      </div>

      {/* Conditional: forward email */}
      {showForwarding && (
        <div className="ml-4 pl-4 border-l border-cyan-500/20">
          <FieldLabel>Forward email to (optional)</FieldLabel>
          <TextInput
            id="forward_email"
            type="email"
            value={answers.forward_email}
            onChange={(v) => onChange('forward_email', v)}
            placeholder="manager@yourcompany.com"
          />
        </div>
      )}

      {/* Conditional: delegate access */}
      {showDelegate && (
        <div className="ml-4 pl-4 border-l border-cyan-500/20">
          <FieldLabel>Delegate mailbox access to</FieldLabel>
          <TextInput
            id="delegate_access"
            type="email"
            value={answers.delegate_access}
            onChange={(v) => onChange('delegate_access', v)}
            placeholder="colleague@yourcompany.com"
          />
        </div>
      )}

      <div>
        <FieldLabel>Remove from all Microsoft 365 groups?</FieldLabel>
        <RadioGroup
          name="remove_from_groups"
          value={answers.remove_from_groups}
          onChange={(v) => onChange('remove_from_groups', v as 'yes' | 'no')}
          options={[
            { value: 'yes', label: 'Yes — remove from all groups, teams, and distribution lists' },
            { value: 'no',  label: 'No — keep existing group memberships' },
          ]}
        />
      </div>

      <div>
        <FieldLabel>Wipe managed devices?</FieldLabel>
        <RadioGroup
          name="wipe_devices"
          value={answers.wipe_devices}
          onChange={(v) => onChange('wipe_devices', v as 'yes' | 'no')}
          options={[
            { value: 'yes', label: 'Yes — wipe all Intune/managed devices enrolled to this user' },
            { value: 'no',  label: 'No — do not wipe devices' },
          ]}
        />
      </div>

      <div>
        <FieldLabel>Additional Notes</FieldLabel>
        <TextareaInput
          id="additional_notes"
          value={answers.additional_notes}
          onChange={(v) => onChange('additional_notes', v)}
          placeholder="Any other instructions or context..."
          rows={3}
        />
      </div>
    </div>
  )
}

function OffboardingStep3({
  answers,
  confirmed,
  onConfirm,
  onSubmit,
  submitting,
  submitError,
}: {
  answers: OffboardingAnswers
  confirmed: boolean
  onConfirm: (v: boolean) => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}) {
  const accountActionLabel =
    ACCOUNT_ACTIONS.find((a) => a.value === answers.account_action)?.label ?? answers.account_action

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="bg-gray-700/30 border border-white/10 rounded-lg p-4 flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Employee Details
        </p>
        <SummaryRow label="Name"        value={`${answers.first_name} ${answers.last_name}`.trim()} />
        <SummaryRow label="Work Email"  value={answers.work_email} />
        <SummaryRow label="Last Day"    value={answers.last_day} />

        <div className="border-t border-white/10 pt-2.5 mt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Account Handling
          </p>
          <SummaryRow label="Action"           value={accountActionLabel} />
          {answers.forward_email  && <SummaryRow label="Forward Email To"    value={answers.forward_email} />}
          {answers.delegate_access && <SummaryRow label="Delegate Access To" value={answers.delegate_access} />}
          <SummaryRow label="Remove Groups"    value={answers.remove_from_groups === 'yes' ? 'Yes' : 'No'} />
          <SummaryRow label="Wipe Devices"     value={answers.wipe_devices === 'yes' ? 'Yes — wipe all devices' : 'No'} />
          <SummaryRow label="Additional Notes" value={answers.additional_notes} />
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-500/5 border border-red-500/30 rounded-lg px-4 py-3.5">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-400 mb-1">Important Warning</p>
            <p className="text-sm text-red-300/80 leading-relaxed">
              This action will immediately affect the employee&apos;s Microsoft 365 access.
              Ensure the last day of work has arrived or authorization has been received before submitting.
            </p>
          </div>
        </div>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <div
          className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors duration-150 ${
            confirmed
              ? 'border-cyan-500 bg-cyan-500'
              : 'border-white/20 group-hover:border-white/40'
          }`}
          onClick={() => onConfirm(!confirmed)}
        >
          {confirmed && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirm(e.target.checked)}
          className="sr-only"
        />
        <span className="text-sm text-gray-300 leading-relaxed">
          I confirm this offboarding request is authorized and I understand it will affect the
          employee&apos;s account access immediately.
        </span>
      </label>

      {submitError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{submitError}</p>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!confirmed || submitting}
        className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting request...
          </>
        ) : (
          'Submit Offboarding Request'
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

function SuccessScreen({
  requestId,
  type,
  onClose,
}: {
  requestId: string
  type: 'onboarding' | 'offboarding'
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white mb-2">Request Submitted</h3>
        <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
          Your {type} request has been received. Our team will process it and an Autotask
          ticket will be created shortly.
        </p>
      </div>
      <div className="bg-gray-800/60 border border-white/10 rounded-lg px-5 py-3 w-full max-w-sm">
        <p className="text-xs text-gray-500 mb-1">Request ID</p>
        <p className="text-sm font-mono text-cyan-400 break-all">{requestId}</p>
      </div>
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onClose}
          className="flex-1 bg-gray-700/50 hover:bg-gray-700 border border-white/10 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export function HrRequestWizard({
  type,
  companySlug,
  submitterEmail,
  submitterName,
  onClose,
  onSuccess,
}: HrRequestWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [successRequestId, setSuccessRequestId] = useState<string | null>(null)

  // ----- Onboarding state -----
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>({
    first_name: '',
    last_name: '',
    start_date: '',
    job_title: '',
    department: '',
    work_location: '',
    personal_email: '',
    phone: '',
    license_type: '',
    groups_to_add: '',
    clone_permissions: 'no',
    clone_from_user: '',
    additional_notes: '',
  })
  const [onboardingErrors, setOnboardingErrors] = useState<Partial<Record<keyof OnboardingAnswers, string>>>({})

  // ----- Offboarding state -----
  const [offboardingAnswers, setOffboardingAnswers] = useState<OffboardingAnswers>({
    first_name: '',
    last_name: '',
    work_email: '',
    last_day: '',
    account_action: '',
    forward_email: '',
    delegate_access: '',
    remove_from_groups: 'yes',
    wipe_devices: 'no',
    additional_notes: '',
  })
  const [offboardingErrors, setOffboardingErrors] = useState<Partial<Record<keyof OffboardingAnswers, string>>>({})

  function updateOnboarding(key: keyof OnboardingAnswers, value: string) {
    setOnboardingAnswers((prev) => ({ ...prev, [key]: value }))
    if (onboardingErrors[key]) {
      setOnboardingErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  function updateOffboarding(key: keyof OffboardingAnswers, value: string) {
    setOffboardingAnswers((prev) => ({ ...prev, [key]: value }))
    if (offboardingErrors[key]) {
      setOffboardingErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  // ----- Validation -----
  function validateStep1(): boolean {
    if (type === 'onboarding') {
      const errors: Partial<Record<keyof OnboardingAnswers, string>> = {}
      if (!onboardingAnswers.first_name.trim()) errors.first_name = 'First name is required'
      if (!onboardingAnswers.last_name.trim())  errors.last_name = 'Last name is required'
      if (!onboardingAnswers.start_date)         errors.start_date = 'Start date is required'
      setOnboardingErrors(errors)
      return Object.keys(errors).length === 0
    } else {
      const errors: Partial<Record<keyof OffboardingAnswers, string>> = {}
      if (!offboardingAnswers.first_name.trim()) errors.first_name = 'First name is required'
      if (!offboardingAnswers.last_name.trim())  errors.last_name = 'Last name is required'
      if (!offboardingAnswers.work_email.trim()) errors.work_email = 'Work email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(offboardingAnswers.work_email))
        errors.work_email = 'Enter a valid email address'
      if (!offboardingAnswers.last_day)          errors.last_day = 'Last day is required'
      setOffboardingErrors(errors)
      return Object.keys(errors).length === 0
    }
  }

  function validateStep2(): boolean {
    if (type === 'onboarding') {
      const errors: Partial<Record<keyof OnboardingAnswers, string>> = {}
      if (!onboardingAnswers.license_type) errors.license_type = 'Please select a license type'
      if (onboardingAnswers.clone_permissions === 'yes' && !onboardingAnswers.clone_from_user.trim())
        errors.clone_from_user = 'Please enter the email of the user to clone'
      setOnboardingErrors(errors)
      return Object.keys(errors).length === 0
    } else {
      const errors: Partial<Record<keyof OffboardingAnswers, string>> = {}
      if (!offboardingAnswers.account_action) errors.account_action = 'Please select an account action'
      setOffboardingErrors(errors)
      return Object.keys(errors).length === 0
    }
  }

  function handleNext(e: FormEvent) {
    e.preventDefault()
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep((s) => s + 1)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)

    const answers =
      type === 'onboarding'
        ? (onboardingAnswers as Record<string, unknown>)
        : (offboardingAnswers as Record<string, unknown>)

    try {
      const res = await fetch('/api/hr/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          answers,
          submittedByEmail: submitterEmail,
          submittedByName: submitterName,
          companySlug,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setSubmitError(
            `A duplicate request was detected (submitted within the last hour). Request ID: ${data.requestId ?? 'unknown'}`
          )
        } else {
          setSubmitError(data.error ?? 'Submission failed. Please try again.')
        }
        return
      }

      setSuccessRequestId(data.requestId)
      onSuccess(data.requestId)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ----- Step labels -----
  const stepLabels =
    type === 'onboarding'
      ? ['Employee Details', 'M365 Setup', 'Review & Submit']
      : ['Employee Details', 'Account Handling', 'Review & Submit']

  const title =
    type === 'onboarding'
      ? 'New Employee Onboarding'
      : 'Employee Offboarding'

  return (
    // Overlay
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        // Close on backdrop click only when not submitting
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      {/* Panel */}
      <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {!successRequestId && (
              <p className="text-xs text-gray-500 mt-0.5">
                Step {step} of 3 — {stepLabels[step - 1]}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!successRequestId && <StepIndicator current={step} total={3} />}
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors duration-150 disabled:opacity-40"
              aria-label="Close wizard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {successRequestId ? (
            <SuccessScreen
              requestId={successRequestId}
              type={type}
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleNext} noValidate>
              {/* Step content */}
              {type === 'onboarding' ? (
                <>
                  {step === 1 && (
                    <OnboardingStep1
                      answers={onboardingAnswers}
                      onChange={updateOnboarding}
                      errors={onboardingErrors}
                    />
                  )}
                  {step === 2 && (
                    <OnboardingStep2
                      answers={onboardingAnswers}
                      onChange={updateOnboarding}
                      errors={onboardingErrors}
                    />
                  )}
                  {step === 3 && (
                    <OnboardingStep3
                      answers={onboardingAnswers}
                      confirmed={confirmed}
                      onConfirm={setConfirmed}
                      onSubmit={handleSubmit}
                      submitting={submitting}
                      submitError={submitError}
                    />
                  )}
                </>
              ) : (
                <>
                  {step === 1 && (
                    <OffboardingStep1
                      answers={offboardingAnswers}
                      onChange={updateOffboarding}
                      errors={offboardingErrors}
                    />
                  )}
                  {step === 2 && (
                    <OffboardingStep2
                      answers={offboardingAnswers}
                      onChange={updateOffboarding}
                      errors={offboardingErrors}
                    />
                  )}
                  {step === 3 && (
                    <OffboardingStep3
                      answers={offboardingAnswers}
                      confirmed={confirmed}
                      onConfirm={setConfirmed}
                      onSubmit={handleSubmit}
                      submitting={submitting}
                      submitError={submitError}
                    />
                  )}
                </>
              )}

              {/* Navigation buttons (shown on steps 1 & 2 only) */}
              {step < 3 && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={() => setStep((s) => s - 1)}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors duration-150"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                      </svg>
                      Back
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all duration-200 flex items-center gap-2"
                  >
                    Continue
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
