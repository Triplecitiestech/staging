'use client'

import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminErrorBoundary>{children}</AdminErrorBoundary>
}
