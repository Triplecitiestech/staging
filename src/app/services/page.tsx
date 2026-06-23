'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import Link from 'next/link'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SERVICES, PAGE_CONTENT } from '@/constants/services'
import { CONTACT_INFO } from '@/constants/data'
import { CheckIcon, MailIcon, CalendarIcon, PhoneIcon } from '@/components/icons/TechIcons'

export default function Services() {
  // Faint schematic grid used behind the hero
  const gridBackdrop = {
    backgroundImage:
      'linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
  }

  const engage = [
    {
      icon: MailIcon,
      title: 'Have us reach out to you',
      description: 'Fill out our contact form and one of our experts will reach out promptly.',
      action: 'Contact Us',
      href: '/contact',
    },
    {
      icon: CalendarIcon,
      title: 'Schedule a Meeting',
      description: 'Book a free consultation with our IT experts to discuss your needs.',
      action: 'Schedule Now',
      href: '/schedule',
    },
    {
      icon: PhoneIcon,
      title: 'Call Us Directly',
      description: 'Call and speak with our sales team today.',
      action: CONTACT_INFO.phone,
      href: `tel:${CONTACT_INFO.phone}`,
      isPhone: true,
    },
  ]

  return (
    <ErrorBoundary>
      <main className="bg-[#0b1120] text-slate-200">
        <Header />
        <Breadcrumbs />

        {/* ───────── Hero ───────── */}
        <section className="relative overflow-hidden border-b border-white/10 bg-[#0b1120]">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 opacity-[0.04]" style={gridBackdrop} />
            <div className="absolute -top-40 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 md:pt-28 md:pb-20">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-cyan-400/70" />
              <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">What we do</span>
            </div>

            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
              {PAGE_CONTENT.hero.title}
            </h1>

            <p className="mt-7 max-w-3xl text-lg leading-relaxed text-slate-300 md:text-xl">
              {PAGE_CONTENT.hero.subtitle}
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
                href="#services"
                className="inline-flex items-center gap-2 rounded font-semibold text-slate-300 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1120]"
              >
                Browse services
              </a>
            </div>
          </div>
        </section>

        {/* ───────── Services catalog ───────── */}
        <section id="services" className="scroll-mt-24 border-b border-white/10 bg-[#0b1120] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-cyan-400/70" />
              <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">Our capabilities</span>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {SERVICES.map((service) => {
                // Create ID from title to match footer links
                let id = service.title.toLowerCase().replace(/\s+/g, '-')
                if (id === 'managed-it-services') id = 'managed-it'
                if (id === 'cybersecurity-&-compliance') id = 'cybersecurity'
                if (id === 'cloud-services') id = 'cloud'
                if (id === 'it-strategy-&-virtual-cio') id = 'strategy'

                return (
                  <div key={service.title} id={id} className="scroll-mt-24">
                    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] p-8 md:p-10 transition-colors duration-300 hover:border-cyan-400/40">
                      {/* Per-service accent bar — keeps each service's color identity */}
                      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${service.gradient}`} />

                      <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{service.title}</h2>
                      <p className="mt-2 text-lg text-slate-300">{service.subtitle}</p>

                      <div className="my-7 h-px w-full bg-white/10" />

                      <ul className="space-y-3">
                        {service.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <CheckIcon size={18} className="mt-0.5 flex-shrink-0 text-cyan-400" />
                            <span className="leading-relaxed text-slate-200">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <p className="mt-6 leading-relaxed text-slate-400">{service.description}</p>

                      <div className="mt-8 flex flex-wrap items-center gap-3 pt-2">
                        {service.detailHref && (
                          <Link
                            href={service.detailHref}
                            className="group/btn inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors duration-300 hover:border-cyan-400/50 hover:text-cyan-300"
                          >
                            Learn More
                            <svg className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </Link>
                        )}
                        <Link
                          href="/contact"
                          className="group/btn inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-300 hover:bg-cyan-400"
                        >
                          Get Started
                          <svg className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </Link>
                      </div>
                    </article>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ───────── CTA ───────── */}
        <section className="bg-[#0f172a] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-cyan-400/70" />
              <span className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-400">Get in touch</span>
            </div>
            <h2 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              {PAGE_CONTENT.ctaSection.title}
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              {PAGE_CONTENT.ctaSection.description}
            </p>

            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
              {engage.map((option) => {
                const Icon = option.icon
                return (
                  <div key={option.title} className="flex flex-col bg-[#0f172a] p-8">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                      <Icon size={22} className="text-cyan-400" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{option.title}</h3>
                    <p className="mt-2 flex-grow leading-relaxed text-slate-400">{option.description}</p>
                    {option.isPhone ? (
                      <a
                        href={option.href}
                        className="mt-6 inline-flex items-center gap-2 text-lg font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
                      >
                        {option.action}
                      </a>
                    ) : (
                      <Link
                        href={option.href}
                        className="group/link mt-6 inline-flex items-center gap-2 font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
                      >
                        {option.action}
                        <svg className="h-4 w-4 transition-transform duration-300 group-hover/link:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </ErrorBoundary>
  )
}
