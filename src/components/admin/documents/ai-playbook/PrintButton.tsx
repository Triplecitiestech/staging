'use client'

import { Printer } from 'lucide-react'

/** Print / Save-as-PDF button, hidden when printing. */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800"
    >
      <Printer size={15} /> Print / Save as PDF
    </button>
  )
}
