import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Database, AlertCircle, CheckCircle2, FileText } from 'lucide-react'

export default function CRMHandlingPage() {
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
                  CRM Handling SOP
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate">
                  Lead Management &amp; Data Integrity Standards
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
        {/* Required Lead Statuses */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Required Lead Statuses</h2>
          </div>
          <p className="text-slate-300 mb-6">
            Every lead must be assigned one of the following statuses in Salesforce after every interaction. Do not create custom statuses. Do not leave leads unlabeled.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Status list */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <h3 className="font-bold text-blue-400">Call Attempted – No Answer</h3>
              </div>
              <p className="text-sm text-slate-400">Contractor called, no one picked up</p>
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-indigo-400"></div>
                <h3 className="font-bold text-indigo-400">Call Connected – Store Does Not Carry</h3>
              </div>
              <p className="text-sm text-slate-400">Store answered, said they do not carry Olujo</p>
            </div>

            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                <h3 className="font-bold text-purple-400">Call Connected – Store Does Carry</h3>
              </div>
              <p className="text-sm text-slate-400">Store confirmed they carry Olujo</p>
            </div>

            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                <h3 className="font-bold text-cyan-400">Call Connected – Awareness Confirmed</h3>
              </div>
              <p className="text-sm text-slate-400">Store does not carry it, but has heard of it</p>
            </div>

            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <h3 className="font-bold text-green-400">Instagram Message Sent</h3>
              </div>
              <p className="text-sm text-slate-400">Contractor sent an Instagram DM to the store</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <h3 className="font-bold text-blue-400">Instagram Response Received</h3>
              </div>
              <p className="text-sm text-slate-400">Store replied to the Instagram message</p>
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-indigo-400"></div>
                <h3 className="font-bold text-indigo-400">Instagram – No Response (7 Days)</h3>
              </div>
              <p className="text-sm text-slate-400">No reply after 7 days</p>
            </div>

            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                <h3 className="font-bold text-purple-400">Follow-Up Required</h3>
              </div>
              <p className="text-sm text-slate-400">Store showed interest; needs another touch</p>
            </div>

            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                <h3 className="font-bold text-cyan-400">Opted Out / Do Not Contact</h3>
              </div>
              <p className="text-sm text-slate-400">Store asked not to be contacted again</p>
            </div>

            <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                <h3 className="font-bold text-orange-400">Inbound Interest – Needs Sales Follow-Up</h3>
              </div>
              <p className="text-sm text-slate-400">Store expressed interest in ordering; must be routed to licensed sales staff</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <h3 className="font-bold text-blue-400">Closed – No Interest</h3>
              </div>
              <p className="text-sm text-slate-400">Store definitively not interested; no further outreach</p>
            </div>
          </div>
        </section>

        {/* Call Logging Rules */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-8 h-8 text-cyan-400" />
            <h2 className="text-3xl font-bold text-white">Call Logging Rules</h2>
          </div>

          <div className="space-y-6">
            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
              <h3 className="text-lg font-bold text-cyan-400 mb-3">After every call, the contractor must:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Upload or paste the call transcript into Salesforce</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Update the lead status to one of the approved statuses</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Log the date and time of the call</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Note who they spoke to (owner / employee / unknown)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-cyan-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Tag themselves as the assigned rep</span>
                </div>
              </div>
            </div>

            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-red-400 mb-2">Critical Rule</h3>
                  <p className="text-red-300 font-semibold">No transcript = no credit.</p>
                  <p className="text-slate-300 mt-2">
                    If a contractor does not upload a transcript, the interaction did not happen. All outreach must be documented in Salesforce for auditability and compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Activity Logging Rules */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Social Activity Logging Rules</h2>

          <div className="space-y-6">
            <div className="bg-purple-500/10 border-l-4 border-purple-500 rounded px-6 py-4">
              <h3 className="text-lg font-bold text-purple-400 mb-3">For every Instagram or Facebook message sent, the contractor must:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Log the message content in the Salesforce timeline</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Update the lead status to "Instagram Message Sent" or appropriate status</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-purple-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Tag themselves as the assigned rep</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border-l-4 border-blue-500 rounded px-6 py-4">
              <h3 className="text-lg font-bold text-blue-400 mb-3">For every Instagram or Facebook response received, the contractor must:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Log the response content in the Salesforce timeline</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Update the lead status to "Instagram Response Received" or appropriate status</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-blue-400 flex-shrink-0 mt-1" />
                  <span className="text-slate-300">Log a brief summary of the response content</span>
                </div>
              </div>
            </div>

            <div className="bg-indigo-900/30 border border-indigo-500/50 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-indigo-400 mb-2">No Exceptions</h3>
                  <p className="text-slate-300">
                    Every social media interaction must be logged in Salesforce. If there is no logged interaction in Salesforce, the interaction did not happen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline Rules */}
        <section className="mb-12 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          <h2 className="text-3xl font-bold text-white mb-6">Timeline Rules</h2>

          <div className="space-y-4">
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-6">
              <h3 className="text-lg font-bold text-indigo-400 mb-3">Every timeline entry must include:</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Date and time of the interaction</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Type of interaction (call / Instagram / other)</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Outcome (carried / not carried / aware / not aware)</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Who was contacted (owner / employee / unknown)</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                  <span className="text-slate-300">Contractor name (alias)</span>
                </div>
              </div>
            </div>

            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-6 py-4">
              <p className="text-slate-300">
                <strong className="text-white">Best practice:</strong> Contractors should log their activity <em>immediately</em> after the interaction. Batch-logging at the end of a shift creates errors and missing data.
              </p>
            </div>
          </div>
        </section>

        {/* Contractor Scope Note */}
        <section className="mb-12 bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-blue-400" />
            <h2 className="text-3xl font-bold text-white">Important: Contractor Scope</h2>
          </div>

          <div className="space-y-4 text-slate-300">
            <p className="text-lg">
              <strong className="text-white">Contractors are awareness-only representatives. They are paid hourly only.</strong>
            </p>
            <p>
              Contractors do not sell. Contractors do not discuss pricing, availability, or ordering. Contractors do not answer or return inbound calls.
            </p>
            <p>
              Any inbound interest must be flagged in Salesforce as "Inbound Interest – Needs Sales Follow-Up" and routed to licensed Olujo sales staff.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
