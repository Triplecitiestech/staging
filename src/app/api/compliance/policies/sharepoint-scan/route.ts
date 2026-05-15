/**
 * POST /api/compliance/policies/sharepoint-scan — Scan a SharePoint folder and list all documents
 *
 * URL parsing supports every SharePoint URL shape we've seen pasted from
 * a browser address bar:
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
 *   4. Custom-named document library
 *      https://tenant.sharepoint.com/sites/Site/Policy%20Library/Drafts
 *
 * We normalize all of these to a server-relative path (`/sites/{site}/{library}/{folders...}`),
 * then look up the matching drive on the site by comparing each drive's
 * webUrl prefix. This avoids hard-coding "Shared Documents" as the only
 * valid library name (a real bug we just hit: a customer used a
 * "Policy Center" library and the old parser routed the request at
 * Forms/AllItems.aspx and got a 404).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTenantCredentials } from '@/lib/graph'
import {
  parseSharePointUrl,
  pickMatchingDrive,
  safeDecode,
  type SharePointDrive,
} from '@/lib/compliance/sharepoint-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface SharePointFile {
  id: string
  name: string
  size: number
  lastModified: string
  webUrl: string
  mimeType: string | null
}

async function getGraphToken(companyId: string): Promise<string> {
  const creds = await getTenantCredentials(companyId)
  if (!creds) throw new Error('M365 credentials not configured for this company.')

  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Graph auth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

// Parser + drive-matcher live in src/lib/compliance/sharepoint-url.ts so
// they're testable independently of the Next.js route surface.

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { companyId: string; folderUrl: string }
    if (!body.companyId || !body.folderUrl) {
      return NextResponse.json({ error: 'companyId and folderUrl are required' }, { status: 400 })
    }

    const parsedUrl = parseSharePointUrl(body.folderUrl)
    const token = await getGraphToken(body.companyId)

    // 1. Site lookup by hostname + site name.
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${parsedUrl.hostname}:/sites/${encodeURIComponent(parsedUrl.siteName)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (!siteRes.ok) {
      const errBody = await siteRes.text().catch(() => '')
      if (siteRes.status === 404) {
        throw new Error(
          `Site "${parsedUrl.siteName}" not found on ${parsedUrl.hostname}. ` +
          `Verify the URL points at a real SharePoint site and that the app registration has Sites.Read.All permission.`
        )
      }
      throw new Error(`Site lookup failed: ${siteRes.status} ${errBody.substring(0, 160)}`)
    }
    const siteData = (await siteRes.json()) as { id: string; webUrl: string }

    // 2. List drives on the site so we can pick the library that contains
    //    the requested folder. This is the step that fixes the "Shared
    //    Documents hard-coded" bug — it works for any library name.
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (!drivesRes.ok) {
      const errBody = await drivesRes.text().catch(() => '')
      throw new Error(`Could not list document libraries: ${drivesRes.status} ${errBody.substring(0, 160)}`)
    }
    const drivesData = (await drivesRes.json()) as { value: SharePointDrive[] }
    if (drivesData.value.length === 0) {
      throw new Error('This site has no document libraries.')
    }

    const matched = pickMatchingDrive(drivesData.value, parsedUrl.serverRelativePath)
    if (!matched) {
      const known = drivesData.value.map((d) => safeDecode(new URL(d.webUrl).pathname)).join(', ')
      throw new Error(
        `URL doesn't point at any document library on this site. ` +
        `The folder must live inside one of: ${known}. ` +
        `Pasted path: ${parsedUrl.serverRelativePath}`
      )
    }

    // 3. List items in the matched folder (Graph URL-encodes spaces and
    //    other special chars per-segment automatically when we use the
    //    relativeToDrive path with `:/...:/children`).
    let listingUrl: string
    if (matched.relativeToDrive.length === 0) {
      listingUrl = `https://graph.microsoft.com/v1.0/drives/${matched.drive.id}/root/children`
    } else {
      // Per-segment encode so `&`, `#`, etc. survive transport.
      const encodedRelative = matched.relativeToDrive
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
      listingUrl = `https://graph.microsoft.com/v1.0/drives/${matched.drive.id}/root:/${encodedRelative}:/children`
    }

    const allFiles: SharePointFile[] = []
    let nextUrl: string | null = listingUrl

    while (nextUrl) {
      const filesRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!filesRes.ok) {
        const errBody = await filesRes.text().catch(() => '')
        if (filesRes.status === 404) {
          throw new Error(
            `Folder not found inside "${matched.drive.name}": "${matched.relativeToDrive || '(root)'}". ` +
            `Verify the folder still exists and the app has access. ` +
            `Raw Graph response: ${errBody.substring(0, 160)}`
          )
        }
        throw new Error(`Failed to list folder contents: ${filesRes.status} ${errBody.substring(0, 200)}`)
      }
      const filesData = (await filesRes.json()) as {
        value: Array<{
          id: string
          name: string
          size: number
          lastModifiedDateTime: string
          webUrl: string
          file?: { mimeType: string }
          folder?: { childCount: number }
        }>
        '@odata.nextLink'?: string
      }

      for (const item of filesData.value) {
        if (item.file) {
          const ext = item.name.split('.').pop()?.toLowerCase()
          if (['txt', 'md', 'pdf', 'docx', 'doc', 'rtf'].includes(ext ?? '')) {
            allFiles.push({
              id: item.id,
              name: item.name,
              size: item.size,
              lastModified: item.lastModifiedDateTime,
              webUrl: item.webUrl,
              mimeType: item.file.mimeType,
            })
          }
        }
      }

      nextUrl = filesData['@odata.nextLink'] ?? null
    }

    return NextResponse.json({
      success: true,
      siteId: siteData.id,
      driveId: matched.drive.id,
      driveName: matched.drive.name,
      folderPath: matched.relativeToDrive || '(library root)',
      files: allFiles,
      totalFiles: allFiles.length,
    })
  } catch (err) {
    console.error('[compliance/sharepoint-scan] Error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to scan SharePoint folder',
    }, { status: 500 })
  }
}
