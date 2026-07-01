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

  server.registerTool('itglue_org_documents', { title: 'IT Glue: org documents', description: 'List documents (SOPs / runbooks / KB articles) for an organization id — the FULL library by default (root + all folders), paginated. Returns { documents, meta } where meta = { totalCount, totalPages, currentPage, pageSize, hasMore }. Page through with page/pageSize (max 1000), or pass documentFolderId to scope to one folder ("0" = root-only). Does NOT return passwords.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), page: z.number().int().min(1).optional().describe('Page number (default 1)'), pageSize: z.number().int().min(1).max(1000).optional().describe('Page size (default 100, max 1000)'), documentFolderId: z.string().optional().describe('Scope to a folder id, or "0" for root-only; default returns ALL documents') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, page, pageSize, documentFolderId }: any) => { try { const c = itglue(); ensureConfigured(c); const { documents, meta } = await c.getDocumentsPage(organizationId, { page, pageSize, documentFolderId }); return ok({ documents, meta }) } catch (e) { return fail(e) } })

  server.registerTool('itglue_search_documents', { title: 'IT Glue: search documents', description: 'Find documents in ONE organization by name (e.g. "SonicWall VPN SOP") without pulling the whole library. Pages the full document list and matches ALL query words against the document name (case-insensitive). Returns compact { id, name, documentFolderId, url, updatedAt }.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), query: z.string().describe('Words to match against document names') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, query }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const idx = await searchDocIndex(organizationId, query)
      if (idx) return ok({ source: 'index', organizationId, query, matchCount: idx.length, documents: idx })
      const docs = await c.searchDocuments(organizationId, query)
      return ok({ source: 'live-name', note: 'This org is not in the content index yet — matched on document NAME only. Content search becomes available once the org is indexed.', organizationId, query, matchCount: docs.length, documents: docs.map(slimDoc) })
    } catch (e) { return fail(e) } })

  server.registerTool('itglue_global_search', { title: 'IT Glue: global document search', description: 'Search documents by name across TCT\'s internal SOP org AND, optionally, a specific customer org — built for triage like "SonicWall VPN down at Client X": pass the customer\'s organizationId to get BOTH TCT\'s SOP and the customer\'s own docs in one call. IT Glue has no account-wide search endpoint, so this scopes to the TCT org plus the passed org. Returns matches grouped by org.', inputSchema: { query: z.string().describe('Words to match against document names'), organizationId: z.string().optional().describe('Optional customer org id to include alongside the TCT SOP org') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ query, organizationId }: any) => { try {
      const c = itglue(); ensureConfigured(c)
      const orgIds = Array.from(new Set([TCT_ORG_ID, organizationId].filter((v): v is string => !!v)))
      const results = []
      for (const orgId of orgIds) {
        const idx = await searchDocIndex(orgId, query)
        if (idx) {
          results.push({ organizationId: orgId, isTctSopOrg: orgId === TCT_ORG_ID, source: 'index', matchCount: idx.length, documents: idx })
        } else {
          const docs = await c.searchDocuments(orgId, query)
          results.push({ organizationId: orgId, isTctSopOrg: orgId === TCT_ORG_ID, source: 'live-name', matchCount: docs.length, documents: docs.map(slimDoc) })
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

  server.registerTool('itglue_add_document_section', { title: 'IT Glue: add document section', description: 'WRITE. Append a content section to an existing document. resourceType is Document::Text (default), Document::Heading (needs level 1-6), or Document::Step (optional duration in minutes). Confirm the exact content with the user first.', inputSchema: { documentId: z.string().describe('IT Glue document id'), content: z.string().describe('Section content: HTML for Text/Step, plain text for Heading'), resourceType: z.enum(['Document::Text', 'Document::Heading', 'Document::Step']).optional().describe('Section type (default Document::Text)'), level: z.number().int().min(1).max(6).optional().describe('Heading level, Document::Heading only'), duration: z.number().int().positive().optional().describe('Duration in minutes, Document::Step only') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, content, resourceType, level, duration }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.addDocumentSection(documentId, { content, resourceType, level, duration })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_document_section', { title: 'IT Glue: update document section', description: 'WRITE. Replace the content of an existing document section (find its id with itglue_document_sections). Confirm the exact content with the user first.', inputSchema: { documentId: z.string().describe('IT Glue document id'), sectionId: z.string().describe('Document section id'), content: z.string().describe('New section content (HTML for Text/Step)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ documentId, sectionId, content }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.updateDocumentSection(documentId, sectionId, { content })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_create_flexible_asset', { title: 'IT Glue: create flexible asset', description: 'WRITE. Create a structured flexible asset. First call itglue_flexible_asset_type_fields to get valid trait keys (use each field\'s name-key). Confirm the values with the user first.', inputSchema: { organizationId: z.string().describe('IT Glue organization id'), flexibleAssetTypeId: z.string().describe('IT Glue flexible asset type id'), traits: z.record(z.string(), z.any()).describe('Object keyed by field name-key -> value') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ organizationId, flexibleAssetTypeId, traits }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.createFlexibleAsset({ organizationId, flexibleAssetTypeId, traits })) } catch (e) { return fail(e) } })

  server.registerTool('itglue_update_flexible_asset', { title: 'IT Glue: update flexible asset', description: 'WRITE. Update traits on an existing flexible asset. Pass ONLY the traits you want to change — existing traits are preserved (the tool GET-merges before PATCH, because IT Glue PATCH is otherwise destructive). Confirm with the user first.', inputSchema: { id: z.string().describe('IT Glue flexible asset id'), traits: z.record(z.string(), z.any()).describe('Changed traits, keyed by field name-key') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ id, traits }: any) => { try { const c = itglue(); ensureConfigured(c); return ok(await c.updateFlexibleAsset(id, traits)) } catch (e) { return fail(e) } })
}
