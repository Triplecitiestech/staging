/**
 * SharePoint URL parser — normalizes every URL shape we've seen pasted
 * from a browser address bar into a canonical server-relative path.
 *
 * Supported inputs:
 *
 *   1. Direct folder URL
 *      https://tenant.sharepoint.com/sites/Site/Shared%20Documents/Policies
 *
 *   2. SharePoint UI "list view" URL — what you get when you click into
 *      a folder in the browser. The folder is referenced via the `id`
 *      query param, NOT the pathname (pathname always ends in
 *      Forms/AllItems.aspx).
 *      https://tenant.sharepoint.com/sites/Site/Shared%20Documents/Forms/AllItems.aspx?id=/sites/Site/Shared%20Documents/Policies
 *
 *   3. Share dialog redirect
 *      https://tenant.sharepoint.com/:f:/r/sites/Site/Shared%20Documents/Policies
 *
 *   4. Custom-named document library (not just "Shared Documents")
 *      https://tenant.sharepoint.com/sites/Site/Policy%20Library/Drafts
 *
 * Output is a server-relative path starting with /sites/{siteName}/...,
 * plus the hostname and siteName broken out. Callers compare the path
 * against the site's drive webUrls to find the matching library at
 * scan time, which avoids hard-coding library names.
 */

export interface ParsedSharePointUrl {
  hostname: string
  siteName: string
  /** Server-relative path starting with `/sites/{siteName}/...`. */
  serverRelativePath: string
}

export function parseSharePointUrl(input: string): ParsedSharePointUrl {
  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    throw new Error('Not a valid URL. Paste the full https:// link to the SharePoint folder.')
  }

  if (!parsed.hostname.endsWith('.sharepoint.com')) {
    throw new Error(`Not a SharePoint URL (host: ${parsed.hostname}). Expected a *.sharepoint.com link.`)
  }

  const hostname = parsed.hostname

  // CASE 2: UI list-view URL — folder is in ?id=, not the pathname.
  // The id is itself server-relative ("/sites/Foo/Library/Folder").
  const idParam = parsed.searchParams.get('id')
  let rawPath: string
  if (idParam && idParam.startsWith('/')) {
    rawPath = idParam
  } else {
    rawPath = parsed.pathname
    // CASE 3: share-redirect prefix `/:x:/r/sites/...` — strip up to /r/.
    const rIdx = rawPath.indexOf('/r/sites/')
    if (rIdx >= 0) rawPath = rawPath.slice(rIdx + 2) // keep the `/sites/...`
  }

  // Decode percent-escapes so paths like `IT%20%26%20Policies` become
  // `IT & Policies`. The pretty-printed form matches what the operator sees.
  const decoded = safeDecode(rawPath)

  const segments = decoded.split('/').filter(Boolean)
  const sitesIdx = segments.indexOf('sites')
  if (sitesIdx === -1 || !segments[sitesIdx + 1]) {
    throw new Error(
      `URL doesn't contain a /sites/{siteName}/ segment. Got: ${decoded.slice(0, 120)}`
    )
  }
  const siteName = segments[sitesIdx + 1]

  // Strip the SharePoint UI artifacts that get glued onto the path when
  // the address bar shows the list view. Forms/AllItems.aspx is never a
  // real folder — it's the page that renders the folder.
  const tail = segments
    .slice(sitesIdx)
    .filter((s) => s.toLowerCase() !== 'allitems.aspx' && s !== 'Forms')
  const serverRelativePath = '/' + tail.join('/')

  return { hostname, siteName, serverRelativePath }
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export interface SharePointDrive {
  id: string
  name: string
  webUrl: string
}

/**
 * Of all drives on a site, pick the one whose webUrl is a prefix of the
 * requested folder URL. This is how we discover which document library
 * the folder lives in without hard-coding library names.
 *
 * Returns the matching drive plus the path remaining after the library
 * root (relative to the drive root, ready to feed Graph as
 * `/drives/{driveId}/root:/<remainder>:/children`).
 */
export function pickMatchingDrive(
  drives: SharePointDrive[],
  serverRelativePath: string
): { drive: SharePointDrive; relativeToDrive: string } | null {
  let best: { drive: SharePointDrive; relativeToDrive: string; matchLength: number } | null = null
  for (const d of drives) {
    let drivePath: string
    try {
      drivePath = safeDecode(new URL(d.webUrl).pathname)
    } catch {
      continue
    }
    const dp = drivePath.replace(/\/+$/, '')
    if (serverRelativePath === dp || serverRelativePath.startsWith(dp + '/')) {
      const remainder = serverRelativePath === dp ? '' : serverRelativePath.slice(dp.length + 1)
      if (!best || dp.length > best.matchLength) {
        best = { drive: d, relativeToDrive: remainder, matchLength: dp.length }
      }
    }
  }
  return best ? { drive: best.drive, relativeToDrive: best.relativeToDrive } : null
}
