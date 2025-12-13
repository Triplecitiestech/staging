import type { Metadata, Viewport } from 'next'
import './globals.css'
import ScrollToTop from '@/components/ui/ScrollToTop'

export const metadata: Metadata = {
  title: 'Triple Cities Tech - Managed IT Services',
  description: 'Professional IT management services for small and mid-sized businesses in Central New York. Cybersecurity, cloud services, and IT strategy.',
  keywords: 'IT services, managed services, cybersecurity, cloud services, Central New York',
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
    title: 'Triple Cities Tech - Managed IT Services',
    description: 'Professional IT management services for small and mid-sized businesses in Central New York.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Triple Cities Tech - Managed IT Services',
    description: 'Professional IT management services for small and mid-sized businesses in Central New York.',
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
  const structuredData = {
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
    areaServed: {
      '@type': 'City',
      name: 'Central New York'
    }
  }

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="antialiased overflow-x-hidden" suppressHydrationWarning={true}>
        <div className="min-h-screen w-full prevent-overflow">
          {children}
          <ScrollToTop />
        </div>
      </body>
    </html>
  )
}
