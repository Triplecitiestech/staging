import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Customer Support Portal | Triple Cities Tech',
  description: 'Sign in to your Triple Cities Tech customer support portal',
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
