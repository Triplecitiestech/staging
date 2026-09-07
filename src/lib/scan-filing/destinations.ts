// src/lib/scan-filing/destinations.ts
//
// Routing POLICY for the Raven scan filing pipeline. Pure: no Graph, no env.
//
// Why this exists at all. The permission grant that lets the scan filer write to
// SharePoint is coarse — whether it ends up as Sites.Selected on a list of sites
// or Sites.ReadWrite.All tenant-wide, the app will be able to reach sites that
// must never receive a scan: the App Catalog, three empty INKY mail-security
// sites, two empty "All Company" sites, a dead 2018 Outlook Customer Manager
// site, and the classic tenant root. The build spec is explicit that those
// "must be enforced in the routing logic, not by permissions alone", because a
// classifier that CAN reach them will eventually file something into one.
//
// The shape of the rule follows the owner's stated requirement (2026-09-07):
// route to any and all appropriate sites, INCLUDING sites that do not exist
// yet. So this is a DENY list with classification, not an allow list — a new
// department site works on the day it is created, while the known-bad set is
// refused outright and the known-good set is recognised by name.
//
// Every verdict is derived from the drive's OWN webUrl as Microsoft Graph
// reports it. That is the only field that proves which site a driveId belongs
// to; a caller-supplied site name would prove nothing.

/** How a destination drive is classified for routing. */
export type DestinationKind =
  /** A department site the pipeline is meant to file into. */
  | 'filing-site'
  /** A real site, but one the owner has not confirmed as a scan target. */
  | 'confirm-before-routing'
  /** Kurtis's own OneDrive — the personal-document and _Needs Review path. */
  | 'owner-onedrive'
  /** A site that exists but nobody has classified — allowed, flagged. */
  | 'unrecognized-site'
  /** Plumbing, dead sites, the tenant root, or somebody else's OneDrive. */
  | 'excluded'
  /** The webUrl could not be parsed, so nothing about it is proven. */
  | 'unknown'

export interface DestinationVerdict {
  /** May a scan be written here? */
  allowed: boolean
  kind: DestinationKind
  /** Lowercased `/sites/<name>` or `/personal/<upn>` path segment, when parseable. */
  siteKey: string | null
  /** Human label for the destination, for the log row and the chat reply. */
  label: string
  /** Why this verdict. Always populated — a refusal must name its own reason. */
  reason: string
  /** Non-blocking things the caller must surface before filing. */
  warnings: string[]
}

/**
 * Department sites scans are meant to route to. From the SharePoint admin
 * centre "Active sites / ALL SITES" view, 2026-09-07 — the authoritative
 * inventory, not a search-derived one.
 */
export const FILING_SITES: Readonly<Record<string, string>> = {
  '/sites/accounting': 'Accounting',
  '/sites/administration': 'Administration',
  '/sites/billing': 'Billing Department',
  '/sites/humanresources': 'Human Resources',
  '/sites/lowvoltage': 'Low Voltage',
  '/sites/marketing': 'Marketing',
  '/sites/sales': 'Sales',
  '/sites/techsupport': 'Tech Support',
}

/**
 * Real sites that are NOT confirmed scan targets. Allowed, because refusing
 * them would contradict the owner's "any and all appropriate sites" decision,
 * but every filing carries a warning so a wrong routing is visible in the log
 * during the step-9 accuracy review rather than discovered months later.
 */
export const CONFIRM_FIRST_SITES: Readonly<Record<string, string>> = {
  '/sites/policycenter': 'Policy Center (policy documents; may be authored-only, not a scan target)',
  '/sites/tctfamily': 'TCT Team',
  '/sites/triplecitiestech': 'Triple Cities Tech (hub site)',
}

/**
 * Sites that must never receive a scan. Matched exactly unless listed under
 * EXCLUDED_SITE_PREFIXES.
 */
export const EXCLUDED_SITES: Readonly<Record<string, string>> = {
  '/sites/appcatalog': 'App Catalog - SharePoint plumbing',
  '/sites/inky-exclude': 'INKY mail-security plumbing, empty',
  '/sites/inky-journaling': 'INKY mail-security plumbing, empty',
  '/sites/inky-users': 'INKY mail-security plumbing, empty',
  '/sites/allcompany': 'Empty site created 2026-08-04',
  '/sites/allcompany.8205616.imeweost': 'Viva Engage artifact, empty',
}

/**
 * Prefix-matched exclusions. The Outlook Customer Manager site carries a GUID
 * suffix that the site inventory recorded truncated, so an exact match would
 * silently stop excluding it. A prefix is the honest encoding of what is known.
 */
export const EXCLUDED_SITE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['/sites/allsalesteam-', 'Outlook Customer Manager - legacy, created 2018, dead'],
]

/** The one OneDrive the pipeline may write to (personal docs + _Needs Review). */
export const OWNER_ONEDRIVE_SEGMENT = 'kurtis_triplecitiestech_com'

/**
 * Extract the site or personal path key from a drive/item webUrl.
 *
 * Returns a lowercased `/sites/<name>` or `/personal/<upn>` prefix, or null
 * when the URL names neither — which is itself meaningful: a SharePoint URL
 * with no `/sites/` and no `/personal/` segment is the classic tenant root.
 */
export function siteKeyFromWebUrl(webUrl: unknown): string | null {
  if (typeof webUrl !== 'string' || webUrl.trim() === '') return null
  let pathname: string
  try {
    pathname = new URL(webUrl).pathname
  } catch {
    return null
  }
  const decoded = safeDecode(pathname).toLowerCase()
  const m = decoded.match(/^\/(sites|personal|teams)\/([^/]+)/)
  if (!m) return null
  return `/${m[1]}/${m[2]}`
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** True when the URL is a SharePoint/OneDrive URL we can reason about at all. */
function isTenantUrl(webUrl: string): boolean {
  try {
    return /\.sharepoint\.com$/i.test(new URL(webUrl).hostname)
  } catch {
    return false
  }
}

/**
 * Decide whether a scan may be filed into the drive whose webUrl this is.
 *
 * The caller MUST pass the webUrl Graph returned for the destination drive (or
 * the destination folder item) — never one it composed itself. The point of
 * this check is that the driveId's real owner is established from Graph's own
 * answer, and a composed URL would just echo the caller's assumption back.
 */
export function classifyDestination(webUrl: unknown): DestinationVerdict {
  if (typeof webUrl !== 'string' || webUrl.trim() === '') {
    return {
      allowed: false,
      kind: 'unknown',
      siteKey: null,
      label: 'unknown',
      reason:
        'Graph returned no webUrl for this drive, so which site it belongs to is not established. ' +
        'A scan is not filed into a destination that cannot be identified.',
      warnings: [],
    }
  }

  if (!isTenantUrl(webUrl)) {
    return {
      allowed: false,
      kind: 'excluded',
      siteKey: null,
      label: webUrl,
      reason: `Destination is not a *.sharepoint.com URL (${webUrl}). The pipeline files only inside the TCT tenant.`,
      warnings: [],
    }
  }

  const siteKey = siteKeyFromWebUrl(webUrl)

  if (!siteKey) {
    return {
      allowed: false,
      kind: 'excluded',
      siteKey: null,
      label: 'tenant root site',
      reason:
        'This drive belongs to the classic tenant root site (its URL has no /sites/ or /personal/ segment). ' +
        'The root site is excluded from routing.',
      warnings: [],
    }
  }

  for (const [prefix, why] of EXCLUDED_SITE_PREFIXES) {
    if (siteKey.startsWith(prefix)) return excluded(siteKey, why)
  }
  if (EXCLUDED_SITES[siteKey]) return excluded(siteKey, EXCLUDED_SITES[siteKey])

  if (siteKey.startsWith('/personal/')) {
    const upn = siteKey.slice('/personal/'.length)
    if (upn !== OWNER_ONEDRIVE_SEGMENT) {
      return {
        allowed: false,
        kind: 'excluded',
        siteKey,
        label: siteKey,
        reason:
          `This is another person's OneDrive (${siteKey}). The pipeline files personal scans only into ` +
          `Kurtis's own OneDrive, because he is the owner and the data subject for that material.`,
        warnings: [],
      }
    }
    return {
      allowed: true,
      kind: 'owner-onedrive',
      siteKey,
      label: "Kurtis's OneDrive",
      reason: "Destination is Kurtis's own OneDrive — the personal-document and _Needs Review path.",
      warnings: [],
    }
  }

  if (FILING_SITES[siteKey]) {
    return {
      allowed: true,
      kind: 'filing-site',
      siteKey,
      label: FILING_SITES[siteKey],
      reason: `Destination is the ${FILING_SITES[siteKey]} site, a confirmed filing destination.`,
      warnings: [],
    }
  }

  if (CONFIRM_FIRST_SITES[siteKey]) {
    return {
      allowed: true,
      kind: 'confirm-before-routing',
      siteKey,
      label: CONFIRM_FIRST_SITES[siteKey],
      reason: `Destination is ${CONFIRM_FIRST_SITES[siteKey]}.`,
      warnings: [
        `${siteKey} is not a confirmed scan destination. It was filed anyway, but say so in the log ` +
          `and in the notification so a wrong routing is caught in review.`,
      ],
    }
  }

  return {
    allowed: true,
    kind: 'unrecognized-site',
    siteKey,
    label: siteKey,
    reason:
      `Destination site ${siteKey} is not in the 2026-09-07 site inventory. It is allowed because the ` +
      `pipeline is meant to route to sites created after that inventory was taken.`,
    warnings: [
      `${siteKey} was not in the site inventory when this pipeline was built. Confirm it is a real ` +
        `department site and not something that should be excluded.`,
    ],
  }
}

function excluded(siteKey: string, why: string): DestinationVerdict {
  return {
    allowed: false,
    kind: 'excluded',
    siteKey,
    label: siteKey,
    reason:
      `${siteKey} is on the routing exclusion list (${why}). Scans are never filed here. Re-route to a ` +
      `department site, or to Kurtis's OneDrive Scans/_Needs Review if the document could not be identified.`,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// Filename policy
// ---------------------------------------------------------------------------

/** Characters SharePoint/OneDrive reject in an item name. */
const ILLEGAL_NAME_CHARS = /["*:<>?/\\|]/
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

/** SharePoint's own per-segment limit. */
export const MAX_FILENAME_LENGTH = 128

export interface FilenameVerdict {
  ok: boolean
  filename: string
  problems: string[]
}

/**
 * Validate the filename the classifier chose. Deliberately validate-and-refuse
 * rather than silently repair: a meaningful filename is the whole point of this
 * pipeline (the scanner's own `20260907_090410_Raven_Scan.pdf` says nothing),
 * so a name quietly rewritten under the caller is a name nobody reviewed.
 */
export function validateScanFilename(input: unknown): FilenameVerdict {
  const filename = typeof input === 'string' ? input : ''
  const problems: string[] = []

  if (filename.trim() === '') problems.push('Filename is empty.')
  if (filename !== filename.trim()) problems.push('Filename has leading or trailing whitespace.')
  if (filename.startsWith('.') || filename.endsWith('.')) problems.push('Filename starts or ends with a dot.')
  if (!/\.pdf$/i.test(filename)) {
    problems.push('Filename must end in .pdf — the scanner produces PDFs and the extension is not rewritten.')
  }
  if (ILLEGAL_NAME_CHARS.test(filename)) {
    problems.push('Filename contains a character SharePoint rejects: " * : < > ? / \\ |')
  }
  if (CONTROL_CHARS.test(filename)) problems.push('Filename contains a control character.')
  if (filename.includes('~')) problems.push('Filename contains "~", which SharePoint reserves.')
  if (filename.length > MAX_FILENAME_LENGTH) {
    problems.push(
      `Filename is ${filename.length} characters; SharePoint caps a name segment at ${MAX_FILENAME_LENGTH}.`
    )
  }
  if (/raven_scan/i.test(filename)) {
    problems.push(
      'Filename still contains "Raven_Scan". That is the scanner\'s generic name, which says nothing about ' +
        'the document — replacing it is the reason this pipeline exists.'
    )
  }

  return { ok: problems.length === 0, filename, problems }
}
