// src/lib/scan-filing/destinations.test.ts
//
// The routing policy is the one guardrail standing between an unattended
// classifier and the App Catalog. These tests pin the refusals by name, because
// a site quietly dropping off the exclusion list is exactly the failure that
// would go unnoticed until something turned up in the wrong place.

import { describe, it, expect } from 'vitest'
import {
  classifyDestination,
  siteKeyFromWebUrl,
  validateScanFilename,
  EXCLUDED_SITES,
  FILING_SITES,
  MAX_FILENAME_LENGTH,
} from './destinations'

const SP = 'https://triplecitiestechcom.sharepoint.com'
const MY = 'https://triplecitiestechcom-my.sharepoint.com'

describe('siteKeyFromWebUrl', () => {
  it('reads the site segment from a document-library URL', () => {
    expect(siteKeyFromWebUrl(`${SP}/sites/accounting/Shared%20Documents`)).toBe('/sites/accounting')
  })

  it('is case-insensitive, because SharePoint paths are', () => {
    expect(siteKeyFromWebUrl(`${SP}/sites/HumanResources/Shared Documents`)).toBe(
      '/sites/humanresources'
    )
  })

  it('reads a personal OneDrive segment', () => {
    expect(siteKeyFromWebUrl(`${MY}/personal/kurtis_triplecitiestech_com/Documents`)).toBe(
      '/personal/kurtis_triplecitiestech_com'
    )
  })

  it('returns null for the tenant root, which has no site segment', () => {
    expect(siteKeyFromWebUrl(`${SP}/Shared Documents`)).toBeNull()
  })

  it('returns null rather than throwing on junk', () => {
    expect(siteKeyFromWebUrl('not a url')).toBeNull()
    expect(siteKeyFromWebUrl(undefined)).toBeNull()
    expect(siteKeyFromWebUrl('')).toBeNull()
  })
})

describe('classifyDestination allows the real filing destinations', () => {
  it.each(Object.entries(FILING_SITES))('allows %s (%s)', (siteKey, label) => {
    const v = classifyDestination(`${SP}${siteKey}/Shared Documents`)
    expect(v.allowed).toBe(true)
    expect(v.kind).toBe('filing-site')
    expect(v.label).toBe(label)
    expect(v.warnings).toEqual([])
  })

  it("allows Kurtis's own OneDrive", () => {
    const v = classifyDestination(`${MY}/personal/kurtis_triplecitiestech_com/Documents`)
    expect(v.allowed).toBe(true)
    expect(v.kind).toBe('owner-onedrive')
  })
})

describe('classifyDestination refuses what must never receive a scan', () => {
  it.each(Object.keys(EXCLUDED_SITES))('refuses %s', (siteKey) => {
    const v = classifyDestination(`${SP}${siteKey}/Shared Documents`)
    expect(v.allowed).toBe(false)
    expect(v.kind).toBe('excluded')
    expect(v.reason).toContain('exclusion list')
  })

  it('refuses the Outlook Customer Manager site by PREFIX, since its GUID was recorded truncated', () => {
    const v = classifyDestination(
      `${SP}/sites/AllSalesTeam-c036c9b0-1111-2222-3333-444455556666/Shared Documents`
    )
    expect(v.allowed).toBe(false)
    expect(v.kind).toBe('excluded')
  })

  it('refuses the classic tenant root', () => {
    const v = classifyDestination(`${SP}/Shared Documents`)
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('tenant root')
  })

  it("refuses another employee's OneDrive", () => {
    const v = classifyDestination(`${MY}/personal/alex_triplecitiestech_com/Documents`)
    expect(v.allowed).toBe(false)
    expect(v.kind).toBe('excluded')
    expect(v.reason).toContain("another person's OneDrive")
  })

  it('refuses anything outside the tenant', () => {
    const v = classifyDestination('https://evil.example.com/sites/accounting/Shared Documents')
    expect(v.allowed).toBe(false)
  })

  it('refuses a destination Graph could not name, rather than assuming it is fine', () => {
    const v = classifyDestination(null)
    expect(v.allowed).toBe(false)
    expect(v.kind).toBe('unknown')
  })
})

describe('classifyDestination handles sites nobody has classified', () => {
  it('ALLOWS a site created after the inventory, because that is the stated requirement', () => {
    const v = classifyDestination(`${SP}/sites/newdepartment/Shared Documents`)
    expect(v.allowed).toBe(true)
    expect(v.kind).toBe('unrecognized-site')
    expect(v.warnings.length).toBeGreaterThan(0)
  })

  it('allows a confirm-first site but flags it', () => {
    const v = classifyDestination(`${SP}/sites/PolicyCenter/Shared Documents`)
    expect(v.allowed).toBe(true)
    expect(v.kind).toBe('confirm-before-routing')
    expect(v.warnings.join(' ')).toContain('not a confirmed scan destination')
  })

  it('an allowed verdict always carries a reason, so a filing can explain itself', () => {
    for (const url of [
      `${SP}/sites/accounting/Shared Documents`,
      `${SP}/sites/newdepartment/Shared Documents`,
      `${MY}/personal/kurtis_triplecitiestech_com/Documents`,
    ]) {
      expect(classifyDestination(url).reason.length).toBeGreaterThan(10)
    }
  })
})

describe('validateScanFilename', () => {
  it('accepts a name in the convention already in use', () => {
    const v = validateScanFilename('Form 1099-NEC 2025 Wells Family $7815.15 Compensation.pdf')
    expect(v.ok).toBe(true)
    expect(v.problems).toEqual([])
  })

  it('REFUSES a name that still says Raven_Scan — renaming is the whole point', () => {
    const v = validateScanFilename('20260907_090410_Raven_Scan.pdf')
    expect(v.ok).toBe(false)
    expect(v.problems.join(' ')).toContain('Raven_Scan')
  })

  it('refuses a path separator, which would silently retarget the write', () => {
    expect(validateScanFilename('../../Invoice.pdf').ok).toBe(false)
    expect(validateScanFilename('folder/Invoice.pdf').ok).toBe(false)
  })

  it.each([
    ['no extension', 'Invoice 2026'],
    ['wrong extension', 'Invoice 2026.docx'],
    ['empty', ''],
    ['leading dot', '.Invoice.pdf'],
    ['illegal character', 'Invoice: 2026.pdf'],
    ['reserved tilde', '~Invoice.pdf'],
    ['untrimmed', ' Invoice.pdf'],
  ])('refuses %s', (_label, name) => {
    expect(validateScanFilename(name).ok).toBe(false)
  })

  it('refuses a name past the SharePoint segment limit', () => {
    const long = `${'A'.repeat(MAX_FILENAME_LENGTH)}.pdf`
    const v = validateScanFilename(long)
    expect(v.ok).toBe(false)
    expect(v.problems.join(' ')).toContain('caps a name segment')
  })

  it('never repairs a name — the returned filename is exactly what was passed', () => {
    const v = validateScanFilename('  Invoice.pdf  ')
    expect(v.filename).toBe('  Invoice.pdf  ')
    expect(v.ok).toBe(false)
  })
})
