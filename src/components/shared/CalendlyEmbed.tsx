'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

/**
 * Calendly booking link used across the site. Query string keeps the widget in
 * the site's dark palette and suppresses Calendly's own GDPR banner.
 */
export const CALENDLY_BOOKING_URL =
  'https://calendly.com/kurtis-tct?background_color=111827&text_color=e5e7eb&primary_color=06b6d4&hide_gdpr_banner=1'

interface CalendlyEmbedProps {
  url?: string
  /** Vertical padding on the loading spinner, in Tailwind spacing units. */
  loadingClassName?: string
}

/**
 * Inline Calendly scheduler. The visitor books without leaving the page — the
 * whole flow happens inside Calendly's iframe, so nothing hits our API.
 *
 * next.config.js already allows assets.calendly.com (script/style) and
 * calendly.com (frame/connect) in the CSP; the root layout preconnects.
 * No wrapper overflow — the iframe auto-resizes itself.
 */
export default function CalendlyEmbed({
  url = CALENDLY_BOOKING_URL,
  loadingClassName = 'py-32',
}: CalendlyEmbedProps) {
  const [widgetReady, setWidgetReady] = useState(false)

  useEffect(() => {
    // Check if Calendly widget script is already loaded
    if (window.Calendly) {
      setWidgetReady(true)
    }
  }, [])

  return (
    <>
      {!widgetReady && (
        <div className={`flex items-center justify-center ${loadingClassName}`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-4" />
            <p className="text-gray-400">Loading calendar...</p>
          </div>
        </div>
      )}
      <div
        className="calendly-inline-widget"
        data-url={url}
        data-resize="true"
        style={{ minWidth: '320px', width: '100%' }}
      />
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
        onLoad={() => setWidgetReady(true)}
      />
    </>
  )
}

// Extend Window for Calendly
declare global {
  interface Window {
    Calendly?: unknown
  }
}
