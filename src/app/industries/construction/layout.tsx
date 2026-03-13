import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Construction IT Services | Mobile & Jobsite Technology | Triple Cities Tech',
  description: 'IT solutions built for construction companies in Central New York. Rugged mobile technology, secure project data, CMMC compliance, and reliable connectivity across jobsites.',
  keywords: ['construction IT', 'jobsite technology', 'construction cybersecurity', 'CMMC compliance', 'mobile IT solutions', 'construction company IT support'],
  openGraph: {
    title: 'Construction IT Services | Triple Cities Tech',
    description: 'IT solutions built for construction companies. Rugged tech, secure data, and reliable connectivity across jobsites.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/industries/construction',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Construction IT Services | Triple Cities Tech',
    description: 'IT solutions built for construction companies in Central New York.',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/industries/construction',
  },
}

export default function ConstructionLayout({ children }: { children: React.ReactNode }) {
  return children
}
