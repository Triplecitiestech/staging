import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recommended Technology Platform | Triple Cities Tech',
  description: 'Triple Cities Tech recommended technology platform for managed IT clients.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RTPLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
