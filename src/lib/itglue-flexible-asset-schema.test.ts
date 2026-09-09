// src/lib/itglue-flexible-asset-schema.test.ts
//
// Replays the real 2026-09-09 failure. Creating ONE Internet/WAN flexible asset
// took four attempts because IT Glue reports one problem per request:
//
//   attempt 1 → 422 "link type can't be blank"
//   attempt 2 → 422 "location(s) can't be blank"
//   attempt 3 → 422 "account number and contact details is too long
//                     (maximum is 255 characters)"
//   attempt 4 → accepted
//
// The headline assertion is that all three come back from a SINGLE validate
// call. If that ever regresses to one-problem-at-a-time, the round trips
// return.

import { describe, expect, it } from 'vitest'
import type { ItGlueFlexibleAssetField } from '@/lib/it-glue'
import { MAX_LENGTH_PROVENANCE, normaliseFields, validateTraits } from './itglue-flexible-asset-schema'

/**
 * The real Internet/WAN (type 310392) field schema, read live from the
 * production IT Glue account on 2026-09-09 via
 * itglue_flexible_asset_type_fields. Trimmed to the fields the failure
 * involved plus one of each interesting kind.
 */
function field(
  order: number,
  name: string,
  nameKey: string,
  kind: string,
  required: boolean,
  extra: Partial<ItGlueFlexibleAssetField['attributes']> & { 'default-value'?: string | null } = {},
): ItGlueFlexibleAssetField {
  return {
    id: String(4945887 + order),
    attributes: {
      'flexible-asset-type-id': 310392,
      order,
      name,
      kind,
      'name-key': nameKey,
      required,
      hint: null,
      'tag-type': null,
      'use-for-title': false,
      'show-in-list': true,
      ...extra,
    } as ItGlueFlexibleAssetField['attributes'],
  }
}

const INTERNET_WAN: ItGlueFlexibleAssetField[] = [
  field(1, 'Provider', 'provider', 'Text', true, { 'use-for-title': true }),
  field(2, 'Link Type', 'link-type', 'Select', true, { 'default-value': 'ADSL\nCable\nEthernet\nFibre\nMPLS\nVPN\nOther' }),
  field(3, 'Primary ISP', 'primary-isp', 'Checkbox', false),
  field(4, 'Location(s)', 'location-s', 'Tag', true, { 'tag-type': 'Locations' }),
  field(6, 'Account Number and Contact Details', 'account-number-and-contact-details', 'Text', false),
  field(9, 'Technical Information', 'technical-information', 'Header', false),
  field(13, 'IP Address(es)', 'ip-address-es', 'Textbox', false),
]

const FIELDS = normaliseFields(INTERNET_WAN)

describe('normaliseFields — publishing the constraints IT Glue does supply', () => {
  it('surfaces the required flag that decides whether a write is accepted', () => {
    const required = FIELDS.filter((f) => f.required).map((f) => f.nameKey)
    // The two that caused attempts 1 and 2.
    expect(required).toContain('link-type')
    expect(required).toContain('location-s')
    expect(required).toContain('provider')
    expect(required).not.toContain('account-number-and-contact-details')
  })

  it('extracts Select options from default-value, where IT Glue hides them', () => {
    const linkType = FIELDS.find((f) => f.nameKey === 'link-type')!
    expect(linkType.selectOptions).toEqual(['ADSL', 'Cable', 'Ethernet', 'Fibre', 'MPLS', 'VPN', 'Other'])
  })

  it('reports the Tag target so the caller knows which ids to fetch', () => {
    const loc = FIELDS.find((f) => f.nameKey === 'location-s')!
    expect(loc.tagType).toBe('Locations')
    // The gap that sent the technician to a browser to copy an id out of a URL.
    expect(loc.howToResolve).toMatch(/itglue_org_locations/)
    expect(loc.howToResolve).toMatch(/NUMERIC IT GLUE LOCATION IDS/)
  })

  it('derives the 255 cap for Text and labels it as derived, not vendor metadata', () => {
    const acct = FIELDS.find((f) => f.nameKey === 'account-number-and-contact-details')!
    expect(acct.maxLength).toBe(255)
    expect(MAX_LENGTH_PROVENANCE).toMatch(/DERIVED, NOT PUBLISHED/)
  })

  it('reports maxLength null for a kind with no observed cap — null means NOT KNOWN', () => {
    // Textbox is the long-form HTML field; we have never observed a cap on it,
    // so inventing one would be worse than reporting nothing.
    expect(FIELDS.find((f) => f.nameKey === 'ip-address-es')!.maxLength).toBeNull()
    expect(MAX_LENGTH_PROVENANCE).toMatch(/does not mean unlimited/)
  })

  it('flags the HTML field and the layout-only field', () => {
    expect(FIELDS.find((f) => f.nameKey === 'ip-address-es')!.storesHtml).toBe(true)
    expect(FIELDS.find((f) => f.nameKey === 'technical-information')!.presentational).toBe(true)
  })

  it('preserves IT Glue field order', () => {
    expect(FIELDS.map((f) => f.order)).toEqual([...FIELDS.map((f) => f.order)].sort((a, b) => a - b))
  })
})

describe('validateTraits — every problem at once (the four-attempt defect)', () => {
  it('returns all three real failures from ONE call', () => {
    // Exactly the payload that took four attempts: no link type, no
    // location(s), and an over-long account number field.
    const r = validateTraits(
      FIELDS,
      {
        provider: 'Spectrum',
        'account-number-and-contact-details': 'x'.repeat(300),
      },
      'create',
    )

    expect(r.valid).toBe(false)
    const kinds = r.problems.map((p) => `${p.kind}:${p.nameKey}`)
    expect(kinds).toContain('required-missing:link-type')
    expect(kinds).toContain('required-missing:location-s')
    expect(kinds).toContain('too-long:account-number-and-contact-details')
    expect(r.problems).toHaveLength(3)

    // The combined message must carry all three, and say why they are together.
    expect(r.combinedMessage).toMatch(/3 problems found/)
    expect(r.combinedMessage).toMatch(/ONE AT A TIME/)
    expect(r.combinedMessage).toMatch(/link type can't be blank/)
    expect(r.combinedMessage).toMatch(/location\(s\) can't be blank/)
    expect(r.combinedMessage).toMatch(/maximum is 255 characters/)
  })

  it('gives each problem its own fix, not one generic remediation', () => {
    const r = validateTraits(FIELDS, { provider: 'Spectrum', 'account-number-and-contact-details': 'x'.repeat(300) }, 'create')
    const fixes = new Set(r.problems.map((p) => p.fix))
    expect(fixes.size).toBe(3)
    expect(r.problems.find((p) => p.nameKey === 'location-s')!.fix).toMatch(/itglue_org_locations/)
    expect(r.problems.find((p) => p.nameKey === 'link-type')!.fix).toMatch(/selectOptions/)
  })

  it('accepts the payload that finally worked on attempt four', () => {
    const r = validateTraits(
      FIELDS,
      {
        provider: 'Spectrum',
        'link-type': 'Cable',
        'location-s': [12345],
        'account-number-and-contact-details': 'Acct 8000-1234, support 1-800-555-0100',
        'primary-isp': true,
      },
      'create',
    )
    expect(r.valid).toBe(true)
    expect(r.problems).toEqual([])
  })

  it('rejects a Select value that is not one of the permitted options', () => {
    const r = validateTraits(FIELDS, { provider: 'X', 'link-type': 'fiber', 'location-s': [1] }, 'create')
    expect(r.problems.map((p) => p.kind)).toContain('not-a-select-option')
    // Case matters to IT Glue: the live option is "Fibre".
    expect(r.problems[0].fix).toMatch(/Fibre/)
  })

  it('rejects a Tag field given a name instead of an array of ids', () => {
    const r = validateTraits(FIELDS, { provider: 'X', 'link-type': 'Cable', 'location-s': 'Main Office' }, 'create')
    expect(r.problems.map((p) => p.kind)).toContain('tag-not-array-of-ids')
  })

  it('accepts numeric-string ids in a Tag array', () => {
    const r = validateTraits(FIELDS, { provider: 'X', 'link-type': 'Cable', 'location-s': ['12345'] }, 'create')
    expect(r.valid).toBe(true)
  })

  it('catches an unknown trait key, which IT Glue silently ignores', () => {
    const r = validateTraits(
      FIELDS,
      { provider: 'X', 'link-type': 'Cable', 'location-s': [1], 'link_type': 'Cable' },
      'create',
    )
    const unknown = r.problems.find((p) => p.kind === 'unknown-trait')!
    expect(unknown.nameKey).toBe('link_type')
    // This is the one that would otherwise leave the caller believing a field
    // was set when it was dropped.
    expect(unknown.message).toMatch(/IGNORES an unrecognised trait key/)
    expect(unknown.fix).toMatch(/link-type/)
  })

  it('refuses a value written to a layout Header, which holds none', () => {
    const r = validateTraits(
      FIELDS,
      { provider: 'X', 'link-type': 'Cable', 'location-s': [1], 'technical-information': 'notes' },
      'create',
    )
    expect(r.problems.map((p) => p.kind)).toContain('presentational-field-written')
  })
})

describe('validateTraits — create and update differ, deliberately', () => {
  it('does not demand an unmentioned required field on update', () => {
    // An update is a PATCH of named fields. Treating an absent required field
    // as an error would make it impossible to edit one field of a valid asset.
    const r = validateTraits(FIELDS, { 'account-number-and-contact-details': 'Acct 1234' }, 'update')
    expect(r.valid).toBe(true)
  })

  it('still refuses a required field explicitly set blank, on update', () => {
    // IT Glue would reject this, so accepting it locally would only move the
    // failure later.
    expect(validateTraits(FIELDS, { 'link-type': '' }, 'update').valid).toBe(false)
    expect(validateTraits(FIELDS, { 'location-s': [] }, 'update').valid).toBe(false)
  })

  it('applies the length cap on update as well as create', () => {
    const r = validateTraits(FIELDS, { 'account-number-and-contact-details': 'x'.repeat(256) }, 'update')
    expect(r.problems.map((p) => p.kind)).toEqual(['too-long'])
  })

  it('accepts exactly the cap and rejects one over', () => {
    expect(validateTraits(FIELDS, { 'account-number-and-contact-details': 'x'.repeat(255) }, 'update').valid).toBe(true)
    expect(validateTraits(FIELDS, { 'account-number-and-contact-details': 'x'.repeat(256) }, 'update').valid).toBe(false)
  })
})
