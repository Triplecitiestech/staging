import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Shield, AlertCircle } from 'lucide-react'

export default function ComplianceMonitoringPage() {
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
                  Compliance Monitoring
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  For Kellan&apos;s Team Only – Regulatory Compliance & Inbound Routing
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
        {/* Important Notice */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-blue-400" />
            <h2 className="text-3xl font-bold text-white">Document Update</h2>
          </div>
          <div className="space-y-4 text-slate-300">
            <p className="text-lg">
              This document has been updated to reflect the current operating model.
            </p>
            <p>
              <strong className="text-white">Contractors are paid hourly only.</strong> There is no commission or sales-based compensation structure.
            </p>
            <p>
              This ensures full compliance with New York State liquor regulations and maintains the integrity of the awareness-only mission.
            </p>
          </div>
        </section>

        {/* Compliance Monitoring */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Compliance Monitoring Process</h2>

          <div className="space-y-6">
            <div className="bg-orange-500/10 border-l-4 border-orange-500 rounded px-6 py-4">
              <h3 className="text-lg font-bold text-orange-400 mb-3">Kellan&apos;s team is responsible for:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Monitoring inbound call queue:</strong> Review Salesforce daily for any inbound calls logged by the phone system
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Routing to licensed sales staff:</strong> Ensure all inbound interest is followed up by licensed Olujo sales personnel
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Auditing contractor activity:</strong> Review call transcripts and Salesforce logs to ensure contractors are not selling, quoting prices, or taking orders
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">4</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Flagging special-order situations:</strong> Identify and handle any instances where stores offered to bring in Olujo for a "customer"
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-slate-900 font-bold text-sm">5</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      <strong className="text-white">Monthly compliance review:</strong> Conduct periodic reviews to ensure zero instances of contractors answering/returning inbound calls or engaging in sales activity
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Red Flags */}
        <section className="mb-12 bg-gradient-to-br from-red-600/20 to-red-500/10 backdrop-blur-sm border-2 border-red-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <h2 className="text-3xl font-bold text-white">Compliance Red Flags</h2>
          </div>

          <div className="space-y-4">
            <p className="text-slate-300">
              If any of the following are discovered during monitoring, immediate action must be taken:
            </p>

            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
                <span className="text-slate-300">Contractor answered or returned an inbound call</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
                <span className="text-slate-300">Contractor discussed pricing, availability, or ordering</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
                <span className="text-slate-300">Contractor committed to a special order or pickup</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
                <span className="text-slate-300">Contractor attempted to influence a purchase</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-red-400 font-bold text-xl">✗</span>
                <span className="text-slate-300">Call transcript missing or incomplete</span>
              </div>
            </div>

            <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-6 mt-6">
              <p className="text-orange-200 font-semibold mb-3">
                Response to Red Flags:
              </p>
              <p className="text-slate-300">
                Any compliance violation must be addressed immediately. Depending on severity, this may result in retraining, suspension, or termination of the contractor. All violations must be documented in Salesforce.
              </p>
            </div>
          </div>
        </section>

        {/* Audit & Transparency */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-blue-400 mb-6">Audit Trail & Documentation</h2>

          <div className="space-y-4 text-slate-300">
            <p>
              All compliance monitoring must be <strong className="text-white">documented in Salesforce</strong> to ensure transparency and auditability.
            </p>
            <p>
              This includes:
            </p>
            <div className="bg-slate-900/50 rounded-lg p-6 space-y-2">
              <p>• Inbound call review logs</p>
              <p>• Compliance audit results</p>
              <p>• Contractor coaching or corrective action notes</p>
              <p>• Special-order situation handling</p>
            </div>
            <p className="mt-4">
              Salesforce serves as the <strong className="text-white">single source of truth</strong> for all compliance monitoring and inbound sales routing.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
