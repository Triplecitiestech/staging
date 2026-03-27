'use client'

import { BackgroundThemeProvider, BackgroundLayer } from '@/components/ui/BackgroundTheme'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackgroundThemeProvider>
      <div className="min-h-screen relative">
        <BackgroundLayer />
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </BackgroundThemeProvider>
  )
}
