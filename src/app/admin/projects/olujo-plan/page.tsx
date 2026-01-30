import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, Users, Target, Database, Megaphone, TrendingUp, DollarSign, Zap, FileText } from 'lucide-react'

export default function OlujoPlanPage() {
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
                  Olujo Brand Awareness Outreach Engine
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Phase-by-Phase Project Plan
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
                href="/admin/projects"
                className="px-3 py-2 sm:px-4 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2 text-sm sm:text-base whitespace-nowrap"
              >
                <ArrowLeft size={16} className="flex-shrink-0" />
                <span className="hidden sm:inline">Back to Projects</span>
                <span className="sm:hidden">Back</span>
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
              <h3 className="text-xl font-bold text-cyan-400 mb-2">Adam — Executive Owner</h3>
              <p className="text-sm text-slate-400 mb-4">(Olujo - High Level)</p>

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
                    <span>Strategic oversight and approval</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Kellan */}
            <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-2">Kellan — Operations Lead</h3>
              <p className="text-sm text-slate-400 mb-4">(Olujo - Day-to-Day)</p>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Owns:</p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Day-to-day coordination with reps</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>CRM setup, configuration, and enforcement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Lead status usage and workflow compliance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Purchase validation and commission processing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Operational reporting and QA oversight</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Kurtis */}
            <div className="bg-slate-900/50 border border-blue-500/30 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-2">Kurtis — Technical Advisor</h3>
              <p className="text-sm text-slate-400 mb-4">(Triple Cities Tech)</p>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Owns:</p>
                <ul className="space-y-1 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Advisory guidance on CRM configuration best practices</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Input on data structure, permissions, and auditability</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Recommendations for lead acquisition methods</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Operational guardrails and risk identification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Sharing proven patterns from offshore workforce systems</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-8">
          {/* Phase 1 */}
          <PhaseCard
            number={1}
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
              { name: "Adam", role: "final approval" },
              { name: "Kellan", role: "reviews + coordinates + enforces" },
              { name: "Kurtis (TCT)", role: "documents + advisory" }
            ]}
            exitCriteria={[
              "Adam signs off on scope",
              "No open 'we'll decide later' items"
            ]}
            documents={[
              { title: "Executive Summary", href: "/admin/projects/olujo-docs/executive-summary" }
            ]}
          />

          {/* Phase 2 */}
          <PhaseCard
            number={2}
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
              { name: "Kellan", role: "operational feedback" },
              { name: "Kurtis (TCT)", role: "structure + compliance framing" }
            ]}
            exitCriteria={[
              "Script can be read by any rep with no interpretation",
              "Kellan can explain the rules in one minute",
              "Adam confirms brand comfort"
            ]}
            documents={[
              { title: "Call Handling SOP", href: "/admin/projects/olujo-docs/call-handling" }
            ]}
          />

          {/* Phase 3 */}
          <PhaseCard
            number={3}
            title="Lead Acquisition & Normalization"
            subtitle=""
            icon={<Database className="w-6 h-6" />}
            color="green"
            goal="Acquire a clean, deduplicated liquor store lead dataset using cost-effective, reliable sources, prioritizing speed, legality, and data accuracy."
            outcomes={[
              "Prefer authoritative or existing data sources",
              "Normalize and clean data instead of over-engineering collection",
              "Expand methods only after pilot validation"
            ]}
            scope={[
              "Government / Regulatory Sources (e.g., NY State Liquor Authority public license datasets): Authoritative, complete coverage, legally clean, free or low-cost",
              "Existing Commercial Lead Providers: Alcohol/retail datasets, social enrichment tools, faster to market, pre-normalized",
              "Manual or Semi-Automated Enrichment: Tools to append Facebook pages and Instagram profiles after base dataset is established"
            ]}
            deliverables={[
              "Selected acquisition method documented",
              "Normalized dataset with required fields: Business name, Phone, City/State, Facebook page (if available), Instagram page (if available)",
              "CSV import format finalized",
              "Data quality spot-check process defined"
            ]}
            owners={[
              { name: "Kellan", role: "selection & validation" },
              { name: "Kurtis (TCT)", role: "advisory input only" }
            ]}
            exitCriteria={[
              "NY and FL datasets acquired and normalized",
              "No duplicate phone/address conflicts",
              "Reps can begin calling immediately"
            ]}
          />

          {/* Phase 4 */}
          <PhaseCard
            number={4}
            title="Cost Modeling & Tooling Selection"
            subtitle="REQUIRED BEFORE PILOT"
            icon={<DollarSign className="w-6 h-6" />}
            color="purple"
            goal="Identify, document, and review all operational costs associated with running the Olujo Brand Awareness Outreach Engine before pilot launch."
            outcomes={[
              "Understand monthly cost per contractor",
              "Identify fixed vs variable expenses",
              "Review contractual commitments (monthly vs annual)",
              "Model budget impact at pilot scale and growth scale"
            ]}
            scope={[
              "CRM Costs: HubSpot Starter Plan ($15/user/month monthly, $9/user/month annual) - Used for lead tracking, proof logging, attribution, and auditability",
              "Phone System: RingCentral (~$30/user/month) - Includes desktop and mobile apps, allows offshore contractors to place U.S.-based calls without international charges. Note: RingCentral commonly prefers annual commitments; month-to-month availability and pricing must be confirmed",
              "Contractor Labor: Hourly rate, expected weekly hours, pilot headcount (2-3 reps), scaled headcount (up to 10 reps)",
              "Lead Acquisition: Government/regulatory data sources (e.g., state liquor authority datasets - typically free or low-cost but requires cleanup), Commercial lead providers (per-record or subscription costs, faster access, variable quality)",
              "Other Potential Costs: Transcription tools (if used), Data enrichment tools (optional), Management or QA tooling (if required)"
            ]}
            deliverables={[
              "Documented cost assumptions by category",
              "Estimated monthly pilot cost",
              "Estimated monthly cost at scale",
              "Identification of fixed costs, per-user costs, and per-lead costs",
              "Budget discussion and acknowledgment"
            ]}
            owners={[
              { name: "Kellan", role: "cost modeling and tooling decisions" },
              { name: "Adam", role: "approval authority" },
              { name: "Kurtis (TCT)", role: "advisory input only" }
            ]}
            exitCriteria={[
              "All major costs identified and reviewed",
              "Tooling assumptions documented",
              "Budget acknowledged before pilot launch"
            ]}
          />

          {/* Phase 5 */}
          <PhaseCard
            number={5}
            title="CRM Configuration (HubSpot)"
            subtitle=""
            icon={<Database className="w-6 h-6" />}
            color="cyan"
            goal="Configure HubSpot CRM to enforce proof-first behavior and attribution. System configuration and enforcement will be handled within a commercially supported CRM platform (HubSpot)."
            capabilities={[
              "Lead list with mandatory statuses",
              "Lead detail page with full timeline",
              "Contact data fields: Business name, Phone, PoC name, Facebook page, Instagram page",
              "Notes field for rep observations",
              "Call transcript upload functionality",
              "Call log with metadata",
              "Social activity logging (FB messages/posts, IG DMs)",
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
              { name: "Kellan", role: "HubSpot setup and configuration, field and status enforcement, contractor permissions and access, day-to-day CRM operation" },
              { name: "Kurtis (TCT)", role: "advisory support and review, best-practice recommendations, validation of enforcement approach" }
            ]}
            exitCriteria={[
              "All agreed contact data points implemented",
              "Reps can complete full workflow in CRM",
              "Call transcript upload functional",
              "Proof cannot be skipped",
              "Admin can verify purchases"
            ]}
            documents={[
              { title: "CRM Handling SOP", href: "/admin/projects/olujo-docs/crm-handling" }
            ]}
          />

          {/* Phase 6 */}
          <PhaseCard
            number={6}
            title="Hiring & Onboarding Pipeline"
            subtitle=""
            icon={<Users className="w-6 h-6" />}
            color="indigo"
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
              { name: "Kellan", role: "interview coordination and onboarding execution" },
              { name: "Adam", role: "strategic veto only" },
              { name: "Kurtis (TCT)", role: "advisory input on compliance and SOP structure" }
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

          {/* Phase 7 */}
          <PhaseCard
            number={7}
            title="Pilot Launch (NY & FL)"
            subtitle=""
            icon={<Zap className="w-6 h-6" />}
            color="blue"
            goal="Validate the system with real calls and real proof in initial markets."
            scope={[
              "2–3 reps",
              "NY and FL simultaneously",
              "Awareness calls + social outreach (FB & IG)"
            ]}
            measured={[
              "Calls per rep per day",
              "Answer rate",
              "Proof compliance (transcripts uploaded)",
              "Store familiarity reactions",
              "Script comfort"
            ]}
            owners={[
              { name: "Kellan", role: "daily ops + system monitoring" },
              { name: "Kurtis (TCT)", role: "advisory oversight" },
              { name: "Adam", role: "strategic review" }
            ]}
            exitCriteria={[
              "≥95% proof compliance",
              "No selling violations",
              "CRM data clean and usable"
            ]}
          />

          {/* Phase 8 */}
          <PhaseCard
            number={8}
            title="Scale Up & Expand Markets"
            subtitle=""
            icon={<TrendingUp className="w-6 h-6" />}
            color="indigo"
            goal="Increase volume and expand to additional markets based on traction."
            changes={[
              "Hire up to 10 reps",
              "Expand to additional high-value markets",
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
              { name: "Kellan", role: "people + ops + reporting + data integrity" },
              { name: "Kurtis (TCT)", role: "advisory review" },
              { name: "Adam", role: "growth approval" }
            ]}
            exitCriteria={[
              "Consistent quality across reps",
              "Clear attribution for any purchases",
              "No operational drift"
            ]}
          />

          {/* Phase 9 */}
          <PhaseCard
            number={9}
            title="Purchase Tracking & Commission Processing"
            subtitle=""
            icon={<DollarSign className="w-6 h-6" />}
            color="purple"
            goal="Ensure commissions are fair, provable, and undisputed."
            process={[
              "Kellan's team tracks store purchases",
              "Bottle count verified",
              "CRM correlates purchase to rep outreach",
              "System attributes rep (last-touch within 30 days)",
              "Commission calculated ($25 per bottle sold)",
              "Payment processed via Gusto"
            ]}
            owners={[
              { name: "Kellan", role: "validates purchases & processes commissions + system enforcement" },
              { name: "Kurtis (TCT)", role: "advisory review" },
              { name: "Adam", role: "final approval for disputes" }
            ]}
            exitCriteria={[
              "Zero commission disputes",
              "Every commission tied to documented outreach"
            ]}
            documents={[
              { title: "Purchase Tracking SOP", href: "/admin/projects/olujo-docs/purchase-tracking" }
            ]}
          />
        </div>

        {/* Final Principle */}
        <div className="mt-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-blue-400 mb-4 text-center">Final Principle (For Adam & Kellan)</h2>
          <p className="text-white text-lg text-center mb-6">
            This project does <strong>not</strong> win by persuasion.
          </p>
          <p className="text-white text-xl font-bold text-center mb-4">It wins by:</p>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-300">Repetition</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-300">Recognition</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-300">Proof</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-300">Attribution</p>
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
