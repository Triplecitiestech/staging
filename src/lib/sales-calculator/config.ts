// Central config loader. All configuration is imported from /src/config/*.json.
// Editing those JSON files changes pricing, packages, services, theme, and
// recommendation rules WITHOUT any code changes.
import themeJson from "@/config/sales-calculator/theme.json";
import appJson from "@/config/sales-calculator/app.config.json";
import packagesJson from "@/config/sales-calculator/packages.json";
import servicesJson from "@/config/sales-calculator/services.json";
import pricingJson from "@/config/sales-calculator/pricing.json";
import recommendationJson from "@/config/sales-calculator/recommendation.json";
import costsJson from "@/config/sales-calculator/costs.json";

export const theme = themeJson as any;
export const appConfig = appJson as any;
export const packagesConfig = packagesJson as any;
export const servicesConfig = servicesJson as any;
export const pricingConfig = pricingJson as any;
export const recommendationConfig = recommendationJson as any;
export const costsConfig = costsJson as any;

export interface PackageDef {
  id: string;
  name: string;
  codename: string;
  order: number;
  shortDescription: string;
  licenseRequirement: string;
  frontlineEligible: boolean;
  comanaged: boolean;
  supportModel?: { label: string; detail: string };
  sharedServices?: string[];
}

// include values: true = included, "billable" = available but billed hourly
// (T&M), false/absent = not available.
export type ServiceInclusion = boolean | "billable";
export type InclusionState = "included" | "billable" | "none";
// Display-only refinement: "shared" marks services a package delivers jointly
// with the customer's internal IT (packages.json sharedServices).
export type DisplayState = InclusionState | "shared";

export interface ServiceDef {
  id: string;
  internalName: string;
  externalName: string;
  vendor: string;
  category: string;
  unit: string;
  include: Record<string, ServiceInclusion>;
}

/** Single source of truth for interpreting a service's include value. */
export function serviceInclusionState(service: ServiceDef, packageId: string): InclusionState {
  const v = service.include?.[packageId];
  if (v === true) return "included";
  if (v === "billable") return "billable";
  return "none";
}

/**
 * DISPLAY state for charts/exports: same as serviceInclusionState, except a
 * service listed in the package's `sharedServices` (packages.json) renders as
 * "shared" — delivered jointly with the customer's internal IT. This never
 * feeds pricing: calc.ts and the quote math must keep using
 * serviceInclusionState so shared services keep their underlying
 * included/billable money treatment.
 */
export function serviceDisplayState(service: ServiceDef, packageId: string): DisplayState {
  const state = serviceInclusionState(service, packageId);
  if (state === "none") return state;
  const pkg = (packagesConfig.packages as PackageDef[]).find((p) => p.id === packageId);
  return pkg?.sharedServices?.includes(service.id) ? "shared" : state;
}

export function getPackages(): PackageDef[] {
  return [...(packagesConfig.packages as PackageDef[])].sort((a, b) => a.order - b.order);
}

export function getServices(): ServiceDef[] {
  return servicesConfig.services as ServiceDef[];
}

export function getServiceCategories(): Record<string, string> {
  return servicesConfig.categories as Record<string, string>;
}

export function licenseRank(license: string): number {
  return (packagesConfig.licenseTierRank as Record<string, number>)[license] ?? 0;
}

export function hexToChannels(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Apply pricing overrides (a flat path→number map from the admin pricing
 * editor, e.g. { "packages.basic.perUser.price": 40 }) onto the in-memory
 * pricingConfig singleton. calc.ts reads pricingConfig at call time, so
 * quotes built after this call use the overridden numbers. Idempotent.
 * Returns the number of overrides applied.
 */
export function applyPricingOverrides(overrides: Record<string, number>): number {
  return applyOverridesToObject(pricingConfig, overrides);
}

export function applyOverridesToObject(target: any, overrides: Record<string, number>): number {
  let applied = 0;
  for (const [path, value] of Object.entries(overrides || {})) {
    if (typeof value !== "number" || !isFinite(value)) continue;
    const segments = path.split(".");
    let node: any = target;
    let ok = true;
    for (let i = 0; i < segments.length - 1; i++) {
      node = node?.[segments[i]];
      if (node === undefined || node === null || typeof node !== "object") { ok = false; break; }
    }
    const leaf = segments[segments.length - 1];
    // Only replace values that exist in the base config as numbers — never
    // create new keys or change the shape of pricing data.
    if (ok && node && typeof node[leaf] === "number") {
      node[leaf] = value;
      applied++;
    }
  }
  return applied;
}

/**
 * Validate a flat path→number overrides map against a base pricing object:
 * every path must resolve to an EXISTING numeric leaf in the base (overrides
 * can never add keys or change shape), and every value must be a finite
 * number >= 0. Used server-side by the pricing API and client-side by the
 * editor for pre-save feedback.
 */
export function validatePricingOverrides(
  overrides: Record<string, unknown>,
  base: any = pricingConfig
): { ok: boolean; errors: string[]; count: number } {
  const errors: string[] = [];
  const entries = Object.entries(overrides || {});
  if (entries.length > 1000) {
    return { ok: false, errors: [`Too many overrides (${entries.length} > 1000)`], count: entries.length };
  }
  for (const [path, value] of entries) {
    if (typeof value !== "number" || !isFinite(value)) {
      errors.push(`${path}: value must be a finite number`);
      continue;
    }
    if (value < 0) {
      errors.push(`${path}: value must be >= 0`);
      continue;
    }
    const segments = path.split(".");
    let node: any = base;
    for (let i = 0; i < segments.length - 1; i++) {
      node = node?.[segments[i]];
      if (node === undefined || node === null || typeof node !== "object") { node = undefined; break; }
    }
    const leafVal = node?.[segments[segments.length - 1]];
    if (typeof leafVal !== "number") {
      errors.push(`${path}: does not match a numeric value in pricing.json`);
    }
  }
  return { ok: errors.length === 0, errors, count: entries.length };
}

export function applyThemeToRoot(): Record<string, string> {
  const b = theme.brand;
  return {
    "--tct-bg": b.bg,
    "--tct-bg-deep": b.bgDeep,
    "--tct-surface": b.surface,
    "--tct-surface-2": b.surface2,
    "--tct-border": b.border,
    "--tct-border-strong": b.borderStrong,
    "--tct-text": b.text,
    "--tct-text-body": b.textBody,
    "--tct-text-muted": b.textMuted,
    "--tct-text-faint": b.textFaint,
    "--tct-accent": hexToChannels(b.accent),
    "--tct-accent-hover": hexToChannels(b.accentHover),
    "--tct-accent-deep": hexToChannels(b.accentDeep),
    "--tct-emerald": hexToChannels(b.emerald),
    "--tct-teal": hexToChannels(b.teal),
    "--tct-success": hexToChannels(b.success),
    "--tct-warning": hexToChannels(b.warning),
    "--tct-danger": hexToChannels(b.danger),
  };
}
