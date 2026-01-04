import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Target, Users, Building2 } from 'lucide-react'

export default function ExecutiveSummaryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-500 bg-clip-text text-transparent">
                  Project Executive Summary
                </h1>
                <p className="text-sm text-slate-400">
                  Olujo Brand Awareness Outreach Engine
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/admin/preview/olujo"
                target="_blank"
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-lg transition-all flex items-center gap-2 font-semibold"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Customer Portal
              </Link>
              <Link
                href="/admin/projects/olujo-plan"
                className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Back to Plan
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Project Purpose */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Project Purpose</h2>
          </div>
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <p>
              The purpose of this project is to <strong className="text-white">increase brand awareness and familiarity</strong> for Olujo Tequila among liquor stores in the United States by repeatedly and consistently asking a single question:
            </p>
            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4 my-6">
              <p className="text-xl font-semibold text-cyan-300">
                "Do you carry Olujo Tequila?"
              </p>
            </div>
            <p className="text-amber-300 font-semibold">
              This project is not a sales program.
            </p>
            <p>
              It is a structured, proof-driven awareness initiative designed to make the Olujo name familiar to store owners and staff so that downstream purchases occur naturally through existing channels.
            </p>
          </div>
        </section>

        {/* Project Leadership */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-purple-400" />
            <h2 className="text-3xl font-bold text-white">Project Leadership & Ownership</h2>
          </div>

          <div className="space-y-6">
            {/* Adam */}
            <div className="bg-slate-900/50 border border-cyan-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-2">Project Lead / Business Owner</h3>
              <p className="text-lg text-white mb-3">Adam – Owner, Olujo</p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                  <span>Owns brand representation, messaging approval, and final business decisions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                  <span>Confirms downstream purchases and bottle counts</span>
                </li>
              </ul>
            </div>

            {/* Jeff */}
            <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-2">Business Project Manager</h3>
              <p className="text-lg text-white mb-3">Jeff – Olujo</p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                  <span>Manages day-to-day execution</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                  <span>Oversees contractors</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                  <span>Reviews reporting and coverage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400 mt-2" />
                  <span>Acts as liaison between Olujo and technical team</span>
                </li>
              </ul>
            </div>

            {/* Triple Cities Tech */}
            <div className="bg-slate-900/50 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-2">Technical Owner & System Manager</h3>
              <p className="text-lg text-white mb-3">Triple Cities Tech</p>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-2" />
                  <span>Designs and builds all systems</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-2" />
                  <span>Owns CRM, database, hosting, security, and data integrity</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-2" />
                  <span>Defines and enforces statuses, workflows, and attribution logic</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Scope Definition */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="w-8 h-8 text-green-400" />
            <h2 className="text-3xl font-bold text-white">Scope Definition</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Included */}
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-4">✓ Included</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>Liquor stores only</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>Awareness phone calls</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>Social media comments (Instagram & Facebook)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>Manual proof logging (call transcripts + activity logs)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>CRM-based attribution and reporting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 mt-2" />
                  <span>Commission tracking for post-awareness purchases</span>
                </li>
              </ul>
            </div>

            {/* Excluded */}
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-red-400 mb-4">✗ Explicitly Excluded</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-red-400 font-bold">✗</span>
                  <span>Selling or pitching</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-red-400 font-bold">✗</span>
                  <span>Distributor outreach</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-red-400 font-bold">✗</span>
                  <span>Price discussion</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-red-400 font-bold">✗</span>
                  <span>Order placement</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-red-400 font-bold">✗</span>
                  <span>Negotiation of terms</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Geographic Rollout */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Geographic Rollout</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-300 font-semibold">Primary Market</p>
              <p className="text-2xl font-bold text-white">New York</p>
            </div>
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
              <p className="text-purple-300 font-semibold">Secondary Market</p>
              <p className="text-2xl font-bold text-white">Florida</p>
            </div>
          </div>
        </section>

        {/* Contractor Model */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Contractor Model</h2>
          <div className="space-y-4 text-slate-300">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
              <span>Temporary, full-time independent contractors</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
              <span><strong className="text-white">Work hours:</strong> Monday–Friday, 10:00 AM–7:00 PM Eastern Time</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
              <span>Paid hourly</span>
            </div>
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mt-4">
              <p className="text-green-300 font-semibold mb-2">Commission Eligibility: $25 per bottle sold</p>
              <p className="text-sm text-slate-300 mb-2">Only if:</p>
              <ul className="space-y-1 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>A verified awareness call exists</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Transcript is uploaded in CRM</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Contractor is attributed per system rules</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Purchase occurs after the awareness touch</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Success Criteria */}
        <section className="mb-12 bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border-2 border-green-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Success Criteria</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">High coverage of liquor stores in target markets</span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">Clean, provable outreach data</span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">Brand name recognition increases over time</span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">Downstream purchases can be fairly attributed</span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">Zero selling behavior by contractors</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
