import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Users, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function ManagerHiringPage() {
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
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-purple-400 to-purple-500 bg-clip-text text-transparent">
                  Operations Manager Hiring Guidelines
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Filipino Operations Manager — Supervisory Role
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
        {/* Role Overview */}
        <section className="mb-12 bg-gradient-to-br from-purple-600/20 to-purple-500/10 backdrop-blur-sm border-2 border-purple-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-purple-400" />
            <h2 className="text-3xl font-bold text-white">Role Overview</h2>
          </div>
          <div className="space-y-4">
            <p className="text-slate-300 leading-relaxed">
              The <strong className="text-white">Filipino Operations Manager</strong> is a senior, non-selling contractor responsible for managing and supervising awareness-only agents.
            </p>
            <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-purple-300 mb-3">This role:</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
                  <span>Does NOT sell</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
                  <span>Does NOT contact stores for outreach (except for training or QA purposes)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
                  <span>Acts as the operational bridge between agents and the Olujo leadership team</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Core Responsibilities */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-8">Core Responsibilities</h2>

          {/* Agent Oversight */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">1. Agent Oversight</h3>
            <p className="text-slate-300 mb-4">Managing day-to-day agent performance and ensuring agents follow:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Call Handling SOP</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">CRM logging standards</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Inbound call rules</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Compliance requirements</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Addressing minor issues before escalation</span>
              </div>
            </div>
          </div>

          {/* Hiring & Interviewing */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-green-400 mb-4">2. Hiring &amp; Interviewing</h3>
            <p className="text-slate-300 mb-4">Interviewing and vetting new Filipino agents using the approved hiring process:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Conducting English fluency checks</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Conducting mock calls</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Evaluating accent and professionalism</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Recommending hires to Olujo leadership for final approval (if required)</span>
              </div>
            </div>
          </div>

          {/* Training & Onboarding */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-blue-400 mb-4">3. Training &amp; Onboarding</h3>
            <p className="text-slate-300 mb-4">Training agents on:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Approved scripts</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">CRM usage (Salesforce)</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Documentation standards</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Ensuring new agents are productive before operating independently</span>
              </div>
            </div>
          </div>

          {/* Quality Assurance */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-orange-400 mb-4">4. Quality Assurance</h3>
            <p className="text-slate-300 mb-4">Reviewing call logs and transcripts for quality and compliance:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Identifying script drift</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Identifying incomplete documentation</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Identifying over-talking or subtle selling behavior</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Correcting issues through coaching or escalation</span>
              </div>
            </div>
          </div>

          {/* Reporting */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-purple-400 mb-4">5. Reporting</h3>
            <p className="text-slate-300 mb-4">Providing regular performance summaries to the Olujo team:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Calls attempted vs completed</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Documentation compliance</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Notable trends or risks</span>
              </div>
            </div>
            <p className="text-slate-400 text-sm mt-4 italic">
              Reporting should be factual and operational, not sales-oriented.
            </p>
          </div>

          {/* Escalation Point */}
          <div>
            <h3 className="text-xl font-bold text-red-400 mb-4">6. Escalation Point</h3>
            <p className="text-slate-300 mb-4">Acting as the first escalation layer for:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Agent underperformance</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Repeated SOP violations</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Attendance or availability issues</span>
              </div>
            </div>
          </div>
        </section>

        {/* Required Qualifications */}
        <section className="mb-12 bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border-2 border-green-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Required Qualifications</h2>
          <p className="text-slate-300 mb-6">
            This is a <strong className="text-white">senior-level role</strong> compared to awareness-only agents. Candidates must demonstrate:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Fluent, professional English</strong> (near-native preferred)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Proven experience managing remote or offshore teams</strong></span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Strong written communication</strong> for reporting</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">High attention to detail</strong> and process enforcement</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Comfortable giving feedback</strong> and enforcing standards</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Strong understanding of CRM systems</strong> (Salesforce preferred)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-1" />
              <span className="text-slate-300"><strong className="text-white">Able to operate independently</strong> without micromanagement</span>
            </div>
          </div>
        </section>

        {/* Interview & Selection Process */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Interview &amp; Selection Process</h2>
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-6 mb-6">
            <p className="text-blue-200 font-bold text-lg">
              Do NOT use the same interview process as agents.
            </p>
          </div>

          {/* Step 1: Live Video Interview */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-blue-400 mb-4">Step 1: Live Video Interview (Required)</h3>
            <p className="text-slate-300 mb-4">
              Conduct a comprehensive video interview to assess communication skills, professionalism, and cultural fit.
            </p>
          </div>

          {/* Step 2: Scenario-Based Questions */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-blue-400 mb-4">Step 2: Scenario-Based Questions</h3>
            <p className="text-slate-300 mb-4">Evaluate decision-making and problem-solving skills:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-4">
              <div>
                <p className="text-blue-300 font-semibold mb-2">Scenario 1: Handling Underperforming Agents</p>
                <p className="text-slate-400 text-sm">
                  "One of your agents has been consistently logging fewer than 30 calls per day and submitting incomplete transcripts. How would you handle this situation?"
                </p>
              </div>
              <div>
                <p className="text-blue-300 font-semibold mb-2">Scenario 2: Enforcing Compliance Rules</p>
                <p className="text-slate-400 text-sm">
                  "You discover that an agent has been answering inbound calls from stores. What steps would you take?"
                </p>
              </div>
              <div>
                <p className="text-blue-300 font-semibold mb-2">Scenario 3: Addressing Repeated SOP Violations</p>
                <p className="text-slate-400 text-sm">
                  "An agent keeps deviating from the approved script despite multiple coaching sessions. How would you address this?"
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Communication Evaluation */}
          <div>
            <h3 className="text-xl font-bold text-blue-400 mb-4">Step 3: Communication Evaluation</h3>
            <p className="text-slate-300 mb-4">Assess written and verbal communication:</p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Can they explain issues clearly and professionally?</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Can they write a concise performance summary?</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Do they demonstrate leadership and professionalism?</span>
              </div>
            </div>
          </div>
        </section>

        {/* Compensation & Authority */}
        <section className="mb-12 bg-gradient-to-br from-orange-600/20 to-orange-500/10 backdrop-blur-sm border-2 border-orange-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Compensation &amp; Authority Clarification</h2>

          {/* Compensation */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-orange-400 mb-4">Compensation</h3>
            <div className="bg-orange-900/30 rounded-lg p-6">
              <p className="text-slate-300 mb-3">
                The Manager is paid <strong className="text-white">hourly only</strong>.
              </p>
              <p className="text-slate-300 mb-3">
                There is <strong className="text-white">no commission or sales-based incentives</strong>.
              </p>
              <p className="text-slate-300">
                Performance expectations are tied to:
              </p>
              <ul className="mt-3 space-y-2 text-slate-300 ml-6">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Team compliance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Documentation quality</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Operational consistency</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Payment & Admin Authority */}
          <div>
            <h3 className="text-xl font-bold text-orange-400 mb-4">Payment &amp; Admin Authority</h3>
            <div className="bg-slate-900/50 border border-orange-500/30 rounded-lg p-6">
              <p className="text-slate-300 mb-4">
                The Manager may assist with coordination and onboarding logistics.
              </p>
              <div className="bg-orange-900/30 border border-orange-500/50 rounded-lg p-4">
                <p className="text-orange-200 font-bold mb-3">Final authority for:</p>
                <ul className="space-y-2 text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Payment methods</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Pay rates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Contract approval</span>
                  </li>
                </ul>
                <p className="text-orange-200 font-semibold mt-3">
                  ...rests with Olujo leadership (e.g., Kellan), unless explicitly delegated.
                </p>
              </div>
              <p className="text-slate-400 text-sm mt-4 italic">
                Do not imply the Manager controls payroll unless instructed otherwise.
              </p>
            </div>
          </div>
        </section>

        {/* Role Distinction */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Role Distinction</h2>
          </div>
          <p className="text-slate-300 mb-6">
            All documentation clearly distinguishes:
          </p>
          <div className="space-y-4">
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">What Agents Do:</h3>
              <p className="text-slate-300">Make awareness-only calls, log data in Salesforce, follow SOPs</p>
            </div>
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
              <h3 className="text-lg font-bold text-purple-400 mb-2">What the Manager Does:</h3>
              <p className="text-slate-300">Supervise agents, enforce compliance, train, report, escalate issues</p>
            </div>
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-4">
              <h3 className="text-lg font-bold text-orange-400 mb-2">What Olujo Leadership Controls:</h3>
              <p className="text-slate-300">Pay rates, contract approval, final hiring decisions, strategic direction</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-6 italic">
            Avoid overlapping authority or ambiguity.
          </p>
        </section>
      </main>
    </div>
  )
}
