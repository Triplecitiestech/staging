import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Healthcare IT Services | HIPAA Compliance & Security | Triple Cities Tech',
  description: 'HIPAA-compliant IT services for healthcare organizations in Central New York. Secure patient data, maintain compliance, and streamline operations with Triple Cities Tech.',
  keywords: ['healthcare IT', 'HIPAA compliance', 'medical IT services', 'healthcare cybersecurity', 'patient data security', 'Central New York healthcare IT'],
  openGraph: {
    title: 'Healthcare IT Services | Triple Cities Tech',
    description: 'HIPAA-compliant IT services for healthcare organizations. Secure patient data and maintain compliance.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/industries/healthcare',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthcare IT Services | Triple Cities Tech',
    description: 'HIPAA-compliant IT services for healthcare organizations in Central New York.',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/industries/healthcare',
  },
}

export default function HealthcareLayout({ children }: { children: React.ReactNode }) {
  return children
}
