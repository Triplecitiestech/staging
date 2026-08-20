import type { Metadata } from 'next'

// Gift-basket campaign landing page. Reached by QR code only — it is not in
// the nav, not in sitemap.ts, and noindex/nofollow here, following the same
// pattern as /rtp and /msa.
export const metadata: Metadata = {
  title: 'Welcome | Triple Cities Tech',
  description: 'Thanks for scanning. Book a meeting or send us a note — Triple Cities Tech, IT services for small and mid-sized businesses in the Southern Tier.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
