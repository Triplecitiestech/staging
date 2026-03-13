import type { Metadata } from 'next'
import { metadata as constructionMetadata } from './metadata'

export const metadata: Metadata = constructionMetadata

export default function ConstructionLayout({ children }: { children: React.ReactNode }) {
  return children
}
