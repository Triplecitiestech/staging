import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Co-Managed IT Services | Augment Your IT Team | Triple Cities Tech',
  description: 'Co-managed IT services for businesses with existing IT staff. Enterprise-grade tools, advanced security, automated compliance, and expert backup for your internal team.',
  keywords: ['co-managed IT', 'co-managed IT services', 'IT team augmentation', 'enterprise IT tools', 'IT staff support', 'managed IT partnership'],
  openGraph: {
    title: 'Co-Managed IT Services | Triple Cities Tech',
    description: 'Enterprise-grade tools and expert backup for your existing IT team.',
    type: 'website',
    url: 'https://www.triplecitiestech.com/services/co-managed-it',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Co-Managed IT Services | Triple Cities Tech',
    description: 'Enterprise-grade tools and expert backup for your existing IT team.',
  },
  alternates: {
    canonical: 'https://www.triplecitiestech.com/services/co-managed-it',
  },
}

export default function CoManagedITLayout({ children }: { children: React.ReactNode }) {
  return children
}
