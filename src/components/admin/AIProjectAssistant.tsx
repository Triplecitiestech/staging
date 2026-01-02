'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Sparkles, Copy, CheckCircle } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AIProjectAssistantProps {
  projectContext?: {
    projectName?: string
    companyName?: string
    description?: string
  }
  projectId?: string
  onInsertStructure?: (structure: unknown) => void
}

const STORAGE_KEY_PREFIX = 'ai-chat-messages-'

export default function AIProjectAssistant({
  projectContext,
  projectId,
  onInsertStructure
}: AIProjectAssistantProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${projectId || 'new'}`

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI project assistant. I can help you:\n\n• Generate project phases and tasks\n• Structure timelines\n• Suggest milestones\n• Create detailed task lists\n\nJust describe what kind of project you\'re building, and I\'ll help structure it!'
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [insertSuccess, setInsertSuccess] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load messages from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      } catch (e) {
        console.error('Failed to parse stored messages:', e)
      }
    }
  }, [storageKey])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(messages))
  }, [messages, storageKey])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          projectContext
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const extractJSON = (content: string): object | null => {
    try {
      // Try to find JSON in code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }

      // Try to find raw JSON
      const jsonStart = content.indexOf('{')
      const jsonEnd = content.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = content.substring(jsonStart, jsonEnd + 1)
        return JSON.parse(jsonStr)
      }
    } catch {
      return null
    }
    return null
  }

  const handleInsertStructure = async (json: object) => {
    if (onInsertStructure) {
      onInsertStructure(json)
      setInsertSuccess(true)
      setTimeout(() => setInsertSuccess(false), 3000)
    } else if (projectId) {
      // If we have a projectId, directly create phases and tasks
      try {
        const structure = json as { phases?: Array<{
          name: string
          description?: string
          orderIndex: number
          tasks?: Array<{
            taskText: string
            completed: boolean
            orderIndex: number
            notes?: string
          }>
        }> }

        if (!structure.phases || !Array.isArray(structure.phases)) {
          throw new Error('Invalid structure: phases array not found')
        }

        // Create phases sequentially to maintain order
        for (const phase of structure.phases) {
          const phaseResponse = await fetch(`/api/projects/${projectId}/phases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: phase.name,
              description: phase.description || '',
              orderIndex: phase.orderIndex,
            }),
          })

          if (!phaseResponse.ok) {
            throw new Error(`Failed to create phase: ${phase.name}`)
          }

          const createdPhase = await phaseResponse.json()

          // Create tasks for this phase if any
          if (phase.tasks && Array.isArray(phase.tasks)) {
            for (const task of phase.tasks) {
              const taskResponse = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phaseId: createdPhase.id,
                  taskText: task.taskText,
                  completed: task.completed || false,
                  orderIndex: task.orderIndex,
                  notes: task.notes || '',
                }),
              })

              if (!taskResponse.ok) {
                throw new Error(`Failed to create task: ${task.taskText}`)
              }
            }
          }
        }

        setInsertSuccess(true)
        setTimeout(() => {
          setInsertSuccess(false)
          // Reload the page to show the new phases
          window.location.reload()
        }, 1500)

      } catch (error) {
        console.error('Error inserting structure:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Failed to insert structure: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or create phases manually.`
        }])
      }
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-40 w-14 h-14 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center group"
        aria-label="Open AI Assistant"
      >
        <Sparkles size={24} className="group-hover:scale-110 transition-transform" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 w-96 h-[600px] bg-slate-900 rounded-2xl shadow-2xl border border-purple-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles size={20} className="text-white" />
          <h3 className="text-white font-bold">AI Project Assistant</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white/80 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex items-center space-x-2 mb-2">
                  <MessageCircle size={16} className="text-purple-400" />
                  <span className="text-xs text-purple-400 font-semibold">AI Assistant</span>
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>

              {/* Action buttons for assistant messages */}
              {message.role === 'assistant' && (
                <div className="mt-2 flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(message.content, index)}
                    className="text-xs text-slate-400 hover:text-purple-400 flex items-center space-x-1 transition-colors"
                  >
                    {copiedIndex === index ? (
                      <>
                        <CheckCircle size={12} />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {extractJSON(message.content) && (onInsertStructure || projectId) && (
                    <button
                      onClick={() => {
                        const json = extractJSON(message.content)
                        if (json) handleInsertStructure(json)
                      }}
                      disabled={isLoading || insertSuccess}
                      className="text-xs text-purple-400 hover:text-purple-300 disabled:text-green-400 flex items-center space-x-1 transition-colors"
                    >
                      {insertSuccess ? (
                        <>
                          <CheckCircle size={12} />
                          <span>Inserted!</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} />
                          <span>{projectId ? 'Create Phases' : 'Insert into Form'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about your project..."
            className="flex-1 bg-slate-800 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
