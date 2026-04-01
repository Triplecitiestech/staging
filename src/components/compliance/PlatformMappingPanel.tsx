'use client'

/**
 * Platform Mapping Panel — Map customers to their specific sites/orgs in each MSP platform
 *
 * Replaces fuzzy company name matching with explicit, user-confirmed mappings.
 * For each platform (Datto RMM, BCDR, Ubiquiti, etc.), the admin selects which
 * sites/orgs/devices belong to the customer from a searchable dropdown.
 */

import { useState, useEffect, useCallback } from 'react'

interface SourceItem {
  id: string
  name: string
  type: string
  detail?: string
}

interface Mapping {
  id: string
  platform: string
  externalId: string
  externalName: string
  externalType: string
  mappedBy: string | null
  mappedAt: string
}

interface PlatformMeta {
  label: string
  itemLabel: string
}

interface PlatformMappingPanelProps {
  companyId: string
  companyName: string
}

const PLATFORMS = [
  'datto_rmm',
  'datto_bcdr',
  'ubiquiti',
  'domotz',
  'it_glue',
  'dnsfilter',
  'saas_alerts',
] as const

export default function PlatformMappingPanel({ companyId, companyName }: PlatformMappingPanelProps) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [platformMeta, setPlatformMeta] = useState<Record<string, PlatformMeta>>({})
  const [loading, setLoading] = useState(true)
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  const [sourceItems, setSourceItems] = useState<Record<string, SourceItem[]>>({})
  const [loadingSources, setLoadingSources] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/compliance/platform-mappings?companyId=${companyId}`)
      const json = await res.json()
      if (json.success) {
        setMappings(json.mappings ?? [])
        setPlatformMeta(json.platforms ?? {})
      }
    } catch {
      setError('Failed to load mappings')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadMappings() }, [loadMappings])

  const loadSourceItems = async (platform: string) => {
    if (sourceItems[platform]) return // already loaded
    setLoadingSources(platform)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/platform-mappings?action=list-sources&platform=${platform}`)
      const json = await res.json()
      if (json.success) {
        setSourceItems((prev) => ({ ...prev, [platform]: json.items ?? [] }))
      } else {
        setError(json.error ?? `Failed to load ${platform} sources`)
      }
    } catch {
      setError(`Failed to connect to ${platform}`)
    } finally {
      setLoadingSources(null)
    }
  }

  const togglePlatform = (platform: string) => {
    if (expandedPlatform === platform) {
      setExpandedPlatform(null)
    } else {
      setExpandedPlatform(platform)
      loadSourceItems(platform)
      setSearchQuery('')
    }
  }

  const markNotUsed = async (platform: string) => {
    setSaving(true)
    try {
      // Remove any existing mappings for this platform
      await fetch('/api/compliance/platform-mappings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, platform }),
      })
      // Add a special "none" mapping
      await fetch('/api/compliance/platform-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          platform,
          externalId: '__none__',
          externalName: 'Not Used',
          externalType: 'none',
        }),
      })
      await loadMappings()
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addMapping = async (platform: string, item: SourceItem) => {
    setSaving(true)
    try {
      await fetch('/api/compliance/platform-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          platform,
          externalId: item.id,
          externalName: item.name,
          externalType: item.type,
        }),
      })
      await loadMappings()
    } catch {
      setError('Failed to save mapping')
    } finally {
      setSaving(false)
    }
  }

  const removeMapping = async (id: string) => {
    try {
      await fetch('/api/compliance/platform-mappings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await loadMappings()
    } catch {
      setError('Failed to remove mapping')
    }
  }

  const getMappingsForPlatform = (platform: string) => mappings.filter((m) => m.platform === platform)

  // Suggest items that match the company name
  const getSuggested = (items: SourceItem[]) => {
    const lower = companyName.toLowerCase()
    const words = lower.split(/\s+/).filter((w) => w.length > 1)
    return items.filter((item) => {
      const itemLower = item.name.toLowerCase()
      return itemLower.includes(lower) || lower.includes(itemLower)
        || words.every((w) => itemLower.includes(w))
    })
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Platform Mapping</h3>
        <p className="text-sm text-slate-400 mt-1">
          Map {companyName} to their specific sites, organizations, or accounts in each platform.
          This ensures assessments only use data from this customer.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">dismiss</button>
        </div>
      )}

      <div className="space-y-2">
        {PLATFORMS.map((platform) => {
          const meta = platformMeta[platform] ?? { label: platform, itemLabel: 'Item' }
          const platformMappings = getMappingsForPlatform(platform)
          const isExpanded = expandedPlatform === platform
          const items = sourceItems[platform] ?? []
          const isLoading = loadingSources === platform

          // Filter items for search
          const filteredItems = searchQuery
            ? items.filter((item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
                || item.id.toLowerCase().includes(searchQuery.toLowerCase())
                || (item.detail ?? '').toLowerCase().includes(searchQuery.toLowerCase())
              )
            : items

          const suggested = !searchQuery ? getSuggested(items) : []
          const alreadyMapped = new Set(platformMappings.map((m) => m.externalId))

          return (
            <div key={platform} className="bg-slate-800/50 border border-white/10 rounded-xl overflow-hidden">
              {/* Platform Header */}
              <button
                onClick={() => togglePlatform(platform)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const isNotUsed = platformMappings.some((m) => m.externalId === '__none__')
                    const hasMappings = platformMappings.length > 0 && !isNotUsed
                    return (
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isNotUsed
                          ? 'bg-slate-600/50 text-slate-500'
                          : hasMappings
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 text-slate-400'
                      }`}>
                        {isNotUsed ? '—' : hasMappings ? platformMappings.length : '?'}
                      </div>
                    )
                  })()}
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{meta.label}</p>
                    <p className="text-xs text-slate-500">
                      {platformMappings.some((m) => m.externalId === '__none__')
                        ? 'Not used by this customer'
                        : platformMappings.length > 0
                          ? `${platformMappings.length} ${meta.itemLabel.toLowerCase()}(s) mapped`
                          : `No ${meta.itemLabel.toLowerCase()} mapped — using name matching`}
                    </p>
                  </div>
                </div>
                <span className="text-slate-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* Expanded: current mappings + source picker */}
              {isExpanded && (
                <div className="border-t border-white/5 p-4 space-y-3">
                  {/* Current Mappings */}
                  {platformMappings.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Mapped {meta.itemLabel}(s)
                      </p>
                      {platformMappings.map((m) => (
                        <div key={m.id} className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-sm text-emerald-300 font-medium">{m.externalName || m.externalId}</span>
                            {m.externalName && m.externalName !== m.externalId && (
                              <span className="text-xs text-slate-500 ml-2">ID: {m.externalId}</span>
                            )}
                          </div>
                          <button
                            onClick={() => removeMapping(m.id)}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Not Used button */}
                  {!platformMappings.some((m) => m.externalId === '__none__') && (
                    <button
                      onClick={() => markNotUsed(platform)}
                      disabled={saving}
                      className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg border border-dashed border-white/10 transition-colors disabled:opacity-50"
                    >
                      Customer does not use {meta.label} — mark as not used
                    </button>
                  )}

                  {/* Webhook setup for SaaS Alerts */}
                  {platform === 'saas_alerts' && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-blue-300">Webhook Setup Required</p>
                      <p className="text-xs text-slate-400">
                        SaaS Alerts uses webhooks to push event data (their API is behind Cloudflare).
                        Configure in <span className="text-cyan-400">manage.saasalerts.com</span>:
                      </p>
                      <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                        <li>Go to Settings &rarr; API &rarr; Webhook API</li>
                        <li>Click &ldquo;+ Add new domain&rdquo;</li>
                        <li>Add domain: <code className="text-cyan-400 bg-slate-800 px-1 rounded">www.triplecitiestech.com</code></li>
                        <li>Set webhook URL: <code className="text-cyan-400 bg-slate-800 px-1 rounded text-[10px]">https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts</code></li>
                      </ol>
                      <p className="text-xs text-slate-500">
                        Once configured, events flow automatically. No customer mapping needed — events are MSP-wide.
                      </p>
                    </div>
                  )}

                  {/* Source Item Picker (skip for webhook-based platforms) */}
                  {platform === 'saas_alerts' ? null : isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-cyan-400 py-4 justify-center">
                      <div className="animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full" />
                      Loading {meta.itemLabel.toLowerCase()}s from {meta.label}...
                    </div>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2 text-center">
                      No {meta.itemLabel.toLowerCase()}s found in {meta.label}. Check API credentials.
                    </p>
                  ) : (
                    <>
                      {/* Search */}
                      <div>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={`Search ${items.length} ${meta.itemLabel.toLowerCase()}(s)...`}
                          className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </div>

                      {/* Suggestions */}
                      {suggested.length > 0 && !searchQuery && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-cyan-400">
                            Suggested matches for &ldquo;{companyName}&rdquo;
                          </p>
                          {suggested.filter((s) => !alreadyMapped.has(s.id)).map((item) => (
                            <SourceItemRow
                              key={item.id}
                              item={item}
                              isSuggested
                              isMapped={false}
                              saving={saving}
                              onAdd={() => addMapping(platform, item)}
                            />
                          ))}
                        </div>
                      )}

                      {/* All Items / Search Results */}
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          {searchQuery ? `Results (${filteredItems.length})` : `All ${meta.itemLabel}s (${items.length})`}
                        </p>
                        {filteredItems.slice(0, 50).map((item) => (
                          <SourceItemRow
                            key={item.id}
                            item={item}
                            isSuggested={false}
                            isMapped={alreadyMapped.has(item.id)}
                            saving={saving}
                            onAdd={() => addMapping(platform, item)}
                          />
                        ))}
                        {filteredItems.length > 50 && (
                          <p className="text-xs text-slate-500 text-center py-1">
                            Showing 50 of {filteredItems.length} — use search to narrow
                          </p>
                        )}
                        {filteredItems.length === 0 && searchQuery && (
                          <p className="text-xs text-slate-500 text-center py-2">
                            No matches for &ldquo;{searchQuery}&rdquo;
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourceItemRow({ item, isSuggested, isMapped, saving, onAdd }: {
  item: SourceItem
  isSuggested: boolean
  isMapped: boolean
  saving: boolean
  onAdd: () => void
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
      isMapped
        ? 'bg-emerald-500/5 border border-emerald-500/10'
        : isSuggested
          ? 'bg-cyan-500/5 border border-cyan-500/10'
          : 'bg-slate-900/30 hover:bg-slate-900/50'
    }`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${isMapped ? 'text-emerald-300' : 'text-slate-300'}`}>
          {item.name}
        </p>
        {item.detail && (
          <p className="text-xs text-slate-500 truncate">{item.detail}</p>
        )}
      </div>
      {isMapped ? (
        <span className="text-xs text-emerald-500 flex-shrink-0 ml-2">Mapped</span>
      ) : (
        <button
          onClick={onAdd}
          disabled={saving}
          className="text-xs px-2.5 py-1 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/30 disabled:opacity-50 flex-shrink-0 ml-2"
        >
          {isSuggested ? 'Add' : 'Map'}
        </button>
      )}
    </div>
  )
}
