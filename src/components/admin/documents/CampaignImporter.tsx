'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import JSZip from 'jszip'
import { Upload, Loader2, FileArchive, CheckCircle2 } from 'lucide-react'

type Status = 'idle' | 'extracting' | 'uploading' | 'done'

export default function CampaignImporter() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const busy = status === 'extracting' || status === 'uploading'

  async function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    if (!/\.zip$/i.test(file.name)) {
      setError('Please choose the Kaseya campaign .zip file.')
      return
    }
    try {
      setStatus('extracting')
      const zip = await JSZip.loadAsync(file)
      const docxEntries = Object.values(zip.files).filter(
        (e) => !e.dir && !e.name.startsWith('__MACOSX') && !/\/\._/.test(e.name) && /\.docx$/i.test(e.name)
      )
      if (docxEntries.length === 0) {
        setError('No .docx documents found in that zip. Is it the Kaseya "Download Full Campaign" zip?')
        setStatus('idle')
        return
      }

      const form = new FormData()
      form.append('zipName', file.name)
      for (const e of docxEntries) {
        const blob = await e.async('blob')
        const base = e.name.split('/').pop() || e.name
        form.append('docx', new File([blob], base, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      }

      setStatus('uploading')
      const res = await fetch('/api/admin/documents/import', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Import failed.')
        setStatus('idle')
        return
      }
      setStatus('done')
      router.push(`/admin/documents/campaign/${data.result.campaign}`)
      router.refresh()
    } catch (err) {
      setError('Could not read that file: ' + (err as Error).message)
      setStatus('idle')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f && !busy) handleFile(f)
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all ${
          dragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/15 bg-white/5 hover:border-cyan-400/40'
        } ${busy ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        {status === 'idle' && (
          <>
            <FileArchive className="mb-4 h-10 w-10 text-cyan-400" />
            <p className="text-lg font-bold text-white">Drop the Kaseya campaign .zip here</p>
            <p className="mt-1 text-sm text-slate-400">or click to choose — we read it in your browser and only send the documents.</p>
          </>
        )}
        {status === 'extracting' && (
          <>
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-cyan-400" />
            <p className="text-lg font-bold text-white">Reading the zip…</p>
            <p className="mt-1 text-sm text-slate-400">{fileName}</p>
          </>
        )}
        {status === 'uploading' && (
          <>
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-cyan-400" />
            <p className="text-lg font-bold text-white">Rebranding the content…</p>
            <p className="mt-1 text-sm text-slate-400">Parsing documents and applying the TCT brand.</p>
          </>
        )}
        {status === 'done' && (
          <>
            <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-400" />
            <p className="text-lg font-bold text-white">Done — opening your campaign…</p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-medium text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
        <div className="mb-2 flex items-center gap-2 font-bold text-white">
          <Upload size={15} className="text-cyan-400" /> How it works
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>In Kaseya MSP Success, open the campaign and click <strong className="text-slate-200">Download Full Campaign</strong>.</li>
          <li>Drop that .zip here. Your browser extracts the email, blog, landing page, and social copy.</li>
          <li>We keep the wording verbatim, strip Kaseya boilerplate, and render everything in the TCT brand as drafts you can review.</li>
        </ol>
      </div>
    </div>
  )
}
