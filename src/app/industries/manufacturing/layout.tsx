import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manufacturing IT Services | NIST Compliance & OT Security | Triple Cities Tech',
  description: 'IT and cybersecurity solutions for manufacturers in Central New York. NIST compliance, OT/IT convergence security, production system protection, and reliable infrastructure.',
  keywords: ['manufacturing IT', 'NIST compliance', 'manufacturing cybersecurity', 'OT security', 'production IT', 'manufacturing IT support', 'Central New York manufacturing'],
  openGraph: {
    title: 'Manufacturing IT Services | Triple Cities Tech',
    description: 'IT and cybersecurity solutions for manufacturers. NIST compliance, OT security, and reliable infrastructure.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/industries/manufacturing',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Manufacturing IT Services | Triple Cities Tech',
    description: 'IT and cybersecurity solutions for manufacturers in Central New York.',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/industries/manufacturing',
  },
}

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return children
}
