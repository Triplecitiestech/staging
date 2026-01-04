import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react'

export default function ContractorAgreementPage() {
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
                  Independent Contractor Agreement
                </h1>
                <p className="text-sm text-slate-400">
                  Olujo Brand Awareness Outreach Program
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
        {/* Agreement Header */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Agreement Overview</h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            This Independent Contractor Agreement ("Agreement") is entered into between <strong className="text-white">Triple Cities Tech</strong> ("Company") and the individual or entity performing outreach services ("Contractor") for the Olujo Brand Awareness Outreach Program ("Program").
          </p>
          <p className="text-slate-300 leading-relaxed">
            By accepting this engagement, the Contractor agrees to the following terms and conditions.
          </p>
        </section>

        {/* Section 1: Engagement */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">1. Engagement</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor is engaged as an <strong className="text-white">independent contractor</strong>, not as an employee, agent, partner, or joint venturer of the Company.
            </p>
            <p>
              The Contractor will perform awareness-only outreach services for Olujo Tequila, including phone calls and Instagram messaging to liquor stores in assigned territories.
            </p>
          </div>
        </section>

        {/* Section 2: Services */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">2. Services</h2>
          <div className="space-y-4">
            <p className="text-slate-300">The Contractor agrees to:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Follow the approved Call Handling SOP and CRM Handling SOP exactly</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Make phone calls using the approved script only</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Send Instagram messages as directed</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Log all interactions in the CRM with transcripts and screenshots</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Use the assigned alias and social media accounts</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Never sell, pitch, or persuade — awareness outreach only</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Schedule */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">3. Schedule</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor will work <strong className="text-white">5 days per week, 4 hours per day</strong> during agreed-upon shifts.
            </p>
            <p>
              The Contractor is responsible for managing their own schedule within the agreed shift times. The Company may adjust shift assignments based on performance and territory needs.
            </p>
          </div>
        </section>

        {/* Section 4: Compensation */}
        <section className="mb-8 bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border-2 border-green-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-green-400 mb-6">4. Compensation</h2>

          <div className="space-y-6">
            <div className="bg-green-900/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-4">Hourly Rate</h3>
              <p className="text-slate-300 mb-2">
                The Contractor will be paid <strong className="text-white">$8 per hour</strong> for documented outreach activity.
              </p>
              <p className="text-slate-400 text-sm italic">
                Payment is contingent on proper CRM logging. Hours without logged activity will not be compensated.
              </p>
            </div>

            <div className="bg-green-900/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-4">Performance Commission</h3>
              <div className="space-y-3">
                <p className="text-slate-300">
                  The Contractor will earn commission on store purchases attributed to their outreach:
                </p>
                <div className="bg-slate-900/50 rounded p-4 space-y-2">
                  <p className="text-slate-300">
                    • <strong className="text-white">First purchase:</strong> $50 per case
                  </p>
                  <p className="text-slate-300">
                    • <strong className="text-white">Repeat purchase (same store):</strong> $25 per case
                  </p>
                </div>
                <p className="text-slate-400 text-sm italic mt-4">
                  Commission is based on last-touch attribution within a 30-day window. No transcript or screenshot = no commission credit.
                </p>
              </div>
            </div>

            <div className="bg-green-900/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-4">Payment Terms</h3>
              <p className="text-slate-300">
                Payments are processed <strong className="text-white">bi-weekly</strong> via the Contractor's chosen payment method (PayPal, Wise, bank transfer, etc.).
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Monitoring */}
        <section className="mb-8 bg-gradient-to-br from-amber-600/20 to-amber-500/10 backdrop-blur-sm border-2 border-amber-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <h2 className="text-2xl font-bold text-white">5. Monitoring &amp; Quality Assurance</h2>
          </div>

          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor acknowledges and agrees that:
            </p>
            <div className="bg-amber-900/20 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">All phone calls may be recorded for quality assurance and training purposes</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">All CRM activity is monitored and audited</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">The Company reserves the right to review transcripts, screenshots, and logged data at any time</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Failure to follow SOPs or falsification of data will result in immediate termination</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Confidentiality */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">6. Confidentiality</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor agrees to keep all information related to the Program confidential, including but not limited to:
            </p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Store lists and contact information</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Call scripts and outreach methodology</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">CRM data and sales information</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Client information and business strategy</span>
              </div>
            </div>
            <p className="mt-4">
              This confidentiality obligation survives termination of this Agreement.
            </p>
          </div>
        </section>

        {/* Section 7: Non-Solicitation */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">7. Non-Solicitation</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor agrees not to:
            </p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Contact stores on the CRM list for personal gain or on behalf of any other brand</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Use the CRM data or store contacts for any purpose outside of this Program</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Recruit or solicit other contractors working on this Program</span>
              </div>
            </div>
            <p className="mt-4">
              This non-solicitation obligation remains in effect for <strong className="text-white">12 months</strong> after termination of this Agreement.
            </p>
          </div>
        </section>

        {/* Section 8: Termination */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">8. Termination</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              Either party may terminate this Agreement at any time with <strong className="text-white">7 days' written notice</strong>.
            </p>
            <p>
              The Company may terminate this Agreement immediately for cause, including but not limited to:
            </p>
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Violation of the Call Handling SOP or CRM Handling SOP</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Falsification of CRM data or call transcripts</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Breach of confidentiality or non-solicitation obligations</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Consistent failure to meet performance standards</span>
              </div>
            </div>
            <p className="mt-4">
              Upon termination, the Contractor must immediately cease all outreach activity and return or destroy any Company materials or data.
            </p>
          </div>
        </section>

        {/* Section 9: Independent Contractor Status */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">9. Independent Contractor Status</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor acknowledges and agrees that:
            </p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">They are an independent contractor, not an employee of the Company</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">They are responsible for their own taxes, insurance, and benefits</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">They are not entitled to employee benefits such as health insurance, retirement plans, or paid leave</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">The Company will not withhold taxes from payments</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">The Company will issue a Form 1099 (or equivalent) for tax reporting purposes if applicable</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 10: Governing Law */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">10. Governing Law</h2>
          <p className="text-slate-300">
            This Agreement shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict of law provisions.
          </p>
        </section>

        {/* Acceptance */}
        <section className="mb-8 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-blue-400 mb-4">Acceptance</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              By beginning work under this Agreement, the Contractor acknowledges that they have read, understood, and agree to be bound by all terms and conditions set forth herein.
            </p>
            <div className="bg-blue-900/20 border-l-4 border-blue-500 rounded px-6 py-4 mt-6">
              <p className="text-white font-semibold">
                This Agreement constitutes the entire agreement between the parties and supersedes all prior understandings or agreements, whether written or oral.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
