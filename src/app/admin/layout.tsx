import DemoModeProvider from '@/components/admin/DemoModeProvider'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DemoModeProvider>{children}</DemoModeProvider>
}
