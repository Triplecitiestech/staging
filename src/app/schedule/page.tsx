'use client'

import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import { PhoneIcon, ClockIcon, CheckCircleIcon } from '@/components/icons/TechIcons'
import { CONTACT_INFO } from '@/constants/data'
import Script from 'next/script'
import { useEffect, useState } from 'react'

export default function SchedulePage() {
  const [widgetReady, setWidgetReady] = useState(false)

  useEffect(() => {
    // Check if Calendly widget script is already loaded
    if (window.Calendly) {
      setWidgetReady(true)
    }
  }, [])

  return (
    <main>
      <Header />
      <Breadcrumbs />

      {/* Hero Section */}
      <section className="relative pt-24 pb-12 bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Schedule a Meeting
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
            Book a free consultation to discuss your IT needs. We&apos;ll review your current setup and recommend solutions tailored to your business.
          </p>
        </div>
      </section>

      {/* Calendly Widget Section */}
      <section className="bg-gradient-to-b from-gray-900 to-black py-8 md:py-12">
        <div className="max-w-6xl mx-auto px-4">
          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <ClockIcon size={20} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-white font-medium text-sm">Quick & Easy</p>
                <p className="text-gray-400 text-xs">30-minute discovery call</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <CheckCircleIcon size={20} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-white font-medium text-sm">No Obligation</p>
                <p className="text-gray-400 text-xs">Free assessment included</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <PhoneIcon size={20} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-white font-medium text-sm">Prefer to call?</p>
                <p className="text-gray-400 text-xs">{CONTACT_INFO.phone}</p>
              </div>
            </div>
          </div>

          {/* Calendly Embed — no wrapper overflow, let iframe auto-resize */}
          {!widgetReady && (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4" />
                <p className="text-gray-400">Loading calendar...</p>
              </div>
            </div>
          )}
          <div
            className="calendly-inline-widget"
            data-url="https://calendly.com/kurtis-tct?background_color=111827&text_color=e5e7eb&primary_color=06b6d4&hide_gdpr_banner=1"
            data-resize="true"
            style={{ minWidth: '320px', width: '100%' }}
          />
        </div>
      </section>

      {/* Calendly Widget Script */}
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
        onLoad={() => setWidgetReady(true)}
      />

      <Footer />
    </main>
  )
}

// Extend Window for Calendly
declare global {
  interface Window {
    Calendly?: unknown
  }
}
