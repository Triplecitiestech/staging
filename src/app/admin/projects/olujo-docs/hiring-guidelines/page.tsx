import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Users, CheckCircle2, AlertTriangle, Phone } from 'lucide-react'

export default function HiringGuidelinesPage() {
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
                  Hiring Guidelines (Agents)
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Awareness-Only Agent Recruitment Standards
                </p>
              </div>
            </div>
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
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Scope Notice */}
        <section className="mb-8 bg-gradient-to-br from-orange-600/20 to-orange-500/10 backdrop-blur-sm border-2 border-orange-500/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-bold text-white">Scope of This Document</h2>
          </div>
          <p className="text-slate-300 mb-3">
            This hiring guidelines document is for <strong className="text-white">awareness-only agents</strong> who make outbound calls and log data.
          </p>
          <p className="text-slate-300">
            For hiring guidelines for the <strong className="text-white">Filipino Operations Manager</strong> (supervisory role), see:{' '}
            <Link
              href="/admin/projects/olujo-docs/manager-hiring"
              className="text-orange-400 hover:text-orange-300 underline font-semibold"
            >
              Operations Manager Hiring Guidelines
            </Link>
          </p>
        </section>

        {/* Role Overview */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Agent Role Overview</h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            Agents are awareness-only representatives. They do not sell, they do not pitch, they do not persuade.
          </p>
          <p className="text-slate-300 leading-relaxed">
            Their job is to execute structured, consistent outreach — by phone and Instagram — following approved scripts, documenting outcomes, and managing leads through Salesforce.
          </p>
        </section>

        {/* Required Qualifications */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-8">Required Qualifications</h2>

          <div className="space-y-6">
            {/* English Fluency */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">English Fluency</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must speak conversational English fluently — with no heavy accent that would distract a U.S. store owner</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must be able to sound neutral or U.S.-based</span>
                </div>
              </div>
            </div>

            {/* Phone Presence */}
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-indigo-400 mb-4">Phone Presence</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Polite, warm, non-pushy tone</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Comfortable making cold calls</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Able to stay calm and friendly if the store owner is short or busy</span>
                </div>
              </div>
            </div>

            {/* Detail-Oriented */}
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-4">Detail-Oriented</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must be able to accurately log data into Salesforce</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must upload call transcripts</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must log any and every interaction with a business</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must follow structure exactly (no improvising on script or logs)</span>
                </div>
              </div>
            </div>

            {/* Social Media & Outreach Capable */}
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Social Media & Outreach Capable</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must be able to send Instagram and Facebook messages to stores</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must log all conversations and interactions into the CRM</span>
                </div>
              </div>
            </div>

            {/* Technical Requirements */}
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-indigo-400 mb-4">Technical Requirements</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must use the assigned VOIP Softphone (likely RingCentral) for all calls</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-indigo-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must know how to perform basic tasks inside Salesforce</span>
                </div>
              </div>
            </div>

            {/* Self-Directed */}
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-green-400 mb-4">Self-Directed</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Must be able to work independently during their scheduled shift</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Should not need constant supervision</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Should be able to ask questions when stuck, not guess</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Identity & Social Requirements */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Identity &amp; Social Requirements</h2>

          <div className="space-y-6">
            <div className="bg-blue-900/20 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Alias System</h3>
              <p className="text-slate-300 mb-4">
                Every contractor must use a U.S.-sounding alias to avoid distrust or confusion. This is not deceptive — it's professional brand representation.
              </p>
              <div className="bg-slate-900/50 rounded p-4">
                <p className="text-sm font-semibold text-blue-300 mb-2">Examples:</p>
                <ul className="space-y-1 text-slate-300">
                  <li>• Alex Johnson</li>
                  <li>• Jordan Lee</li>
                  <li>• Taylor Martinez</li>
                  <li>• Casey Brown</li>
                </ul>
              </div>
            </div>

            <div className="bg-blue-900/20 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Instagram &amp; Facebook Accounts</h3>
              <p className="text-slate-300 mb-4">
                Contractors must have active Instagram and Facebook accounts under their alias. These do not need to be elaborate — but they must:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Look like real, personal accounts</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Not appear to be spam or brand-only pages</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Have a few posts (3–5 minimum) to appear legitimate</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interview Process */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Phone className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Interview Process</h2>
          </div>

          <div className="mb-6 bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
            <p className="text-white font-semibold">
              <strong>CRITICAL:</strong> A live phone call or video call is required during the interview process to ask questions on the fly and measure the candidate's accent, responsiveness, and communication skills in real-time.
            </p>
          </div>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="bg-blue-900/20 border-l-4 border-blue-500 rounded-lg p-6">
              <h3 className="text-lg font-bold text-blue-400 mb-3">Step 1: English Test</h3>
              <p className="text-slate-300 mb-3">Ask the candidate to read the approved call script aloud.</p>
              <p className="text-slate-400 italic">Listen for: fluency, accent, tone, confidence.</p>
            </div>

            {/* Step 2 */}
            <div className="bg-indigo-900/20 border-l-4 border-indigo-500 rounded-lg p-6">
              <h3 className="text-lg font-bold text-indigo-400 mb-3">Step 2: Mock Call</h3>
              <p className="text-slate-300 mb-3">Role-play a store call. You act as a liquor store employee.</p>
              <p className="text-slate-400 italic">Observe: do they follow the script? Do they sound natural?</p>
            </div>

            {/* Step 3 */}
            <div className="bg-purple-900/20 border-l-4 border-purple-500 rounded-lg p-6">
              <h3 className="text-lg font-bold text-purple-400 mb-3">Step 3: Accent Evaluation</h3>
              <p className="text-slate-300 mb-3">Ask: "Would a New York liquor store owner trust this voice on the phone?"</p>
              <p className="text-slate-400 italic">If the answer is no, do not hire.</p>
            </div>

            {/* Step 4 */}
            <div className="bg-cyan-900/20 border-l-4 border-cyan-500 rounded-lg p-6">
              <h3 className="text-lg font-bold text-cyan-400 mb-3">Step 4: CRM Demonstration</h3>
              <p className="text-slate-300 mb-3">Show them how to log a call in the CRM. Ask them to repeat it back to you.</p>
              <p className="text-slate-400 italic">If they can't follow instructions, they won't succeed.</p>
            </div>

            {/* Step 5 */}
            <div className="bg-green-900/20 border-l-4 border-green-500 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-3">Step 5: Instagram Test</h3>
              <p className="text-slate-300 mb-3">Ask them to show you their Instagram account. Ask them to send a test message to a demo account.</p>
              <p className="text-slate-400 italic">Confirm they know how to screenshot and log it.</p>
            </div>
          </div>
        </section>

        {/* Hiring Decision Criteria */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-8">Hiring Decision Criteria</h2>

          <div className="space-y-6">
            {/* Hire if */}
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-green-400 mb-4">✓ Hire if:</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Fluent English, neutral or U.S.-sounding accent</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Warm, non-pushy phone presence</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Can follow instructions precisely</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Comfortable with Salesforce and Instagram logging</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Self-directed and detail-oriented</span>
                </div>
              </div>
            </div>

            {/* Do not hire if */}
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-red-400 mb-4">✗ Do not hire if:</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Heavy accent that would raise suspicion</span>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Cannot follow the script exactly</span>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Sounds robotic or unnatural on the phone</span>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Struggles with basic Salesforce or Instagram tasks</span>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Needs constant hand-holding</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
            <p className="text-white font-semibold">
              When in doubt: don't hire. A bad contractor damages trust, creates compliance risk, and costs more to fix than to replace.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
