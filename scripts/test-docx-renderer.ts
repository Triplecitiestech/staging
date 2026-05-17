/**
 * Smoke test: feed a representative Markdown policy into renderPolicyDocx
 * and verify the output buffer is a real .docx (zip with [Content_Types].xml).
 *
 * Run:  npx tsx scripts/test-docx-renderer.ts
 */

import { renderPolicyDocx } from '../src/lib/compliance/policy-generation/docx-renderer'
import { writeFileSync } from 'fs'

const SAMPLE = `# Acceptable Use Policy

## 1. Purpose and Scope
This policy defines acceptable use of **Acme Corp** IT resources.

## 2. Acceptable Use
Employees may use company devices for:
- Work-related tasks
- Brief personal use during break time
- Approved training and development

## 3. Prohibited Activities
The following are **strictly prohibited**:
- Installing unauthorized software
- Accessing inappropriate content
- Sharing credentials with anyone

### 3.1 Email Use
Use company email for *business communications only*.

## 4. Enforcement
Violations may result in disciplinary action up to and including termination.
`

async function main() {
  const buf = await renderPolicyDocx(SAMPLE, {
    policyTitle: 'Acceptable Use Policy',
    companyName: 'Acme Corp',
    effectiveDate: '2026-05-21',
    reviewDate: '2027-05-21',
    version: '1.0',
    owner: 'TCT (managed)',
    approvedBy: 'kurtis@triplecitiestech.com',
  })

  // Validate it's a zip — .docx files always start with PK (0x50 0x4B).
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    console.error('FAIL: output buffer does not look like a zip (missing PK signature)')
    process.exit(1)
  }
  // Quick check that [Content_Types].xml is in there — docx requirement.
  const asString = buf.toString('latin1')
  if (!asString.includes('[Content_Types].xml')) {
    console.error('FAIL: [Content_Types].xml not present in zip stream')
    process.exit(1)
  }
  if (!asString.includes('word/document.xml')) {
    console.error('FAIL: word/document.xml not present in zip stream')
    process.exit(1)
  }
  // NOTE: can't grep for the title string here — document.xml is
  // deflate-compressed inside the zip. The structural checks above
  // (PK signature + two required filenames in the central directory)
  // are sufficient evidence we produced a valid .docx.

  const path = '/tmp/test-policy.docx'
  writeFileSync(path, buf)
  console.log(`OK  ${(buf.length / 1024).toFixed(1)} KB written to ${path}`)
  console.log('OK  starts with PK signature')
  console.log('OK  contains [Content_Types].xml')
  console.log('OK  contains word/document.xml')
}

main().catch((err) => {
  console.error('threw:', err)
  process.exit(1)
})
