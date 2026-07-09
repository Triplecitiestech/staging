import { describe, it, expect } from 'vitest'
import {
  normalizeSavedInput,
  parseSavedQuoteBody,
  sanitizeQuoteSummary,
  buildQuoteSummary,
  SAVED_QUOTE_LIMITS,
} from './saved-quotes'
import { defaultInput } from './defaults'
import { buildAllQuotes } from './calc'

describe('normalizeSavedInput', () => {
  it('round-trips a real discovery payload unchanged', () => {
    const input = defaultInput()
    input.company.name = 'Acme Manufacturing'
    input.users.standard = 42
    input.devices.windowsPCs = 55
    input.servers = [
      { id: 'srv-1', type: 'Physical', backupRequired: true, retention: '7-year', os: 'Windows Server', provisionedTB: 2 },
    ]
    input.company.compliance = ['HIPAA']
    expect(normalizeSavedInput(JSON.parse(JSON.stringify(input)))).toEqual(input)
  })

  it('fills fields missing from old payloads with defaults and drops unknown keys', () => {
    const normalized = normalizeSavedInput({
      company: { name: 'Old Save', bogusField: 'dropped' },
      users: { standard: 7 },
      somethingElse: true,
    })
    const def = defaultInput()
    expect(normalized.company.name).toBe('Old Save')
    expect(normalized.company.industry).toBe(def.company.industry)
    expect(normalized.users.standard).toBe(7)
    expect(normalized.users.frontline).toBe(def.users.frontline)
    expect(normalized.backup).toEqual(def.backup)
    expect((normalized.company as Record<string, unknown>).bogusField).toBeUndefined()
    expect((normalized as unknown as Record<string, unknown>).somethingElse).toBeUndefined()
  })

  it('falls back to defaults on type mismatches and non-finite numbers', () => {
    const def = defaultInput()
    const normalized = normalizeSavedInput({
      users: { standard: 'twelve', frontline: NaN },
      devices: { windowsPCs: Infinity },
      company: { locations: 3 },
    })
    expect(normalized.users.standard).toBe(def.users.standard)
    expect(normalized.users.frontline).toBe(def.users.frontline)
    expect(normalized.devices.windowsPCs).toBe(def.devices.windowsPCs)
    expect(normalized.company.locations).toBe(3)
  })

  it('normalizes server entries and compliance lists', () => {
    const normalized = normalizeSavedInput({
      servers: [
        { type: 'Virtual', provisionedTB: 1.5 }, // no id → filled
        'garbage', // non-object → template
      ],
      company: { compliance: ['HIPAA', 42, 'CMMC'] },
    })
    expect(normalized.servers).toHaveLength(2)
    expect(normalized.servers[0].type).toBe('Virtual')
    expect(normalized.servers[0].provisionedTB).toBe(1.5)
    expect(normalized.servers[0].id).toBeTruthy()
    expect(normalized.servers[1].os).toBe('Windows Server')
    expect(normalized.company.compliance).toEqual(['HIPAA', 'CMMC'])
  })

  it('tolerates a completely garbage payload (returns pure defaults)', () => {
    expect(normalizeSavedInput(null)).toEqual(defaultInput())
    expect(normalizeSavedInput('not an object')).toEqual(defaultInput())
    expect(normalizeSavedInput([1, 2, 3])).toEqual(defaultInput())
  })
})

describe('parseSavedQuoteBody', () => {
  const valid = () => ({
    name: '  Acme — July renewal  ',
    customerName: 'Acme Manufacturing',
    note: 'stage 2',
    input: JSON.parse(JSON.stringify(defaultInput())),
    selectedPackageId: 'comanaged',
    summary: { packageName: 'TCT Ally (Co-Managed)', monthlyPrice: 1234.56, users: 10, devices: 12, servers: 0 },
  })

  it('accepts a valid body and trims the name', () => {
    const res = parseSavedQuoteBody(valid())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.name).toBe('Acme — July renewal')
      expect(res.value.selectedPackageId).toBe('comanaged')
      expect(res.value.summary?.monthlyPrice).toBe(1234.56)
    }
  })

  it('rejects a missing/blank name and a missing input', () => {
    expect(parseSavedQuoteBody({ ...valid(), name: '   ' }).ok).toBe(false)
    expect(parseSavedQuoteBody({ ...valid(), name: undefined }).ok).toBe(false)
    expect(parseSavedQuoteBody({ ...valid(), input: undefined }).ok).toBe(false)
    expect(parseSavedQuoteBody({ ...valid(), input: [1, 2] }).ok).toBe(false)
    expect(parseSavedQuoteBody(null).ok).toBe(false)
  })

  it('rejects an oversized input payload', () => {
    const res = parseSavedQuoteBody({
      ...valid(),
      input: { blob: 'x'.repeat(SAVED_QUOTE_LIMITS.inputBytes + 1) },
    })
    expect(res.ok).toBe(false)
  })

  it('nulls an unknown selectedPackageId and sanitizes the summary', () => {
    const res = parseSavedQuoteBody({
      ...valid(),
      selectedPackageId: 'not-a-package',
      summary: { packageName: 'X', monthlyPrice: 'lots', evil: 'dropped', users: 3 },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.selectedPackageId).toBeNull()
      expect(res.value.summary).toEqual({
        packageName: 'X',
        monthlyPrice: null,
        m365MonthlyPrice: null,
        users: 3,
        devices: 0,
        servers: 0,
      })
    }
  })

  it('caps note and customerName lengths', () => {
    const res = parseSavedQuoteBody({
      ...valid(),
      note: 'n'.repeat(9999),
      customerName: 'c'.repeat(9999),
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.note?.length).toBe(SAVED_QUOTE_LIMITS.note)
      expect(res.value.customerName?.length).toBe(SAVED_QUOTE_LIMITS.customerName)
    }
  })
})

describe('sanitizeQuoteSummary / buildQuoteSummary', () => {
  it('returns null for non-objects', () => {
    expect(sanitizeQuoteSummary(null)).toBeNull()
    expect(sanitizeQuoteSummary('x')).toBeNull()
    expect(sanitizeQuoteSummary([])).toBeNull()
  })

  it('buildQuoteSummary snapshots the selected package', () => {
    const input = defaultInput()
    const quotes = buildAllQuotes(input)
    const summary = buildQuoteSummary(input, quotes, 'comanaged')
    const ally = quotes.find((q) => q.packageId === 'comanaged')!
    expect(summary.packageName).toBe(ally.packageName)
    expect(summary.monthlyPrice).toBeCloseTo(ally.monthlyPrice, 2)
    expect(summary.users).toBe(input.users.standard + input.users.frontline)
    expect(summary.devices).toBe(input.devices.windowsPCs)
  })

  it('buildQuoteSummary falls back to the first quote when nothing is selected', () => {
    const input = defaultInput()
    const quotes = buildAllQuotes(input)
    expect(buildQuoteSummary(input, quotes, null).packageName).toBe(quotes[0].packageName)
  })
})
