/**
 * POST /api/compliance/policies/sharepoint-scan — Scan a SharePoint folder and list all documents
 * POST /api/compliance/policies/sharepoint-import — Bulk import documents from SharePoint
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTenantCredentials } from '@/lib/graph'

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

/**
 * Get a Graph token for a company's tenant.
 */
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

/**
 * Parse a SharePoint URL to extract hostname, site name, and folder path.
 */
function parseSharePointUrl(url: string): { hostname: string; siteName: string; folderPath: string } {
  const parsed = new URL(url)
  const hostname = parsed.hostname
  const pathParts = parsed.pathname.split('/')
  const sitesIdx = pathParts.indexOf('sites')
  if (sitesIdx === -1) throw new Error('Invalid SharePoint URL — must contain /sites/{siteName}/')
  const siteName = pathParts[sitesIdx + 1]

  // Extract folder path after document library root
  const docsIdx = pathParts.findIndex((p) =>
    decodeURIComponent(p) === 'Shared Documents' || p === 'Shared%20Documents' || p === 'Documents'
  )
  const folderPath = docsIdx >= 0
    ? pathParts.slice(docsIdx).map(decodeURIComponent).join('/')
    : ''

  return { hostname, siteName, folderPath }
}

/**
 * POST /api/compliance/policies/sharepoint-scan
 * Scan a SharePoint folder URL and return all document files found.
 */
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

    const token = await getGraphToken(body.companyId)
    const { hostname, siteName, folderPath } = parseSharePointUrl(body.folderUrl)

    // Get site ID
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${hostname}:/sites/${siteName}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (!siteRes.ok) throw new Error(`SharePoint site not found: ${siteName} (${siteRes.status})`)
    const siteData = (await siteRes.json()) as { id: string }

    // List all files in the folder (and subfolders)
    let graphPath: string
    if (folderPath) {
      graphPath = `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive/root:/${folderPath}:/children`
    } else {
      graphPath = `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive/root/children`
    }

    const allFiles: SharePointFile[] = []
    let nextUrl: string | null = graphPath

    // Paginate through all files
    while (nextUrl) {
      const filesRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!filesRes.ok) {
        const errText = await filesRes.text().catch(() => '')
        throw new Error(`Failed to list folder contents: ${filesRes.status} ${errText.substring(0, 200)}`)
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
        // Only include files (not folders), and only policy-like documents
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
      folderPath: folderPath || '(root)',
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
