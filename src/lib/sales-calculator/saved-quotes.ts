// Saved quotes: persist a calculator discovery payload so a quote can be
// reloaded and edited later. Storage is the raw-pg `sales_calc_saved_quotes`
// table (soft-deleted, latest-edit-wins), served by
// /api/admin/sales-calculator/quotes. This module is shared by the API
// routes (validation) and the client UI (normalization + summary building)
// so both sides agree on shape and limits.
//
// IMPORTANT: a saved quote stores INPUTS, not prices. Loading a quote
// recomputes every number with the CURRENT pricing.json + live overrides, so
// old quotes always reprice at today's rates. The small `summary` snapshot
// (for the browse list) is the only place save-time prices are kept.

import { DiscoveryInput, PackageQuote, ServerEntry } from "./types";
import { defaultInput } from "./defaults";
import { getPackages } from "./config";

/** Bump when DiscoveryInput changes shape in a way mergeShape can't absorb. */
export const SAVED_QUOTE_INPUT_VERSION = 1;

export const SAVED_QUOTE_LIMITS = {
  name: 120,
  customerName: 160,
  note: 500,
  inputBytes: 200_000,
  maxServers: 500,
} as const;

/** Light snapshot stored alongside the input for cheap list rendering. */
export interface SavedQuoteSummary {
  packageName: string | null;
  monthlyPrice: number | null;
  m365MonthlyPrice: number | null;
  users: number;
  devices: number;
  servers: number;
}

export interface SavedQuoteListItem {
  id: string;
  name: string;
  customerName: string | null;
  selectedPackageId: string | null;
  summary: SavedQuoteSummary | null;
  note: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedQuoteDetail extends SavedQuoteListItem {
  input: unknown;
  inputVersion: number;
}

// ---------------------------------------------------------------------------
// DB row mapping — shared by the two API route files (route files may only
// export HTTP handlers, so this lives here).
// ---------------------------------------------------------------------------

export const SAVED_QUOTE_LIST_COLUMNS = `id, name, customer_name, selected_package_id, summary, note,
  created_by, updated_by, created_at, updated_at`;

export interface SavedQuoteRow {
  id: string;
  name: string;
  customer_name: string | null;
  selected_package_id: string | null;
  summary: unknown;
  note: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  input?: unknown;
  input_version?: number;
}

export function savedQuoteRowToListItem(row: SavedQuoteRow): SavedQuoteListItem {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    selectedPackageId: row.selected_package_id,
    summary: (row.summary as SavedQuoteSummary | null) ?? null,
    note: row.note,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function savedQuoteRowToDetail(row: SavedQuoteRow): SavedQuoteDetail {
  return {
    ...savedQuoteRowToListItem(row),
    input: row.input ?? null,
    inputVersion: typeof row.input_version === "number" ? row.input_version : 1,
  };
}

export interface SavedQuoteWritePayload {
  name: string;
  customerName: string | null;
  note: string | null;
  input: Record<string, unknown>;
  selectedPackageId: string | null;
  summary: SavedQuoteSummary | null;
}

/**
 * Validate a create/update request body. Pure + side-effect free so the API
 * routes and unit tests share it. Never trusts client shape: names are
 * trimmed and capped, the input payload is size-capped, the selected package
 * must exist, and the summary is re-sanitized field by field.
 */
export function parseSavedQuoteBody(
  body: unknown
): { ok: true; value: SavedQuoteWritePayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim().slice(0, SAVED_QUOTE_LIMITS.name) : "";
  if (!name) return { ok: false, error: "`name` is required" };

  const customerName =
    typeof b.customerName === "string"
      ? b.customerName.trim().slice(0, SAVED_QUOTE_LIMITS.customerName) || null
      : null;
  const note = typeof b.note === "string" ? b.note.slice(0, SAVED_QUOTE_LIMITS.note) || null : null;

  const input = b.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "`input` (the discovery payload) is required" };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, error: "`input` is not serializable" };
  }
  if (serialized.length > SAVED_QUOTE_LIMITS.inputBytes) {
    return { ok: false, error: `\`input\` too large (${serialized.length} > ${SAVED_QUOTE_LIMITS.inputBytes} bytes)` };
  }

  const packageIds = new Set(getPackages().map((p) => p.id));
  const selectedPackageId =
    typeof b.selectedPackageId === "string" && packageIds.has(b.selectedPackageId)
      ? b.selectedPackageId
      : null;

  return {
    ok: true,
    value: {
      name,
      customerName,
      note,
      input: input as Record<string, unknown>,
      selectedPackageId,
      summary: sanitizeQuoteSummary(b.summary),
    },
  };
}

/** Keep only the known summary fields, with type checks — drop everything else. */
export function sanitizeQuoteSummary(raw: unknown): SavedQuoteSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  return {
    packageName: typeof r.packageName === "string" ? r.packageName.slice(0, 80) : null,
    monthlyPrice: num(r.monthlyPrice),
    m365MonthlyPrice: num(r.m365MonthlyPrice),
    users: num(r.users) ?? 0,
    devices: num(r.devices) ?? 0,
    servers: num(r.servers) ?? 0,
  };
}

/** Snapshot the currently-selected quote's headline numbers for the browse list. */
export function buildQuoteSummary(
  input: DiscoveryInput,
  quotes: PackageQuote[],
  selectedPackageId: string | null
): SavedQuoteSummary {
  const q = quotes.find((x) => x.packageId === selectedPackageId) ?? quotes[0] ?? null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    packageName: q?.packageName ?? null,
    monthlyPrice: q ? round2(q.monthlyPrice) : null,
    m365MonthlyPrice: q ? round2(q.m365MonthlyPrice) : null,
    users: input.users.standard + input.users.frontline,
    devices: input.devices.windowsPCs,
    servers: input.servers.length,
  };
}

/**
 * Rebuild a DiscoveryInput from a stored payload by deep-merging it over
 * today's defaultInput(): fields added to DiscoveryInput after the quote was
 * saved get their defaults, removed/unknown fields are dropped, and any
 * type-mismatched leaf falls back to the default. A quote saved months ago
 * therefore always loads into a valid, complete input.
 */
export function normalizeSavedInput(raw: unknown): DiscoveryInput {
  const def = defaultInput();
  const merged = mergeShape(def, raw) as DiscoveryInput;

  const rawObj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  // compliance: free-form string array (mergeShape can't type-check array items)
  const rawCompliance = (rawObj.company as Record<string, unknown> | undefined)?.compliance;
  if (Array.isArray(rawCompliance)) {
    const cleaned = rawCompliance.filter((c): c is string => typeof c === "string").slice(0, 20);
    merged.company.compliance = cleaned.length ? cleaned : def.company.compliance;
  }

  // servers: validate each entry against the ServerEntry shape
  const serverTemplate: ServerEntry = {
    id: "",
    type: "Physical",
    backupRequired: true,
    retention: "1 year",
    os: "Windows Server",
    provisionedTB: 0,
  };
  const rawServers = rawObj.servers;
  merged.servers = Array.isArray(rawServers)
    ? rawServers.slice(0, SAVED_QUOTE_LIMITS.maxServers).map((s, i) => {
        const entry = mergeShape(serverTemplate, s) as ServerEntry;
        if (!entry.id) entry.id = `srv-restored-${i}`;
        return entry;
      })
    : [];

  return merged;
}

/**
 * Recursively project `raw` onto the shape of `def`: objects keep exactly the
 * default's keys, primitives keep the raw value only when the type matches
 * (finite numbers only), arrays pass through raw as-is (callers post-process
 * typed arrays like servers/compliance).
 */
function mergeShape(def: unknown, raw: unknown): unknown {
  if (Array.isArray(def)) {
    return Array.isArray(raw) ? raw : def;
  }
  if (def !== null && typeof def === "object") {
    const rawObj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(def as Record<string, unknown>)) {
      out[key] = mergeShape((def as Record<string, unknown>)[key], rawObj[key]);
    }
    return out;
  }
  if (typeof raw !== typeof def || raw === null) return def;
  if (typeof raw === "number" && !isFinite(raw)) return def;
  return raw;
}
