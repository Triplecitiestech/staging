import { Metadata } from 'next'

export const servicesMetadata: Metadata = {
  title: 'IT Services | Managed IT, Cybersecurity & Cloud Solutions | Triple Cities Tech',
  description: 'Professional IT services including managed IT support, cybersecurity, cloud solutions, and AI consulting. Transform your business technology with Triple Cities Tech.',
  keywords: [
    'IT services',
    'managed IT',
    'cybersecurity',
    'cloud services',
    'IT consulting',
    'business technology',
    'IT support',
    'network security',
    'data protection',
    'IT strategy'
  ],
  openGraph: {
    title: 'IT Services | Triple Cities Tech',
    description: 'Professional IT services including managed IT support, cybersecurity, cloud solutions, and AI consulting.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/services',
    images: [
      {
        url: '/og-services.jpg',
        width: 1200,
        height: 630,
        alt: 'Triple Cities Tech IT Services'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IT Services | Triple Cities Tech',
    description: 'Professional IT services including managed IT support, cybersecurity, cloud solutions, and AI consulting.',
    images: ['/og-services.jpg']
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/services'
  }
}
