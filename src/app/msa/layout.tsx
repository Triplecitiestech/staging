import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Master Services Agreement | Triple Cities Tech',
  description: 'Master Services Agreement for Triple Cities Tech managed IT services.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function MSALayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
