import type { Metadata } from 'next'
import { metadata as coManagedMetadata } from './metadata'

export const metadata: Metadata = coManagedMetadata

export default function CoManagedITLayout({ children }: { children: React.ReactNode }) {
  return children
}
