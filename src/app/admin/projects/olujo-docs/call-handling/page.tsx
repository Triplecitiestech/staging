import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Phone, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function CallHandlingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={48}
                height={48}
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-500 bg-clip-text text-transparent">
                  Call Handling SOP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Awareness-Only Phone Outreach
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/admin/preview/olujo"
                target="_blank"
                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-lg transition-all flex items-center gap-2 font-semibold text-sm sm:text-base whitespace-nowrap"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="hidden sm:inline">View Customer Portal</span>
                <span className="sm:hidden">Portal</span>
              </Link>
              <Link
                href="/admin/projects/olujo-plan"
                className="px-3 py-2 sm:px-4 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2 text-sm sm:text-base whitespace-nowrap"
              >
                <ArrowLeft size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Back to Plan</span>
                <span className="sm:hidden">Back</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Purpose */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Phone className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Purpose</h2>
          </div>
          <p className="text-slate-300 leading-relaxed">
            This SOP defines exactly how contractors must handle phone calls. The goal is consistency, comfort for the store, and provable outreach.
          </p>
        </section>

        {/* Core Rule */}
        <section className="mb-12 bg-gradient-to-br from-red-600/20 to-red-500/10 backdrop-blur-sm border-2 border-red-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Core Rule</h2>
          <p className="text-white text-lg mb-4">
            Contractors <strong>do not sell</strong>. They <strong>do not pitch</strong>. They <strong>do not persuade</strong>.
          </p>
          <p className="text-white text-lg">
            They ask one question and document the outcome.
          </p>
        </section>

        {/* Approved Call Script */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-8">Approved Call Script</h2>

          {/* Opening */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">Opening</h3>
            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
              <p className="text-white text-lg mb-3">"Hi, is this [Store Name]?</p>
              <p className="text-white text-lg">Quick question — do you carry Olujo Tequila?"</p>
            </div>
            <p className="text-slate-400 mt-3 italic">Pause and wait for a response.</p>
          </div>

          {/* Response Handling */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-purple-400 mb-4">Response Handling</h3>

            <div className="space-y-6">
              {/* If YES */}
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
                <h4 className="text-lg font-bold text-green-400 mb-3">If the store says YES</h4>
                <p className="text-white text-lg mb-2">"Got it — thank you, I appreciate it."</p>
                <p className="text-slate-400">End the call politely.</p>
              </div>

              {/* If NO */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                <h4 className="text-lg font-bold text-blue-400 mb-3">If the store says NO</h4>
                <p className="text-white text-lg mb-3">"No worries at all — thanks for checking."</p>
                <p className="text-slate-300 mb-2"><strong>Optionally:</strong></p>
                <p className="text-white text-lg mb-2">"Have you heard of it before, or not really?"</p>
                <p className="text-slate-400">Then end the call.</p>
              </div>

              {/* If they ask what it is */}
              <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
                <h4 className="text-lg font-bold text-purple-400 mb-3">If the store asks: "What is Olujo?"</h4>
                <p className="text-slate-300 mb-3">Contractors may respond only with casual, experiential familiarity:</p>

                <div className="bg-slate-900/50 rounded p-4 mb-3">
                  <p className="text-sm font-semibold text-purple-300 mb-2">Approved examples (rotate naturally):</p>
                  <ul className="space-y-2 text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                      <span>"I had it at a friend's house — it came in an orange case and was really good."</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                      <span>"I've seen it at a restaurant in NYC — beautiful bottle."</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                      <span>"Someone brought it to a get-together and it stood out."</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Prohibited Behavior */}
        <section className="mb-12 bg-gradient-to-br from-red-600/20 to-red-500/10 backdrop-blur-sm border-2 border-red-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <h2 className="text-3xl font-bold text-white">Prohibited Call Behavior</h2>
          </div>
          <p className="text-red-300 font-semibold mb-4">Contractors must never:</p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Mention pricing</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Mention distributors</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Offer to send ordering information</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Ask to speak to a buyer for sales purposes</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Attempt to close or influence a purchase</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
              <span>Argue or persist if the store is not interested</span>
            </li>
          </ul>
        </section>

        {/* Closing */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Closing</h2>
          <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
            <p className="text-white text-lg">"Thanks for your time — have a great day."</p>
          </div>
        </section>

        {/* Documentation Requirement */}
        <section className="mb-12 bg-gradient-to-br from-teal-600/20 to-teal-500/10 backdrop-blur-sm border-2 border-teal-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-8 h-8 text-teal-400" />
            <h2 className="text-3xl font-bold text-white">Call Documentation Requirement</h2>
          </div>
          <p className="text-white text-lg mb-6">After every call, the contractor must:</p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-teal-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300">Upload or paste the call transcript into the CRM</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-teal-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-slate-300 mb-2">Log:</p>
                <ul className="ml-6 space-y-1 text-slate-400">
                  <li>• Who answered (owner / employee / unknown)</li>
                  <li>• Carry status</li>
                  <li>• Any brand familiarity mentioned</li>
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-teal-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300">Update the lead status</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-teal-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300">Ensure they are recorded as the last-touch rep</span>
            </div>
          </div>
          <div className="mt-6 bg-red-900/30 border border-red-500/50 rounded-lg p-4">
            <p className="text-red-300 font-bold text-lg">No transcript = no credit.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
