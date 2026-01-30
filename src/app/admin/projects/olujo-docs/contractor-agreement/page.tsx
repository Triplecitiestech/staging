import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react'

export default function ContractorAgreementPage() {
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
                  Independent Contractor Agreement
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Olujo Brand Awareness Outreach Program
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
        {/* Agreement Header */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Agreement Overview</h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            This Independent Contractor Agreement ("Agreement") is entered into between <strong className="text-white">Olujo</strong> ("Company") and the individual or entity performing outreach services ("Contractor") for the Olujo Brand Awareness Outreach Program ("Program").
          </p>
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-bold text-blue-300 mb-3">Scope of Agreement</h3>
            <p className="text-slate-300 mb-3">
              This Agreement applies to <strong className="text-white">both</strong>:
            </p>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0">•</span>
                <span><strong className="text-white">Awareness-only agents</strong> who make outbound calls, send social messages, and log data in Salesforce</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0">•</span>
                <span><strong className="text-white">Filipino Operations Manager</strong> who supervises agents, enforces SOPs, trains, and reports to Olujo leadership</span>
              </li>
            </ul>
            <p className="text-slate-400 text-sm mt-3 italic">
              Both roles are non-selling. Both must follow compliance and documentation rules. Managers are held to a higher standard of conduct and enforcement.
            </p>
          </div>
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
              The Contractor will perform one of the following roles:
            </p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-cyan-400 mb-2">Awareness-Only Agent</h3>
                <p className="text-slate-300">
                  Performs awareness-only outreach services for Olujo Tequila, including phone calls, Instagram messaging, and Facebook messages or posts to liquor stores in assigned territories.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-orange-400 mb-2">Filipino Operations Manager</h3>
                <p className="text-slate-300">
                  Supervises awareness-only agents, enforces SOPs and compliance requirements, conducts agent hiring and training, performs quality assurance, and reports operational metrics to Olujo leadership. Does NOT sell and does NOT contact stores for outreach (except for training or QA purposes).
                </p>
              </div>
            </div>
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
                <span className="text-slate-300">Send Instagram and Facebook messages as directed</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Log all interactions in Salesforce with call transcripts</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Use the assigned alias and social media accounts</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Never sell, pitch, or persuade — awareness outreach only</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Never answer or return inbound calls</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Schedule */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">3. Schedule</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor will work <strong className="text-white">8 hours per day, Monday through Friday, 10 AM to 7 PM EST</strong>.
            </p>
            <p>
              As the program expands to additional markets in different timezones, schedules may be adjusted to ensure outreach occurs during normal business hours in the target market. The goal is to reach out to liquor stores when they are open for business, which is estimated to be 10 AM or later in their respective timezones.
            </p>
            <p>
              Contractors must clock in and out using <strong className="text-white">Gusto</strong> each day. Activity should begin immediately upon clocking in.
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
                The Contractor will be paid <strong className="text-white">$3 per hour</strong> for documented outreach activity.
              </p>
              <p className="text-slate-400 text-sm italic">
                Payment is contingent on proper Salesforce logging. Hours without logged activity will not be compensated.
              </p>
            </div>

            <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-orange-400 mb-4">Compliance Requirement</h3>
              <p className="text-slate-300 mb-3">
                Contractors are paid <strong className="text-white">hourly only</strong>. There is no commission, bonus, or sales-based compensation.
              </p>
              <p className="text-slate-300">
                This structure ensures full compliance with New York State liquor regulations and maintains the integrity of the awareness-only mission.
              </p>
            </div>

            <div className="bg-green-900/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-green-400 mb-4">Payment Terms</h3>
              <p className="text-slate-300">
                Payments are processed <strong className="text-white">bi-weekly via Gusto</strong>. All contractors will be paid through the Gusto platform for hourly wages only.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Performance Expectations */}
        <section className="mb-8 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-blue-400 mb-6">5. Performance Expectations</h2>

          <div className="space-y-6">
            <p className="text-slate-300">
              Contractors are expected to maintain consistent daily activity levels to ensure program effectiveness and operational efficiency.
            </p>

            <div className="bg-blue-900/20 rounded-lg p-6">
              <h3 className="text-lg font-bold text-blue-400 mb-4">Daily Activity Targets</h3>
              <p className="text-slate-300 mb-4">
                While working scheduled hours, contractors should aim to meet the following targets:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Calls attempted per day:</strong> Minimum 40-60 outbound calls during an 8-hour shift</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Calls completed with documentation:</strong> All completed calls must be logged in Salesforce with transcripts</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Response rate:</strong> Contractors should maintain regular communication with management and respond to requests within 24 hours</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-blue-300 mb-3">Important Clarifications</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>These targets are <strong className="text-white">operational expectations</strong>, not tied to sales outcomes or purchase results</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Call volume may vary based on market conditions, store hours, and territory characteristics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0">•</span>
                  <span>Quality of outreach and SOP compliance is equally important as quantity</span>
                </li>
              </ul>
            </div>

            <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-orange-400 mb-4">Performance Enforcement</h3>
              <p className="text-slate-300 mb-3">
                Failure to meet performance targets may result in:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Coaching and feedback:</strong> Management will provide guidance to help contractors improve activity levels</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Reduced hours:</strong> Persistent underperformance may lead to reduced scheduled hours or shift reassignment</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300"><strong className="text-white">Termination:</strong> Consistent failure to meet minimum activity expectations may result in termination of this Agreement</span>
                </div>
              </div>
              <p className="text-slate-400 text-sm mt-4 italic">
                Performance is reviewed on an ongoing basis. Contractors will receive feedback and opportunities to improve before termination is considered.
              </p>
            </div>
          </div>
        </section>

        {/* Section 6: Monitoring */}
        <section className="mb-8 bg-gradient-to-br from-purple-600/20 to-purple-500/10 backdrop-blur-sm border-2 border-purple-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-8 h-8 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">6. Monitoring &amp; Quality Assurance</h2>
          </div>

          <div className="space-y-4 text-slate-300">
            <p>
              The Contractor acknowledges and agrees that:
            </p>
            <div className="bg-purple-900/20 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">All phone calls may be recorded for quality assurance and training purposes</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">All Salesforce activity is monitored and audited</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">RingCentral and Salesforce analytics track productivity, start times, and activity levels</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">The Company reserves the right to review transcripts and logged data at any time</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span className="text-slate-300">Failure to follow SOPs or falsification of data will result in immediate termination</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Confidentiality */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">7. Confidentiality</h2>
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
                <span className="text-slate-300">Salesforce data and lead information</span>
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

        {/* Section 8: Non-Solicitation */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">8. Non-Solicitation</h2>
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
                <span className="text-slate-300">Use the Salesforce data or store contacts for any purpose outside of this Program</span>
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

        {/* Section 9: Termination */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">9. Termination</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              The Company may terminate this Agreement <strong className="text-white">at any time without warning or prior notice</strong>.
            </p>
            <p>
              The Contractor must provide <strong className="text-white">7 business days' written notice</strong> if they wish to terminate this Agreement.
            </p>
            <p>
              Immediate termination by the Company may occur for cause, including but not limited to:
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

            <div className="bg-orange-900/30 border border-orange-500/50 rounded-lg p-6 mt-6">
              <h3 className="text-lg font-bold text-orange-400 mb-4">Additional Termination Grounds for Operations Managers</h3>
              <p className="text-slate-300 mb-3">
                Operations Managers are held to a <strong className="text-white">higher standard</strong> of conduct and enforcement. Immediate termination may occur for:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Failure to enforce SOPs or compliance requirements with agents</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Knowingly allowing or ignoring compliance violations by agents</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Repeated failure to meet operational expectations or reporting requirements</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Misrepresentation of agent performance or data integrity issues</span>
                </div>
              </div>
            </div>

            <p className="mt-4">
              Upon termination, the Contractor must immediately cease all outreach activity and return or destroy any Company materials or data.
            </p>
          </div>
        </section>

        {/* Section 10: Independent Contractor Status */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">10. Independent Contractor Status</h2>
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

        {/* Section 11: Governing Law */}
        <section className="mb-8 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">11. Governing Law</h2>
          <div className="space-y-4 text-slate-300">
            <p>
              This Agreement shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict of law provisions.
            </p>
            <p>
              For contractors based in the Philippines, this Agreement shall also comply with applicable Philippine labor laws and regulations. In the event of any conflict between New York law and Philippine labor law, the provisions most favorable to the Contractor under Philippine law shall prevail to the extent required by Philippine law.
            </p>
          </div>
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
