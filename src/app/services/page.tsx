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

        {/* CTA Section */}
        <div className="relative bg-black py-32">
          {/* Subtle background elements */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
          </div>

          {/* Content */}
          <div className="relative z-10 text-center max-w-6xl mx-auto px-6">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              {PAGE_CONTENT.ctaSection.title}
            </h2>
            <p className="text-xl text-white mb-12 max-w-3xl mx-auto leading-relaxed">
              {PAGE_CONTENT.ctaSection.description}
            </p>

            {/* Engagement Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
              {/* Contact Form */}
              <div className="group">
                <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/20 h-full flex flex-col">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                    <MailIcon size={28} className="text-white" />
                  </div>

                  <div className="text-center mb-6 flex-grow">
                    <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-cyan-200 transition-colors duration-300">
                      Have us reach out to you
                    </h4>
                    <p className="text-white/90 text-sm md:text-base leading-relaxed">
                      Fill out our contact form and one of our experts will reach out promptly.
                    </p>
                  </div>

                  <div>
                    <Link
                      href="/contact"
                      className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-cyan-500 to-cyan-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
                    >
                      Contact Us
                      <svg className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Schedule Meeting */}
              <div className="group">
                <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 h-full flex flex-col">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                    <CalendarIcon size={28} className="text-white" />
                  </div>

                  <div className="text-center mb-6 flex-grow">
                    <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-purple-200 transition-colors duration-300">
                      Schedule a Meeting
                    </h4>
                    <p className="text-white/90 text-sm md:text-base leading-relaxed">
                      Book a free consultation with our IT experts to discuss your needs.
                    </p>
                  </div>

                  <div>
                    <a
                      href="/schedule"
                      className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-purple-500 to-purple-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg"
                    >
                      Schedule Now
                      <svg className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>

              {/* Call Directly */}
              <div className="group">
                <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-rose-500/20 h-full flex flex-col">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                    <PhoneIcon size={28} className="text-white" />
                  </div>

                  <div className="text-center mb-6 flex-grow">
                    <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-rose-200 transition-colors duration-300">
                      Call Us Directly
                    </h4>
                    <p className="text-white/90 text-sm md:text-base leading-relaxed">
                      Call and speak with our sales team today.
                    </p>
                  </div>

                  <div>
                    <a
                      href={`tel:${CONTACT_INFO.phone}`}
                      className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-rose-500 to-rose-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg md:text-xl"
                    >
                      {CONTACT_INFO.phone}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </main>
    </ErrorBoundary>
  )
}
