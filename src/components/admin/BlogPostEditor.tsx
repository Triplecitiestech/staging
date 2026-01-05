'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  status: string
  metaTitle: string | null
  metaDescription: string | null
  keywords: string[]
  views: number
  publishedAt: string | null
  scheduledFor?: string | null
  sentForApproval?: string | null
  approvedAt?: string | null
  createdAt?: string
  updatedAt?: string
  category: {
    id: string
    name: string
  } | null
  tags?: Array<{
    id: string
    name: string
    slug: string
  }>
  author?: {
    id: string
    name: string
    email: string
  } | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function BlogPostEditor({ post: initialPost }: { post: BlogPost }) {
  const [post, setPost] = useState(initialPost)
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [aiInput, setAiInput] = useState('')
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/blog/posts/${post.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          keywords: post.keywords
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      alert('Blog post saved successfully!')
      router.refresh()
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save blog post. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!confirm('Are you sure you want to publish this post?')) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/blog/posts/${post.id}/publish`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to publish')
      }

      alert('Blog post published successfully!')
      router.refresh()
    } catch (error) {
      console.error('Error publishing:', error)
      alert('Failed to publish blog post. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAiMessage = async () => {
    if (!aiInput.trim()) return

    const userMessage: Message = {
      role: 'user',
      content: aiInput
    }

    setMessages(prev => [...prev, userMessage])
    setAiInput('')
    setIsAiThinking(true)

    try {
      const response = await fetch('/api/blog/ai-editor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          post,
          messages: [...messages, userMessage]
        })
      })

      if (!response.ok) {
        throw new Error('AI request failed')
      }

      const data = await response.json()

      // Add AI response to messages
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message
      }])

      // If AI made changes to the post, update it
      if (data.updatedPost) {
        setPost(prev => ({
          ...prev,
          ...data.updatedPost
        }))
      }
    } catch (error) {
      console.error('AI error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }])
    } finally {
      setIsAiThinking(false)
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/blog" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
            ← Back to Blog Management
          </Link>
          <h2 className="text-3xl font-bold text-white">Edit Blog Post</h2>
          <p className="text-slate-400 mt-1">Status: <span className="text-cyan-400">{post.status}</span></p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAiPanel(!showAiPanel)}
            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-lg font-medium transition-colors"
          >
            {showAiPanel ? '🤖 Hide AI' : '🤖 Show AI'}
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            {showPreview ? '✏️ Edit' : '👁️ Preview'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : '💾 Save'}
          </button>
          {post.status !== 'PUBLISHED' && (
            <button
              onClick={handlePublish}
              disabled={isSaving}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🚀 Publish
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Editor */}
        <div className={`${showAiPanel ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
          {showPreview ? (
            /* Preview Mode */
            <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-8">
              <h1 className="text-4xl font-bold text-white mb-4">{post.title}</h1>
              <p className="text-xl text-cyan-300 italic mb-6 pb-6 border-b border-gray-700">{post.excerpt}</p>
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown
                  components={{
                    h2: (props) => <h2 className="text-3xl font-bold mt-8 mb-4 text-white" {...props} />,
                    h3: (props) => <h3 className="text-2xl font-bold mt-6 mb-3 text-white" {...props} />,
                    p: (props) => <p className="mb-6 text-gray-300 leading-relaxed text-lg" {...props} />,
                    ul: (props) => <ul className="list-disc list-inside mb-6 space-y-2 ml-4" {...props} />,
                    ol: (props) => <ol className="list-decimal list-inside mb-6 space-y-2 ml-4" {...props} />,
                    li: (props) => <li className="text-gray-300 text-lg" {...props} />,
                    strong: (props) => <strong className="font-bold text-white" {...props} />,
                  }}
                >
                  {post.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            /* Edit Mode */
            <>
              {/* Title */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Title</label>
                <input
                  type="text"
                  value={post.title}
                  onChange={(e) => setPost({ ...post, title: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white text-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Excerpt */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Excerpt</label>
                <textarea
                  value={post.excerpt}
                  onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>

              {/* Content */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Content (Markdown)</label>
                <textarea
                  value={post.content}
                  onChange={(e) => setPost({ ...post, content: e.target.value })}
                  rows={20}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>

              {/* SEO Metadata */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">SEO Metadata</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Meta Title</label>
                    <input
                      type="text"
                      value={post.metaTitle || ''}
                      onChange={(e) => setPost({ ...post, metaTitle: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Meta Description</label>
                    <textarea
                      value={post.metaDescription || ''}
                      onChange={(e) => setPost({ ...post, metaDescription: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={post.keywords.join(', ')}
                      onChange={(e) => setPost({ ...post, keywords: e.target.value.split(',').map(k => k.trim()) })}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* AI Assistant Panel */}
        {showAiPanel && (
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-lg overflow-hidden sticky top-24">
              <div className="p-4 border-b border-purple-500/30">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>🤖</span>
                  AI Writing Companion
                </h3>
                <p className="text-xs text-purple-300 mt-1">Ask me to help edit your blog post</p>
              </div>

              {/* Chat Messages */}
              <div className="p-4 h-96 overflow-y-auto space-y-4">
                {messages.length === 0 && (
                  <div className="text-sm text-slate-400 italic">
                    <p className="mb-2">💡 Try asking me:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>"Make the introduction more engaging"</li>
                      <li>"Add a section about cloud security"</li>
                      <li>"Improve the SEO keywords"</li>
                      <li>"Make it shorter and more concise"</li>
                    </ul>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-100'
                        : 'bg-purple-500/20 border border-purple-500/30 text-purple-100'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {isAiThinking && (
                  <div className="text-left">
                    <div className="inline-block bg-purple-500/20 border border-purple-500/30 text-purple-100 rounded-lg p-3">
                      <p className="text-sm">Thinking...</p>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-purple-500/30">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAiMessage()}
                    placeholder="Ask me to edit something..."
                    disabled={isAiThinking}
                    className="flex-1 px-3 py-2 bg-slate-900/50 border border-purple-500/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  />
                  <button
                    onClick={handleAiMessage}
                    disabled={isAiThinking || !aiInput.trim()}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
