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
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
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
