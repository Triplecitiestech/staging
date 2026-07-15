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
// PASSWORDS ARE OUT OF SCOPE BY CONSTRUCTION: no tool here ever calls the IT
// Glue /passwords resource, so the connector cannot read or write credentials.
//
// Attribution note: IT Glue's API has no per-user impersonation (unlike
// Autotask), so writes are recorded under the API key's identity, not the
// individual signed-in technician.

import { z } from 'zod'
import { ItGlueClient, type ItGlueDocument } from '@/lib/it-glue'
import { searchDocIndex, TCT_ORG_ID } from '@/lib/itglue-doc-index'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerItGlueTools(server: any) {
  // ── IT Glue reads ────────────────────────────────────────────────────────
  server.registerTool('itglue_search_orgs', { title: 'IT Glue: search organizations', description: 'Search IT Glue organizations by name (partial ok). Returns matches with id + name; use the id in other IT Glue tools.', inputSchema: { query: z.string().describe('Organization name or partial name') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ query }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.searchOrganizations(query)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_configurations', { title: 'IT Glue: org configurations', description: 'List IT Glue configurations (assets/devices) for an organization id.', inputSchema: { organizationId: z.string().describe('IT Glue organization id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getConfigurations(organizationId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_flexible_asset_types', { title: 'IT Glue: flexible asset types', description: 'List all flexible asset types (structured documentation templates) in the account.', inputSchema: {} },
    async () => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAssetTypes()) } catch (e) { return fail(e) } })

  server.registerTool('itglue_flexible_asset_type_fields', { title: 'IT Glue: flexible asset type fields', description: 'List the fields (schema) of a flexible asset type. The field name-keys are the trait keys to use when creating/updating a flexible asset.', inputSchema: { flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ flexibleAssetTypeId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAssetTypeFields(flexibleAssetTypeId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_flexible_assets', { title: 'IT Glue: org flexible assets', description: 'List an organization\'s flexible assets of a given type (IT Glue requires the flexible asset type id).', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, flexibleAssetTypeId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAssetsByType(organizationId, flexibleAssetTypeId)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_get_flexible_asset', { title: 'IT Glue: get flexible asset', description: 'Get a single flexible asset by id, including its current traits.', inputSchema: { id: z.string().describe('IT Glue flexible asset id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ id }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.getFlexibleAsset(id)) } catch (e) { return fail(e) } })

  server.registerTool('itglue_org_documents', { title: 'IT Glue: org documents', description: 'List documents (SOPs / runbooks / KB articles) for an organization id — the FULL library by default (root + all folders), paginated. Returns { documents, meta } where meta = { totalCount, totalPages, currentPage, pageSize, hasMore }. Page through with page/pageSize (max 1000), or pass documentFolderId to scope to one folder ("0" = root-only). ARCHIVED documents are EXCLUDED by default; set includeArchived=true to include them (each doc carries an "archived" flag). Note: meta counts come from IT Glue and include archived docs, so a filtered page may return fewer than pageSize rows (archivedExcluded reports how many were dropped). Does NOT return passwords.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), page: z.number().int().min(1).optional().describe('Page number (default 1)'), pageSize: z.number().int().min(1).max(1000).optional().describe('Page size (default 100, max 1000)'), documentFolderId: z.string().optional().describe('Scope to a folder id, or "0" for root-only; default returns ALL documents'), includeArchived: z.boolean().optional().describe('Include archived documents (default false)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, page, pageSize, documentFolderId, includeArchived }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const { documents, meta } = await c.getDocumentsPage(organizationId, { page, pageSize, documentFolderId })
      const filtered = includeArchived ? documents : documents.filter((d) => d.attributes.archived !== true)
      return ok({ documents: filtered, meta, includeArchived: !!includeArchived, archivedExcluded: documents.length - filtered.length })
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
  server.registerTool('itglue_create_document', { title: 'IT Glue: create document', description: 'WRITE. Create a new IT Glue document under an organization with a rich-text body (HTML), optionally publishing it (default: draft). NEVER put passwords/credentials in a document. Only call after the user has approved the exact title and content.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), name: z.string().describe('Document title'), html: z.string().describe('Document body as HTML'), publish: z.boolean().optional().describe('Publish immediately; default false (draft)'), documentFolderId: z.string().optional().describe('Optional document folder id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, name, html, publish, documentFolderId }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.createDocumentWithBody({ organizationId, name, html, publish: publish ?? false, documentFolderId })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_add_document_section', { title: 'IT Glue: add document section', description: 'WRITE. Append a content section to an existing document. resourceType is Document::Text (default), Document::Heading (needs level 1-6), or Document::Step (optional duration in minutes). Confirm the exact content with the user first. IMPORTANT: section changes land on the document\'s DRAFT revision only — what techs see (the published version) is unchanged until itglue_publish_document is called for the document.', inputSchema: { documentId: z.string().describe('IT Glue document id'), content: z.string().describe('Section content: HTML for Text/Step, plain text for Heading'), resourceType: z.enum(['Document::Text', 'Document::Heading', 'Document::Step']).optional().describe('Section type (default Document::Text)'), level: z.number().int().min(1).max(6).optional().describe('Heading level, Document::Heading only'), duration: z.number().int().positive().optional().describe('Duration in minutes, Document::Step only') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, content, resourceType, level, duration }: any) => { try { const c = itglue(); ensureConfigured(c); const section = await c.addDocumentSection(documentId, { content, resourceType, level, duration }); return ok({ section, note: 'Saved to the document DRAFT. The published version techs see is unchanged until itglue_publish_document is called.' }) } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_document_section', { title: 'IT Glue: update document section', description: 'WRITE. Replace the content of an existing document section (find its id with itglue_document_sections). Confirm the exact content with the user first. IMPORTANT: section changes land on the document\'s DRAFT revision only — what techs see (the published version) is unchanged until itglue_publish_document is called for the document.', inputSchema: { documentId: z.string().describe('IT Glue document id'), sectionId: z.string().describe('Document section id'), content: z.string().describe('New section content (HTML for Text/Step)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, sectionId, content }: any) => { try { const c = itglue(); ensureConfigured(c); const section = await c.updateDocumentSection(documentId, sectionId, { content }); return ok({ section, note: 'Saved to the document DRAFT. The published version techs see is unchanged until itglue_publish_document is called.' }) } catch (e) { return fail(e) } })

  server.registerTool('itglue_publish_document', { title: 'IT Glue: publish a document', description: 'WRITE. Publish an existing document so its current DRAFT becomes the version techs see, then VERIFIES via a read-back that published-at/draft actually flipped (a publish that silently no-ops is reported as published:false, not success). Required after itglue_add_document_section / itglue_update_document_section — section edits alone never change the published version. CAUTION: publishing pushes the ENTIRE current draft live, including any earlier unpublished edits by others — confirm with the user before calling.', inputSchema: { documentId: z.string().describe('IT Glue document id') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const result = await c.publishDocument(documentId)
      return ok({ documentId, ...result, note: result.published ? 'Verified: the current draft is now the published version.' : 'The publish call succeeded but the read-back does NOT show the document as published — check it in the IT Glue UI before trusting it.' })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_rename_document', { title: 'IT Glue: rename a document', description: 'WRITE. Change a document\'s title (and optionally move it to a folder). Inline links built on ID-based URLs survive renames, but confirm the exact new title with the user first — titles drive the TCT naming convention (System - Topic).', inputSchema: { documentId: z.string().describe('IT Glue document id'), name: z.string().describe('New document title'), documentFolderId: z.string().optional().describe('Optional folder id to move the document into') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, name, documentFolderId }: any) => { try { const c = itglue(); ensureConfigured(c); const doc = await c.updateDocument(documentId, { name, ...(documentFolderId !== undefined ? { documentFolderId } : {}) }); return ok({ id: doc.id, name: doc.attributes?.name, note: 'Title metadata applies immediately (it is not part of the draft/publish cycle).' }) } catch (e) { return fail(e) } })

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

  server.registerTool('itglue_create_flexible_asset', { title: 'IT Glue: create flexible asset', description: 'WRITE. Create a structured flexible asset. First call itglue_flexible_asset_type_fields to get valid trait keys (use each field\'s name-key). Confirm the values with the user first.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id'), traits: z.record(z.string(), z.any()).describe('Object keyed by field name-key -> value') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, flexibleAssetTypeId, traits }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.createFlexibleAsset({ organizationId, flexibleAssetTypeId, traits })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_flexible_asset', { title: 'IT Glue: update flexible asset', description: 'WRITE. Update traits on an existing flexible asset. Pass ONLY the traits you want to change — existing traits are preserved (the tool GET-merges before PATCH, because IT Glue PATCH is otherwise destructive). Confirm with the user first.', inputSchema: { id: z.string().describe('IT Glue flexible asset id'), traits: z.record(z.string(), z.any()).describe('Changed traits, keyed by field name-key') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ id, traits }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.updateFlexibleAsset(id, traits)) } catch (e) { return fail(e) } })
}
