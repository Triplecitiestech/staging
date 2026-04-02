import DemoModeProvider from '@/components/admin/DemoModeProvider'
import { AdminErrorBoundary } from '@/components/admin/AdminErrorBoundary'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoModeProvider>
      <AdminErrorBoundary>
        {children}
      </AdminErrorBoundary>
    </DemoModeProvider>
  )
}
