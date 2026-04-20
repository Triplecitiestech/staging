'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

interface Existing {
  contentText: string | null
  originalFilename: string | null
  fileSize: number | null
  uploadedAt: string
  uploadedByAdminEmail: string
  signedName: string | null
  signedAt: string | null
}

interface Props {
  agentId: string
  existing: Existing | null
}

type Tab = 'text' | 'upload'

export default function AgreementEditor({ agentId, existing }: Props) {
  const router = useRouter()
  const initialTab: Tab = existing?.originalFilename && !existing.contentText ? 'upload' : 'text'
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div>
      {existing && (
        <ExistingSummary existing={existing} agentId={agentId} />
      )}

      <div className="flex items-center gap-1 border-b border-white/10 mb-4">
        <TabButton active={tab === 'text'} onClick={() => setTab('text')}>Write agreement text</TabButton>
        <TabButton active={tab === 'upload'} onClick={() => setTab('upload')}>Upload file</TabButton>
      </div>

      {tab === 'text' ? (
        <TextEditor
          agentId={agentId}
          initialText={existing?.contentText || ''}
          hasSignature={!!existing?.signedAt}
          onChanged={() => router.refresh()}
        />
      ) : (
        <FileUploader agentId={agentId} hasExisting={!!existing?.originalFilename} onChanged={() => router.refresh()} />
      )}
    </div>
  )
}

function ExistingSummary({ existing, agentId }: { existing: Existing; agentId: string }) {
  const hasText = !!existing.contentText
  const hasFile = !!existing.originalFilename
  return (
    <div className="mb-4 text-sm text-slate-200 bg-slate-900/40 border border-white/5 rounded-lg p-4">
      {hasText && (
        <div>
          <div className="font-medium text-white">Text agreement on file</div>
          <div className="text-xs text-slate-400 mt-1">
            Last saved {new Date(existing.uploadedAt).toLocaleString()} by {existing.uploadedByAdminEmail}
          </div>
          {existing.signedName && existing.signedAt ? (
            <div className="text-xs text-emerald-300 mt-1">
              E-signed by {existing.signedName} on {new Date(existing.signedAt).toLocaleString()}
            </div>
          ) : (
            <div className="text-xs text-violet-300 mt-1">Awaiting agent signature</div>
          )}
        </div>
      )}
      {hasFile && (
        <div className={hasText ? 'mt-3 pt-3 border-t border-white/10' : ''}>
          <div className="font-medium text-white">
            {existing.originalFilename} {typeof existing.fileSize === 'number' && <span className="text-xs text-slate-400">({Math.round(existing.fileSize / 1024)} KB)</span>}
          </div>
          <a
            href={`/api/admin/sales-agents/${agentId}/agreement`}
            className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-white rounded-md text-xs transition-colors"
          >
            Download uploaded file
          </a>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active ? 'text-white border-cyan-400' : 'text-slate-400 border-transparent hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function TextEditor({
  agentId,
  initialText,
  hasSignature,
  onChanged,
}: {
  agentId: string
  initialText: string
  hasSignature: boolean
  onChanged: () => void
}) {
  const [text, setText] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const changedFromInitial = text !== initialText

  const save = async () => {
    if (!text.trim()) { setError('Agreement text cannot be empty.'); return }
    if (hasSignature && !changedFromInitial) { return }
    if (hasSignature && changedFromInitial) {
      const ok = confirm(
        'This agent has already e-signed the current agreement. Saving new text will clear the signature and require them to re-sign. Continue?'
      )
      if (!ok) return
    }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/admin/sales-agents/${agentId}/agreement/text`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentText: text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save agreement text.')
      } else {
        setSuccess(data.signatureInvalidated ? 'Saved. Prior signature was cleared.' : 'Agreement text saved.')
        onChanged()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-sm text-emerald-300">{success}</div>}
      <p className="text-xs text-slate-400 mb-2">
        Paste the agreement body below. The agent will review it in their portal and electronically sign by typing
        their full legal name. Plain text is fine — blank lines preserve paragraphs.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={16}
        disabled={saving}
        placeholder={'Paste or write the full agreement text here.\n\nExample:\n\nThis Referral Agent Agreement ("Agreement") is entered into as of the date of e-signature below between Triple Cities Tech and the undersigned referral partner...'}
        className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-slate-100 placeholder-slate-500 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !text.trim() || !changedFromInitial}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : initialText ? 'Save changes' : 'Save agreement'}
        </button>
        {changedFromInitial && hasSignature && (
          <span className="text-xs text-amber-300 hidden">Signature will be cleared on save.</span>
        )}
      </div>
    </div>
  )
}

function FileUploader({
  agentId,
  hasExisting,
  onChanged,
}: {
  agentId: string
  hasExisting: boolean
  onChanged: () => void
}) {
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
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="text-xs text-slate-400 mb-2">
        Upload a pre-signed PDF or Word document. Use this option when the agreement was signed offline —
        the agent will just download it from their portal.
      </p>
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
      <p className="text-xs text-slate-500 mt-2">PDF or Word, 10 MB max. Stored securely in the database.</p>
    </form>
  )
}
