import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { importDocxFiles, type DocxFile } from '@/lib/documents/import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Receives the .docx files the browser extracted from the Kaseya campaign zip
 * (the large graphics are never uploaded — we generate our own). Parses them
 * into TCT-branded documents grouped under one campaign.
 */
export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const zipName = typeof form.get('zipName') === 'string' ? (form.get('zipName') as string) : 'campaign'
  const fileEntries = form.getAll('docx').filter((x): x is File => x instanceof File)
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: 'No .docx files were provided.' }, { status: 400 })
  }
  const total = fileEntries.reduce((n, f) => n + f.size, 0)
  if (total > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Extracted documents are too large (max 8 MB).' }, { status: 400 })
  }

  try {
    const files: DocxFile[] = []
    for (const f of fileEntries) files.push({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })
    const result = await importDocxFiles(files, zipName, session.user?.email || null)
    if (result.created.length === 0) {
      return NextResponse.json({ error: 'No recognizable content found in the documents.', result }, { status: 422 })
    }
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[documents:import] failed:', err)
    return NextResponse.json({ error: 'Import failed: ' + (err as Error).message }, { status: 500 })
  }
}
