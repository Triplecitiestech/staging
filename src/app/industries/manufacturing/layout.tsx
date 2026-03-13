import type { Metadata } from 'next'
import { metadata as manufacturingMetadata } from './metadata'

export const metadata: Metadata = manufacturingMetadata

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return children
}
