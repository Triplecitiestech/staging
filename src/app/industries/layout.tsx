import type { Metadata } from 'next'
import { industriesMetadata } from './metadata'

export const metadata: Metadata = industriesMetadata

export default function IndustriesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
