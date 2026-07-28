// src/lib/sales-calculator/pricing-source.ts
//
// SERVER-ONLY — imports the raw pg pool. Never import this from a client
// component ('use client'), or `pg` ends up in the browser bundle. The
// calculator UI reads overrides over HTTP (/api/admin/sales-calculator/pricing);
// only server code (that route, and the MCP connector tools) uses this module.
//
// The single reader of the calculator's EFFECTIVE pricing:
//
//   effective pricing = src/config/sales-calculator/pricing.json  (defaults)
//                     + latest sales_calc_pricing_overrides row   (flat path→number map)
//
// Money lives in pricing.json and that override table — nowhere else. This
// module does not decide any prices; it only assembles those two sources the
// same way the calculator page does, so a second consumer (the MCP connector)
// can never drift from what the page quotes.

import { getPool } from "@/lib/db-pool";
import pricingBase from "@/config/sales-calculator/pricing.json";
import { applyOverridesToObject, applyPricingOverrides, pricingConfig } from "./config";

const UNDEFINED_TABLE = "42P01";

export interface PricingOverridesRecord {
  overrides: Record<string, number>;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** sales_calc_pricing_overrides has not been migrated yet — defaults only. */
  tableMissing: boolean;
}

/**
 * Latest overrides row, or an empty map when the table is missing (the
 * calculator degrades to pricing.json defaults — same contract as the pricing
 * editor's banner). Unexpected DB errors THROW: callers decide whether to fail
 * the request (the admin route) or degrade with a visible note (MCP tools).
 */
export async function loadPricingOverrides(): Promise<PricingOverridesRecord> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT overrides, note, updated_by, created_at
         FROM sales_calc_pricing_overrides
        ORDER BY created_at DESC
        LIMIT 1`
    );
    const latest = rows[0];
    return {
      overrides: (latest?.overrides as Record<string, number>) ?? {},
      note: latest?.note ?? null,
      updatedBy: latest?.updated_by ?? null,
      updatedAt: latest?.created_at ? String(latest.created_at) : null,
      tableMissing: false,
    };
  } catch (dbError) {
    const err = dbError as Error & { code?: string };
    if (err.code === UNDEFINED_TABLE) {
      return { overrides: {}, note: null, updatedBy: null, updatedAt: null, tableMissing: true };
    }
    throw dbError;
  }
}

// ---------------------------------------------------------------------------
// Pristine defaults
// ---------------------------------------------------------------------------
// A deep clone of pricing.json taken at module load, plus a flat path→number
// map of every numeric leaf in it. The flat map is what resets the shared
// pricingConfig singleton: it only ever writes back values that already exist
// in the defaults, so a reset can never change the shape of pricing data
// (same guarantee applyOverridesToObject gives overrides).

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function flattenNumbers(node: unknown, prefix = "", out: Record<string, number> = {}): Record<string, number> {
  if (node === null || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number" && isFinite(value)) out[path] = value;
    else if (value && typeof value === "object") flattenNumbers(value, path, out);
  }
  return out;
}

const PRISTINE_PRICING = deepClone(pricingBase);
const PRISTINE_FLAT = flattenNumbers(PRISTINE_PRICING);

/**
 * Shape of pricing.json. Deliberately untyped: it is owner-edited config whose
 * authoritative structure is the JSON file itself (and the pricing editor can
 * only ever replace existing numeric leaves, never change the shape). Declared
 * once here so consumers outside this directory reference a named type instead
 * of scattering `any` through their own code.
 */
export type PricingModel = any;

export interface EffectivePricing {
  /** pricing.json defaults with the overrides applied — a COPY, not the singleton. */
  pricing: PricingModel;
  /** How many override entries actually landed on a numeric leaf. */
  applied: number;
  /** Only the paths whose effective value differs from the shipped default. */
  overriddenPaths: Record<string, { default: number; effective: number }>;
  /** Override paths that matched nothing in pricing.json (should be empty — the save API validates). */
  ignoredPaths: string[];
}

/**
 * Defaults + overrides as a fresh object. Pure: the shared pricingConfig
 * singleton is untouched, so this is safe to call concurrently.
 */
export function buildEffectivePricing(overrides: Record<string, number>): EffectivePricing {
  const pricing = deepClone(PRISTINE_PRICING);
  const applied = applyOverridesToObject(pricing, overrides);

  const overriddenPaths: Record<string, { default: number; effective: number }> = {};
  const ignoredPaths: string[] = [];
  for (const [path, value] of Object.entries(overrides || {})) {
    const base = PRISTINE_FLAT[path];
    if (base === undefined || typeof value !== "number" || !isFinite(value)) {
      ignoredPaths.push(path);
      continue;
    }
    if (base !== value) overriddenPaths[path] = { default: base, effective: value };
  }

  return { pricing, applied, overriddenPaths, ignoredPaths };
}

/**
 * Run a SYNCHRONOUS quote computation against defaults + overrides.
 *
 * calc.ts reads the module-level pricingConfig singleton at call time (that is
 * how the calculator page applies overrides), so the only way to price with
 * overrides is to put them on that singleton. This does it safely:
 *
 *   reset to pristine → apply overrides → run fn → reset to pristine
 *
 * `fn` MUST be synchronous. Node runs a synchronous block to completion without
 * interleaving another request, which makes the mutation window atomic — an
 * `await` inside would break that guarantee and could leak one caller's
 * overrides into another's quote. The leading reset also self-heals if anything
 * else ever left the singleton dirty.
 */
export function withEffectivePricing<T>(
  overrides: Record<string, number>,
  fn: () => T
): { value: T; applied: number } {
  applyPricingOverrides(PRISTINE_FLAT);
  const applied = applyPricingOverrides(overrides);
  try {
    return { value: fn(), applied };
  } finally {
    applyPricingOverrides(PRISTINE_FLAT);
  }
}

/** Test/diagnostic helper: is the shared singleton currently at shipped defaults? */
export function pricingSingletonIsPristine(): boolean {
  const current = flattenNumbers(pricingConfig);
  const paths = new Set([...Object.keys(current), ...Object.keys(PRISTINE_FLAT)]);
  for (const p of paths) if (current[p] !== PRISTINE_FLAT[p]) return false;
  return true;
}

/**
 * Every `_`-prefixed string annotation in pricing.json, with its path. These
 * are the config's own provenance/caveat comments (`_comment`, `_note`, `_src`,
 * `_flag`, `_label`, `_markupNote`) — the honest answer to "where did this
 * number come from" and "is it confirmed".
 */
export function pricingAnnotations(pricing: unknown): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (node: unknown, prefix: string) => {
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (key.startsWith("_") && typeof value === "string") out.push({ path, text: value });
      else if (value && typeof value === "object") walk(value, path);
    }
  };
  walk(pricing, "");
  return out;
}
