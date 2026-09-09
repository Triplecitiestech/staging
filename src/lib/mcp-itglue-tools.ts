// src/lib/mcp-itglue-tools.ts
//
// Registers the connector's IT Glue tools (reads + document/flexible-asset
// writes) on the MCP server. Mirrors the shape of mcp-write-tools.ts and uses
// the single ItGlueClient (src/lib/it-glue.ts) — no parallel client.
//
// Credentials: the connector authenticates with IT_GLUE_CONNECTOR_API_KEY when
// set, otherwise falls back to IT_GLUE_API_KEY (the read key the compliance
// engine uses). Using a dedicated connector key keeps blast radius isolated.
//
// PASSWORDS: WRITE-ONLY, AND THE READ PATH STAYS CLOSED (changed 2026-09-09).
// Until now no tool here touched /passwords at all. That was OUR blast-radius
// decision, not an IT Glue limitation, and it became a blocker: a customer sent
// an invoice carrying a portal security code, asked for it to be documented,
// and the connector could only hand back a manual task.
//
// The gate is narrowed rather than removed, because writing a credential IN and
// reading one OUT are different risks. A write puts a secret the human already
// has into the vault. A read would let anything holding an MCP token pull every
// customer credential out of it. So there is itglue_create_password and
// itglue_update_password and NOTHING ELSE — no get, no list, no search, no
// retrieval of a stored secret — and none may be added. Passwords also remain
// excluded on both ends of itglue_relate_items and itglue_upload_attachment.
//
// Behind CONNECTOR_ITGLUE_PASSWORD_WRITES_ENABLED, default false, whose name is
// declared in TOOL_FACTS and read from that declaration.
//
// THE SECRET NEVER COMES BACK AND IS NEVER RECORDED: it is not echoed in the
// tool response, not written to the audit log, and not included in an error
// message — the client throws password errors WITHOUT the response body,
// because IT Glue's validation text can quote the value it rejected.
//
// Attribution note: IT Glue's API has no per-user impersonation (unlike
// Autotask), so writes are recorded under the API key's identity, not the
// individual signed-in technician.

import { z } from 'zod'
import { DOCUMENT_FOLDER_MOVE_UNSUPPORTED, ItGlueClient, type ItGlueDocument, type ItGlueDocumentFolder, type ItGlueLocation } from '@/lib/it-glue'
import { searchDocIndex, TCT_ORG_ID } from '@/lib/itglue-doc-index'
import { failureResult } from '@/lib/connector/failure-envelope'
import { structuredLog } from '@/lib/resilience'
import { randomUUID } from 'crypto'
import { ITGLUE_HTML_FIELD_NOTE, toItGlueHtml } from '@/lib/itglue-html'
import {
  MAX_LENGTH_PROVENANCE,
  normaliseFields,
  validateTraits,
  type NormalisedField,
} from '@/lib/itglue-flexible-asset-schema'

function itglue(): ItGlueClient {
  return new ItGlueClient({ apiKey: process.env.IT_GLUE_CONNECTOR_API_KEY || process.env.IT_GLUE_API_KEY })
}

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }
function fail(err: unknown) { const m = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true } }

function ensureConfigured(c: ItGlueClient) {
  if (!c.isConfigured()) throw new Error('IT Glue is not configured: set IT_GLUE_CONNECTOR_API_KEY (or IT_GLUE_API_KEY) in the environment.')
}

// Compact document shape for search results (keeps responses small).
function slimDoc(d: ItGlueDocument) {
  return {
    id: d.id,
    name: d.attributes.name,
    documentFolderId: d.attributes['document-folder-id'],
    url: d.attributes['resource-url'],
    updatedAt: d.attributes['updated-at'],
    archived: d.attributes.archived === true,
  }
}

/**
 * Surface IT Glue's native `archived` flag at the TOP LEVEL of a full document.
 *
 * itglue_org_documents returns raw IT Glue documents, where the flag lives at
 * `attributes.archived`, while the two search tools return it top-level via
 * slimDoc. Same fact, two paths — so a caller (or a skill) that learned to read
 * `doc.archived` from a search read `undefined` here, which is falsy, which
 * reads as "not archived". A stale SOP looking current is the exact failure
 * surfacing this flag was meant to prevent.
 *
 * ADDITIVE on purpose: `attributes` is left completely intact, so nothing that
 * already reads attributes.archived breaks. This only adds a second, uniform
 * place to find the same value.
 */
function withArchivedFlag(d: ItGlueDocument): ItGlueDocument & { archived: boolean } {
  return { ...d, archived: d.attributes.archived === true }
}

// Compact folder shape: parentId null = top-level; ancestorIds outermost-first.
function slimFolder(f: ItGlueDocumentFolder) {
  return {
    id: f.id,
    name: f.attributes.name,
    parentId: f.attributes['parent-id'] ?? null,
    ancestorIds: f.attributes['ancestor-ids'] ?? [],
    documentsCount: f.attributes['documents-count'] ?? null,
    restricted: f.attributes.restricted === true,
    url: f.attributes['resource-url'] ?? null,
  }
}


/**
 * Fetch a type's schema, validate the caller's traits against it, and convert
 * any Textbox (HTML) trait from plain text.
 *
 * ONE helper for create and update so the two cannot drift apart on what they
 * validate — the whole point of the fix is that a caller gets the same answer
 * either way.
 */
async function prepareTraits(
  c: ItGlueClient,
  flexibleAssetTypeId: string,
  traits: Record<string, unknown>,
  mode: 'create' | 'update',
): Promise<
  | { ok: true; traits: Record<string, unknown>; fields: NormalisedField[]; htmlConversions: Array<{ nameKey: string; notes: string[] }> }
  | { ok: false; problems: ReturnType<typeof validateTraits>; fields: NormalisedField[] }
> {
  const fields = normaliseFields(await c.getFlexibleAssetTypeFields(String(flexibleAssetTypeId)))

  // Convert BEFORE validating: conversion changes the string length, and the
  // length cap must be judged on what is actually written.
  const prepared: Record<string, unknown> = { ...traits }
  const htmlConversions: Array<{ nameKey: string; notes: string[] }> = []
  for (const f of fields) {
    if (!f.storesHtml) continue
    const v = prepared[f.nameKey]
    if (typeof v !== 'string' || !v.trim()) continue
    const converted = toItGlueHtml(v)
    if (converted.html !== v) {
      prepared[f.nameKey] = converted.html
      htmlConversions.push({ nameKey: f.nameKey, notes: converted.notes })
    }
  }

  const verdict = validateTraits(fields, prepared, mode)
  if (!verdict.valid) return { ok: false, problems: verdict, fields }
  return { ok: true, traits: prepared, fields, htmlConversions }
}

function traitValidationFailure(
  tool: string,
  verdict: ReturnType<typeof validateTraits>,
  details: Record<string, unknown>,
) {
  return failureResult({
    reasonCode: 'INVALID_INPUT',
    message: `NOTHING WAS WRITTEN. ${verdict.combinedMessage}`,
    evidence:
      'Validated locally against the type\'s own field schema (required flags, Select options and Tag targets come from IT Glue; the length cap is derived from the field kind — see maxLengthProvenance on itglue_flexible_asset_type_fields) BEFORE any request was sent.',
    remediation:
      'Fix every problem listed above in ONE go and call again. They are all reported together on purpose: IT Glue returns only the first failure per attempt, which is why creating a single asset previously took four round trips.',
    surface: 'itglue',
    tool,
    details: { ...details, problems: verdict.problems },
  })
}


// ---------------------------------------------------------------------------
// Password writes
// ---------------------------------------------------------------------------

export const ITGLUE_PASSWORD_WRITES_KILL_SWITCH = 'CONNECTOR_ITGLUE_PASSWORD_WRITES_ENABLED'

/** Default false: an unset switch is OFF, never on. */
export function itGluePasswordWritesEnabled(): boolean {
  return process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] === 'true'
}

/**
 * Audit one password write.
 *
 * WHAT IS RECORDED: who did it, which organization, the record NAME and id, and
 * WHICH FIELDS were set. WHAT IS NEVER RECORDED: the value of any of them. The
 * field NAMES are the useful audit signal ("the password was rotated on
 * 2026-09-09 by kurtis@") and they carry no secret; the values are the thing an
 * audit log must never become a copy of.
 *
 * The allowlist below is the enforcement, not a convention: only these keys can
 * reach the log line, so adding a `password` field to the tool later cannot
 * accidentally start logging it.
 */
const AUDITABLE_FIELDS = ['name', 'username', 'url', 'notes', 'passwordCategoryId', 'restricted', 'password'] as const

export function passwordAuditRecord(input: {
  action: 'create' | 'update'
  actor: string
  organizationId?: string | null
  recordId?: string | null
  recordName?: string | null
  suppliedKeys: string[]
}): { correlationId: string; operation: string } & Record<string, unknown> {
  return {
    correlationId: randomUUID(),
    operation: `connector_itglue_password_${input.action}`,
    actor: input.actor,
    organizationId: input.organizationId ?? null,
    recordId: input.recordId ?? null,
    // The record NAME is deliberately logged — it is how a human finds the
    // record later — and is never the secret. TCT's naming convention puts the
    // system and account in the name, not the credential.
    recordName: input.recordName ?? null,
    // Field names only. No values, ever.
    fieldsSet: input.suppliedKeys.filter((k) => (AUDITABLE_FIELDS as readonly string[]).includes(k)),
    secretLogged: false,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerItGlueTools(server: any) {
  // ── IT Glue reads ────────────────────────────────────────────────────────
  server.registerTool('itglue_search_orgs', { title: 'IT Glue: search organizations', description: 'Find a customer / client / company / account / org / site in IT GLUE by name (partial ok) and get its numeric organization id. This is the entry point to all of a customer\'s documentation — every other IT Glue tool (documents, SOPs, configurations, locations, flexible assets, quick notes, passwords) takes the organizationId this returns. Note this is IT Glue\'s own id, which is DIFFERENT from the Autotask companyID.', inputSchema: { query: z.string().describe('Organization name or partial name') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ query }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.searchOrganizations(query)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_configurations', { title: 'IT Glue: org configurations', description: 'List a customer\'s CONFIGURATIONS in IT Glue — their documented assets, devices, hardware and equipment: servers, workstations, firewalls, switches, access points, printers, NAS and so on, with make/model, serial, IP and status. Takes the numeric IT Glue organizationId from itglue_search_orgs (NOT an Autotask company id, and NOT a customer name). For a customer\'s sites and addresses use itglue_org_locations instead; a configuration\'s null location-id says nothing about whether locations exist.', inputSchema: { organizationId: z.string().describe('IT Glue organization id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getConfigurations(organizationId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_locations', { title: 'IT Glue: org locations (site addresses + their numeric ids)', description: 'List an IT Glue organization\'s LOCATIONS — its sites, offices, branches and addresses — returning each one\'s NUMERIC ID, name, full address and whether it is the primary location. Use it whenever you need a location id: Tag fields of type "Locations" (such as the required "Location(s)" trait on the Internet/WAN flexible asset type) take an ARRAY OF THESE NUMERIC IDS, not names. Nothing else in the connector returns a location id, so on 2026-09-09 the technician had to open the record in a browser and copy the id out of the URL. IMPORTANT — this tool is also the ONLY sound way to answer "does this customer have any locations": a configuration with a null location-id says nothing about whether locations exist, and reading it that way led to a duplicate location being created for a site that already had one. An empty list here is the only evidence of no locations. Read-only.', inputSchema: { organizationId: z.string().describe('IT Glue organization id (from itglue_search_orgs)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const rows = await c.getLocations(String(organizationId))
      const slim = rows.map((l: ItGlueLocation) => ({
        id: l.id,
        name: l.attributes.name,
        primary: l.attributes.primary === true,
        address: [l.attributes['address-1'], l.attributes['address-2'], l.attributes.city, l.attributes['region-name'], l.attributes['postal-code'], l.attributes['country-name']]
          .filter((p) => typeof p === 'string' && p.trim())
          .join(', ') || null,
        phone: l.attributes.phone ?? null,
      }))
      return ok({
        organizationId: String(organizationId),
        count: slim.length,
        note: slim.length
          ? 'Use the numeric id values for any Tag field whose tagType is "Locations" — pass them as an array, e.g. { "location-s": [12345] }.'
          : 'This organization has NO locations in IT Glue. That is established by this read returning an empty list — it is the only thing that establishes it. Before creating one, confirm with the user, because a location created in error is a duplicate someone has to clean up.',
        locations: slim,
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_flexible_asset_types', { title: 'IT Glue: flexible asset types', description: 'List all flexible asset types (structured documentation templates) in the account.', inputSchema: {} },
    async () => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAssetTypes()) } catch (e) { return fail(e) } })

  server.registerTool('itglue_flexible_asset_type_fields', { title: 'IT Glue: flexible asset type fields + their constraints', description: 'Get the SCHEMA of an IT Glue flexible asset type — every field, its trait name-key, and the constraints that decide whether a write will be accepted: whether it is REQUIRED, its MAXIMUM LENGTH, its input type, the exact permitted values for a Select, and for a Tag field the resource the tag points at plus how to resolve its ids. CALL THIS BEFORE itglue_create_flexible_asset OR itglue_update_flexible_asset. It exists because IT Glue rejects one problem per attempt: creating a single Internet/WAN asset on 2026-09-09 took four tries (link type blank, then location(s) blank, then a 255-character overflow) since none of those constraints were readable from the old raw payload. The create/update tools now validate against this schema locally and return every problem at once. NOTE ON maxLength: IT Glue publishes no length attribute, so it is DERIVED from the field kind and labelled as such — null means NOT KNOWN, never unlimited.', inputSchema: { flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id (from itglue_flexible_asset_types)'), includeRaw: z.boolean().optional().describe('Also return IT Glue\'s untouched JSON:API payload (default false — it is large and its constraints are already normalised above)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ flexibleAssetTypeId, includeRaw }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const raw = await c.getFlexibleAssetTypeFields(flexibleAssetTypeId)
      const fields = normaliseFields(raw)
      const required = fields.filter((f) => f.required && !f.presentational)
      return ok({
        flexibleAssetTypeId: String(flexibleAssetTypeId),
        fieldCount: fields.length,
        requiredFieldKeys: required.map((f) => f.nameKey),
        writeChecklist: required.length
          ? `${required.length} field(s) MUST be set on create or IT Glue refuses the write: ${required.map((f) => `${f.nameKey} (${f.kind}${f.tagType ? ` → ${f.tagType}` : ''})`).join(', ')}.`
          : 'No fields on this type are required.',
        maxLengthProvenance: MAX_LENGTH_PROVENANCE,
        htmlFieldKeys: fields.filter((f) => f.storesHtml).map((f) => f.nameKey),
        fields,
        ...(includeRaw ? { raw } : {}),
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_flexible_assets', { title: 'IT Glue: org flexible assets', description: 'List an organization\'s flexible assets of a given type (IT Glue requires the flexible asset type id).', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, flexibleAssetTypeId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAssetsByType(organizationId, flexibleAssetTypeId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_get_flexible_asset', { title: 'IT Glue: get flexible asset', description: 'Get a single flexible asset by id, including its current traits.', inputSchema: { id: z.string().describe('IT Glue flexible asset id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ id }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAsset(id)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_documents', { title: 'IT Glue: org documents', description: 'List documents (SOPs / runbooks / KB articles) for an organization id — the FULL library by default (root + all folders), paginated. Returns { documents, meta } where meta = { totalCount, totalPages, currentPage, pageSize, hasMore }. Page through with page/pageSize (max 1000), or pass documentFolderId to scope to one folder ("0" = root-only). ARCHIVED documents are EXCLUDED by default; set includeArchived=true to include them. Every returned document carries a top-level "archived" boolean — the same place itglue_search_documents and itglue_global_search put it — as well as IT Glue\'s own attributes.archived. Note: meta counts come from IT Glue and include archived docs, so a filtered page may return fewer than pageSize rows (archivedExcluded reports how many were dropped). Does NOT return passwords.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), page: z.number().int().min(1).optional().describe('Page number (default 1)'), pageSize: z.number().int().min(1).max(1000).optional().describe('Page size (default 100, max 1000)'), documentFolderId: z.string().optional().describe('Scope to a folder id (from itglue_list_document_folders), or "0" for root-only; default returns ALL documents'), includeArchived: z.boolean().optional().describe('Include archived documents (default false)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, page, pageSize, documentFolderId, includeArchived }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const { documents, meta } = await c.getDocumentsPage(organizationId, { page, pageSize, documentFolderId })
      const filtered = (includeArchived ? documents : documents.filter((d) => d.attributes.archived !== true)).map(withArchivedFlag)
      return ok({ documents: filtered, meta, includeArchived: !!includeArchived, archivedExcluded: documents.length - filtered.length })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_list_document_folders', { title: 'IT Glue: list document folders', description: 'List an organization\'s document folders so you can file a document into the right one instead of the org root: id, name, parentId (null = top-level), ancestorIds (path from root), documentsCount. Returns ALL folders by default (top-level + nested); pass parentId "0" for top-level only, or a folder id for its direct children. Use this to RESOLVE the target documentFolderId before itglue_create_document / itglue_move_document — never guess folder ids, and reuse an existing folder over creating a near-duplicate. Folder names can repeat in different branches, so disambiguate by parentId/ancestorIds, not name alone.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), parentId: z.string().optional().describe('Omit for ALL folders; "0" for top-level only; a folder id for its direct children') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, parentId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const folders = (await c.getDocumentFolders(organizationId, { parentId })).map(slimFolder)
      return ok({ organizationId, parentId: parentId ?? null, folderCount: folders.length, folders, note: folders.length === 0 ? 'No folders match. If the target folder is missing, create it with itglue_create_document_folder (confirm name + location with the user first).' : 'Pass a folder id as documentFolderId in itglue_create_document. Placement is create-time only — IT Glue\'s API cannot move an existing document into a folder.' })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_search_documents', { title: 'IT Glue: search documents', description: 'Find documents in ONE organization by keyword. When the org is indexed this is Postgres full-text over document NAME + CONTENT (ranked by relevance); it falls back to name-only search when the org has not been indexed yet. The response tags source: "index" | "live-name". ARCHIVED documents are EXCLUDED by default; set includeArchived=true to include them (each doc carries an "archived" flag so you never edit a stale SOP unaware). Returns compact { id, name, documentFolderId, url, updatedAt, archived }.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), query: z.string().describe('Words to match against document names'), includeArchived: z.boolean().optional().describe('Include archived documents (default false)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, query, includeArchived }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const idx = await searchDocIndex(organizationId, query, { includeArchived: !!includeArchived })
      if (idx) return ok({ source: 'index', organizationId, query, includeArchived: !!includeArchived, matchCount: idx.length, documents: idx })
      const all = await c.searchDocuments(organizationId, query)
      const docs = includeArchived ? all : all.filter((d) => d.attributes.archived !== true)
      return ok({ source: 'live-name', note: 'This org is not in the content index yet — matched on document NAME only. Content search becomes available once the org is indexed.', organizationId, query, includeArchived: !!includeArchived, archivedExcluded: all.length - docs.length, matchCount: docs.length, documents: docs.map(slimDoc) })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_global_search', { title: 'IT Glue: global document search', description: 'Search documents by keyword (document NAME + CONTENT when the org is indexed) across TCT\'s internal SOP org AND, optionally, a specific customer org — built for triage like "VPN down at Client X": pass the customer\'s organizationId to get BOTH TCT\'s SOP and the customer\'s own docs in one call. IT Glue has no account-wide search endpoint, so this scopes to the TCT org plus the passed org. Returns matches grouped by org, each tagged source: "index" | "live-name". ARCHIVED documents are EXCLUDED by default; set includeArchived=true to include them (each doc carries an "archived" flag).', inputSchema: { query: z.string().describe('Words to match against document names'), organizationId: z.string().optional().describe('Optional customer org id to include alongside the TCT SOP org'), includeArchived: z.boolean().optional().describe('Include archived documents (default false)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ query, organizationId, includeArchived }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const orgIds = Array.from(new Set([TCT_ORG_ID, organizationId].filter((v): v is string => !!v)))
      const results = []
      for (const orgId of orgIds) {
        const idx = await searchDocIndex(orgId, query, { includeArchived: !!includeArchived })
        if (idx) {
          results.push({ organizationId: orgId, isTctSopOrg: orgId === TCT_ORG_ID, source: 'index', includeArchived: !!includeArchived, matchCount: idx.length, documents: idx })
        } else {
          const all = await c.searchDocuments(orgId, query)
          const docs = includeArchived ? all : all.filter((d) => d.attributes.archived !== true)
          results.push({ organizationId: orgId, isTctSopOrg: orgId === TCT_ORG_ID, source: 'live-name', includeArchived: !!includeArchived, archivedExcluded: all.length - docs.length, matchCount: docs.length, documents: docs.map(slimDoc) })
        }
      }
      return ok({ query, orgsSearched: orgIds, results })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_get_quick_notes', { title: 'IT Glue: get quick notes', description: 'Return an organization\'s FULL (untruncated) Quick Notes HTML — e.g. the org-level help-desk reference. Reads the quick-notes field from the organization record.', inputSchema: { organizationId: z.string().describe('IT Glue organization id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getOrganizationQuickNotes(organizationId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_document_sections', { title: 'IT Glue: document sections', description: 'List the content sections (Text/Heading/Step blocks) of a document, including each section id and its HTML content.', inputSchema: { documentId: z.string().describe('IT Glue document id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getDocumentSections(documentId)) } catch (e) { return fail(e) } })

  // ── IT Glue writes (confirm exact content with the user before calling) ────
  server.registerTool('itglue_create_document', { title: 'IT Glue: create document', description: 'WRITE. Create a new IT Glue document under an organization with a rich-text body (HTML), optionally publishing it (default: draft). RESOLVE THE DESTINATION FOLDER FIRST — THIS IS THE ONLY CHANCE TO SET IT: IT Glue accepts document_folder_id on create and REJECTS it on every update, so a document that lands in the org root can only be moved by a human in the IT Glue UI (itglue_move_document cannot do it). Call itglue_list_document_folders and pass the matching folder id as documentFolderId; if no suitable folder exists, create one with itglue_create_document_folder or ask the user which folder to use BEFORE creating the document. Only leave documentFolderId unset when the user explicitly wants a root-level document. NEVER put passwords/credentials in a document. Only call after the user has approved the exact title, content, and folder placement.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), name: z.string().describe('Document title'), html: z.string().describe('Document body as HTML'), publish: z.boolean().optional().describe('Publish immediately; default false (draft)'), documentFolderId: z.string().optional().describe('Destination folder id from itglue_list_document_folders / itglue_create_document_folder. Omit ONLY for an explicitly root-level document — never default to root for SOPs') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, name, html, publish, documentFolderId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const converted = toItGlueHtml(String(html ?? ''))
      const result = await c.createDocumentWithBody({ organizationId, name, html: converted.html, publish: publish ?? false, documentFolderId })
      return ok({
        ...result,
        ...(converted.structureAdded || converted.charactersEscaped > 0 ? { htmlConversion: converted.notes } : {}),
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_create_document_folder', { title: 'IT Glue: create document folder', description: 'WRITE. Create a document folder under an organization; optional parentId nests it inside an existing folder. Check itglue_list_document_folders FIRST and reuse an existing folder instead of creating a near-duplicate name. Confirm the exact folder name and location with the user before calling. (The public API supports folder create/rename; folder DELETION is deliberately not exposed — do it in the IT Glue UI.)', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), name: z.string().describe('Folder name'), parentId: z.string().optional().describe('Optional parent folder id (from itglue_list_document_folders); omit for a top-level folder') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, name, parentId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const folder = await c.createDocumentFolder({ organizationId, name, parentId })
      return ok({ folder: slimFolder(folder), note: 'Use folder.id as documentFolderId in itglue_create_document — that is the only way to file a document into it through the API. Existing documents cannot be moved into it programmatically; a human must do that in the IT Glue UI.' })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_move_document', { title: 'IT Glue: move a document into a folder (NOT SUPPORTED BY THE API)', description: 'DOES NOT WORK — kept registered only so the reason is discoverable instead of guessable. IT Glue\'s API cannot move an existing document between folders: document_folder_id is marked "Not permitted in PUT/PATCH, optional in POST" in the developer reference, and IT Glue silently DROPS it on PATCH and answers 200 with the document unchanged. This tool therefore writes NOTHING and returns UPSTREAM_UNSUPPORTED (fixableBy: vendor) with the document\'s current folder. THE TWO THINGS THAT DO WORK: (1) pass documentFolderId when CREATING the document (itglue_create_document) — placement is create-time only; (2) for a document that already exists, a human moves it in the IT Glue UI (open the org\'s Documents list, tick the document, Move). Do not retry this tool, do not look for a connector workaround, and never report a move as done.', inputSchema: { documentId: z.string().describe('IT Glue document id'), documentFolderId: z.string().describe('Target folder id — recorded in the failure so the user can be told where to move it by hand') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, documentFolderId }: any) => {
      // Deliberately NO write attempt. The PATCH returns 200 and changes
      // nothing, so issuing it would only re-manufacture the ambiguity.
      let current: number | null | undefined
      let name: string | null = null
      try {
        const c = itglue(); ensureConfigured(c)
        const doc = await c.getDocument(String(documentId))
        current = doc?.attributes?.['document-folder-id'] ?? null
        name = doc?.attributes?.name ?? null
      } catch {
        // Best-effort context only — an unreadable document must not change the
        // verdict, which is about the API's capability, not this document.
      }
      const target = String(documentFolderId).trim()
      const alreadyThere = current != null && String(current) === target
      return failureResult({
        reasonCode: 'UPSTREAM_UNSUPPORTED',
        message:
          `IT Glue's API cannot move document ${documentId}${name ? ` ("${name}")` : ''} into folder ${target}. Nothing was written.` +
          (alreadyThere
            ? ' NOTE: the document is ALREADY in that folder, so no move is needed.'
            : current !== undefined
              ? ` It is currently in ${current == null ? 'the org root' : `folder ${current}`}.`
              : ''),
        evidence: DOCUMENT_FOLDER_MOVE_UNSUPPORTED,
        remediation: alreadyThere
          ? 'No action needed — the document is already in the requested folder. Confirm that to the user rather than reporting a move.'
          : `Tell the user the API cannot do this and give them the manual step: in IT Glue, open the organization's Documents list, tick "${name ?? documentId}", choose Move, and select the target folder. For any NEW document, set the folder at creation instead (itglue_create_document documentFolderId) — that is the only API-supported placement.`,
        surface: 'itglue',
        tool: 'itglue_move_document',
        details: { documentId, requestedDocumentFolderId: target, currentDocumentFolderId: current ?? null, alreadyInRequestedFolder: alreadyThere },
      })
    })

  server.registerTool('itglue_add_document_section', { title: 'IT Glue: add document section', description: `WRITE. Append a content section to an existing document. resourceType is Document::Text (default), Document::Heading (needs level 1-6), or Document::Step (optional duration in minutes). ${ITGLUE_HTML_FIELD_NOTE} (A Document::Heading is plain text by definition and is NOT converted.) Confirm the exact content with the user first. IMPORTANT: section changes land on the document's DRAFT revision only — what techs see (the published version) is unchanged until itglue_publish_document is called for the document.`, inputSchema: { documentId: z.string().describe('IT Glue document id'), content: z.string().describe('Section content: plain text or HTML for Text/Step (plain text is converted); plain text for Heading'), resourceType: z.enum(['Document::Text', 'Document::Heading', 'Document::Step']).optional().describe('Section type (default Document::Text)'), level: z.number().int().min(1).max(6).optional().describe('Heading level, Document::Heading only'), duration: z.number().int().positive().optional().describe('Duration in minutes, Document::Step only') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, content, resourceType, level, duration }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      // A Heading is plain text by definition, so it is not run through the
      // HTML converter — wrapping a heading in <p> would corrupt it.
      const isHeading = resourceType === 'Document::Heading'
      const converted = isHeading ? null : toItGlueHtml(String(content ?? ''))
      const section = await c.addDocumentSection(documentId, { content: converted ? converted.html : content, resourceType, level, duration })
      return ok({
        section,
        ...(converted && (converted.structureAdded || converted.charactersEscaped > 0) ? { htmlConversion: converted.notes } : {}),
        note: 'Saved to the document DRAFT. The published version techs see is unchanged until itglue_publish_document is called.',
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_document_section', { title: 'IT Glue: update document section', description: `WRITE. Replace the content of an existing document section (find its id with itglue_document_sections). ${ITGLUE_HTML_FIELD_NOTE} Confirm the exact content with the user first. IMPORTANT: section changes land on the document's DRAFT revision only — what techs see (the published version) is unchanged until itglue_publish_document is called for the document.`, inputSchema: { documentId: z.string().describe('IT Glue document id'), sectionId: z.string().describe('Document section id'), content: z.string().describe('New section content — plain text or HTML; plain text is converted') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, sectionId, content }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const converted = toItGlueHtml(String(content ?? ''))
      const section = await c.updateDocumentSection(documentId, sectionId, { content: converted.html })
      return ok({
        section,
        ...(converted.structureAdded || converted.charactersEscaped > 0 ? { htmlConversion: converted.notes } : {}),
        note: 'Saved to the document DRAFT. The published version techs see is unchanged until itglue_publish_document is called.',
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_publish_document', { title: 'IT Glue: publish a document', description: 'WRITE. Publish an existing document so its current DRAFT becomes the version techs see, then VERIFIES via a read-back that published-at/draft actually flipped (a publish that silently no-ops is reported as published:false, not success). Required after itglue_add_document_section / itglue_update_document_section — section edits alone never change the published version. CAUTION: publishing pushes the ENTIRE current draft live, including any earlier unpublished edits by others — confirm with the user before calling.', inputSchema: { documentId: z.string().describe('IT Glue document id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const result = await c.publishDocument(documentId)
      return ok({ documentId, ...result, note: result.published ? 'Verified: the current draft is now the published version.' : 'The publish call succeeded but the read-back does NOT show the document as published — check it in the IT Glue UI before trusting it.' })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_rename_document', { title: 'IT Glue: rename a document', description: 'WRITE. Change a document\'s title. RENAME ONLY — it cannot also move the document: IT Glue rejects document_folder_id on PATCH (create-time placement only), so passing documentFolderId here used to be accepted and silently ignored. It now REFUSES the whole call with UPSTREAM_UNSUPPORTED before renaming anything, so you never get a half-applied write; call again without documentFolderId to rename, and have the folder change done in the IT Glue UI. The new title is VERIFIED by read-back. Inline links built on ID-based URLs survive renames, but confirm the exact new title with the user first — titles drive the TCT naming convention (System - Topic).', inputSchema: { documentId: z.string().describe('IT Glue document id'), name: z.string().describe('New document title'), documentFolderId: z.string().optional().describe('NOT SUPPORTED by IT Glue\'s API — supplying it fails the call instead of silently ignoring it. Omit it') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, name, documentFolderId }: any) => {
      // Refuse BEFORE writing: renaming and reporting the ignored folder would
      // leave the caller with a partial result they cannot distinguish.
      if (documentFolderId !== undefined) {
        return failureResult({
          reasonCode: 'UPSTREAM_UNSUPPORTED',
          message: `Refused before writing anything: this call asked to rename document ${documentId} AND move it to folder ${documentFolderId}, but IT Glue's API cannot move a document. The rename was NOT applied, so nothing is half-done.`,
          evidence: DOCUMENT_FOLDER_MOVE_UNSUPPORTED,
          remediation: `Call itglue_rename_document again with documentId and name ONLY — that part works. Then tell the user the folder change must be done by hand in IT Glue (Documents list → tick the document → Move), because no API supports it.`,
          surface: 'itglue',
          tool: 'itglue_rename_document',
          details: { documentId, requestedName: name, rejectedDocumentFolderId: String(documentFolderId), renameApplied: false },
        })
      }
      try {
        const c = itglue(); ensureConfigured(c)
        await c.updateDocument(String(documentId), { name })
        // Read back rather than trusting the PATCH echo — the folder defect was
        // invisible for twelve days precisely because a 200 was taken as proof.
        const after = await c.getDocument(String(documentId))
        const actual = after?.attributes?.name ?? null
        if (actual !== name) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `IT Glue accepted the rename of document ${documentId} but the read-back still shows "${actual ?? 'unknown'}", not "${name}". Do not report the rename as done.`,
            evidence: 'Verified by re-reading the document after the PATCH instead of trusting its status code.',
            remediation: 'Check the document in the IT Glue UI — it may be restricted, archived, or locked by another edit.',
            surface: 'itglue',
            tool: 'itglue_rename_document',
            details: { documentId, requestedName: name, actualName: actual },
          })
        }
        return ok({ id: after.id, name: actual, renamed: true, note: 'Verified by read-back: the document now carries this title. Title metadata applies immediately (it is not part of the draft/publish cycle).' })
      } catch (e) { return fail(e) }
    })

  // Related Items / attachments: the /passwords resource stays out of bounds
  // on BOTH ends, same policy as every other tool in this module.
  const RELATABLE_SOURCES = ['documents', 'configurations', 'contacts', 'domains', 'locations', 'ssl_certificates', 'flexible_assets', 'checklists', 'tickets'] as const
  const RELATABLE_DESTINATIONS = ['Document', 'Configuration', 'Contact', 'Domain', 'Location', 'SSL Certificate', 'Flexible Asset', 'Checklist', 'Ticket'] as const

  server.registerTool('itglue_relate_items', { title: 'IT Glue: link two records (Related Items)', description: 'WRITE. Create ONE native "Related Items" link (the right-hand pane) between two records — e.g. relate a Document to a sibling Document in its SOP set. One call links BOTH panes (verified in-tenant 2026-07-08): the API stores a single bidirectional relation and rejects the inverse with 422 "a similar or inverse relation already exists" — do NOT call a second time in the other direction. One pair per call. Passwords are excluded on both ends by policy.', inputSchema: { sourceType: z.enum(RELATABLE_SOURCES).describe('Source record type (URL form), e.g. documents'), sourceId: z.string().describe('Source record id'), destinationType: z.enum(RELATABLE_DESTINATIONS).describe('Destination record type (label form), e.g. Document'), destinationId: z.string().describe('Destination record id'), notes: z.string().optional().describe('Optional note stored on the link') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ sourceType, sourceId, destinationType, destinationId, notes }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.createRelatedItem({ sourceType, sourceId, destinationType, destinationId, notes })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_upload_attachment', { title: 'IT Glue: upload an attachment', description: 'WRITE. Attach ONE file (e.g. a screenshot) to a record, provided as base64 content. Hard 10 MB cap (IT Glue limit). Practical note: this works best when the file already exists where Claude runs (scripts, Claude Code sessions); pasting large images through chat is unreliable. NEVER attach anything containing credentials. Confirm the target record with the user first.', inputSchema: { resourceType: z.enum(RELATABLE_SOURCES).describe('Parent record type (URL form), e.g. documents'), resourceId: z.string().describe('Parent record id'), fileName: z.string().describe('File name shown on the record, e.g. connect-form.png'), base64Content: z.string().describe('Base64-encoded file bytes (no data: prefix)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ resourceType, resourceId, fileName, base64Content }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.uploadAttachment({ resourceType, resourceId, fileName, base64Content })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_create_flexible_asset', { title: 'IT Glue: create flexible asset (validated first)', description: `WRITE. Create a structured IT Glue flexible asset. Call itglue_flexible_asset_type_fields first for the trait name-keys and their constraints. THIS TOOL VALIDATES LOCALLY BEFORE WRITING and returns EVERY problem in one combined error — missing required fields, values over the length cap, values that are not one of a Select's permitted options, Tag fields not given an array of numeric ids, and unrecognised trait keys (which IT Glue silently ignores, so you would otherwise believe a field was set when it was dropped). This exists because IT Glue reports one failure per attempt: a single Internet/WAN asset took four round trips on 2026-09-09. For a Tag field of type Locations, get the numeric ids from itglue_org_locations — never pass a location name. ${ITGLUE_HTML_FIELD_NOTE} Confirm the values with the user first.`, inputSchema: { organizationId: z.string().describe('IT Glue organization id'), flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id'), traits: z.record(z.string(), z.any()).describe('Object keyed by field name-key -> value. Tag fields take an array of numeric ids; Textbox fields accept plain text and are converted to HTML for you') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, flexibleAssetTypeId, traits }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const prep = await prepareTraits(c, flexibleAssetTypeId, traits ?? {}, 'create')
      if (!prep.ok) {
        return traitValidationFailure('itglue_create_flexible_asset', prep.problems, { organizationId, flexibleAssetTypeId })
      }
      const asset = await c.createFlexibleAsset({ organizationId, flexibleAssetTypeId, traits: prep.traits })
      return ok({
        asset,
        validatedLocally: true,
        ...(prep.htmlConversions.length ? { htmlConversions: prep.htmlConversions } : {}),
      })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_flexible_asset', { title: 'IT Glue: update flexible asset (validated first)', description: `WRITE. Update traits on an existing IT Glue flexible asset. Pass ONLY the traits you want to change — existing traits are preserved (the tool GET-merges before PATCH, because IT Glue PATCH is otherwise destructive). VALIDATED LOCALLY BEFORE WRITING, returning every problem at once: length caps, Select options, Tag id arrays, and unrecognised trait keys. A required field you simply do not mention is fine here (an update is a patch of named fields), but explicitly setting a required field BLANK is refused, because IT Glue would reject it. ${ITGLUE_HTML_FIELD_NOTE} Confirm with the user first.`, inputSchema: { id: z.string().describe('IT Glue flexible asset id'), traits: z.record(z.string(), z.any()).describe('Changed traits, keyed by field name-key'), flexibleAssetTypeId: z.string().optional().describe('The asset\'s type id. Optional — it is read off the asset when omitted, which costs one extra request') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ id, traits, flexibleAssetTypeId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      // The type id is needed to validate. Read it off the asset when the
      // caller did not supply it, rather than skipping validation — an
      // unvalidated update is the defect, not a fallback.
      let typeId = flexibleAssetTypeId ? String(flexibleAssetTypeId) : null
      if (!typeId) {
        const current = await c.getFlexibleAsset(String(id))
        if (!current) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Nothing was written: flexible asset ${id} was not found, so its type could not be read and the traits could not be validated.`,
            evidence: 'Read the asset before writing in order to resolve its flexible-asset-type-id.',
            remediation: 'Check the id with itglue_org_flexible_assets, or pass flexibleAssetTypeId explicitly.',
            surface: 'itglue',
            tool: 'itglue_update_flexible_asset',
            details: { id: String(id) },
          })
        }
        typeId = String(current.attributes['flexible-asset-type-id'])
      }
      const prep = await prepareTraits(c, typeId, traits ?? {}, 'update')
      if (!prep.ok) {
        return traitValidationFailure('itglue_update_flexible_asset', prep.problems, { id: String(id), flexibleAssetTypeId: typeId })
      }
      const asset = await c.updateFlexibleAsset(String(id), prep.traits)
      return ok({
        asset,
        validatedLocally: true,
        ...(prep.htmlConversions.length ? { htmlConversions: prep.htmlConversions } : {}),
      })
    } catch (e) { return fail(e) } })

  // ── Password writes (create + update only; no read path exists) ───────────
  const passwordDisabled = (tool: string) =>
    failureResult({
      reasonCode: 'POLICY_BLOCKED',
      message: `${tool} is turned off: the ${ITGLUE_PASSWORD_WRITES_KILL_SWITCH} kill switch is not set to "true", so nothing was written and no credential left this session.`,
      evidence: `Read ${ITGLUE_PASSWORD_WRITES_KILL_SWITCH} from the environment at call time; it is off by default.`,
      remediation: `Kurtis: set ${ITGLUE_PASSWORD_WRITES_KILL_SWITCH}=true in the Vercel project and redeploy to allow password WRITES. Reading passwords back out is a separate matter and is not implemented at all — there is no tool for it and none is planned.`,
      surface: 'itglue',
      tool,
    })

  const requireActor = (extra: unknown): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const email = (extra as any)?.authInfo?.extra?.email
    if (typeof email !== 'string' || !email) {
      throw new Error(
        'Cannot attribute this password write: no signed-in user email on the connector session. A credential write is not made anonymously — sign in so the write is recorded under your name.',
      )
    }
    return email
  }

  server.registerTool('itglue_create_password', { title: 'IT Glue: create a password record (write-only)', description: 'WRITE. Store a credential in IT Glue as a PASSWORD record — a login, portal account, security code, PIN, API key or licence key — under a customer organization, so it lives in the vault instead of in an email or an invoice. WRITE ONLY, AND DELIBERATELY ONE-DIRECTIONAL: this tool puts a secret IN. There is no companion tool to read, list, search or retrieve a stored password, and none will be added — writing a credential the human already has is a different risk from being able to pull every customer credential out. The secret you pass is never echoed back in the response, never written to the audit log, and never included in an error message (IT Glue password errors are returned WITHOUT the vendor body, because a validation message can quote the value it rejected). The write is attributed to you by name, with the organization and record name logged and the values not. ALWAYS confirm the exact record name, username and value with the user before calling, and follow the TCT naming convention (System - Account) so the record is findable. Gated by a kill switch that is OFF by default.', inputSchema: { organizationId: z.string().describe('IT Glue organization id (from itglue_search_orgs)'), name: z.string().describe('Record name, TCT convention "System - Account", e.g. "Spectrum Business - Portal Login". This IS logged, so keep the secret out of it'), password: z.string().describe('The credential value. Never echoed, never logged, never in an error message'), username: z.string().optional().describe('Username / login / account identifier'), url: z.string().optional().describe('Login URL for the system'), notes: z.string().optional().describe('Context — what this is for, who provided it, any expiry. Do NOT put the credential here'), passwordCategoryId: z.string().optional().describe('IT Glue password category id, if the account uses categories'), restricted: z.boolean().optional().describe('Restrict visibility to the record\'s own permissions') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'itglue_create_password'
      if (!itGluePasswordWritesEnabled()) return passwordDisabled(TOOL)
      try {
        const actor = requireActor(extra)
        const c = itglue(); ensureConfigured(c)
        const record = await c.createPassword({
          organizationId: args.organizationId,
          name: args.name,
          password: args.password,
          username: args.username,
          url: args.url,
          notes: args.notes,
          passwordCategoryId: args.passwordCategoryId,
          restricted: args.restricted,
        })
        structuredLog.info(
          passwordAuditRecord({
            action: 'create',
            actor,
            organizationId: String(args.organizationId),
            recordId: record.id,
            recordName: record.name,
            suppliedKeys: Object.keys(args ?? {}),
          }),
          `IT Glue password record created by ${actor}`,
        )
        return ok({
          created: true,
          // Metadata only, by construction — the client's return shape has no
          // password field to leak.
          record,
          attributedTo: actor,
          note: 'Stored. The credential value is not returned here and is not in any log — to see it, open the record in IT Glue. There is no connector tool that can read it back.',
        })
      } catch (e) { return fail(e) }
    })

  server.registerTool('itglue_update_password', { title: 'IT Glue: update a password record (write-only)', description: 'WRITE. Update an existing IT Glue PASSWORD record — rotate the credential, correct the username or URL, or add notes. Pass only the fields you want to change. WRITE ONLY: like the create tool there is no way to read the current value first, and that is deliberate, so a rotation replaces the value rather than being computed from it. The new secret is never echoed back, never logged and never included in an error message. Attributed to you by name, with the record id and the FIELD NAMES you changed recorded — never their values. You need the record id, which comes from the create response or from the IT Glue UI; there is no password search tool. Confirm the change with the user first. Gated by a kill switch that is OFF by default.', inputSchema: { id: z.string().describe('IT Glue password record id'), password: z.string().optional().describe('New credential value. Never echoed, never logged'), name: z.string().optional().describe('New record name'), username: z.string().optional().describe('New username / login'), url: z.string().optional().describe('New login URL'), notes: z.string().optional().describe('New notes. Do NOT put the credential here'), passwordCategoryId: z.string().optional().describe('IT Glue password category id'), restricted: z.boolean().optional().describe('Restrict visibility to the record\'s own permissions') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      const TOOL = 'itglue_update_password'
      if (!itGluePasswordWritesEnabled()) return passwordDisabled(TOOL)

      const changeKeys = Object.keys(args ?? {}).filter((k) => k !== 'id' && args[k] !== undefined)
      if (changeKeys.length === 0) {
        return failureResult({
          reasonCode: 'INVALID_INPUT',
          message: 'Nothing was written: no fields to change were supplied.',
          evidence: 'Checked before any request was made.',
          remediation: 'Pass at least one of password, name, username, url, notes, passwordCategoryId or restricted.',
          surface: 'itglue',
          tool: TOOL,
          details: { id: String(args?.id ?? '') },
        })
      }

      try {
        const actor = requireActor(extra)
        const c = itglue(); ensureConfigured(c)
        const record = await c.updatePassword(String(args.id), {
          password: args.password,
          name: args.name,
          username: args.username,
          url: args.url,
          notes: args.notes,
          passwordCategoryId: args.passwordCategoryId,
          restricted: args.restricted,
        })
        structuredLog.info(
          passwordAuditRecord({
            action: 'update',
            actor,
            organizationId: record.organizationId != null ? String(record.organizationId) : null,
            recordId: record.id,
            recordName: record.name,
            suppliedKeys: changeKeys,
          }),
          `IT Glue password record updated by ${actor}`,
        )
        return ok({
          updated: true,
          record,
          fieldsChanged: changeKeys,
          attributedTo: actor,
          note: 'Updated. No credential value is returned here or in any log, and no connector tool can read it back — open the record in IT Glue to see it.',
        })
      } catch (e) { return fail(e) }
    })
}
