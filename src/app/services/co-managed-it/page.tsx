'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import ProspectEngagement from '@/components/sections/ProspectEngagement'
import {
  CheckIcon,
  ShieldCheckIcon,
  MessageSquareIcon,
  PhoneIcon,
  CloudIcon,
  SettingsIcon,
  MonitorIcon,
  UsersIcon,
  RobotIcon,
} from '@/components/icons/TechIcons'
import { CONTACT_INFO } from '@/constants/data'
import Link from 'next/link'
import Script from 'next/script'
import type { ComponentType } from 'react'

type IconType = ComponentType<{ size?: number; className?: string }>

interface Capability {
  icon: IconType
  title: string
  desc: string
  tags?: string[]
}

interface CapabilityGroup {
  label: string
  blurb: string
  items: Capability[]
}

export default function CoManagedIT() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    'serviceType': 'Co-Managed IT Services',
    'provider': {
      '@type': 'LocalBusiness',
      'name': 'Triple Cities Tech',
      'image': 'https://www.triplecitiestech.com/logo/tctlogo.webp',
      'telephone': CONTACT_INFO.phone,
      'email': CONTACT_INFO.email,
      'address': {
        '@type': 'PostalAddress',
        'addressRegion': 'NY',
        'addressLocality': 'Central New York'
      },
      'areaServed': { '@type': 'State', 'name': 'New York' },
      'priceRange': '$$'
    },
    'description': 'Co-managed IT for businesses with their own internal IT person or team. We extend your staff with a shared help desk, a full security stack, backups, patching, and monitoring — without replacing anyone.',
    'category': 'Co-Managed IT Services',
    'offers': {
      '@type': 'Offer',
      'availability': 'https://schema.org/InStock',
      'availableAtOrFrom': { '@type': 'Place', 'name': 'Central New York' }
    }
  }

  const stance = [
    { label: 'Coverage', value: '24/7 monitoring & response' },
    { label: 'Support', value: 'One shared help desk' },
    { label: 'Your team', value: 'Stays in charge' },
  ]

  const goodFit = [
    'One IT person wearing every hat, with no backup when they’re out',
    'A small team that spends the day on tickets instead of projects',
    'Internal IT that owns strategy but needs after-hours coverage',
    'A security stack and tooling you can’t justify buying alone',
    'Growth that’s outpacing how fast you can hire and train',
    'A partner who fills the gaps — not one who takes over',
  ]

  const capabilityGroups: CapabilityGroup[] = [
    {
      label: 'Support',
      blurb: 'One front door for every request your people make.',
      items: [
        {
          icon: MessageSquareIcon,
          title: 'One shared help desk',
          desc: 'Every end-user request funnels into a single ticketing system your team and ours both work — full history in one place, nothing dropped between you.',
        },
        {
          icon: PhoneIcon,
          title: 'Direct end-user support',
          desc: 'Your employees call, email, or message us directly and reach a real technician. Your staff stops being the first stop for every password reset.',
        },
      ],
    },
    {
      label: 'Security',
      blurb: 'A full, layered stack — watched around the clock.',
      items: [
        {
          icon: ShieldCheckIcon,
          title: 'A complete security stack',
          desc: 'An AI-capable Security Operations Center, managed detection and response, endpoint detection and response, and DNS and content filtering — run together as one program, not scattered point products.',
          tags: ['SOC', 'MDR', 'EDR / AV', 'DNS filtering'],
        },
        {
          icon: MonitorIcon,
          title: 'Security monitoring',
          desc: 'Continuous monitoring of your environment, including identity and security-event monitoring, so risky sign-ins and threats get caught and investigated day or night.',
        },
      ],
    },
    {
      label: 'Continuity',
      blurb: 'Get back up fast when something breaks.',
      items: [
        {
          icon: CloudIcon,
          title: 'Backup for Microsoft 365 & servers',
          desc: 'Microsoft 365 cloud data backup plus server backup, with recovery that’s actually tested — so email, files, and critical systems come back when they need to.',
        },
        {
          icon: SettingsIcon,
          title: 'Patch management',
          desc: 'Operating-system and third-party patching on a schedule, with reporting. Known vulnerabilities get closed before they turn into incidents.',
        },
      ],
    },
    {
      label: 'People & tools',
      blurb: 'Clean transitions, and sharper tools for your team.',
      items: [
        {
          icon: UsersIcon,
          title: 'Onboarding & offboarding',
          desc: 'New hires get the right access on day one; departing staff are fully shut off the day they leave — handled the same way every time.',
        },
        {
          icon: RobotIcon,
          title: 'Tools for your IT staff',
          desc: 'Your own technicians get the platforms we use: best-in-class remote access, scripting, automation, and AI tooling — so they work faster, not just harder.',
        },
      ],
    },
  ]

  const yourTeamKeeps = [
    'The line-of-business applications only your team knows',
    'Internal projects and the technology roadmap',
    'Relationships with leadership, staff, and key vendors',
    'The institutional knowledge that makes your business run',
  ]

  const weHandle = [
    'The day-to-day ticket queue and end-user support',
    'Patching, monitoring, and security response',
    'Backups and recovery testing',
    'Employee onboarding and offboarding',
    'Maintaining and licensing the security and management tools',
  ]

  const scenarios = [
    {
      icon: UsersIcon,
      title: 'Your team is stretched thin',
      desc: 'When tickets eat the whole day and projects keep slipping, we absorb the operational load so your team gets its time back.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'You need around-the-clock coverage',
      desc: 'A small team can’t watch for threats 24/7. Our SOC and monitoring cover nights, weekends, and the hours your staff is offline.',
    },
    {
      icon: SettingsIcon,
      title: 'You have gaps in tooling or depth',
      desc: 'When there are capabilities you can’t staff or platforms you can’t justify alone, we fill the gap with tools and specialists already in place.',
    },
  ]

  // Faint schematic grid used behind the hero
  const gridBackdrop = {
    backgroundImage:
      'linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
  }

  return (
    <main className="bg-[#0b1120] text-slate-200">
      <Script
        id="co-managed-it-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      {/* ───────── Hero — the thesis ───────── */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0b1120]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 opacity-[0.04]" style={gridBackdrop} />
          <div className="absolute -top-40 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-20 md:pt-28">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-cyan-400/70" />
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">Co-Managed IT</span>
          </div>

          <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            We extend your IT team.
            <span className="block text-cyan-400">We don&rsquo;t replace it.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">
            You already have IT. We add the coverage, the security stack, and the tools behind your people — so
            your team spends its time on the work that moves the business, and we handle the day-to-day
            operations.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/contact"
              className="group inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1120]"
            >
              Talk to our team
              <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <a
              href="#what-we-provide"
              className="inline-flex items-center gap-2 font-semibold text-slate-300 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1120] rounded"
            >
              See what we cover
            </a>
          </div>

          {/* Mono stance ribbon — the positioning, not vanity metrics */}
          <dl className="mt-16 grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {stance.map((item) => (
              <div key={item.label} className="py-6 sm:px-7 sm:first:pl-0">
                <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400/80">{item.label}</dt>
                <dd className="mt-2 text-lg font-semibold text-white">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────── Who it's for ───────── */}
      <section className="border-b border-white/10 bg-[#0f172a] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-cyan-400/70" />
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">Who it&rsquo;s for</span>
          </div>
          <div className="mt-6 grid gap-x-12 gap-y-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              Built for businesses that already have IT
            </h2>
            <p className="text-lg leading-relaxed text-slate-300">
              Co-managed IT fits companies with an in-house IT person or a small team that needs more coverage,
              tooling, and security depth than they can maintain alone. You keep ownership. We add the people,
              platforms, and around-the-clock support behind them.
            </p>
          </div>

          <ul className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {goodFit.map((point) => (
              <li key={point} className="flex items-start gap-4 bg-[#0f172a] px-6 py-6 transition-colors duration-300 hover:bg-[#141d30]">
                <CheckIcon size={20} className="mt-0.5 flex-shrink-0 text-cyan-400" />
                <span className="leading-relaxed text-slate-200">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── What we provide — grouped by domain ───────── */}
      <section id="what-we-provide" className="scroll-mt-24 border-b border-white/10 bg-[#0b1120] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-cyan-400/70" />
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">What we provide</span>
          </div>
          <h2 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
            The operational backbone behind your team
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            Concrete capabilities your team can lean on from day one — the support, security, and continuity that
            are hard to build and maintain in-house. Every tool in the stack is best-in-class and configured to
            industry best practices, then reviewed and updated every week to keep your environment current,
            consistent, and reliable.
          </p>

          <div className="mt-14 space-y-12">
            {capabilityGroups.map((group) => (
              <div key={group.label} className="grid gap-6 border-t border-white/10 pt-10 lg:grid-cols-[14rem_1fr] lg:gap-10">
                <div>
                  <h3 className="font-mono text-sm uppercase tracking-[0.2em] text-cyan-400">{group.label}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{group.blurb}</p>
                </div>

                <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.title} className="group bg-[#0b1120] p-7 transition-colors duration-300 hover:bg-[#0f1b2b]">
                      <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-cyan-400/30 bg-cyan-500/10 transition-colors duration-300 group-hover:border-cyan-400/60">
                        <item.icon size={22} className="text-cyan-400" />
                      </div>
                      <h4 className="mt-5 text-lg font-semibold text-white">{item.title}</h4>
                      <p className="mt-3 leading-relaxed text-slate-300">{item.desc}</p>
                      {item.tags && item.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded border border-cyan-400/30 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-cyan-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── How it works — the seam ───────── */}
      <section className="border-b border-white/10 bg-[#0f172a] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-cyan-400/70" />
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">How it works with your team</span>
          </div>
          <h2 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
            You set the direction. We carry the load.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            We take the repetitive, time-consuming work off your staff&rsquo;s plate — tickets, patching,
            monitoring, backups, on/offboarding — so your IT people spend their time on the strategic,
            business-specific priorities only they can handle.
          </p>

          <div className="relative mt-12 grid overflow-hidden rounded-2xl border border-white/10 lg:grid-cols-2">
            {/* Your team */}
            <div className="border-b border-white/10 p-8 md:p-10 lg:border-b-0 lg:border-r">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Your team focuses on</h3>
              <p className="mt-2 text-sm text-slate-500">The work that depends on knowing your business.</p>
              <ul className="mt-7 space-y-4">
                {yourTeamKeeps.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckIcon size={18} className="mt-1 flex-shrink-0 text-slate-400" />
                    <span className="leading-relaxed text-slate-200">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* We handle (cyan side) */}
            <div className="relative bg-cyan-500/[0.05] p-8 md:p-10">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-400">We handle</h3>
              <p className="mt-2 text-sm text-cyan-200/60">The operational work that has to happen every day.</p>
              <ul className="mt-7 space-y-4">
                {weHandle.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckIcon size={18} className="mt-1 flex-shrink-0 text-cyan-400" />
                    <span className="leading-relaxed text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* The seam — the one bold, subject-specific element */}
            <div
              aria-hidden
              className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-cyan-400/70 to-transparent lg:block"
            />
          </div>
        </div>
      </section>

      {/* ───────── When it makes sense ───────── */}
      <section className="border-b border-white/10 bg-[#0b1120] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-cyan-400/70" />
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">When co-managed fits</span>
          </div>
          <h2 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
            Where it delivers the most value
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            Co-managed pays off most when your team is capable, but capacity, coverage, or tooling is the real
            constraint.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
            {scenarios.map((item) => (
              <div key={item.title} className="group relative overflow-hidden bg-[#0b1120] p-8 transition-colors duration-300 hover:bg-[#0f1b2b]">
                <span aria-hidden className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-cyan-400 transition-transform duration-300 group-hover:scale-x-100" />
                <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                  <item.icon size={22} className="text-cyan-400" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — reuses the site-wide "How to Engage" section */}
      <ProspectEngagement />

      <Footer />
    </main>
  )
}
