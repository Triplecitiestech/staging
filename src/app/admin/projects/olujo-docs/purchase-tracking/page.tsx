import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, DollarSign, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export default function PurchaseTrackingPage() {
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
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                  Purchase Tracking SOP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  For Jeff&apos;s Team Only – Commission Attribution &amp; Processing
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
        {/* Important Notice */}
        <section className="mb-12 bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border-2 border-green-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="w-8 h-8 text-green-400" />
            <h2 className="text-3xl font-bold text-white">Overview</h2>
          </div>
          <div className="space-y-4 text-slate-300">
            <p className="text-lg">
              This SOP is <strong className="text-white">for Jeff&apos;s team only</strong>. Contractors do not track purchases or process commissions.
            </p>
            <p>
              This document outlines how to track store purchases, correlate them with contractor outreach, and calculate commissions fairly and accurately.
            </p>
          </div>
        </section>

        {/* Commission Structure */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Commission Structure</h2>

          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={24} className="text-green-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-green-400 mb-2">$25 per bottle</h3>
                  <p className="text-slate-300">
                    Contractors earn a flat <strong className="text-white">$25 commission per bottle</strong> purchased by a store, if the purchase occurs within 30 days of the contractor&apos;s last logged interaction with that store.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-blue-500/10 border-l-4 border-blue-500 rounded px-6 py-4">
            <p className="text-slate-300">
              <strong className="text-white">Example:</strong> If a store purchases 12 bottles of Olujo and the purchase is attributed to Contractor A, Contractor A earns <strong className="text-white">$300 commission</strong> (12 bottles × $25).
            </p>
          </div>
        </section>

        {/* Attribution Rules */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Attribution Rules</h2>
          </div>

          <div className="space-y-6">
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Last-Touch Attribution</h3>
              <p className="text-slate-300 mb-4">
                The contractor who <strong className="text-white">most recently logged an interaction</strong> with the store gets credited for the purchase.
              </p>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm italic">
                  <strong className="text-white">Example:</strong> If Contractor A called Store X on January 5th and Contractor B sent an Instagram message on January 8th, Contractor B gets the credit if Store X purchases on January 15th.
                </p>
              </div>
            </div>

            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-4">30-Day Commission Window</h3>
              <p className="text-slate-300 mb-4">
                A purchase must occur <strong className="text-white">within 30 days</strong> of the contractor&apos;s last logged interaction for them to earn commission.
              </p>
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <p className="text-slate-300">
                  <strong className="text-white">Eligible:</strong> Last interaction on January 1st, purchase on January 25th → Commission earned
                </p>
                <p className="text-slate-300">
                  <strong className="text-white">Not Eligible:</strong> Last interaction on January 1st, purchase on February 5th → No commission
                </p>
              </div>
            </div>

            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6">
              <h3 className="text-xl font-bold text-red-400 mb-4">No Transcript = No Credit</h3>
              <p className="text-slate-300">
                If the last interaction logged in the CRM <strong className="text-white">does not have a call transcript or logged content</strong>, the contractor does not earn commission, even if the interaction is within 30 days.
              </p>
              <p className="text-slate-400 text-sm mt-4 italic">
                This rule ensures all contractors properly document their outreach and maintains audit integrity.
              </p>
            </div>
          </div>
        </section>

        {/* Purchase Tracking Process */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Purchase Tracking Process</h2>

          <div className="space-y-6">
            <div className="bg-indigo-500/10 border-l-4 border-indigo-500 rounded px-6 py-4">
              <h3 className="text-lg font-bold text-indigo-400 mb-3">When Jeff&apos;s team learns of a store purchase:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Verify the purchase details:</strong> Store name, purchase date, number of bottles purchased
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Look up the store in the CRM:</strong> Find the store&apos;s lead record
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Review the timeline:</strong> Identify the last logged interaction and the rep who made it
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">4</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Check the 30-day window:</strong> Confirm the purchase date is within 30 days of the last interaction
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">5</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Verify documentation:</strong> Ensure the last interaction has a call transcript or logged content
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">6</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Enter purchase data in CRM:</strong> Log purchase date, bottle count, and attributed rep
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">7</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Calculate commission:</strong> Multiply number of bottles by $25
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">8</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Process payment via Gusto:</strong> Schedule the commission payment for the next bi-weekly pay period
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Edge Cases */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-yellow-400" />
            <h2 className="text-3xl font-bold text-white">Edge Cases &amp; Special Situations</h2>
          </div>

          <div className="space-y-6">
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">No Logged Interactions Found</h3>
              <p className="text-slate-300">
                If a store purchases but there are <strong className="text-white">no logged interactions in the CRM</strong>, no commission is paid. This purchase may be organic or from another marketing channel.
              </p>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Last Interaction Is Older Than 30 Days</h3>
              <p className="text-slate-300">
                If the most recent logged interaction is <strong className="text-white">more than 30 days old</strong>, no commission is paid. The purchase is considered organic or influenced by other factors.
              </p>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Missing or Incomplete Transcript</h3>
              <p className="text-slate-300 mb-3">
                If the last interaction <strong className="text-white">does not have a call transcript or logged content</strong>, no commission is paid, even if it&apos;s within 30 days.
              </p>
              <p className="text-slate-400 text-sm italic">
                Contractors are responsible for proper documentation. Missing transcripts result in lost commission for the contractor.
              </p>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Disputed Attribution</h3>
              <p className="text-slate-300 mb-3">
                If there is a dispute about which contractor should receive credit, Jeff&apos;s team will review the CRM timeline and make the final determination based on:
              </p>
              <div className="space-y-2 ml-4">
                <p className="text-slate-300">• Most recent logged interaction with proper documentation</p>
                <p className="text-slate-300">• Compliance with 30-day window</p>
                <p className="text-slate-300">• Quality and completeness of transcript/logged content</p>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">Repeat Purchases from Same Store</h3>
              <p className="text-slate-300">
                Each purchase is treated independently. If a store makes multiple purchases, each one is evaluated separately using the same attribution rules. A different contractor may receive credit for each purchase depending on who made the last documented contact.
              </p>
            </div>
          </div>
        </section>

        {/* Audit & Transparency */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-blue-400 mb-6">Audit &amp; Transparency</h2>

          <div className="space-y-4 text-slate-300">
            <p>
              All purchase tracking and commission calculations must be <strong className="text-white">documented in the CRM</strong> to ensure transparency and fairness.
            </p>
            <p>
              Contractors can view their commission-eligible interactions in the CRM. If they believe they were incorrectly denied commission, they can escalate to Jeff&apos;s team with the CRM record as proof.
            </p>
            <p>
              The CRM serves as the <strong className="text-white">single source of truth</strong>. No commission disputes will be entertained without proper CRM documentation.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
