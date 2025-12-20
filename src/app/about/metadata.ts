import { Metadata } from 'next'

export const aboutMetadata: Metadata = {
  title: 'About Us | IT Experts for Small Business | Triple Cities Tech',
  description: 'Triple Cities Tech specializes in delivering right-sized IT solutions for 20-50 person teams in Central New York. Learn about our values, mission, and commitment to clarity over complexity.',
  keywords: [
    'IT company',
    'small business IT',
    'Central New York IT',
    'managed IT services',
    'IT consulting',
    'business technology',
    'Endicott NY',
    'IT support team',
    'technology partner'
  ],
  openGraph: {
    title: 'About Triple Cities Tech | Small Business IT Experts',
    description: 'We specialize in helping 20-50 person teams grow with technology that fits their size, budget, and goals.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/about',
    images: [
      {
        url: '/og-about.jpg',
        width: 1200,
        height: 630,
        alt: 'Triple Cities Tech - About Our IT Team'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Triple Cities Tech | Small Business IT Experts',
    description: 'We specialize in helping 20-50 person teams grow with technology that fits their size, budget, and goals.',
    images: ['/og-about.jpg']
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/about'
  }
}
