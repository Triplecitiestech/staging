'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import PageHero from '@/components/shared/PageHero'
import ProspectEngagement from '@/components/sections/ProspectEngagement'
import {
  CheckCircleIcon,
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
import Script from 'next/script'

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
      'areaServed': {
        '@type': 'State',
        'name': 'New York'
      },
      'priceRange': '$$'
    },
    'description': 'Co-managed IT for businesses with their own internal IT person or team. We extend your staff with a shared help desk, a full security stack, backups, patching, monitoring, and the tools your team needs — without replacing anyone.',
    'category': 'Co-Managed IT Services',
    'offers': {
      '@type': 'Offer',
      'availability': 'https://schema.org/InStock',
      'availableAtOrFrom': {
        '@type': 'Place',
        'name': 'Central New York'
      }
    }
  }

  // Who co-managed IT is built for
  const goodFit = [
    'You have one IT person wearing every hat, with no backup when they\'re out.',
    'You have a small IT team that spends most of its day on tickets instead of projects.',
    'Your internal IT owns strategy, but you need 24/7 and after-hours security coverage.',
    'You need an enterprise security stack and tooling you can\'t justify buying for one company.',
    'You\'re growing faster than you can hire and train new IT staff.',
    'You want a partner who fills the gaps — not one who takes over.',
  ]

  // What we provide — concrete capabilities
  const capabilities = [
    {
      icon: MessageSquareIcon,
      title: 'One shared help desk',
      description:
        'Every end-user support request funnels into a single ticketing system that your team and ours both work. Nothing falls through the cracks, and you see the full history in one place.',
    },
    {
      icon: PhoneIcon,
      title: 'Direct end-user support',
      description:
        'Your employees can call, email, or message us directly and get help from a real technician. Your internal staff stops being the first stop for every password reset and printer problem.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'A full security stack',
      description:
        'A leading, layered security program: an AI-capable Security Operations Center (SOC), managed detection and response (MDR), endpoint detection and response (EDR/antivirus), and DNS and content filtering — running together, not as disconnected point products.',
    },
    {
      icon: CloudIcon,
      title: 'Backup for Microsoft 365 and servers',
      description:
        'Microsoft 365 cloud data backup plus server backup, with recovery that\'s actually tested — so email, files, and critical systems can be restored when something goes wrong.',
    },
    {
      icon: SettingsIcon,
      title: 'Patch management',
      description:
        'Operating system and third-party patching handled on a schedule, with reporting. Known vulnerabilities get closed before they become incidents, without your team chasing updates by hand.',
    },
    {
      icon: MonitorIcon,
      title: 'Security monitoring',
      description:
        'Continuous monitoring of your environment, including identity and security-event monitoring, so suspicious sign-ins and threats are caught and investigated around the clock.',
    },
    {
      icon: UsersIcon,
      title: 'Onboarding and offboarding',
      description:
        'Consistent employee onboarding and offboarding: accounts created with the right access on day one, and fully shut off the day someone leaves — a step that protects you when it\'s done right every time.',
    },
    {
      icon: RobotIcon,
      title: 'Tools for your IT staff',
      description:
        'We give your own technicians access to best-in-class remote access, scripting, automation, and AI tooling — the same platforms we use — so your team works faster, not just harder.',
    },
  ]

  // How it works alongside your team
  const yourTeamKeeps = [
    'The line-of-business applications only your team knows',
    'Internal projects and the technology roadmap',
    'Relationships with leadership, staff, and key vendors',
    'The institutional knowledge that makes your business run',
  ]

  const weTakeOff = [
    'The day-to-day ticket queue and end-user support',
    'Patching, monitoring, and security response',
    'Backups and recovery testing',
    'Employee onboarding and offboarding',
    'Maintaining and licensing the security and management tools',
  ]

  // When co-managed makes the most sense
  const scenarios = [
    {
      icon: UsersIcon,
      title: 'Your IT team is stretched thin',
      description:
        'When tickets eat the whole day and projects keep slipping, we absorb the operational load so your team gets its time back.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'You need around-the-clock coverage',
      description:
        'A small team can\'t watch for threats 24/7. Our SOC and monitoring cover nights, weekends, and the hours your staff is offline.',
    },
    {
      icon: SettingsIcon,
      title: 'You have gaps in tooling or security depth',
      description:
        'If there are capabilities you can\'t staff or platforms you can\'t justify buying alone, we fill the gap with tools and specialists already in place.',
    },
  ]

  return (
    <main>
      <Script
        id="co-managed-it-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />
      <Breadcrumbs />

      {/* Hero */}
      <PageHero
        badge="Co-Managed IT"
        title="We Extend Your IT Team — We Don't Replace It"
        subtitle="You already have IT. We give your people more coverage, a full security stack, and better tools — so your team can focus on what matters to the business while we handle the operational legwork."
        textAlign="center"
        imageBackground="/herobg.webp"
      />

      {/* Who it's for */}
      <section className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-cyan-400 text-sm font-semibold tracking-wider uppercase mb-4">Who it&apos;s for</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              Built for businesses that already have IT
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Co-managed IT is for companies with an in-house IT person or a small IT team that needs more
              coverage, tooling, and security depth than they can maintain on their own. You keep ownership of
              your technology. We add the people, platforms, and around-the-clock support behind them.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {goodFit.map((point, index) => (
              <div
                key={index}
                className="flex items-start gap-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/15 hover:border-cyan-400/40 transition-all duration-300"
              >
                <CheckCircleIcon size={24} className="text-cyan-400 flex-shrink-0 mt-1" />
                <p className="text-white/90 leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we provide */}
      <section className="relative bg-gradient-to-br from-slate-950 via-gray-900 to-black py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-cyan-400 text-sm font-semibold tracking-wider uppercase mb-4">What we provide</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              The operational backbone behind your team
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Concrete capabilities your team can lean on from day one — the support, security, and tooling that
              are hard to build and maintain in-house.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {capabilities.map((item, index) => (
              <div
                key={index}
                className="group bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 hover:bg-white/15 hover:border-cyan-400/50 transition-all duration-300 flex flex-col"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <item.icon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-white/80 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works with your team */}
      <section className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900 py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-cyan-400 text-sm font-semibold tracking-wider uppercase mb-4">How it works with your team</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              You set the direction. We carry the load.
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              We take the repetitive, time-consuming work off your internal staff&apos;s plate — tickets,
              patching, monitoring, backups, and on/offboarding — so your IT people can spend their time on the
              strategic, business-specific priorities only they can handle.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Your team keeps */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8">
              <h3 className="text-2xl font-bold text-white mb-2">Your team focuses on</h3>
              <p className="text-white/70 mb-6">The work that depends on knowing your business.</p>
              <ul className="space-y-4">
                {yourTeamKeeps.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircleIcon size={22} className="text-cyan-400 flex-shrink-0 mt-1" />
                    <span className="text-white/90 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* We take off your plate */}
            <div className="bg-gradient-to-br from-cyan-500/15 to-cyan-700/10 backdrop-blur-sm border border-cyan-400/40 rounded-3xl p-8">
              <h3 className="text-2xl font-bold text-white mb-2">We take off your plate</h3>
              <p className="text-white/70 mb-6">The operational work that has to happen every day.</p>
              <ul className="space-y-4">
                {weTakeOff.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircleIcon size={22} className="text-cyan-400 flex-shrink-0 mt-1" />
                    <span className="text-white/90 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* When co-managed makes the most sense */}
      <section className="relative bg-gradient-to-br from-slate-950 via-gray-900 to-black py-20 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-cyan-400 text-sm font-semibold tracking-wider uppercase mb-4">When it makes the most sense</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              Where co-managed delivers the most value
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Co-managed IT pays off most when your team is capable but capacity, coverage, or tooling is the
              real constraint.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {scenarios.map((item, index) => (
              <div
                key={index}
                className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 hover:border-cyan-400/50 transition-all duration-300"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-2xl flex items-center justify-center mb-6">
                  <item.icon size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-white/80 leading-relaxed">{item.description}</p>
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
