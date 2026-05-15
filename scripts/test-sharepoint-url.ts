/**
 * LOCAL-ONLY smoke test for the SharePoint URL parser. Verifies the
 * three URL shapes we've seen from operators (direct, UI ?id= viewer,
 * share-redirect /:f:/r/) all normalize to the same canonical
 * server-relative path, and that pickMatchingDrive correctly chooses
 * the library that contains the folder.
 *
 * Run:  npx tsx scripts/test-sharepoint-url.ts
 */

import { parseSharePointUrl, pickMatchingDrive } from '../src/lib/compliance/sharepoint-url'

let failures = 0
function assertEq<T>(label: string, got: T, want: T) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) {
    console.log(`OK   ${label}`)
  } else {
    failures++
    console.log(`FAIL ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
  }
}

// ---------------------------------------------------------------------------
// parseSharePointUrl — every shape collapses to the same canonical form
// ---------------------------------------------------------------------------

assertEq('direct folder', parseSharePointUrl('https://tenant.sharepoint.com/sites/Foo/Shared%20Documents/Policies'), {
  hostname: 'tenant.sharepoint.com',
  siteName: 'Foo',
  serverRelativePath: '/sites/Foo/Shared Documents/Policies',
})

// The operator's exact failing URL shape: UI list view with ?id=
assertEq('UI viewer with ?id=', parseSharePointUrl('https://triplecitiestechcom.sharepoint.com/sites/PolicyCenter/Shared%20Documents/Forms/AllItems.aspx?id=/sites/PolicyCenter/Shared%20Documents/IT%20%26%20Compliance%20Policies'), {
  hostname: 'triplecitiestechcom.sharepoint.com',
  siteName: 'PolicyCenter',
  serverRelativePath: '/sites/PolicyCenter/Shared Documents/IT & Compliance Policies',
})

assertEq('share /:f:/r/ redirect', parseSharePointUrl('https://tenant.sharepoint.com/:f:/r/sites/Foo/Shared%20Documents/Policies'), {
  hostname: 'tenant.sharepoint.com',
  siteName: 'Foo',
  serverRelativePath: '/sites/Foo/Shared Documents/Policies',
})

assertEq('custom library name', parseSharePointUrl('https://tenant.sharepoint.com/sites/Foo/Policy%20Library/Drafts'), {
  hostname: 'tenant.sharepoint.com',
  siteName: 'Foo',
  serverRelativePath: '/sites/Foo/Policy Library/Drafts',
})

assertEq('library root only', parseSharePointUrl('https://tenant.sharepoint.com/sites/Foo/Shared%20Documents'), {
  hostname: 'tenant.sharepoint.com',
  siteName: 'Foo',
  serverRelativePath: '/sites/Foo/Shared Documents',
})

assertEq('deeply nested', parseSharePointUrl('https://tenant.sharepoint.com/sites/Foo/Shared%20Documents/A/B/C/D'), {
  hostname: 'tenant.sharepoint.com',
  siteName: 'Foo',
  serverRelativePath: '/sites/Foo/Shared Documents/A/B/C/D',
})

// Negative cases
for (const [label, url] of [
  ['non-sharepoint domain', 'https://example.com/foo'],
  ['garbage input',         'not a url'],
  ['empty string',          ''],
  ['sharepoint host but no /sites/', 'https://tenant.sharepoint.com/Lists/MyList'],
]) {
  try {
    parseSharePointUrl(url)
    failures++
    console.log(`FAIL ${label} → should have thrown`)
  } catch (err) {
    console.log(`OK   ${label} → rejected (${err instanceof Error ? err.message.slice(0, 60) : err})`)
  }
}

// ---------------------------------------------------------------------------
// pickMatchingDrive — discovers which library the folder lives in
// ---------------------------------------------------------------------------

const drives = [
  { id: 'drv-shared',  name: 'Documents',      webUrl: 'https://tenant.sharepoint.com/sites/Foo/Shared%20Documents' },
  { id: 'drv-policy',  name: 'Policy Library', webUrl: 'https://tenant.sharepoint.com/sites/Foo/Policy%20Library' },
]

assertEq('match Shared Documents root',  pickMatchingDrive(drives, '/sites/Foo/Shared Documents'),
  { drive: drives[0], relativeToDrive: '' })

assertEq('match Shared Documents nested', pickMatchingDrive(drives, '/sites/Foo/Shared Documents/IT & Compliance Policies'),
  { drive: drives[0], relativeToDrive: 'IT & Compliance Policies' })

assertEq('match Policy Library root',    pickMatchingDrive(drives, '/sites/Foo/Policy Library'),
  { drive: drives[1], relativeToDrive: '' })

assertEq('match Policy Library deep',    pickMatchingDrive(drives, '/sites/Foo/Policy Library/Drafts/v3'),
  { drive: drives[1], relativeToDrive: 'Drafts/v3' })

assertEq('no matching drive',            pickMatchingDrive(drives, '/sites/Foo/SiteAssets/Things'),
  null)

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall ok')
