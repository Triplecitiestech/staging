/**
 * Step 2 — Customer Profile.
 *
 * Renders the full CUSTOMER_PROFILE_SECTIONS schema as a form,
 * pre-filled from the canonical merged source (legacy + form_responses
 * overlay, via getCustomerProfileAnswers). Save persists via the new
 * /api/compliance/customer-profile endpoint.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CUSTOMER_PROFILE_SECTIONS,
  CUSTOMER_PROFILE_QUESTIONS,
  getCustomerProfileAnswers,
} from '@/lib/compliance/customer-profile-schema'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import CustomerProfileForm from '@/components/compliance/CustomerProfileForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function ProfileStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const [answers, steps] = await Promise.all([
    getCustomerProfileAnswers(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'profile')

  const requiredCount = CUSTOMER_PROFILE_QUESTIONS.filter((q) => q.required).length
  const filledCount = CUSTOMER_PROFILE_QUESTIONS.filter((q) => {
    if (!q.required) return false
    const v = answers[q.key]
    if (v === null || v === undefined) return false
    if (Array.isArray(v)) return v.length > 0
    return String(v).trim().length > 0
  }).length

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 2</p>
        <h2 className="text-2xl font-bold text-white">Customer Profile</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Industry, regulatory scope, operating environment, and people
          inputs that drive framework auto-detection, control applicability,
          and policy generation. These answers persist across reassessments —
          fill them once, edit when something changes.
        </p>
        <p className="text-xs text-cyan-300/80 mt-2">
          {filledCount} of {requiredCount} required answers complete.
        </p>
      </header>

      <CustomerProfileForm
        companyId={companyId}
        sections={CUSTOMER_PROFILE_SECTIONS}
        initial={answers}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        {prev ? (
          <Link
            href={prev.href}
            className="text-xs text-slate-400 hover:text-cyan-300"
          >
            ← Back to {prev.title}
          </Link>
        ) : <span />}
        {next && (
          <Link
            href={next.href}
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Next: {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}
