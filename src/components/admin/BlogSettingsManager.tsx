'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ContentSource {
  id: string
  name: string
  url: string
  rssFeedUrl: string
  apiEndpoint: string
  isActive: boolean
  lastFetched: string | null
  fetchFrequency: string
}

interface BlogSettingsManagerProps {
  sources: ContentSource[]
}

export default function BlogSettingsManager({ sources: initialSources }: BlogSettingsManagerProps) {
  const [sources, setSources] = useState<ContentSource[]>(initialSources)
  const [guidelines, setGuidelines] = useState('')
  const [isLoadingGuidelines, setIsLoadingGuidelines] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const [newSource, setNewSource] = useState({
    name: '',
    url: '',
    rssFeedUrl: '',
    isActive: true
  })
  const router = useRouter()

  // Load guidelines on mount
  useEffect(() => {
    loadGuidelines()
  }, [])

  const loadGuidelines = async () => {
    setIsLoadingGuidelines(true)
    try {
      const response = await fetch('/api/blog/settings/guidelines')
      if (response.ok) {
        const data = await response.json()
        setGuidelines(data.guidelines || '')
      }
    } catch (error) {
      console.error('Error loading guidelines:', error)
    } finally {
      setIsLoadingGuidelines(false)
    }
  }

  const handleSaveGuidelines = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/blog/settings/guidelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guidelines })
      })

      if (!response.ok) {
        throw new Error('Failed to save guidelines')
      }

      alert('Guidelines saved successfully!')
    } catch (error) {
      console.error('Error saving guidelines:', error)
      alert('Failed to save guidelines. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleSource = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/blog/settings/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      })

      if (!response.ok) {
        throw new Error('Failed to update source')
      }

      setSources(sources.map(s => s.id === id ? { ...s, isActive } : s))
    } catch (error) {
      console.error('Error updating source:', error)
      alert('Failed to update source. Please try again.')
    }
  }

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this content source?')) return

    try {
      const response = await fetch(`/api/blog/settings/sources/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete source')
      }

      setSources(sources.filter(s => s.id !== id))
    } catch (error) {
      console.error('Error deleting source:', error)
      alert('Failed to delete source. Please try again.')
    }
  }

  const handleAddSource = async () => {
    if (!newSource.name || !newSource.rssFeedUrl) {
      alert('Please provide at least a name and RSS feed URL')
      return
    }

    try {
      const response = await fetch('/api/blog/settings/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource)
      })

      if (!response.ok) {
        throw new Error('Failed to add source')
      }

      const data = await response.json()
      setSources([...sources, data.source])
      setNewSource({ name: '', url: '', rssFeedUrl: '', isActive: true })
      setShowAddSource(false)
      router.refresh()
    } catch (error) {
      console.error('Error adding source:', error)
      alert('Failed to add source. Please try again.')
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/blog" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Blog Management
        </Link>
        <h2 className="text-3xl font-bold text-white">Blog Settings</h2>
        <p className="text-slate-400 mt-1">Configure AI generation guidelines and content sources</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* AI Generation Guidelines */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <span>🤖</span>
                  AI Generation Guidelines
                </h3>
                <p className="text-sm text-purple-300 mt-1">
                  Define rules and guidelines for AI to follow when generating blog posts
                </p>
              </div>
              <button
                onClick={handleSaveGuidelines}
                disabled={isSaving}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : '💾 Save Guidelines'}
              </button>
            </div>

            <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-300 mb-2">
                💡 <strong>Tips:</strong> Be specific about:
              </p>
              <ul className="text-sm text-slate-400 space-y-1 ml-6 list-disc">
                <li>Tone and voice (professional, friendly, technical level)</li>
                <li>Target audience (small businesses in Central NY)</li>
                <li>Topics to focus on or avoid</li>
                <li>Formatting preferences (bullet points, examples, etc.)</li>
                <li>Word count targets and structure</li>
                <li>Calls-to-action and company mentions</li>
              </ul>
            </div>

            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Example:&#10;&#10;- Write for small business owners in Central New York who may not be technical experts&#10;- Use a professional but friendly tone&#10;- Include practical, actionable advice&#10;- Target 800-1200 words per post&#10;- Always include a call-to-action at the end mentioning Triple Cities Tech&#10;- Focus on cybersecurity, cloud services, and IT management&#10;- Avoid overly technical jargon - explain concepts in simple terms&#10;- Use real-world examples that small businesses can relate to&#10;- Never recommend specific products from competitors"
              rows={20}
              className="w-full px-4 py-3 bg-slate-900/50 border border-purple-500/30 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              disabled={isLoadingGuidelines}
            />
          </div>
        </div>

        {/* Content Sources */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <span>📡</span>
                  Content Sources (RSS Feeds)
                </h3>
                <p className="text-sm text-cyan-300 mt-1">
                  Manage RSS feeds that AI uses for inspiration
                </p>
              </div>
              <button
                onClick={() => setShowAddSource(!showAddSource)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
              >
                {showAddSource ? '✕ Cancel' : '➕ Add Source'}
              </button>
            </div>

            {/* Add Source Form */}
            {showAddSource && (
              <div className="bg-slate-900/50 border border-cyan-500/20 rounded-lg p-6 mb-6">
                <h4 className="text-lg font-semibold text-white mb-4">Add New Content Source</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Name *</label>
                    <input
                      type="text"
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                      placeholder="e.g., Krebs on Security"
                      className="w-full px-4 py-2 bg-slate-900/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Website URL</label>
                    <input
                      type="text"
                      value={newSource.url}
                      onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                      placeholder="https://example.com"
                      className="w-full px-4 py-2 bg-slate-900/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">RSS Feed URL *</label>
                    <input
                      type="text"
                      value={newSource.rssFeedUrl}
                      onChange={(e) => setNewSource({ ...newSource, rssFeedUrl: e.target.value })}
                      placeholder="https://example.com/feed"
                      className="w-full px-4 py-2 bg-slate-900/50 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newSource.isActive}
                      onChange={(e) => setNewSource({ ...newSource, isActive: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label className="text-sm text-slate-300">Active (fetch content from this source)</label>
                  </div>
                  <button
                    onClick={handleAddSource}
                    className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Add Content Source
                  </button>
                </div>
              </div>
            )}

            {/* Sources List */}
            <div className="space-y-3">
              {sources.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  No content sources configured. Click "Add Source" to get started.
                </div>
              ) : (
                sources.map((source) => (
                  <div
                    key={source.id}
                    className="bg-slate-900/50 border border-cyan-500/20 rounded-lg p-4 hover:border-cyan-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-white font-semibold">{source.name}</h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            source.isActive
                              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                              : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                          }`}>
                            {source.isActive ? '✓ Active' : '✕ Inactive'}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          {source.url && (
                            <p className="text-slate-400">
                              🌐 <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                                {source.url}
                              </a>
                            </p>
                          )}
                          <p className="text-slate-400">
                            📡 <span className="text-slate-300">{source.rssFeedUrl}</span>
                          </p>
                          {source.lastFetched && (
                            <p className="text-slate-500 text-xs">
                              Last fetched: {new Date(source.lastFetched).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleToggleSource(source.id, !source.isActive)}
                          className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
                          title={source.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {source.isActive ? '⏸️' : '▶️'}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="text-sm text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-8 bg-slate-800/50 border border-white/10 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">💡 How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
          <div>
            <h4 className="font-semibold text-cyan-400 mb-2">AI Guidelines</h4>
            <p>
              The AI reads your guidelines every time it generates a new blog post. Be as specific as possible
              about tone, style, topics, and formatting. These guidelines help ensure consistent, on-brand content.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-cyan-400 mb-2">Content Sources</h4>
            <p>
              The system fetches recent articles from these RSS feeds for inspiration. The AI doesn't copy content
              but uses it to identify trending topics and create original posts tailored to your audience.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
