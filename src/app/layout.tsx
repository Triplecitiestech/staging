import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import ScrollToTop from '@/components/ui/ScrollToTop'
import FAQSchema from '@/components/seo/FAQSchema'
import ServiceSchema from '@/components/seo/ServiceSchema'
import AIMetadata from '@/components/seo/AIMetadata'

export const metadata: Metadata = {
  title: 'Triple Cities Tech | Managed IT Services for Small Business | Central NY',
  description: 'Right-sized IT solutions for 20-50 person teams in Central New York. Managed IT, cybersecurity, cloud services, and IT strategy. Located in Endicott, NY. Call (607) 341-7500.',
  keywords: [
    'managed IT services',
    'small business IT',
    'Central New York IT',
    'cybersecurity',
    'cloud services',
    'IT strategy',
    'Endicott NY',
    'IT support',
    'managed services',
    'business technology'
  ],
  authors: [{ name: 'Triple Cities Tech' }],
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
    other: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
    ]
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Triple Cities Tech | Managed IT Services for Small Business',
    description: 'Right-sized IT solutions for 20-50 person teams in Central New York. Managed IT, cybersecurity, cloud services, and IT strategy.',
    type: 'website',
    locale: 'en_US',
    url: 'https://www.triplecitiestech.com',
    siteName: 'Triple Cities Tech',
    images: [
      {
        url: '/og-home.jpg',
        width: 1200,
        height: 630,
        alt: 'Triple Cities Tech - Managed IT Services'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Triple Cities Tech | Managed IT Services for Small Business',
    description: 'Right-sized IT solutions for 20-50 person teams in Central New York.',
    images: ['/og-home.jpg']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com'
  },
  verification: {
    google: 'google-site-verification-code-here', // Add your Google Search Console verification code
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const localBusinessData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Triple Cities Tech',
    image: 'https://www.triplecitiestech.com/logo/tctlogo.webp',
    '@id': 'https://www.triplecitiestech.com',
    url: 'https://www.triplecitiestech.com',
    telephone: '(607) 341-7500',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '1109 Monroe St',
      addressLocality: 'Endicott',
      addressRegion: 'NY',
      postalCode: '13760',
      addressCountry: 'US'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 42.0987,
      longitude: -76.0492
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:30',
      closes: '17:00'
    },
    sameAs: [
      'https://www.facebook.com/TripleCitiesTech/',
      'https://linkedin.com/company/triple-cities-tech'
    ],
    description: 'Professional IT management services for small and mid-sized businesses in Central New York. Cybersecurity, cloud services, and IT strategy.',
    areaServed: [
      {
        '@type': 'City',
        name: 'Binghamton',
        addressRegion: 'NY'
      },
      {
        '@type': 'City',
        name: 'Endicott',
        addressRegion: 'NY'
      },
      {
        '@type': 'AdministrativeArea',
        name: 'Broome County',
        addressRegion: 'NY'
      },
      {
        '@type': 'AdministrativeArea',
        name: 'Southern Tier',
        addressRegion: 'NY'
      },
      {
        '@type': 'Country',
        name: 'United States'
      }
    ]
  }

  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Triple Cities Tech',
    url: 'https://www.triplecitiestech.com',
    logo: 'https://www.triplecitiestech.com/logo/tctlogo.webp',
    description: 'Professional IT management services for small and mid-sized businesses in Central New York. Specializing in managed IT, cybersecurity, cloud services, and IT strategy.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '1109 Monroe St',
      addressLocality: 'Endicott',
      addressRegion: 'NY',
      postalCode: '13760',
      addressCountry: 'US'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '(607) 341-7500',
      contactType: 'customer service',
      email: 'info@triplecitiestech.com',
      areaServed: 'US',
      availableLanguage: 'en'
    },
    areaServed: [
      {
        '@type': 'City',
        name: 'Binghamton',
        addressRegion: 'NY'
      },
      {
        '@type': 'City',
        name: 'Endicott',
        addressRegion: 'NY'
      },
      {
        '@type': 'AdministrativeArea',
        name: 'Broome County',
        addressRegion: 'NY'
      },
      {
        '@type': 'AdministrativeArea',
        name: 'Southern Tier',
        addressRegion: 'NY'
      },
      {
        '@type': 'Country',
        name: 'United States'
      }
    ],
    sameAs: [
      'https://www.facebook.com/TripleCitiesTech/',
      'https://linkedin.com/company/triple-cities-tech'
    ]
  }

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <AIMetadata />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preconnect" href="https://calendly.com" />
        <link rel="dns-prefetch" href="https://calendly.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }}
        />
        <FAQSchema />
        <ServiceSchema />
      </head>
      <body className="antialiased overflow-x-hidden bg-black" suppressHydrationWarning={true}>
        <div className="min-h-screen w-full prevent-overflow">
          {children}
          <ScrollToTop />
        </div>
        <Script
          id="chatgenie-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              var chatgenieParams = {
                appId: "3de45b0b-6349-42fa-a1d7-5a299b4c5ab2"
              }
              function run(ch){ch.default.messenger().initialize(chatgenieParams);}!function(){var e=window.chatgenie;if(e)run(e);else{function t(){var t=document.createElement("script");t.type="text/javascript",t.async=true,t.readyState?t.onreadystatechange=function(){"loaded"!==t.readyState&&"complete"!==t.readyState||(t.onreadystatechange=null,window.chatgenie&&(e=window.chatgenie,run(e)))}:t.onload=function(){window.chatgenie&&(e=window.chatgenie,run(e))},t.src="https://messenger.chatgenie.io/widget.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n)}window.attachEvent?window.attachEvent("onload",t):window.addEventListener("load",t,!1)}}();
            `
          }}
        />
      </body>
    </html>
  )
}
