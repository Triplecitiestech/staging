'use client'

import { useState } from 'react'

interface FlowStep {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  description: string
  details: string[]
}

const PIPELINE_STEPS: FlowStep[] = [
  {
    id: 'ingest',
    label: 'Ticket Ingestion',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    color: 'cyan',
    description: 'New Autotask tickets enter the queue',
    details: [
      'Cron runs every 5 minutes',
      'Reads from local tickets table (synced from Autotask every 2 hours)',
      'Skips tickets already analyzed or in closed status',
      'Manual "Run Now" also triggers this step',
    ],
  },
  {
    id: 'filter',
    label: 'Security Filter',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    color: 'slate',
    description: 'Non-security tickets are filtered out',
    details: [
      'Pattern-matches title/description for security keywords',
      'Looks for: alerts, threats, suspicious, malware, login, EDR, etc.',
      'Non-security tickets (billing, general IT) are skipped',
      'Reduces AI processing costs significantly',
    ],
  },
  {
    id: 'enrich',
    label: 'Enrich & Verify',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    color: 'violet',
    description: 'Extract IPs and verify against Datto RMM devices',
    details: [
      'Extracts IP addresses from ticket text using regex',
      'Cross-references IPs with Datto RMM device cache',
      'Checks if source device belongs to a known technician',
      'Identifies internal site IDs vs customer devices',
      'Falls back to live Datto API query on cache miss',
    ],
  },
  {
    id: 'correlate',
    label: 'Correlation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    color: 'blue',
    description: 'Group related alerts into incident clusters',
    details: [
      'Groups tickets from the same company within a time window',
      'Default correlation window: 15 minutes (configurable)',
      'Burst detection: 3+ alerts in window = likely one event',
      'Primary ticket selected as representative for each group',
      'Creates incident records for multi-ticket groups',
    ],
  },
  {
    id: 'rules',
    label: 'Rule Matching',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    color: 'rose',
    description: 'Check against suppression and escalation rules',
    details: [
      'Matches tickets against admin-defined rule patterns',
      'Agent Install Burst: auto-close bursts during installs',
      'Technician PH Login: suppress known tech VPN alerts',
      'Windows Update Noise: filter out system update alerts',
      'Rules can auto-close, escalate, or flag for review',
    ],
  },
  {
    id: 'screening',
    label: 'AI Screening',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'cyan',
    description: 'Fast AI triage with Haiku (low-cost screening)',
    details: [
      'Uses Claude Haiku for rapid first-pass analysis',
      'Classifies: false positive, suspicious, or needs deep analysis',
      'Assigns confidence score (0-1)',
      'Identifies alert source and category',
      'Extracts key indicators for further analysis',
      'Cost: ~$0.001 per ticket',
    ],
  },
  {
    id: 'deep',
    label: 'Deep Analysis',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    color: 'rose',
    description: 'Sonnet deep-dive for uncertain or complex cases',
    details: [
      'Triggers when: confidence < 70%, flagged, or 3+ correlated tickets',
      'Uses Claude Sonnet for thorough threat assessment',
      'Considers full ticket group context and device verification',
      'Produces detailed reasoning and recommended actions',
      'Skipped if Haiku screening is 95%+ confident',
    ],
  },
  {
    id: 'decide',
    label: 'Verdict & Action',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'green',
    description: 'Final verdict with confidence-based routing',
    details: [
      'Confidence >= 90%: recommend auto-close (false positive)',
      'Confidence 70-90%: flag for quick human review',
      'Confidence < 50%: investigate manually',
      'High-priority tickets always escalated regardless of AI score',
      'Safeguard: escalates when AI is uncertain',
    ],
  },
  {
    id: 'document',
    label: 'Document & Log',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'emerald',
    description: 'Add internal Autotask note and log all activity',
    details: [
      'Adds structured internal note to Autotask ticket',
      'Note includes: verdict, confidence, reasoning, related tickets',
      'Records full analysis in soc_ticket_analysis table',
      'Logs activity to soc_activity_log for audit trail',
      'Dry run mode: logs everything but skips Autotask note',
      'Notes are INTERNAL ONLY — never visible to customers',
    ],
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string; dot: string; line: string }> = {
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-400',    glow: 'shadow-cyan-500/20',    dot: 'bg-cyan-500',    line: 'bg-cyan-500/30' },
  slate:   { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-400',   glow: 'shadow-slate-500/20',   dot: 'bg-slate-500',   line: 'bg-slate-500/30' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-400',  glow: 'shadow-violet-500/20',  dot: 'bg-violet-500',  line: 'bg-violet-500/30' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-400',    glow: 'shadow-blue-500/20',    dot: 'bg-blue-500',    line: 'bg-blue-500/30' },
  orange:  { bg: 'bg-rose-500/10',  border: 'border-rose-500/30',  text: 'text-rose-400',  glow: 'shadow-rose-500/20',  dot: 'bg-rose-500',  line: 'bg-rose-500/30' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-400',    glow: 'shadow-rose-500/20',    dot: 'bg-rose-500',    line: 'bg-rose-500/30' },
  green:   { bg: 'bg-green-500/10',   border: 'border-green-500/30',   text: 'text-green-400',   glow: 'shadow-green-500/20',   dot: 'bg-green-500',   line: 'bg-green-500/30' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: 'shadow-emerald-500/20', dot: 'bg-emerald-500', line: 'bg-emerald-500/30' },
}

export default function SocFlowchart() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showFlowchart, setShowFlowchart] = useState(false)

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setShowFlowchart(!showFlowchart)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white">How the AI Analyst Works</h3>
            <p className="text-xs text-slate-400">9-stage triage pipeline from ingestion to documentation</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${showFlowchart ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showFlowchart && (
        <div className="px-4 pb-4">
          {/* Pipeline visualization */}
          <div className="relative ml-1">
            {/* Continuous vertical connector line behind all steps */}
            <div
              className="absolute left-[19px] top-[20px] w-px bg-gradient-to-b from-cyan-500/40 via-blue-500/30 to-emerald-500/40"
              style={{ height: 'calc(100% - 40px)' }}
            />

            {PIPELINE_STEPS.map((step, i) => {
              const colors = colorMap[step.color]
              const isExpanded = expanded === step.id

              return (
                <div key={step.id} className="relative">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : step.id)}
                    className={`relative w-full flex items-start gap-3 p-3 rounded-lg transition-all text-left ${
                      isExpanded ? `${colors.bg} ${colors.border} border shadow-lg ${colors.glow}` : 'hover:bg-white/5'
                    }`}
                  >
                    {/* Step icon with connector dot */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.text} relative z-10 bg-slate-900/80 backdrop-blur-sm`}>
                        {step.icon}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono ${colors.text} opacity-60`}>{String(i + 1).padStart(2, '0')}</span>
                        <h4 className={`text-sm font-medium ${isExpanded ? 'text-white' : 'text-slate-200'}`}>
                          {step.label}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>

                      {/* Expanded details */}
                      {isExpanded && (
                        <ul className="mt-3 space-y-1.5">
                          {step.details.map((detail, j) => (
                            <li key={j} className="flex items-start gap-2 text-xs text-slate-300">
                              <div className={`w-1 h-1 rounded-full ${colors.dot} mt-1.5 flex-shrink-0`} />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <svg
                      className={`w-4 h-4 text-slate-500 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>

          {/* Decision tree summary */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-400">Auto-Close</span>
                </div>
                <p className="text-[11px] text-slate-400">Confidence &gt;= 90% false positive. Recommends closure with full reasoning.</p>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-xs font-medium text-rose-400">Flag for Review</span>
                </div>
                <p className="text-[11px] text-slate-400">Confidence 50-90%. Needs quick human verification before action.</p>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-red-400">Escalate</span>
                </div>
                <p className="text-[11px] text-slate-400">High-priority, uncertain, or confirmed threat. Requires immediate human action.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
