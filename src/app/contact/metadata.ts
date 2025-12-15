import { Metadata } from 'next'

export const contactMetadata: Metadata = {
  title: 'Contact Us | Get Started with IT Support | Triple Cities Tech',
  description: 'Contact Triple Cities Tech for a free IT assessment. Located in Endicott, NY, serving Central New York businesses. Call (607) 341-7500 or schedule a consultation online.',
  keywords: [
    'contact IT services',
    'IT consultation',
    'Endicott NY IT',
    'Central New York IT support',
    'IT assessment',
    'managed services consultation',
    'IT support contact',
    '607-341-7500'
  ],
  openGraph: {
    title: 'Contact Triple Cities Tech | Free IT Assessment',
    description: 'Get started with expert IT support. Call (607) 341-7500 or schedule a consultation online.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/contact',
    images: [
      {
        url: '/og-contact.jpg',
        width: 1200,
        height: 630,
        alt: 'Contact Triple Cities Tech'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Triple Cities Tech | Free IT Assessment',
    description: 'Get started with expert IT support. Call (607) 341-7500 or schedule a consultation online.',
    images: ['/og-contact.jpg']
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/contact'
  }
}
