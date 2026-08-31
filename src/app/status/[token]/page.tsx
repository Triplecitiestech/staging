import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import {
  getWilmarStatusData,
  WILMAR_CONTRACT_SCOPE,
  WILMAR_ENGAGEMENT,
  type WilmarPhaseCard,
  type WilmarStatusData,
} from '@/lib/wilmar-status'
import { WILMAR_STATUS_CODE_COOKIE, isWilmarStatusCodeCookieValid } from '@/lib/wilmar-status-code'
import WilmarCodeGate from './CodeGate'

// Public, unauthenticated onboarding status page for Wilmar, LLC. Access
// control is the URL token (compared to WILMAR_STATUS_TOKEN below) — no
// login, no account, matching the URL-token gate already used for other
// public-but-unlinked pages in this codebase — PLUS a second, lightweight
// gate layered on top: a 6-digit code Neil types in once, remembered via a
// plain marker cookie (see CodeGate.tsx and src/lib/wilmar-status-code.ts).
// See layout.tsx for the noindex metadata.
//
// Must read Autotask live on every request (no static caching, no DB sync
// step) — see src/lib/wilmar-status.ts for the data layer and rationale.
export const dynamic = 'force-dynamic'

export default async function WilmarStatusPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const expectedToken = process.env.WILMAR_STATUS_TOKEN

  // No password UI, no partial-match hints — a wrong or unconfigured token
  // is indistinguishable from a route that doesn't exist.
  if (!expectedToken || token !== expectedToken) {
    notFound()
  }

  // Second gate: the 6-digit code. Checked (and the Autotask fetch below
  // skipped) until the code cookie is present and valid.
  const cookieStore = await cookies()
  const codeCookieValue = cookieStore.get(WILMAR_STATUS_CODE_COOKIE)?.value
  if (!isWilmarStatusCodeCookieValid(codeCookieValue)) {
    return <WilmarCodeGate token={token} />
  }

  const result = await getWilmarStatusData()

  return (
    <main className="min-h-screen bg-black text-white/90">
      <div className="relative mx-auto max-w-[1120px] overflow-hidden px-4 py-8 sm:px-8 sm:py-10 lg:px-[52px] lg:py-11">
        {/* Decorative radial glows, matching the design source */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-56 -top-80 h-[760px] w-[760px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, rgba(34,211,238,0) 68%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-96 -left-64 h-[820px] w-[820px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.14) 0%, rgba(168,85,247,0) 68%)' }}
        />

        <div className="relative flex flex-col gap-8 sm:gap-10">
          {result.ok ? <StatusHeader data={result.data} /> : <ErrorHeader />}

          {result.ok ? (
            <>
              <MilestoneRail data={result.data} />
              <ProgressSummary data={result.data} />
              <PhaseCards data={result.data} />
            </>
          ) : (
            <ErrorNotice />
          )}
        </div>
      </div>
    </main>
  )
}

// ============================================================
// Header — present regardless of data-fetch success, so the page always
// looks like Triple Cities Tech even when live data can't be reached.
// ============================================================

function StatusHeader({ data }: { data: WilmarStatusData }) {
  return (
    <HeaderShell statusAsOfLabel={data.statusAsOfLabel}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile value={WILMAR_CONTRACT_SCOPE.sites} label="Sites" />
        <StatTile value={WILMAR_CONTRACT_SCOPE.pcs} label="PCs" />
        <StatTile value={WILMAR_CONTRACT_SCOPE.servers} label="Servers" />
        <StatTile value={WILMAR_CONTRACT_SCOPE.userSeats} label="User seats" />
        <StatTile value={WILMAR_CONTRACT_SCOPE.adminSeats} label="Admin seats" />
      </div>
    </HeaderShell>
  )
}

function ErrorHeader() {
  return <HeaderShell statusAsOfLabel={null} />
}

function HeaderShell({
  statusAsOfLabel,
  children,
}: {
  statusAsOfLabel: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/tctlogo.webp"
            alt="Triple Cities Tech"
            width={34}
            height={34}
            className="h-8 w-8 object-contain sm:h-[34px] sm:w-[34px]"
            priority
          />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/90 sm:text-sm">
            Triple Cities Tech
          </span>
        </div>
        {statusAsOfLabel && (
          <div className="flex shrink-0 flex-col items-start gap-1 text-left sm:items-end sm:text-right">
            <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-400">Status as of</span>
            <span className="text-sm font-semibold text-white/70">{statusAsOfLabel}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-white/90 sm:text-4xl lg:text-[48px]">
          Ally Co-Managed Onboarding
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/70 sm:gap-4">
          <span className="font-semibold text-white/90">{WILMAR_ENGAGEMENT.companyName}</span>
          <span className="text-white/30">|</span>
          <span className="font-semibold text-white/90">{WILMAR_ENGAGEMENT.vendorName}</span>
          <span className="hidden h-4 w-px bg-white/20 sm:block" />
          <span>{WILMAR_ENGAGEMENT.tierLabel}</span>
        </div>
      </div>

      {children}
    </div>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 bg-white/[0.04] px-4 py-3 sm:px-5">
      <span className="text-xl font-black tracking-tight text-white/90 sm:text-2xl">{value}</span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/50 sm:text-[11px]">{label}</span>
    </div>
  )
}

// ============================================================
// Milestone rail
// ============================================================

function MilestoneRail({ data }: { data: WilmarStatusData }) {
  const { milestones, todayPositionPercent } = data
  const firstUnreachedIndex = milestones.findIndex((m) => !m.reached)

  return (
    <section className="flex flex-col gap-3">
      <SectionEyebrow>Milestones</SectionEyebrow>

      {/* Desktop: horizontal rail, matching the design source's absolute layout */}
      <div className="relative hidden h-[228px] lg:mx-24 lg:block">
        <div className="absolute left-0 right-0 top-[92px] h-1 rounded-full bg-white/10" />
        <div
          className="absolute left-0 top-[92px] h-1 rounded-full"
          style={{
            width: `${todayPositionPercent}%`,
            background: 'linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)',
            boxShadow: '0 0 14px rgba(34,211,238,0.5)',
          }}
        />

        {/* TODAY marker */}
        <div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${todayPositionPercent}%` }}
        >
          <div className="w-[252px] rounded-xl border border-cyan-400/55 bg-cyan-400/10 px-4 py-2.5 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-400">Today</div>
            <div className="mt-1 text-[12.5px] leading-snug text-white/90">
              {data.statusAsOfLabel}
            </div>
          </div>
          <div
            className="h-[46px] w-[3px] rounded"
            style={{ background: 'linear-gradient(180deg, rgba(34,211,238,0.45) 0%, #22d3ee 100%)' }}
          />
        </div>

        {milestones.map((m, i) => {
          const distanceFromNext = firstUnreachedIndex === -1 ? -1 : i - firstUnreachedIndex
          const dotClasses = m.reached
            ? 'bg-cyan-500'
            : distanceFromNext >= 0 && distanceFromNext < 2
              ? 'border-2 border-cyan-400/55 bg-black'
              : 'border-2 border-white/[0.28] bg-black'
          const staggerTop = i % 2 === 0 ? 'top-[104px]' : 'top-[162px]'

          return (
            <div key={m.key}>
              <div
                className={`absolute top-[87px] h-3.5 w-3.5 -translate-x-1/2 rounded-full ${dotClasses}`}
                style={{ left: `${m.positionPercent}%` }}
              />
              {i % 2 === 1 && (
                <div
                  className="absolute top-24 h-[66px] w-px bg-white/[0.14]"
                  style={{ left: `${m.positionPercent}%` }}
                />
              )}
              <div
                className={`absolute ${staggerTop} flex w-[176px] -translate-x-1/2 flex-col gap-1 text-center`}
                style={{ left: `${m.positionPercent}%` }}
              >
                <span
                  className={`font-mono text-xs tracking-[0.14em] ${m.reached ? 'text-cyan-400' : 'text-white/50'}`}
                >
                  {m.dateLabel}
                </span>
                <span className={`text-[12.5px] leading-snug ${m.reached ? 'text-white/90' : 'text-white/70'}`}>
                  {m.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile / tablet: stacked vertical timeline */}
      <div className="flex flex-col gap-4 lg:hidden">
        {milestones.map((m, i) => (
          <div key={m.key} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${
                  m.reached ? 'bg-cyan-500' : 'border-2 border-white/[0.28] bg-black'
                }`}
              />
              <div className="flex flex-col gap-0.5">
                <span className={`font-mono text-xs tracking-[0.14em] ${m.reached ? 'text-cyan-400' : 'text-white/50'}`}>
                  {m.dateLabel}
                </span>
                <span className={`text-sm leading-snug ${m.reached ? 'text-white/90' : 'text-white/70'}`}>
                  {m.label}
                </span>
              </div>
            </div>
            {i === firstUnreachedIndex - 1 || (firstUnreachedIndex === -1 && i === milestones.length - 1) ? (
              <div className="ml-[7px] rounded-xl border border-cyan-400/55 bg-cyan-400/10 px-4 py-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-400">Today</div>
                <div className="mt-1 text-[12.5px] leading-snug text-white/90">{data.statusAsOfLabel}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================================
// Progress summary
// ============================================================

function ProgressSummary({ data }: { data: WilmarStatusData }) {
  const { overall } = data
  const percentWidth = `${Math.max(0, Math.min(100, overall.percent))}%`

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:flex-row lg:items-stretch lg:gap-9 lg:p-8">
      <div className="flex flex-col gap-3.5 lg:w-[384px] lg:shrink-0">
        <SectionEyebrow>Overall progress — tasks</SectionEyebrow>
        <div className="flex items-baseline gap-3">
          <span className="text-6xl font-black leading-[0.9] tracking-tighter text-cyan-400 sm:text-7xl lg:text-[92px]">
            {overall.percent}%
          </span>
          <span className="text-lg font-semibold text-white/70">complete</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full"
            style={{
              width: percentWidth,
              background: 'linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)',
              boxShadow: '0 0 18px rgba(34,211,238,0.45)',
            }}
          />
        </div>
        <span className="text-sm text-white/50">{overall.totalTasks} total</span>
      </div>

      <div className="hidden w-px bg-white/10 lg:block" />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:flex-1">
        <StatCard value={overall.complete} label="Complete" valueClassName="text-cyan-400" />
        <StatCard value={overall.inProgress} label="In progress" valueClassName="text-white/90" />
        <StatCard value={overall.waiting} label="Waiting on access or vendor" valueClassName="text-white/90" />
        <StatCard value={overall.notStarted} label="Not yet started" valueClassName="text-white/50" />
      </div>
    </section>
  )
}

function StatCard({
  value,
  label,
  valueClassName,
}: {
  value: number
  label: string
  valueClassName: string
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
      <span className={`min-w-[52px] text-3xl font-black tracking-tight ${valueClassName}`}>{value}</span>
      <span className="text-sm font-semibold text-white/70">{label}</span>
    </div>
  )
}

// ============================================================
// Phase cards
// ============================================================

function PhaseCards({ data }: { data: WilmarStatusData }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionEyebrow>Phase progress</SectionEyebrow>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.phaseCards.map((card) => (
          <PhaseCard key={`${card.eyebrow}-${card.title}`} card={card} />
        ))}
      </div>
    </section>
  )
}

function PhaseCard({ card }: { card: WilmarPhaseCard }) {
  const containerClasses = card.highlight
    ? 'border border-cyan-400/45 bg-cyan-400/[0.07]'
    : 'border border-white/10 bg-white/[0.04]'

  return (
    <div className={`flex min-h-[178px] flex-col gap-2.5 rounded-2xl p-5 ${containerClasses}`}>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.28em] ${
          card.highlight ? 'text-cyan-400' : 'text-white/50'
        }`}
      >
        {card.eyebrow}
      </span>
      <h3 className="min-h-[42px] text-base font-bold leading-snug text-white/90">{card.title}</h3>
      <p
        className={`flex-1 text-[12.5px] leading-relaxed ${
          card.highlight ? 'text-white/90' : 'text-white/70'
        }`}
      >
        <PhaseDescription description={card.description} emphasize={card.emphasize} />
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-cyan-400"
          style={{ width: `${Math.max(0, Math.min(100, card.percent))}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-lg font-black ${card.percent > 0 ? 'text-cyan-400' : 'text-white/50'}`}>
          {card.percent}%
        </span>
        <span className="text-xs text-white/50">
          {card.completed} of {card.total} complete
        </span>
      </div>
    </div>
  )
}

function PhaseDescription({ description, emphasize }: { description: string; emphasize?: string }) {
  if (!emphasize || !description.includes(emphasize)) {
    return <>{description}</>
  }
  const idx = description.indexOf(emphasize)
  const before = description.slice(0, idx)
  const after = description.slice(idx + emphasize.length)
  return (
    <>
      {before}
      <strong className="font-bold text-cyan-400">{emphasize}</strong>
      {after}
    </>
  )
}

// ============================================================
// Shared bits
// ============================================================

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-400">{children}</span>
  )
}

function ErrorNotice() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <p className="text-sm text-white/80">
        We couldn&apos;t load live status data just now. Nothing here is wrong — try refreshing in a moment.
      </p>
      <a
        href="."
        className="inline-flex min-h-[44px] items-center rounded-lg border border-cyan-400/45 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-300"
      >
        Refresh
      </a>
    </div>
  )
}
