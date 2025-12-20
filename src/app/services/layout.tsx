import type { Metadata } from 'next'
import { servicesMetadata } from './metadata'
import ServicesSchema from '@/components/seo/ServicesSchema'

export const metadata: Metadata = servicesMetadata

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <ServicesSchema />
      {children}
    </>
  )
}
