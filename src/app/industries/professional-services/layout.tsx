import type { Metadata } from 'next'
import { metadata as professionalServicesMetadata } from './metadata'

export const metadata: Metadata = professionalServicesMetadata

export default function ProfessionalServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
