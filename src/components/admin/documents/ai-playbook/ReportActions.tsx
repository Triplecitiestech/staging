'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

/** Top action bar for the report page — hidden when printing. */
export default function ReportActions() {
  return (
    <div className="print:hidden max-w-[840px] mx-auto flex items-center justify-between gap-4 mb-6">
      <Link
        href="/admin/documents/ai-playbook/discovery"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft size={14} /> Back to discovery
      </Link>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800"
      >
        <Printer size={15} /> Print / Save as PDF
      </button>
    </div>
  )
}
