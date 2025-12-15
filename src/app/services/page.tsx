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
                {SERVICES.map((service, index) => (
                  <ServiceCard
                    key={service.title}
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
                ))}
              </div>
            </Suspense>
          </div>
        </div>

        {/* CTA Section */}
        <div className="relative">
          {/* Dark background */}
          <div className="absolute inset-0 bg-black"></div>
          
          {/* Subtle background elements */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
          </div>
          
          {/* Content */}
          <div className="relative z-10 text-center py-32">
            <div className="max-w-4xl mx-auto px-6">
              {/* Main Heading */}
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                {PAGE_CONTENT.ctaSection.title}
              </h2>
              
              {/* Description */}
              <p className="text-lg text-white mb-10 leading-relaxed max-w-2xl mx-auto">
                {PAGE_CONTENT.ctaSection.description}
              </p>
              
              {/* CTA Button */}
              <div className="flex justify-center">
                <Link 
                  href="/contact" 
                  className="group relative bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg hover:shadow-cyan-500/25 hover:scale-105 transition-all duration-300 inline-flex items-center space-x-3"
                  aria-label="Contact us to get started with our IT services"
                >
                  <span>{PAGE_CONTENT.ctaSection.buttonText}</span>
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </main>
    </ErrorBoundary>
  )
}