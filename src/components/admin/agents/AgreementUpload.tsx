'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

interface Props {
  agentId: string
  hasExisting: boolean
}

export default function AgreementUpload({ agentId, hasExisting }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = (f: File | null) => {
    setError(null)
    if (!f) { setFile(null); return }
    if (!ALLOWED.includes(f.type)) {
      setError('Only PDF and Word documents (.pdf, .doc, .docx) are allowed.')
      setFile(null)
      return
    }
    if (f.size > MAX_BYTES) {
      setError('File exceeds the 10 MB limit.')
      setFile(null)
      return
    }
    setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/sales-agents/${agentId}/agreement`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Upload failed.')
        setUploading(false)
        return
      }
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-white/10 pt-4">
      <h3 className="text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
        {hasExisting ? 'Replace agreement' : 'Upload agreement'}
      </h3>
      {error && <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={e => onPick(e.target.files?.[0] || null)}
          disabled={uploading}
          className="text-sm text-slate-200 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600 file:cursor-pointer"
        />
        <button
          type="submit"
          disabled={uploading || !file}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : hasExisting ? 'Replace' : 'Upload'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">PDF or Word, 10 MB max. Stored securely in the database (not on disk).</p>
    </form>
  )
}
