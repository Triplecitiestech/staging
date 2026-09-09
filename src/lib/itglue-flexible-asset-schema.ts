// src/lib/itglue-flexible-asset-schema.ts
//
// Normalise an IT Glue flexible-asset-type field schema, and validate a set of
// traits against it BEFORE the write.
//
// WHY THIS EXISTS: creating ONE flexible asset on 2026-09-09 took four
// attempts, because IT Glue rejects one problem at a time:
//
//   attempt 1 → 422 "link type can't be blank"
//   attempt 2 → 422 "location(s) can't be blank"
//   attempt 3 → 422 "account number and contact details is too long
//                     (maximum is 255 characters)"
//   attempt 4 → accepted
//
// The type was Internet/WAN (310392), confirmed live: `link-type` is a Select
// marked required, `location-s` is a Tag pointing at Locations and marked
// required, `account-number-and-contact-details` is kind Text.
//
// TWO SEPARATE PROBLEMS, TWO DIFFERENT FIXES:
//
//   (a) `required`, `kind` and `tag-type` ARE published by IT Glue — they were
//       simply never surfaced usably. `itglue_flexible_asset_type_fields`
//       returned the raw JSON:API payload, every field wrapped in `attributes`
//       and `relationships` noise, so the three facts that decide whether a
//       write will succeed were present but not readable at a glance. Fixed by
//       normalising: one flat row per field with exactly the constraints that
//       matter, plus the Select options, which IT Glue hides in `default-value`
//       as a newline-delimited string.
//
//   (b) MAX LENGTH IS NOT PUBLISHED ANYWHERE IN THE SCHEMA. IT Glue's field
//       record carries no length attribute at all. So the 255-character cap is
//       DERIVED FROM THE FIELD KIND — Text is a single-line input — and its
//       provenance is labelled `observed-422` rather than presented as vendor
//       metadata. This repo has been burned by undocumented constants twice
//       (the scan pipeline's 392-byte offset, and every hardcoded picklist id),
//       so the rule is: derive it, label where it came from, and never let it
//       read as something the vendor told us.
//
// Validation returns EVERY problem at once. Surfacing IT Glue's one-at-a-time
// 422s is what turned one asset into four attempts.
//
// Pure by construction — no I/O. The connector tools fetch the schema and pass
// it in.

import type { ItGlueFlexibleAssetField } from '@/lib/it-glue'

/**
 * Length caps by field kind.
 *
 * NOT VENDOR METADATA. IT Glue publishes no length attribute on a flexible
 * asset field, so this is derived from the kind and from an observed rejection.
 * Only `Text` is capped, because that is the only kind for which we have seen
 * a cap; a kind absent from this map is reported as `maxLength: null`, meaning
 * NOT KNOWN — never "unlimited".
 */
const KIND_MAX_LENGTH: Record<string, number> = {
  // Observed live: 422 "account number and contact details is too long
  // (maximum is 255 characters)" on a kind Text field, 2026-09-09.
  Text: 255,
}

export const MAX_LENGTH_PROVENANCE =
  'DERIVED, NOT PUBLISHED. IT Glue\'s flexible-asset-field schema carries no length attribute of any kind, so this cap comes from the field KIND plus an observed rejection: on 2026-09-09 a kind "Text" field (Internet/WAN → "Account Number and Contact Details") was refused with 422 "is too long (maximum is 255 characters)". Text is IT Glue\'s single-line input; Textbox is the long-form HTML field and has no cap we have observed. A kind with no entry reports maxLength null, which means NOT KNOWN — it does not mean unlimited.'

/** Kinds that carry no value at all — they are layout, not data. */
const PRESENTATIONAL_KINDS = new Set(['Header'])

/** Kinds whose value is stored as HTML. */
export const HTML_KINDS = new Set(['Textbox'])

export interface NormalisedField {
  /** The trait key to use when writing. */
  nameKey: string
  /** The label a person sees in IT Glue — what its 422 messages quote. */
  name: string
  /** IT Glue's input type: Text, Textbox, Select, Checkbox, Number, Date, Tag, Upload, Header, Password. */
  kind: string
  required: boolean
  /** Null means NOT KNOWN, never unlimited. See MAX_LENGTH_PROVENANCE. */
  maxLength: number | null
  /** For kind Tag: the resource the tag points at, e.g. "Locations", "Contacts". */
  tagType: string | null
  /** For kind Select: the permitted values, which IT Glue hides in default-value. */
  selectOptions: string[] | null
  /** True when the value is stored as HTML — a raw \n will not render. */
  storesHtml: boolean
  /** Layout only; carries no value and must not be written. */
  presentational: boolean
  hint: string | null
  order: number
  usedForTitle: boolean
  /** How a caller resolves a value for this field, when it is not free text. */
  howToResolve: string | null
}

function selectOptionsOf(f: ItGlueFlexibleAssetField): string[] | null {
  if (f.attributes.kind !== 'Select') return null
  // IT Glue stores Select options as a newline-delimited string in
  // `default-value`. Undocumented in the field reference, confirmed live
  // against types 310392, 310403 and 310404 on 2026-09-09.
  const raw = (f.attributes as unknown as { 'default-value'?: string | null })['default-value']
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.split('\n').map((s) => s.trim()).filter(Boolean)
}

function howToResolve(kind: string, tagType: string | null): string | null {
  if (kind === 'Tag') {
    if (tagType === 'Locations') {
      return 'Tag field pointing at Locations. The value is an ARRAY OF NUMERIC IT GLUE LOCATION IDS — call itglue_org_locations for the organization to get them. Do not pass a location name.'
    }
    if (tagType === 'Contacts') {
      return 'Tag field pointing at Contacts. The value is an array of numeric IT Glue contact ids.'
    }
    if (tagType === 'Configurations') {
      return 'Tag field pointing at Configurations. The value is an array of numeric ids — itglue_org_configurations lists them.'
    }
    if (tagType === 'Organizations') {
      return 'Tag field pointing at Organizations. The value is an array of numeric org ids — itglue_search_orgs finds them.'
    }
    if (tagType === 'Passwords') {
      return 'Tag field pointing at Passwords. The connector deliberately does not read the /passwords resource, so it cannot resolve these ids — leave this trait unset and have a human tag it in the IT Glue UI.'
    }
    return `Tag field pointing at ${tagType ?? 'an unspecified resource'}. The value is an array of numeric ids of that resource.`
  }
  if (kind === 'Select') return 'Select field — the value must be one of selectOptions exactly, including capitalisation.'
  if (kind === 'Checkbox') return 'Checkbox — pass true or false.'
  if (kind === 'Upload') return 'Upload field — a file. The connector cannot set this; attach the file in the IT Glue UI, or use itglue_upload_attachment against the record afterwards.'
  if (kind === 'Header') return 'Layout header only. It holds no value — do not include it in traits.'
  if (kind === 'Textbox') return 'Long-form field stored as HTML. Plain text is converted for you (paragraphs, line breaks, lists); a raw \\n would not render.'
  return null
}

export function normaliseFields(fields: ItGlueFlexibleAssetField[]): NormalisedField[] {
  return fields
    .map((f) => {
      const a = f.attributes
      const kind = a.kind
      const tagType = a['tag-type'] ?? null
      return {
        nameKey: a['name-key'],
        name: a.name,
        kind,
        required: a.required === true,
        maxLength: KIND_MAX_LENGTH[kind] ?? null,
        tagType,
        selectOptions: selectOptionsOf(f),
        storesHtml: HTML_KINDS.has(kind),
        presentational: PRESENTATIONAL_KINDS.has(kind),
        hint: a.hint ?? null,
        order: a.order,
        usedForTitle: a['use-for-title'] === true,
        howToResolve: howToResolve(kind, tagType),
      }
    })
    .sort((x, y) => x.order - y.order)
}

// ---------------------------------------------------------------------------
// Validation — every problem at once
// ---------------------------------------------------------------------------

export type ValidationProblemKind =
  | 'required-missing'
  | 'too-long'
  | 'unknown-trait'
  | 'not-a-select-option'
  | 'presentational-field-written'
  | 'tag-not-array-of-ids'

export interface ValidationProblem {
  kind: ValidationProblemKind
  nameKey: string
  fieldName: string
  message: string
  /** What to do about it, per problem — not one generic remediation. */
  fix: string
}

export interface ValidationResult {
  valid: boolean
  problems: ValidationProblem[]
  /** One combined message listing every problem, ready to return to a caller. */
  combinedMessage: string
}

function lengthOf(v: unknown): number | null {
  return typeof v === 'string' ? v.length : null
}

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/**
 * Validate traits against a normalised schema.
 *
 * `mode` matters: on create, a required field that is absent is a problem
 * because IT Glue will reject it. On update, traits are a PATCH of specific
 * fields — an absent required field simply is not being changed, and treating
 * that as an error would make it impossible to edit one field of a valid
 * asset. A required field explicitly set to blank IS a problem in both modes.
 */
export function validateTraits(
  fields: NormalisedField[],
  traits: Record<string, unknown>,
  mode: 'create' | 'update',
): ValidationResult {
  const problems: ValidationProblem[] = []
  const byKey = new Map(fields.map((f) => [f.nameKey, f]))

  for (const f of fields) {
    const present = Object.prototype.hasOwnProperty.call(traits, f.nameKey)
    const value = traits[f.nameKey]

    if (f.presentational) {
      if (present) {
        problems.push({
          kind: 'presentational-field-written',
          nameKey: f.nameKey,
          fieldName: f.name,
          message: `"${f.name}" is a layout Header and holds no value, but a value was supplied for it.`,
          fix: `Remove "${f.nameKey}" from traits.`,
        })
      }
      continue
    }

    // Required-and-blank is a problem in both modes; required-and-absent only
    // on create, because an update is a patch of named fields.
    if (f.required && ((mode === 'create' && !present) || (present && isBlank(value)))) {
      problems.push({
        kind: 'required-missing',
        nameKey: f.nameKey,
        fieldName: f.name,
        message: `"${f.name}" is REQUIRED and ${present ? 'was supplied blank' : 'was not supplied'} — IT Glue will reject the write with "${f.name.toLowerCase()} can't be blank".`,
        fix: f.howToResolve
          ? `Set "${f.nameKey}". ${f.howToResolve}`
          : `Set "${f.nameKey}" to a non-empty value.`,
      })
    }

    if (present && f.maxLength != null) {
      const len = lengthOf(value)
      if (len != null && len > f.maxLength) {
        problems.push({
          kind: 'too-long',
          nameKey: f.nameKey,
          fieldName: f.name,
          message: `"${f.name}" is ${len} characters but the maximum is ${f.maxLength} — IT Glue will reject the write with "${f.name.toLowerCase()} is too long (maximum is ${f.maxLength} characters)".`,
          fix:
            f.kind === 'Text'
              ? `Shorten "${f.nameKey}" to ${f.maxLength} characters or fewer. If the content genuinely needs more room, it belongs in a Textbox field (this type's long-form fields are listed in the schema) or in a document, not in a single-line Text field.`
              : `Shorten "${f.nameKey}" to ${f.maxLength} characters or fewer.`,
        })
      }
    }

    if (present && !isBlank(value) && f.selectOptions?.length) {
      const supplied = String(value)
      if (!f.selectOptions.includes(supplied)) {
        problems.push({
          kind: 'not-a-select-option',
          nameKey: f.nameKey,
          fieldName: f.name,
          message: `"${f.name}" was given "${supplied}", which is not one of its permitted values.`,
          fix: `Use exactly one of: ${f.selectOptions.join(', ')}.`,
        })
      }
    }

    if (present && !isBlank(value) && f.kind === 'Tag') {
      const arr = Array.isArray(value) ? value : null
      const allIds = arr?.every((v) => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)))
      if (!arr || !allIds) {
        problems.push({
          kind: 'tag-not-array-of-ids',
          nameKey: f.nameKey,
          fieldName: f.name,
          message: `"${f.name}" is a Tag field pointing at ${f.tagType ?? 'another resource'}, so its value must be an array of numeric ids — got ${Array.isArray(value) ? 'an array containing non-numeric entries' : typeof value}.`,
          fix: f.howToResolve ?? `Pass an array of numeric ${f.tagType ?? 'resource'} ids.`,
        })
      }
    }
  }

  // An unknown trait key is almost always a name-key typo, and IT Glue silently
  // ignores it — so the caller believes they set a field they did not.
  for (const key of Object.keys(traits)) {
    if (!byKey.has(key)) {
      problems.push({
        kind: 'unknown-trait',
        nameKey: key,
        fieldName: key,
        message: `"${key}" is not a field on this flexible asset type. IT Glue IGNORES an unrecognised trait key without erroring, so this would have been silently dropped and you would believe it was set.`,
        fix: `Use one of the nameKey values from itglue_flexible_asset_type_fields. Closest matches: ${
          [...byKey.keys()]
            .map((k) => ({ k, score: sharedPrefix(k, key) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((x) => x.k)
            .join(', ')
        }.`,
      })
    }
  }

  const combinedMessage = problems.length
    ? `${problems.length} problem${problems.length === 1 ? '' : 's'} found before writing anything — IT Glue reports these ONE AT A TIME, so all of them are listed here to save the round trips:\n\n` +
      problems.map((p, i) => `${i + 1}. ${p.message}\n   FIX: ${p.fix}`).join('\n\n')
    : 'No problems found.'

  return { valid: problems.length === 0, problems, combinedMessage }
}

function sharedPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}
