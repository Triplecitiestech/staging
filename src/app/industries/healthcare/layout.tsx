import type { Metadata } from 'next'
import { metadata as healthcareMetadata } from './metadata'

export const metadata: Metadata = healthcareMetadata

export default function HealthcareLayout({ children }: { children: React.ReactNode }) {
  return children
}
