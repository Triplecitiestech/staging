# Raven Scan Filing Pipeline — connector reference

*Built 2026-09-07. Branch `claude/raven-scan-filing-pipeline-liy2au`.*

Replaces the manual handling of Raven scanner output. Scans arrive in
`kurtis@triplecitiestech.com` from `raw39v@import.raven.com` as
"Document From Kurtis Florance" with a generic attachment name
(`20260907_090410_Raven_Scan.pdf`) that says nothing about the document.
These tools read the scan, file it under a meaningful name, and log the row.

**The classifier is the model. The routing policy is code.** Deciding what a
document *is* stays in the conversation; deciding where it *may go* is enforced
in `src/lib/scan-filing/destinations.ts` and cannot be talked around.

---

## 1 · The constraint the design turns on

A typical scan is ~936,000 bytes — about 1,248,000 base64 characters, on the
order of **400,000 tokens** for one document. Eight arrived between 08:34 and
10:05 on 2026-09-07 alone.

So **bytes never pass through the conversation**. There is deliberately no tool
that returns a raw attachment, and one must not be added — a unit test asserts
no tool schema mentions `contentBytes` or `base64Content`.

Instead:

| Path | Cost | When |
|---|---|---|
| Extracted text | small | The PDF has a real text layer |
| Page images (MuPDF, 150 DPI) | ~3,000 tokens/page | Everything else — the normal Raven case |
| Server-side upload | 0 | Filing |

Raven scans generally have **no text layer**: two already-filed ones extracted
zero characters, and the SharePoint index only ever matches the literal string
`Raven_Scan`, never document body text.

---

## 2 · The tools

| Tool | Access | Kill switch | Notes |
|---|---|---|---|
| `scan_probe_render` | read | **none** | Generates its own image; no credential, no mailbox, no document |
| `scan_list_attachments` | read | `CONNECTOR_SCAN_WRITES_ENABLED` | Metadata only — the `$select` excludes `contentBytes` |
| `scan_render_attachment` | read | `CONNECTOR_SCAN_WRITES_ENABLED` | Text or page images, never the file |
| `scan_file_attachment` | write | `CONNECTOR_SCAN_WRITES_ENABLED` | Mailbox → drive, server-side, read-back verified |
| `scan_log_append` | write | `CONNECTOR_SCAN_WRITES_ENABLED` | Append-only, live header row, read-back verified |
| `scan_log_columns` | read | `CONNECTOR_SCAN_WRITES_ENABLED` | Reports the log's shape without writing |

All six return the standard structured failure envelope
(`{failure:{reasonCode, message, evidence, remediation, fixableBy}}`).

### Why the probe is not behind the kill switch

`scan_probe_render` exists to answer *whether MCP image content blocks reach the
model at all*, which the entire design is gated on — the fallback if they do not
is a paid OCR service. That question has to be answerable **before** the app has
a secret or a site grant. It touches no mailbox and no document, so there is
nothing for a switch to protect.

It reports two things **separately**: the image block, and whether the MuPDF
renderer loads. Collapsing them would make either failure uninterpretable — a
lesson this connector has already paid for once, with `kqm_probe_connection`
reporting the first mechanism that worked and calling the other doc wrong.

The image contains a **random 4-digit code**. Read it back. A tool returning an
image only proves the connector built one, which was never the thing in doubt.

### Why the writes are direct, not staged

The stage → human-approval → execute gate exists for **instance configuration**
(Autotask picklists, UniFi firewall rules) where a wrong write is hard to see and
hard to undo. These are one document filed into a folder and one appended log
row, both visible and correctable by hand. What guards them instead:

- one kill switch over the whole surface,
- the destination check, which runs **before anything is fetched or written**,
- **no `replace` conflict behaviour, by schema** — not "discouraged", not
  expressible; a scan overwriting a filed document destroys a record with
  nothing left to recover it from, and this pipeline runs unattended,
- read-back verification on every upload and every log row.

---

## 3 · The routing policy

`classifyDestination()` reads the **drive's own `webUrl` as Graph reports it** —
never a site name the caller supplied, which would only echo the caller's
assumption back.

**Refused outright:**

| Destination | Why |
|---|---|
| `/sites/appcatalog` | App Catalog — SharePoint plumbing |
| `/sites/inky-exclude`, `/sites/inky-journaling`, `/sites/inky-users` | INKY mail-security plumbing, empty |
| `/sites/allcompany`, `/sites/AllCompany.8205616.imeweost` | Empty / Viva Engage artifact |
| `/sites/allsalesteam-*` | Outlook Customer Manager, dead since 2018 — matched by **prefix**, because the inventory recorded its GUID truncated |
| tenant root | No `/sites/` or `/personal/` segment |
| any other person's OneDrive | Kurtis is the owner and data subject for the personal-document decision; nobody else is |
| anything not `*.sharepoint.com` | Outside the tenant |

**Allowed and recognised:** Accounting, Administration, Billing Department,
Human Resources, Low Voltage, Marketing, Sales, Tech Support, and Kurtis's own
OneDrive.

**Allowed and flagged:** Policy Center, TCT Team, Triple Cities Tech (hub) — real
sites nobody confirmed as scan targets — and **any site not in the 2026-09-07
inventory**. The last one is deliberate: the owner's requirement is "any and all
appropriate SharePoint sites, including sites that do not exist yet", so a new
department site works the day it is created. It files, and it warns. Surface the
warning; do not swallow it.

**Filenames** are validated, never repaired. A name still containing
`Raven_Scan` is refused — replacing it is the reason this pipeline exists — as
are path separators, SharePoint's illegal characters, and anything over 128
characters. A filename quietly rewritten under the caller is a filename nobody
reviewed.

---

## 4 · Configuration

### Entra app — done

**TCT Scan Filer (connector)**, client id
`e28b8696-3a31-4713-822e-fbd46f46f7e2`, single tenant, no redirect URI. A
dedicated app, following the one-app-per-surface convention this tenant already
uses. Not the staff-SSO app, not the HR records app.

### Mail.Read — done and verified 2026-09-07

Supplied by **Exchange Application RBAC**, not by Entra consent:

| Object | Value |
|---|---|
| Management scope | `TCT-ScanConnector-KurtisMailboxOnly` |
| Scope filter | `Alias -eq 'kurtis'` |
| Role assignment | `Application Mail.Read-91d67e04-8fa2-4047-9056-c00036e9f8ae` |

`Test-ServicePrincipalAuthorization` reports **InScope True** for `kurtis@` and
**False** for a control mailbox. The control row is the load-bearing evidence:
least privilege is demonstrated, not assumed.

> **Never grant `Mail.Read` tenant-wide admin consent to this app.** Microsoft's
> documentation is explicit that an Entra grant and an App RBAC scope are
> **unioned** — a tenant-wide grant would silently give this app every mailbox in
> the company, defeating the scope entirely. Re-verify after any permission
> change to the app.

### Environment variables

```
CONNECTOR_SCAN_WRITES_ENABLED=true      # kill switch, whole surface bar the probe
SCAN_FILER_TENANT_ID=...
SCAN_FILER_CLIENT_ID=e28b8696-3a31-4713-822e-fbd46f46f7e2
SCAN_FILER_CLIENT_SECRET=...            # created by Kurtis in Entra; never pasted into chat
SCAN_LOG_DRIVE_ID=...
SCAN_LOG_ITEM_ID=...
# optional
SCAN_MAILBOX=kurtis@triplecitiestech.com
SCAN_LOG_WORKSHEET=Scans
```

Vercel project **`staging`** (`prj_yBXZpU15i8b1SaSVUs83iHsWBhKu`), team
`kurtis-florances-projects`.

---

## 5 · The SharePoint permission model — the open decision, narrowed

The build spec left three options and said to resolve it here. One of them is
now settled, on evidence:

**Delegated `Files.ReadWrite.All` through the connector's existing Entra auth
cannot work.** The connector's OAuth store
(`src/lib/connector/oauth/store.ts`) persists only the user's **email**, client
id, scope and expiry — no Entra access token and no Entra refresh token — and the
access tokens the connector mints are its own JWTs signed with
`CONNECTOR_OAUTH_SIGNING_KEY`, carrying `scp`/`azp`/`email` and nothing
Graph-capable. There is no token to exchange, so there is nothing to call Graph
with as the signed-in technician.

That rules out the *existing* auth. It does not rule out someone later building a
separate delegated flow (storing a long-lived refresh token for Kurtis) — that
would be new work with its own trade-offs, not a switch to flip.

**So the remaining choice is Kurtis's, and it is a real one:**

| Model | Blast radius | New sites | Cost |
|---|---|---|---|
| `Sites.Selected`, granted per site | 8–11 named sites | A manual grant each time | A forgotten grant fails as a `PERMISSION_DENIED` naming the site — noisy, but a scan sits unfiled until someone acts |
| `Sites.ReadWrite.All` | Every site in the tenant | Automatic | One standing tenant-wide write credential, hard to walk back once code depends on it |

**The code works identically either way.** The excluded sites are unreachable in
routing regardless of what the grant permits, which is exactly why the exclusion
list lives in code. Recommendation: start with `Sites.Selected` on the eight
department sites plus Kurtis's OneDrive, and revisit only if the per-site grants
actually become a maintenance problem in practice — the failure mode is visible
and recoverable, and the tenant-wide grant is not easily undone.

---

## 6 · Standing it up

Steps 1–4 are prerequisites. Step 5 is the gate the whole design rests on — do it
before provisioning anything else.

1. **Create the client secret** on TCT Scan Filer (connector) in Entra and set
   `SCAN_FILER_*` in the Vercel `staging` project. Claude never handles it.
   → https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/e28b8696-3a31-4713-822e-fbd46f46f7e2/isMSAApp~/false

2. **Decide the SharePoint model** (section 5) and make the grant.

3. **Create the scan log workbook** — an `.xlsx` on a sheet named `Scans`, with
   this header row, selected and turned into an Excel table via
   *Insert → Table* with "My table has headers" ticked:

   | Scan ID | Received | Original filename | Identified as | Renamed to | Filed to | Source email | Rio notified | Confidence | Notes |
   |---|---|---|---|---|---|---|---|---|---|

   Column order is yours to change and columns are yours to add — the tool reads
   the live header row on every call and pads anything it has no input for.
   Set `SCAN_LOG_DRIVE_ID` and `SCAN_LOG_ITEM_ID`.

4. **Set `CONNECTOR_SCAN_WRITES_ENABLED=true`** and redeploy.

5. **Run `scan_probe_render` and read the four digits back.** This is
   prerequisite 8 from the build spec and it gates everything downstream.
   - Digits read correctly → the image path works; proceed.
   - `renderEngine.available: false` with the digits readable → image blocks are
     fine and the MuPDF WASM asset did not reach the serverless bundle. A
     packaging fix, not a redesign.
   - No image visible at all → **stop.** The design falls back to server-side OCR
     (Azure AI Document Intelligence `prebuilt-read`, per-page cost) and section 1
     needs revisiting before anything else is built.

6. **Reconnect the connector** so the six new tools appear — a session's tool
   list caches at connect time. Confirm with `tct_connector_capabilities`.

7. **Run `scan_log_columns`** to confirm the workbook is wired up. It writes
   nothing and reports the live headers, the row count and the next Scan ID.

8. **Run manually for one week, notifying Kurtis only, with Rio's notification
   off.** Review the log daily. This is not caution, it is measurement: the log
   from the first week is the only evidence of whether the classifier picks the
   right site often enough for Rio to act on a notification. If it misfiles a
   quarter of the time, Rio starts checking every notification by hand and the
   system has made his job worse.

---

## 7 · Running it — the daily loop

Each scheduled run starts with **no memory of any previous run**, so it must
establish state from the systems themselves, not from anything remembered.

1. **Find unprocessed scans.** The Microsoft 365 connector (delegated as Kurtis)
   lists mail: `from:raw39v@import.raven.com`, excluding whatever marks a
   processed message. **Mark processed messages** — move them to a
   `Scans/Processed` mail folder or apply a category — and filter on that mark,
   never on date alone. The scan filer app itself is read-only on mail
   (`Mail.ReadWrite` is configured but unused), so the marking is the M365
   connector's job.
2. **`scan_list_attachments`** → the attachment id.
3. **`scan_render_attachment`** → read the pages. If they do not establish what
   the document is, say so — do not file a guess.
4. **`scan_file_attachment`** → work documents to the department site, personal
   documents to OneDrive `Documents`, anything unidentified to OneDrive
   `Scans/_Needs Review`. Match the naming convention already in use, e.g.
   `Form 1099-NEC 2025 Wells Family $7815.15 Compensation.pdf`.
5. **`scan_log_append`** → one row, always, including for `_Needs Review`.
6. **Notify Rio** (`teams_send_chat_message`, chat id
   `19:9cad8b29-897e-40f5-a48b-8d15e271ee15_ad5a82d8-cdc4-40a7-bf5d-ae28ec21ba23@unq.gbl.spaces`)
   **only for a work document, and only after `scan_file_attachment` returned
   `verified: true`.** Notification is driven by destination, not by confidence:
   anything filed to a SharePoint site notifies him. Personal documents do not —
   not as a risk gate, just because he has no use for them.
7. **Log a zero-scan run** as a note. A scanner that silently stops producing
   email looks exactly like a quiet week.

---

## 8 · Escalation

| Condition | What it means |
|---|---|
| `POLICY_BLOCKED` on a destination | The routing guardrail **held**. Do not look for a way around it. Re-route, or send it to `_Needs Review`. |
| `PERMISSION_DENIED` on a drive path | A site grant is missing. Entra/SharePoint change, not a code fix. |
| `PERMISSION_DENIED` on a mail path | The Exchange Application RBAC assignment is gone or no longer resolves. Re-verify with `Test-ServicePrincipalAuthorization`. |
| `NOT_IMPLEMENTED` naming `mupdf` | The WASM asset did not reach the serverless bundle. A build task, not a permissions problem. |
| `verified: false` on an upload | The file may not be filed. Open the destination in SharePoint before re-uploading — a blind retry is how one scan ends up filed twice under two names. |
| `PRECONDITION_FAILED` naming `%%EOF` or MuPDF | The downloaded file is not a complete, openable PDF. Open the attachment in Outlook: if it opens there, it is a connector bug; if not, the scan must be redone. **Retrying unchanged gives the same result.** |
| `INVALID_INPUT` "is not a PDF" | Wrong attachment id — a scan email carries exactly one `application/pdf` attachment. |
| `Test-ServicePrincipalAuthorization` reports the app in-scope for any other mailbox | **Stop.** A tenant-wide `Mail.Read` grant is defeating the scope. Remove the Entra grant before the connector goes live. |
| A document lands on the wrong site | Recoverable — the log row carries the source email link. Re-file from there and count the miss in the week-one review. |
| Misfile rate looks high in the week-one review | Do not enable Rio's notification. Tighten the routing rules against the live folder taxonomy first. |

---

## 7a · Integrity: what is checked, and what is deliberately not

`scan_render_attachment` and `scan_file_attachment` validate the **artifact**,
never a byte count:

| Check | Catches |
|---|---|
| `%PDF-` header | Not a PDF at all → `INVALID_INPUT` |
| `%%EOF` in the last 2 KB | **Truncation** — a cut-off PDF keeps its header and loses its tail |
| MuPDF opens it, pageCount >= 1 | Structural corruption |

The verdict is returned as `integrity` on both tools, alongside `bytes` (what
was downloaded) and `reportedSize` (the attachment resource's own field).

**Why not compare those two numbers?** Because that was the first design and it
rejected **8 of 8 real scans**: the shortfall was exactly **392 bytes** on files
from 155,669 to 1,565,339 bytes and identical on retry. A constant offset
independent of file size is an envelope, not data loss — the two fields measure
different things for a `fileAttachment`, and Microsoft does not document which
one `size` counts. The failure also told the caller to retry, which loops forever.

**There is no 392-byte tolerance and none should be added.** The constant is
undocumented and may differ by attachment type or tenant; encoding it would swap
a wrong measurement for a fragile one. A test asserts the verdict never contains
that number.

`openable: null` means **not checked** (the renderer could not load), never
"fine" — the reason is stated alongside it, and the structural checks still applied.

---

## 8a · Connector tool diagnostics — `GET /api/connector/diagnostics/tools`

Read-only. Auth = `MIGRATION_SECRET` (bearer header or `?secret=`). Writes
nothing, calls no vendor API, invokes no tool handler, touches no kill switch.

Built 2026-09-08 during an unresolved investigation: the connector reported
**185 registered** tools while the client advertised **179**, with the six
`scan_*` tools missing, and `tct_connector_capabilities` reported those six with
**empty parameter lists** while `hr_*` returned full ones.

It registers the real surface through `registerAllConnectorTools()` — the same
function both live mounts use, not a second copy of the tool list — then drives
a **real MCP client over an in-memory transport** and compares what was
registered against what that client receives. Reading the SDK's internal
registry would have answered a different question while looking like the same
answer.

```powershell
$r = Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/connector/diagnostics/tools' `
  -Headers @{ Authorization = "Bearer $env:MIGRATION_SECRET" }
$r.summary
$r.mismatches
$r.tools | Where-Object { $_.name -like 'scan_*' } | Format-Table
```

How to read `summary`:

| Result | Meaning |
|---|---|
| `registered` = `emittedToClient`, `mismatches` empty | The server is self-consistent. If the Claude client still advertises fewer, **the drop is downstream of this server** and no server-side change will fix it. |
| `registeredButNotEmitted` > 0 | The server is the cause; `mismatches` names the tools. |
| A row with `recordedParamCount` ≠ `emittedPropertyCount` | The recording proxy and the emitted schema disagree for that tool. |
| A row with `recordedDescriptionLength` 0 | The recording proxy threw for that tool and fell back — which is the one code path that produces empty parameters. |

`emittedHasSchemaKey` is not cosmetic: a tool registered with **no**
`inputSchema` emits `{type, properties}` with no `$schema` key, while
`inputSchema: {}` emits one **with** it. If anything downstream validates tool
schemas strictly, that is the difference it would act on.

---

## 9 · Not in this repo

`Set-ScanConnectorMailboxScope.ps1` — the script that configured the Exchange
Application RBAC scope on 2026-09-07 — lives outside the repo. It should be
committed by whoever holds it rather than re-authored here: a second copy of a
script that has already been run against production would diverge from what
actually ran, and this pipeline's whole posture is that a claim is licensed by
what was tested, not by what was written afterwards.

To re-verify the scope without it:

```powershell
Connect-ExchangeOnline -Organization triplecitiestechcom.onmicrosoft.com
Test-ServicePrincipalAuthorization -Identity 'TCT MCP Scan Connector' -Resource 'kurtis@triplecitiestech.com'
Test-ServicePrincipalAuthorization -Identity 'TCT MCP Scan Connector' -Resource 'Alex@triplecitiestech.com'
```

The first must report `InScope True`; the second must report `False`.

---

## 10 · Related

| Document | Relationship |
|---|---|
| `docs/gotchas.md` → Raven scan filing | Field notes and the reasons behind the non-obvious choices |
| `src/lib/graph-workbook.ts` | The shared live-header row planner, used by this log and the ER log |
| SharePoint folder taxonomy / filing conventions | The routing rules depend on it; a taxonomy change moves the classifier's target |
| Scheduled task inventory | Add an entry once the daily task exists |
