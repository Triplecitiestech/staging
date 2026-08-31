import type { Metadata } from 'next'

// Wilmar's public, unauthenticated onboarding status page. Reached only via
// the exact token in the URL (see page.tsx) — not in NAVIGATION, not in
// sitemap.ts, and noindex/nofollow here, following the same "unlinked and
// noindex, not via robots.ts" pattern as /welcome (a Disallow line in
// robots.ts would publish the URL to anyone reading it).
export const metadata: Metadata = {
  title: 'Onboarding Status | Triple Cities Tech',
  description: 'Live onboarding status.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function StatusTokenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
