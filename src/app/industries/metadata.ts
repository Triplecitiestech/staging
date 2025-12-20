import { Metadata } from 'next'

export const industriesMetadata: Metadata = {
  title: 'Industries We Serve | Construction, Healthcare, Manufacturing & More | Triple Cities Tech',
  description: 'Specialized IT solutions for Construction, Healthcare, Manufacturing, and Professional Services. Right-sized technology for industries where stability, security, and speed matter most.',
  keywords: [
    'construction IT services',
    'healthcare IT solutions',
    'manufacturing cybersecurity',
    'professional services IT',
    'industry IT support',
    'HIPAA compliance',
    'NIST compliance',
    'CMMC compliance',
    'industry-specific IT'
  ],
  openGraph: {
    title: 'Industries We Serve | Triple Cities Tech',
    description: 'Specialized IT solutions for Construction, Healthcare, Manufacturing, and Professional Services in Central New York.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/industries',
    images: [
      {
        url: '/og-industries.jpg',
        width: 1200,
        height: 630,
        alt: 'Triple Cities Tech - Industries We Serve'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Industries We Serve | Triple Cities Tech',
    description: 'Specialized IT solutions for Construction, Healthcare, Manufacturing, and Professional Services.',
    images: ['/og-industries.jpg']
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/industries'
  }
}
