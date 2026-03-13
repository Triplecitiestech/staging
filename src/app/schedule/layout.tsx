import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Schedule a Consultation | Triple Cities Tech',
  description: 'Book a free IT consultation with Triple Cities Tech. Discuss your managed IT, cybersecurity, and cloud service needs with our team in Central New York.',
  openGraph: {
    title: 'Schedule a Consultation | Triple Cities Tech',
    description: 'Book a free IT consultation. We\'ll review your setup and recommend solutions for your business.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/schedule',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/schedule',
  },
}

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children
}
