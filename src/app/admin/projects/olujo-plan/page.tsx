import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, Users, Target, Database, Megaphone, TrendingUp, DollarSign, Zap, FileText } from 'lucide-react'

export default function OlujoPlanPage() {
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
                  Olujo Brand Awareness Outreach Engine
                </h1>
                <p className="text-sm text-slate-400">
                  Phase-by-Phase Project Plan
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
                href="/admin/projects"
                className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Back to Projects
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Project Roles Section */}
        <div className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Project Roles & Ownership</h2>
          </div>
          <p className="text-sm text-cyan-300 mb-6 uppercase tracking-wide font-semibold">(Set Once)</p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Adam */}
            <div className="bg-slate-900/50 border border-cyan-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-2">Adam — Project Lead</h3>
              <p className="text-sm text-slate-400 mb-4">(Olujo)</p>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Owns:</p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Business goals and success criteria</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Brand messaging approval</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Final decisions on scope changes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Validation of downstream purchases (bottle counts)</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Jeff */}
            <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-2">Jeff — Business PM</h3>
              <p className="text-sm text-slate-400 mb-4">(Olujo)</p>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Owns:</p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Day-to-day coordination with reps</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Feedback on scripts and store responses</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Reporting review with Adam</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Purchase confirmation inputs to TCT</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Triple Cities Tech */}
            <div className="bg-slate-900/50 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-2">Triple Cities Tech</h3>
              <p className="text-sm text-slate-400 mb-4">Technical Owner</p>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Owns:</p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>CRM design & implementation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Database schema and statuses</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Hosting, security, backups</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Data integrity, auditability</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Tooling selection and delivery</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Operational guardrails inside the system</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-8">
          {/* Phase 0 */}
          <PhaseCard
            number={0}
            title="Alignment & Governance"
            subtitle="REQUIRED FIRST"
            icon={<Target className="w-6 h-6" />}
            color="blue"
            goal="Lock scope, rules, ownership, and prevent rework."
            outcomes={[
              "Everyone agrees this is awareness only",
              "Statuses and proof requirements are frozen",
              "Commission rules are unambiguous",
              "No engineering starts without this complete"
            ]}
            deliverables={[
              "Final operating rules (what reps can/can't say)",
              "Final lead statuses (already defined)",
              "Commission attribution rules (last-touch, verified)",
              "Contractor requirements (alias, socials, hours)",
              "Project roles formally acknowledged"
            ]}
            owners={[
              { name: "Adam", role: "approves" },
              { name: "Jeff", role: "reviews" },
              { name: "Triple Cities Tech", role: "documents + enforces" }
            ]}
            exitCriteria={[
              "Adam signs off on scope",
              "No open 'we'll decide later' items"
            ]}
            documents={[
              { title: "Executive Summary", href: "/admin/projects/olujo-docs/executive-summary" }
            ]}
          />

          {/* Phase 1 */}
          <PhaseCard
            number={1}
            title="Sales & Awareness Playbook"
            subtitle="NON-TECH"
            icon={<Megaphone className="w-6 h-6" />}
            color="indigo"
            goal="Create a repeatable, compliant human process before tooling."
            deliverables={[
              "Awareness-only call scripts",
              "Allowed experiential responses (\"orange case\", NYC restaurant, etc.)",
              "Objection handling (busy, not interested, what is it, are you selling)",
              "Social media commenting SOP (strict, non-spam)",
              "Proof requirements (transcripts + logging)"
            ]}
            owners={[
              { name: "Adam", role: "brand approval" },
              { name: "Jeff", role: "operational feedback" },
              { name: "TCT", role: "structure + compliance framing" }
            ]}
            exitCriteria={[
              "Script can be read by any rep with no interpretation",
              "Jeff can explain the rules in one minute",
              "Adam confirms brand comfort"
            ]}
            documents={[
              { title: "Call Handling SOP", href: "/admin/projects/olujo-docs/call-handling" }
            ]}
          />

          {/* Phase 2 */}
          <PhaseCard
            number={2}
            title="Hiring & Onboarding Pipeline"
            subtitle=""
            icon={<Users className="w-6 h-6" />}
            color="purple"
            goal="Recruit reps who sound natural, look legitimate, and can follow rules."
            deliverables={[
              "onlinejobs.ph job post",
              "Interview rubric (English clarity, tone, socials)",
              "Alias policy (American-sounding first name)",
              "Social profile requirements (IG + FB review)",
              "Contractor agreement (temporary, hourly + commission)",
              "Day-1 onboarding checklist"
            ]}
            owners={[
              { name: "Jeff", role: "interview coordination" },
              { name: "Adam", role: "optional final veto" },
              { name: "TCT", role: "onboarding SOP + compliance rules" }
            ]}
            exitCriteria={[
              "First 2–3 reps fully trained",
              "Social profiles approved",
              "Reps understand \"we do NOT sell\""
            ]}
            documents={[
              { title: "Hiring Guidelines", href: "/admin/projects/olujo-docs/hiring-guidelines" },
              { title: "Contractor Agreement", href: "/admin/projects/olujo-docs/contractor-agreement" }
            ]}
          />

          {/* Phase 3 */}
          <PhaseCard
            number={3}
            title="Data Acquisition (Leads)"
            subtitle=""
            icon={<Database className="w-6 h-6" />}
            color="green"
            goal="Build a clean, deduplicated liquor store list for outreach."
            scope={[
              "Liquor stores only",
              "Start with New York",
              "Florida added later"
            ]}
            deliverables={[
              "Scraping approach selected (Apify / Playwright / provider)",
              "Normalized lead dataset: Store name, Phone, City/state, Website (if available), IG/FB links (if available)",
              "CSV import format finalized"
            ]}
            owners={[
              { name: "TCT", role: "scraping + normalization" },
              { name: "Jeff", role: "spot-check accuracy" }
            ]}
            exitCriteria={[
              "NY dataset imported",
              "No duplicate phone/address conflicts",
              "Reps can begin calling immediately"
            ]}
          />

          {/* Phase 4 */}
          <PhaseCard
            number={4}
            title="CRM Build (MVP)"
            subtitle=""
            icon={<Database className="w-6 h-6" />}
            color="cyan"
            goal="Create a proof-first CRM that enforces behavior and attribution."
            capabilities={[
              "Lead list with mandatory statuses",
              "Lead detail page with full timeline",
              "Call log with transcript paste/upload",
              "Social activity logging (exact text)",
              "Rep assignment & last-touch tracking",
              "Admin-only purchase & commission entry",
              "Audit-friendly (no deletes)"
            ]}
            statuses={[
              "New – Uncontacted",
              "Called – No Answer",
              "Called – Answered – Carries Olujo",
              "Called – Answered – Does Not Carry",
              "Called – Answered – Unsure",
              "Called – Answered – Introduced Olujo",
              "Social Comment Posted",
              "Social Response – Carries Olujo",
              "Social Response – Does Not Carry",
              "Do Not Call",
              "Needs Review (QA)"
            ]}
            owners={[
              { name: "Triple Cities Tech", role: "end-to-end" }
            ]}
            exitCriteria={[
              "Reps can complete full workflow in CRM",
              "Proof cannot be skipped",
              "Admin can verify purchases"
            ]}
            documents={[
              { title: "CRM Handling SOP", href: "/admin/projects/olujo-docs/crm-handling" }
            ]}
          />

          {/* Phase 5 */}
          <PhaseCard
            number={5}
            title="Pilot Launch (New York)"
            subtitle=""
            icon={<Zap className="w-6 h-6" />}
            color="blue"
            goal="Validate the system with real calls and real proof."
            scope={[
              "2–3 reps",
              "NY only",
              "Awareness calls + limited social comments"
            ]}
            measured={[
              "Calls per rep per day",
              "Answer rate",
              "Proof compliance (transcripts uploaded)",
              "Store familiarity reactions",
              "Script comfort"
            ]}
            owners={[
              { name: "Jeff", role: "daily ops" },
              { name: "TCT", role: "system monitoring" },
              { name: "Adam", role: "high-level review" }
            ]}
            exitCriteria={[
              "≥95% proof compliance",
              "No selling violations",
              "CRM data clean and usable"
            ]}
          />

          {/* Phase 6 */}
          <PhaseCard
            number={6}
            title="Scale Up (NY → FL)"
            subtitle=""
            icon={<TrendingUp className="w-6 h-6" />}
            color="indigo"
            goal="Increase volume without breaking discipline."
            changes={[
              "Hire up to 10 reps",
              "Add Florida leads",
              "Increase QA sampling",
              "Add reporting dashboards"
            ]}
            deliverables={[
              "Rep performance reports",
              "Coverage reporting (stores touched by market)",
              "QA flags and coaching notes",
              "Commission tracking live"
            ]}
            owners={[
              { name: "Jeff", role: "people + ops" },
              { name: "TCT", role: "reporting + data integrity" },
              { name: "Adam", role: "growth decisions" }
            ]}
            exitCriteria={[
              "Consistent quality across reps",
              "Clear attribution for any purchases",
              "No operational drift"
            ]}
          />

          {/* Phase 7 */}
          <PhaseCard
            number={7}
            title="Purchase Attribution & Commissions"
            subtitle=""
            icon={<DollarSign className="w-6 h-6" />}
            color="purple"
            goal="Ensure commissions are fair, provable, and undisputed."
            process={[
              "Adam/Jeff confirms store purchase",
              "Bottle count verified",
              "Admin records purchase in CRM",
              "System attributes rep (last-touch within window)",
              "Commission calculated ($25/bottle)",
              "Approved → paid"
            ]}
            owners={[
              { name: "Adam", role: "confirms purchase reality" },
              { name: "Jeff", role: "provides inputs" },
              { name: "TCT", role: "system enforcement" }
            ]}
            exitCriteria={[
              "Zero commission disputes",
              "Every commission tied to proof"
            ]}
            documents={[
              { title: "CRM Handling SOP", href: "/admin/projects/olujo-docs/crm-handling" }
            ]}
          />

          {/* Phase 8 */}
          <PhaseCard
            number={8}
            title="Optimization & Optional Automation"
            subtitle=""
            icon={<Zap className="w-6 h-6" />}
            color="cyan"
            goal="Make the system cheaper and smarter after it works."
            enhancements={[
              "RingCentral API metadata sync",
              "Duplicate-call prevention",
              "Smarter lead rotation",
              "Automated QA flagging",
              "Email follow-ups (still optional)",
              "Heatmaps of brand recognition by region"
            ]}
            owners={[
              { name: "Adam", role: "business value decision" },
              { name: "TCT", role: "technical roadmap" }
            ]}
          />
        </div>

        {/* Final Principle */}
        <div className="mt-12 bg-gradient-to-br from-amber-600/20 to-amber-500/10 backdrop-blur-sm border-2 border-amber-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-amber-400 mb-4 text-center">Final Principle (For Adam & Jeff)</h2>
          <p className="text-white text-lg text-center mb-6">
            This project does <strong>not</strong> win by persuasion.
          </p>
          <p className="text-white text-xl font-bold text-center mb-4">It wins by:</p>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-300">Repetition</p>
            </div>
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-300">Recognition</p>
            </div>
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-300">Proof</p>
            </div>
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-300">Attribution</p>
            </div>
          </div>
          <p className="text-white text-lg text-center italic">
            If the data is clean, the brand grows.
          </p>
        </div>
      </main>
    </div>
  )
}

interface PhaseCardProps {
  number: number
  title: string
  subtitle?: string
  icon: React.ReactNode
  color: 'green' | 'blue' | 'indigo' | 'purple' | 'cyan'
  goal: string
  outcomes?: string[]
  scope?: string[]
  deliverables?: string[]
  capabilities?: string[]
  statuses?: string[]
  changes?: string[]
  process?: string[]
  enhancements?: string[]
  measured?: string[]
  owners: Array<{ name: string; role: string }>
  exitCriteria?: string[]
  documents?: Array<{ title: string; href: string }>
}

function PhaseCard({
  number,
  title,
  subtitle,
  icon,
  color,
  goal,
  outcomes,
  scope,
  deliverables,
  capabilities,
  statuses,
  changes,
  process,
  enhancements,
  measured,
  owners,
  exitCriteria,
  documents
}: PhaseCardProps) {
  const colorClasses = {
    green: 'from-green-600/20 to-green-500/10 border-green-500/50',
    blue: 'from-blue-600/20 to-blue-500/10 border-blue-500/50',
    indigo: 'from-indigo-600/20 to-indigo-500/10 border-indigo-500/50',
    purple: 'from-purple-600/20 to-purple-500/10 border-purple-500/50',
    cyan: 'from-cyan-600/20 to-cyan-500/10 border-cyan-500/50'
  }

  const iconColorClasses = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    indigo: 'text-indigo-400',
    purple: 'text-purple-400',
    cyan: 'text-cyan-400'
  }

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur-sm border-2 rounded-lg p-8`}>
      <div className="flex items-start gap-4 mb-6">
        <div className={`${iconColorClasses[color]} flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-3xl font-bold text-white">Phase {number}</h3>
            <span className="text-2xl font-bold text-white">—</span>
            <h4 className="text-2xl font-bold text-white">{title}</h4>
          </div>
          {subtitle && (
            <p className={`text-sm ${iconColorClasses[color]} uppercase tracking-wide font-semibold`}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Goal */}
      <div className="mb-6 bg-slate-900/50 border border-white/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-cyan-400 mb-2">Goal:</p>
        <p className="text-white">{goal}</p>
      </div>

      {/* Related Documents */}
      {documents && documents.length > 0 && (
        <div className="mb-6 bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-cyan-400" />
            <p className="text-sm font-semibold text-cyan-400">Related Documents:</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {documents.map((doc, idx) => (
              <Link
                key={idx}
                href={doc.href}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-sm text-cyan-300 hover:text-cyan-200 transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                {doc.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Key Outcomes */}
      {outcomes && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Key Outcomes:</p>
          <ul className="space-y-2">
            {outcomes.map((outcome, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scope */}
      {scope && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Scope:</p>
          <ul className="space-y-2">
            {scope.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deliverables */}
      {deliverables && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Deliverables:</p>
          <ul className="space-y-2">
            {deliverables.map((deliverable, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{deliverable}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Core Capabilities */}
      {capabilities && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Core Capabilities (MVP):</p>
          <ul className="space-y-2">
            {capabilities.map((capability, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{capability}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Explicit Statuses */}
      {statuses && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Explicit Statuses (Must Exist):</p>
          <div className="grid md:grid-cols-2 gap-2">
            {statuses.map((status, idx) => (
              <div key={idx} className="bg-slate-900/50 border border-white/10 rounded px-3 py-2 text-sm text-slate-300">
                {status}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changes */}
      {changes && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Changes:</p>
          <ul className="space-y-2">
            {changes.map((change, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Process */}
      {process && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Process:</p>
          <div className="space-y-2">
            {process.map((step, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500 text-white text-xs flex items-center justify-center font-bold">
                  {idx + 1}
                </div>
                <span className="text-slate-300 mt-0.5">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Enhancements */}
      {enhancements && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">Optional Enhancements:</p>
          <ul className="space-y-2">
            {enhancements.map((enhancement, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{enhancement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What's Measured */}
      {measured && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-white mb-3">What's Measured:</p>
          <ul className="space-y-2">
            {measured.map((metric, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                <span>{metric}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Owners */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-white mb-3">Owner:</p>
        <div className="space-y-2">
          {owners.map((owner, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-white font-semibold">{owner.name}:</span>
              <span className="text-slate-300">{owner.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Exit Criteria */}
      {exitCriteria && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-400 mb-3">Exit Criteria:</p>
          <ul className="space-y-2">
            {exitCriteria.map((criteria, idx) => (
              <li key={idx} className="flex items-start gap-2 text-green-300">
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                <span>{criteria}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
