import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Professional Services IT | Law Firms, Accounting & More | Triple Cities Tech',
  description: 'IT solutions for professional services firms in Central New York. Secure client data, streamline workflows, and maintain compliance for law firms, accounting firms, and consultancies.',
  keywords: ['professional services IT', 'law firm IT', 'accounting IT services', 'professional services cybersecurity', 'client data security', 'professional services technology'],
  openGraph: {
    title: 'Professional Services IT | Triple Cities Tech',
    description: 'IT solutions for professional services firms. Secure client data and streamline workflows.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/industries/professional-services',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Professional Services IT | Triple Cities Tech',
    description: 'IT solutions for professional services firms in Central New York.',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/industries/professional-services',
  },
}

export default function ProfessionalServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
