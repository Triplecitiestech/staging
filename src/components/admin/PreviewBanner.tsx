'use client'

import { useDemoMode } from '@/components/admin/DemoModeProvider'

export default function PreviewBanner({ companyName }: { companyName: string }) {
  const demo = useDemoMode()
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 border-b border-cyan-500/30 text-white px-4 py-2 text-center text-sm font-semibold shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-center gap-2">
        <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="text-cyan-300">Admin Preview Mode</span>
        <span className="text-slate-400">&bull;</span>
        <span className="text-slate-300">Viewing as: {demo.company(companyName)}</span>
      </div>
    </div>
  )
}
