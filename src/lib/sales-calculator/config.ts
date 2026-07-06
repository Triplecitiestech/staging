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
}

export interface ServiceDef {
  id: string;
  internalName: string;
  externalName: string;
  vendor: string;
  category: string;
  unit: string;
  include: Record<string, boolean>;
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
