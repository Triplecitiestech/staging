/**
 * Step 1 — Onboard.
 *
 * Slice 1 delegates the actual work to the existing tech onboarding
 * wizard at /admin/companies/[id]/onboard rather than duplicating it.
 * This page is a short readout of where things stand (Autotask link,
 * M365 consent, M365 setup status) plus a Continue button that jumps
 * to the wizard.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function OnboardStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const [company, steps] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        slug: true,
        autotaskCompanyId: true,
        m365TenantId: true,
        m365SetupStatus: true,
        m365ConsentMode: true,
        m365ConsentGrantedAt: true,
        onboardingCompletedAt: true,
      },
    }),
    getWorkflowState(companyId),
  ])
  if (!company) notFound()
  const { next } = adjacentSteps(steps, 'onboard')

  const autotaskLinked = Boolean(company.autotaskCompanyId)
  const m365Connected = Boolean(
    company.m365ConsentGrantedAt || company.m365SetupStatus === 'verified'
  )

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 1</p>
        <h2 className="text-2xl font-bold text-white">Onboard</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Link the customer to Autotask and grant the Microsoft 365 admin
          consent that lets us read tenant security state. Both are required
          before compliance assessments will produce meaningful results.
        </p>
      </header>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Status</h3>
        <StatusRow
          label="Autotask company link"
          ok={autotaskLinked}
          detail={
            autotaskLinked
              ? `Linked to Autotask company ID ${company.autotaskCompanyId}`
              : 'Not linked. Use the onboarding wizard to search Autotask and import the company.'
          }
        />
        <StatusRow
          label="Microsoft 365 admin consent"
          ok={m365Connected}
          detail={
            m365Connected
              ? company.m365ConsentMode === 'multi_tenant'
                ? `Multi-tenant consent granted${company.m365ConsentGrantedAt ? ` on ${new Date(company.m365ConsentGrantedAt).toLocaleDateString()}` : ''}.`
                : `Legacy per-tenant credentials are present (mode: ${company.m365ConsentMode ?? 'legacy'}).`
              : `No consent yet. Mode: ${company.m365ConsentMode ?? 'legacy'} · Setup status: ${company.m365SetupStatus ?? 'not_configured'}.`
          }
        />
      </section>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-2">
          Continue onboarding
        </h3>
        <p className="text-sm text-slate-400 mb-3">
          The full onboarding wizard handles Autotask search, M365 admin
          consent, connection test, manager invite, and finalize. Once both
          rows above are green, this step is complete and the workflow will
          advance to the Customer Profile.
        </p>
        <Link
          href={`/admin/companies/${companyId}/onboard`}
          className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
        >
          Open onboarding wizard →
        </Link>
      </section>

      <StepFooter
        next={next}
        nextDisabled={!autotaskLinked || !m365Connected}
        disabledReason="Complete the Autotask link and M365 consent rows above before continuing."
      />
    </div>
  )
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/30'
      }`}
    >
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
          ok
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
        }`}
        aria-label={ok ? 'Complete' : 'Pending'}
      >
        {ok ? '✓' : '!'}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

function StepFooter({
  next,
  nextDisabled,
  disabledReason,
}: {
  next: ReturnType<typeof adjacentSteps>['next']
  nextDisabled: boolean
  disabledReason: string
}) {
  if (!next) return null
  const cls = nextDisabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'hover:bg-cyan-500/30'
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      <div className="text-xs text-slate-500">
        {nextDisabled ? disabledReason : `Up next: ${next.title}`}
      </div>
      <Link
        href={next.href}
        aria-disabled={nextDisabled}
        className={`inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 ${cls}`}
      >
        Next: {next.title} →
      </Link>
    </div>
  )
}
