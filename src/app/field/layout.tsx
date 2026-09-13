import type { Metadata } from 'next'

// Contractor Portal shell. Deliberately NOT the public site chrome: no header,
// nav or footer — plain white, mobile-first, large touch targets. noindex on
// the same pattern as /rtp and /msa (metadata here; absent from NAVIGATION and
// sitemap.ts; /field is also in robots.ts disallow and every response carries
// X-Robots-Tag from the middleware).
export const metadata: Metadata = {
  title: 'Triple Cities Tech — Field Playbook',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
}

export const dynamic = 'force-dynamic'

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-white text-slate-900 antialiased">
      {children}
    </div>
  )
}
