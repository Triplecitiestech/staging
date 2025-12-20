'use client'

import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Link from 'next/link'
import PageHero from '@/components/shared/PageHero'
import ServiceCard from '@/components/shared/ServiceCard'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import LoadingSpinner from '@/components/LoadingSpinner'
import { SERVICES, PAGE_CONTENT } from '@/constants/services'
import { CONTACT_INFO } from '@/constants/data'
import { MailIcon, CalendarIcon, PhoneIcon } from '@/components/icons/TechIcons'

export default function Services() {
  return (
    <ErrorBoundary>
      <main>
        <Header />
        <Breadcrumbs />

        <PageHero
          title={PAGE_CONTENT.hero.title}
          subtitle={PAGE_CONTENT.hero.subtitle}
          textAlign="center"
          verticalPosition="bottom"
          titleNoWrap={true}
          imageBackground="/herobg.webp"
        />

        {/* Services Details */}
        <div className="relative bg-gradient-to-br from-black via-gray-900 to-cyan-900">
          <div className="relative z-10 max-w-7xl mx-auto px-6 py-24">
            <Suspense fallback={<LoadingSpinner size="lg" className="mx-auto my-24" />}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {SERVICES.map((service, index) => {
                  // Create ID from title to match footer links
                  let id = service.title.toLowerCase().replace(/\s+/g, '-')
                  // Map specific services to footer link IDs
                  if (id === 'managed-it-services') id = 'managed-it'
                  if (id === 'cybersecurity-&-compliance') id = 'cybersecurity'
                  if (id === 'cloud-services') id = 'cloud'
                  if (id === 'it-strategy-&-virtual-cio') id = 'strategy'

                  return (
                    <div key={service.title} id={id} className="scroll-mt-24">
                      <ServiceCard
                        icon={service.icon}
                        title={service.title}
                        subtitle={service.subtitle}
                        features={service.features}
                        description={service.description}
                        gradient={service.gradient}
                        index={index}
                        image={service.image}
                        darkBackground={true}
                      />
                    </div>
                  )
                })}
              </div>
            </Suspense>
          </div>
        </div>

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
                      href="https://calendly.com/kurtis-tct"
                      target="_blank"
                      rel="noopener noreferrer"
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
                <div className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-white/30 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/20 h-full flex flex-col">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 mx-auto mb-6">
                    <PhoneIcon size={28} className="text-white" />
                  </div>

                  <div className="text-center mb-6 flex-grow">
                    <h4 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-orange-200 transition-colors duration-300">
                      Call Us Directly
                    </h4>
                    <p className="text-white/90 text-sm md:text-base leading-relaxed">
                      Call and speak with our sales team today.
                    </p>
                  </div>

                  <div>
                    <a
                      href={`tel:${CONTACT_INFO.phone}`}
                      className="inline-flex items-center justify-center w-full text-center bg-gradient-to-r from-orange-500 to-orange-600 hover:opacity-90 text-white font-bold px-4 py-3 md:px-6 md:py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg md:text-xl"
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