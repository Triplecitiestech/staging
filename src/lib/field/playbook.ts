// src/lib/field/playbook.ts
//
// Loads content/field/playbook.html — the contractor Field Playbook, a single
// self-contained HTML file that is served VERBATIM. It is read from disk (not
// imported) so the build never reformats it, and it is outside /public so it is
// only ever served through the session-checked route at /field/playbook.
// next.config.js `outputFileTracingIncludes` carries the file into the
// serverless bundle for that route.

import { readFile } from 'fs/promises'
import path from 'path'

export const PLAYBOOK_FILE = path.join(process.cwd(), 'content', 'field', 'playbook.html')

let cached: Promise<string> | null = null

export function readPlaybookHtml(): Promise<string> {
  if (!cached) {
    cached = readFile(PLAYBOOK_FILE, 'utf8').catch((err) => {
      cached = null
      throw err
    })
  }
  return cached
}
