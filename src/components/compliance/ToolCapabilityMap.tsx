'use client'

import { useState, useEffect, useCallback } from 'react'

interface Tool {
  toolId: string
  name: string
  vendor: string
  category: string
  integrationStatus: string
  connectorType: string | null
  description: string
  capabilityCount: number
  capabilities: Array<{
    capabilityId: string
    confidence: string
    dataDescription: string
  }>
}

interface Capability {
  id: string
  name: string
  category: string
  description: string
}

interface GapAnalysis {
  totalControls: number
  fullyAutomatable: number
  partiallyAutomatable: number
  manualOnly: number
  gaps: Array<{
    capabilityId: string
    capabilityName: string
    affectedControls: string[]
    bestKnownTool: string | null
  }>
}

interface Props {
  companies: Array<{ id: string; name: string }>
}

export default function ToolCapabilityMap({ companies }: Props) {
  const [tools, setTools] = useState<Tool[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null)
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedFramework, setSelectedFramework] = useState('cis-v8-ig1')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'tools' | 'matrix' | 'gaps'>('tools')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedCompany) params.set('companyId', selectedCompany)
      if (selectedFramework) params.set('frameworkId', selectedFramework)

      const res = await fetch(`/api/compliance/registry?${params}`)
      const json = await res.json()
      if (json.success) {
        setTools(json.data.tools)
        setCapabilities(json.data.capabilities)
        setGapAnalysis(json.data.gapAnalysis)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [selectedCompany, selectedFramework])

  useEffect(() => { loadData() }, [loadData])

  const integratedTools = tools.filter((t) => t.integrationStatus === 'integrated')
  const knownTools = tools.filter((t) => t.integrationStatus !== 'integrated')

  const statusColors: Record<string, string> = {
    integrated: 'bg-green-500/20 text-green-300 border-green-500/30',
    planned: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    known: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  const statusLabels: Record<string, string> = {
    integrated: 'Integrated', planned: 'Planned', known: 'Not Integrated',
  }
  const confidenceColors: Record<string, string> = {
    authoritative: 'bg-green-500/30 text-green-300',
    supplementary: 'bg-cyan-500/30 text-cyan-300',
    indirect: 'bg-slate-500/30 text-slate-400',
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
          className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
          <option value="">All companies (no gap analysis)</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedFramework} onChange={(e) => setSelectedFramework(e.target.value)}
          className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
          <option value="cis-v8-ig1">CIS v8 — IG1</option>
          <option value="cis-v8-ig2">CIS v8 — IG2</option>
          <option value="cis-v8-ig3">CIS v8 — IG3</option>
        </select>
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
          {(['tools', 'matrix', 'gaps'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${view === v ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
              {v === 'tools' ? 'Tools' : v === 'matrix' ? 'Capability Matrix' : 'Gap Analysis'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : (
        <>
          {/* Gap Analysis Summary (if company selected) */}
          {gapAnalysis && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Fully Automatable" value={gapAnalysis.fullyAutomatable} total={gapAnalysis.totalControls} color="text-green-400" />
              <StatCard label="Partially Automatable" value={gapAnalysis.partiallyAutomatable} total={gapAnalysis.totalControls} color="text-cyan-400" />
              <StatCard label="Manual Only" value={gapAnalysis.manualOnly} total={gapAnalysis.totalControls} color="text-slate-400" />
              <StatCard label="Total Controls" value={gapAnalysis.totalControls} total={gapAnalysis.totalControls} color="text-white" />
            </div>
          )}

          {/* Tool Grid View */}
          {view === 'tools' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">Integrated Tools ({integratedTools.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {integratedTools.map((tool) => <ToolCard key={tool.toolId} tool={tool} statusColors={statusColors} statusLabels={statusLabels} confidenceColors={confidenceColors} />)}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Known Tools — Not Yet Integrated ({knownTools.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {knownTools.map((tool) => <ToolCard key={tool.toolId} tool={tool} statusColors={statusColors} statusLabels={statusLabels} confidenceColors={confidenceColors} />)}
                </div>
              </div>
            </div>
          )}

          {/* Capability Matrix View */}
          {view === 'matrix' && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium sticky left-0 bg-slate-900/90 z-10 min-w-[200px]">Capability</th>
                    {tools.map((t) => (
                      <th key={t.toolId} className="px-2 py-2 text-slate-400 font-medium text-center whitespace-nowrap">
                        <div className="truncate max-w-[80px]" title={t.name}>{t.name.split(' ')[0]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {capabilities.map((cap) => (
                    <tr key={cap.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-slate-300 sticky left-0 bg-slate-800/90 z-10">
                        <span title={cap.description}>{cap.name}</span>
                      </td>
                      {tools.map((tool) => {
                        const tc = tool.capabilities.find((c) => c.capabilityId === cap.id)
                        return (
                          <td key={tool.toolId} className="px-2 py-2 text-center">
                            {tc ? (
                              <span className={`inline-block w-6 h-6 rounded text-[10px] font-bold leading-6 ${confidenceColors[tc.confidence]}`}
                                title={`${tc.confidence}: ${tc.dataDescription}`}>
                                {tc.confidence === 'authoritative' ? 'A' : tc.confidence === 'supplementary' ? 'S' : 'I'}
                              </span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t border-white/5 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-500/30 inline-block text-center text-[9px] font-bold text-green-300 leading-4">A</span> Authoritative</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-cyan-500/30 inline-block text-center text-[9px] font-bold text-cyan-300 leading-4">S</span> Supplementary</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-slate-500/30 inline-block text-center text-[9px] font-bold text-slate-400 leading-4">I</span> Indirect</span>
              </div>
            </div>
          )}

          {/* Gap Analysis View */}
          {view === 'gaps' && (
            <div className="space-y-4">
              {!gapAnalysis ? (
                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-8 text-center">
                  <p className="text-slate-400">Select a company above to see gap analysis</p>
                </div>
              ) : gapAnalysis.gaps.length === 0 ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
                  <p className="text-green-300 font-medium">No capability gaps detected</p>
                  <p className="text-green-400/70 text-sm mt-1">All controls have at least one integrated tool providing evidence</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-400">{gapAnalysis.gaps.length} capability gaps affecting {gapAnalysis.manualOnly + gapAnalysis.partiallyAutomatable} controls</p>
                  {gapAnalysis.gaps.map((gap) => (
                    <div key={gap.capabilityId} className="bg-slate-800/50 border border-white/10 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{gap.capabilityName}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Affects {gap.affectedControls.length} control{gap.affectedControls.length !== 1 ? 's' : ''}:
                            <span className="text-slate-300 ml-1">{gap.affectedControls.map((c) => c.replace('cis-v8-', '')).join(', ')}</span>
                          </p>
                        </div>
                        {gap.bestKnownTool && (
                          <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded whitespace-nowrap">
                            Deploy: {gap.bestKnownTool}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ToolCard({ tool, statusColors, statusLabels, confidenceColors }: {
  tool: Tool
  statusColors: Record<string, string>
  statusLabels: Record<string, string>
  confidenceColors: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{tool.name}</h3>
          <p className="text-xs text-slate-500">{tool.vendor} — {tool.category}</p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[tool.integrationStatus]}`}>
          {statusLabels[tool.integrationStatus]}
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-3">{tool.description}</p>
      <button onClick={() => setExpanded(!expanded)} className="text-xs text-cyan-400 hover:text-cyan-300">
        {tool.capabilityCount} capabilities {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {tool.capabilities.map((cap) => (
            <div key={cap.capabilityId} className="flex items-center gap-2">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${confidenceColors[cap.confidence]}`}>
                {cap.confidence === 'authoritative' ? 'AUTH' : cap.confidence === 'supplementary' ? 'SUPP' : 'IND'}
              </span>
              <span className="text-xs text-slate-300">{cap.capabilityId.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label} ({pct}%)</p>
    </div>
  )
}
