// src/lib/mcp-sales-pricing-tools.ts
//
// READ-ONLY connector tools for TCT's internal sales pricing:
//
//   sales_pricing_catalog — the complete pricing model (every tier, per-unit
//                           cost + sell rates, add-ons, M365 licensing, and the
//                           calculation rules) as live data.
//   sales_pricing_quote   — the calculator itself: discovery inputs in, computed
//                           monthly/annual price per tier out.
//
// Both reuse the SAME engine and config the staff calculator at
// /admin/sales-calculator runs on (src/lib/sales-calculator/calc.ts +
// src/config/sales-calculator/*.json + the sales_calc_pricing_overrides
// table), so a quote from the connector and a quote from the page cannot
// disagree. Nothing here writes: pricing is edited only by a staff user with
// the system_settings permission at /admin/sales-calculator/pricing.
//
// INTERNAL DATA. Responses carry vendor costs and margins. They are for TCT
// staff working a quote — not customer-facing copy.

import { z } from 'zod'
import { buildAllQuotes } from '@/lib/sales-calculator/calc'
import {
  appConfig,
  getPackages,
  getServices,
  serviceDisplayState,
  serviceInclusionState,
  type PackageDef,
  type ServiceDef,
} from '@/lib/sales-calculator/config'
import { defaultInput } from '@/lib/sales-calculator/defaults'
import { laborForQuote, laborModelProvenance } from '@/lib/sales-calculator/labor'
import { normalizeSavedInput } from '@/lib/sales-calculator/saved-quotes'
import {
  buildEffectivePricing,
  loadPricingOverrides,
  pricingAnnotations,
  withEffectivePricing,
  type PricingModel,
  type PricingOverridesRecord,
} from '@/lib/sales-calculator/pricing-source'
import type { DiscoveryInput, LineItem, PackageQuote } from '@/lib/sales-calculator/types'

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }
function fail(err: unknown) { const m = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true } }

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'

const INTERNAL_ONLY =
  'INTERNAL — contains TCT vendor costs and margins. Do not paste raw figures into customer-facing material; quote sell prices only.'

// ---------------------------------------------------------------------------
// Pricing provenance (same shape on both tools)
// ---------------------------------------------------------------------------

interface PricingSourceInfo {
  currency: string
  figuresAre: string
  defaultsFile: string
  overridesTable: string
  engine: string
  pricingEditorUrl: string
  calculatorUrl: string
  overridesApplied: number
  overriddenPaths?: Record<string, { default: number; effective: number }>
  overridesNote: string | null
  overridesUpdatedBy: string | null
  overridesUpdatedAt: string | null
  overridesTableMissing: boolean
  overridesUnavailable?: string
}

function pricingSourceInfo(
  record: PricingOverridesRecord,
  applied: number,
  overriddenPaths?: Record<string, { default: number; effective: number }>,
  unavailable?: string
): PricingSourceInfo {
  return {
    currency: appConfig.currency ?? 'USD',
    figuresAre: `All rates are MONTHLY per unit unless stated. Annual = monthly × ${appConfig.annualMonths ?? 12}.`,
    defaultsFile: 'src/config/sales-calculator/pricing.json',
    overridesTable: 'sales_calc_pricing_overrides (append-only; latest row wins)',
    engine: 'src/lib/sales-calculator/calc.ts',
    pricingEditorUrl: `${BASE_URL}/admin/sales-calculator/pricing`,
    calculatorUrl: `${BASE_URL}/admin/sales-calculator`,
    overridesApplied: applied,
    ...(overriddenPaths && Object.keys(overriddenPaths).length ? { overriddenPaths } : {}),
    overridesNote: record.note,
    overridesUpdatedBy: record.updatedBy,
    overridesUpdatedAt: record.updatedAt,
    overridesTableMissing: record.tableMissing,
    ...(unavailable ? { overridesUnavailable: unavailable } : {}),
  }
}

const NO_OVERRIDES: PricingOverridesRecord = {
  overrides: {}, note: null, updatedBy: null, updatedAt: null, tableMissing: false,
}

/**
 * Overrides, or shipped defaults with a VISIBLE reason when the DB read fails.
 * A pricing answer that silently drops live overrides would be wrong without
 * looking wrong, so the degrade is always reported in the response.
 */
async function loadOverridesOrDegrade(): Promise<{ record: PricingOverridesRecord; unavailable?: string }> {
  try {
    return { record: await loadPricingOverrides() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      record: NO_OVERRIDES,
      unavailable:
        `Could not read sales_calc_pricing_overrides (${msg}). Figures below are pricing.json DEFAULTS only — ` +
        `if the pricing editor has saved overrides, these numbers are stale. Verify at ${BASE_URL}/admin/sales-calculator/pricing.`,
    }
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const UNIT_TYPES: Record<string, string> = {
  perUser: 'Per STANDARD user (a person with email). Frontline/deskless users are priced separately.',
  perFrontlineUser: 'Per frontline/deskless user (no email) — reduced stack, priced from pricing.json.frontline.components.',
  perDevice: 'Per WINDOWS PC (workstation or laptop). Macs, tablets, phones and other endpoints are NOT priced by the calculator.',
  perServer: 'Per server (base monitoring). Server backup/BCDR is a separate add-on sized by protected TB.',
  perSite: 'Per site / location / network.',
  perTenant: 'Per business / organization — the Business Line "cost to play" SKU (one per company).',
  perComanagedAdmin: "Per internal-IT admin seat (the customer's own IT staff getting access to TCT's tooling).",
  perDomain: 'Per email domain — feeds the Business Line cost, not billed as its own line.',
  service: 'Not a billed unit — an included service or an informational rate (e.g. Ally hourly labor).',
}

function money(v: { cost?: number; price?: number } | undefined) {
  if (!v) return null
  const cost = typeof v.cost === 'number' ? v.cost : null
  const price = typeof v.price === 'number' ? v.price : null
  return {
    unitCost: cost,
    unitPrice: price,
    unitMargin: cost !== null && price !== null ? Math.round((price - cost) * 100) / 100 : null,
    marginPct: cost !== null && price !== null && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null,
  }
}

function tierEntry(pkg: PackageDef, pricing: PricingModel, services: ServiceDef[]) {
  const pp = pricing.packages?.[pkg.id] ?? {}
  const licenseDef = pricing.m365Licenses?.[pkg.licenseRequirement]
  const businessLineApplies = (pricing.businessLine?.includeIn ?? []).includes(pkg.id)

  return {
    // Verbatim from packages.json — this is the name on the customer's chart.
    id: pkg.id,
    name: pkg.name,
    internalCodename: pkg.codename,
    order: pkg.order,
    shortDescription: pkg.shortDescription,
    supportModel: pkg.supportModel ?? null,
    isCoManaged: pkg.comanaged === true,
    perUnitRates: {
      perUser: money(pp.perUser),
      perDevice: money(pp.perDevice),
      perServer: money(pp.perServer),
      perSite: money(pp.perSite),
      perComanagedAdmin: money(pp.perComanagedAdmin),
    },
    hourlyLabor: pp.hourlyLabor
      ? { rate: pp.hourlyLabor.rate, label: pp.hourlyLabor.label, includedInMonthly: false }
      : null,
    businessLine: businessLineApplies
      ? {
          applies: true,
          note: 'Adds one per-company Business Line charge on top of the per-unit rates — see modifiers.businessLine.',
        }
      : { applies: false },
    microsoft365: {
      minimumLicense: pkg.licenseRequirement,
      billedSeparately: true,
      excludedFromManagedMargin: true,
      ratesIfTctResells: money(licenseDef),
      note: 'Charged only when licensing.provider = "Triple Cities Tech resells licensing". If the customer buys direct, the requirement is still checked but nothing is added.',
    },
    services: {
      included: services.filter((s) => serviceInclusionState(s, pkg.id) === 'included').map((s) => s.externalName),
      billableHourly: services.filter((s) => serviceInclusionState(s, pkg.id) === 'billable').map((s) => s.externalName),
      notAvailable: services.filter((s) => serviceInclusionState(s, pkg.id) === 'none').map((s) => s.externalName),
      sharedWithCustomerIT: services
        .filter((s) => serviceDisplayState(s, pkg.id) === 'shared')
        .map((s) => s.externalName),
    },
  }
}

function modifiersSection(pricing: PricingModel) {
  const bl = pricing.businessLine ?? {}
  return {
    volumeTiers: {
      applies: false,
      note: 'There are NO volume breaks. Every per-unit rate is flat — 500 users pay the same per-user rate as 5.',
    },
    termLengthDiscounts: {
      applies: false,
      note:
        'Managed-services pricing has NO term-length discount; monthly rate × 12 is the annual figure. ' +
        `The only term in the pricing model is Datto BCDR hardware/service, quoted at a fixed ${pricing.dattoBackup?.term ?? '3-year'} term, and Azure/BCDR RETENTION tiers (1-year / 7-year / Infinite) which change cost, not a discount.`,
    },
    industryOrVerticalAdjustments: {
      applies: false,
      note:
        'Industry/vertical does NOT change price. It is an input to the RECOMMENDATION engine only ' +
        '(src/lib/sales-calculator/recommend.ts — which package to suggest), never to the money.',
    },
    complianceAdjustments: {
      applies: false,
      note: 'Compliance selections (HIPAA/CMMC/NY SHIELD/…) and the "security priority" flag also feed only the recommendation engine, not price.',
    },
    userCountOrSeatMinimums: {
      applies: false,
      note: 'No seat minimum is enforced by the calculator.',
    },
    businessLine: {
      appliesToTiers: bl.includeIn ?? [],
      rule: `price = max(floor, multiplier × monthly per-company cost)`,
      floor: bl.floor ?? null,
      multiplier: bl.multiplier ?? null,
      perCompanyCostComponents: (bl.perCompanyComponents ?? []).map((c: PricingModel) => ({ label: c.label, monthlyCost: c.cost, vendor: c.vendor })),
      perDomainCostComponents: (bl.perDomainComponents ?? []).map((c: PricingModel) => ({ label: c.label, monthlyCostPerDomain: c.cost, vendor: c.vendor })),
      note:
        'Per-company cost = sum(perCompanyCostComponents) + sum(perDomainCostComponents) × domains. ' +
        'With the shipped values and 1 domain that is $44, so the $250 floor is what almost every quote actually charges.',
    },
    rounding: {
      rule: 'Every line item rounds cost, price and margin to 2 decimals (round-half-up on cents). Quantities are used as entered.',
      note: 'No rounding to whole dollars, no per-quote minimum, no proration. Totals are the sum of already-rounded line items.',
    },
    marginPolicy: {
      note: 'Managed totals EXCLUDE Microsoft 365 licensing (company policy) and exclude informational lines such as the Ally hourly labor rate.',
    },
  }
}

function addOnsSection(pricing: PricingModel) {
  const az = pricing.azureBackup ?? {}
  const db = pricing.dattoBackup ?? {}
  return {
    perStandardUser: {
      entraIdBackup: pricing.entraBackup
        ? {
            label: pricing.entraBackup.label,
            unitCost: pricing.entraBackup.cost,
            sellMultiplier: pricing.entraBackup.sellMultiplier,
            unitPrice: Math.round(pricing.entraBackup.cost * (pricing.entraBackup.sellMultiplier || 2) * 100) / 100,
            optional: true,
          }
        : null,
      sharedMailboxes: pricing.sharedMailbox ? { label: pricing.sharedMailbox.label, ...money(pricing.sharedMailbox) } : null,
    },
    perWindowsPc: {
      workstationBackup: pricing.endpointBackup ? { label: pricing.endpointBackup.label, ...money(pricing.endpointBackup) } : null,
    },
    perInternalItAdminSeat: {
      coManagedToolAccess: pricing.comanagedToolAccess
        ? {
            label: pricing.comanagedToolAccess.label,
            ...money(pricing.comanagedToolAccess),
            note: 'Added to a FULLY-MANAGED tier when the customer has internal IT wanting access to TCT tooling. On TCT Ally the equivalent seat is packages.comanaged.perComanagedAdmin.',
          }
        : null,
    },
    perFrontlineUser: {
      components: Object.entries<PricingModel>(pricing.frontline?.components ?? {}).map(([id, c]) => ({
        id,
        label: c.label,
        unitCost: c.cost,
        unitPrice: c.price,
        alwaysIncluded: c.always === true,
      })),
      note: 'Frontline = deskless / no email. One line at the SUM of the enabled components × frontline user count. Same in every tier.',
    },
    serverBackup: {
      azureVmCloudBackup: {
        note: 'ONE line for ALL Azure VMs marked for backup, banded by COMBINED provisioned TB (not per VM). price = sellMultiplier × band cost.',
        sellMultiplier: az.sellMultiplier ?? null,
        retentionDefault: az.retentionDefault ?? null,
        capacityLimitsPerCloudDevice: { tb: az.perDeviceCapacityTB ?? null, vms: az.perDeviceMaxVMs ?? null },
        bands: (az.bands ?? []).map((b: PricingModel) => ({
          label: b.label,
          uptoTB: b.uptoTB,
          monthlyCostByRetention: { '1-year': b['1-year'], '7-year': b['7-year'], Infinite: b.Infinite },
        })),
      },
      onPremBcdr: {
        note: 'ONE line. The calculator picks the SMALLEST model whose TB >= protected TB; price = sellMultiplier × the model\'s service cost for the chosen retention. Appliance hardware MSRP becomes a ONE-TIME charge at hardwareSellMultiplier.',
        term: db.term ?? null,
        sellMultiplier: db.sellMultiplier ?? null,
        hardwareSellMultiplier: db.hardwareSellMultiplier ?? null,
        retentions: db.retentions ?? [],
        deployments: Object.entries<PricingModel>(db.deployments ?? {}).map(([key, dep]) => ({
          key,
          label: dep.label,
          includesHardware: dep.hardware === true,
          ...(dep.computeBy === 'per500GB'
            ? { computeBy: 'per500GB', gbPerUnit: dep.gbPerUnit, monthlyCostPerUnitByRetention: dep.rates }
            : {
                models: (dep.models ?? []).map((m: PricingModel) => ({
                  model: m.model,
                  tb: m.tb,
                  hardwareMSRP: m.hardwareMSRP,
                  monthlyServiceCostByRetention: m.svc,
                })),
              }),
        })),
      },
      legacyServerAddOnsNotBilled: pricing.serverAddOns
        ? {
            note:
              'pricing.json.serverAddOns (backup / dr / imageBackup / retentionUpcharge) is REFERENCE ONLY — the calculator does NOT bill these, ' +
              'because Datto SIRIS/Azure backup above already includes image-based backup with cloud DR and billing both would double-count.',
            values: pricing.serverAddOns,
          }
        : null,
    },
  }
}

function m365Section(pricing: PricingModel) {
  const licenses = Object.entries<PricingModel>(pricing.m365Licenses ?? {})
    .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object')
    .map(([name, v]) => ({
      license: name,
      tierRank: v.rank,
      monthlyCost: v.cost,
      monthlyPrice: v.price,
      provenance: v._src ?? null,
      needsConfirmation: v._flag ?? null,
    }))
  return {
    billedSeparately: true,
    excludedFromManagedServicesMargin: true,
    chargedOnlyWhen: 'licensing.provider = "Triple Cities Tech resells licensing". Customer-direct purchases add $0 — only the minimum-license requirement is checked.',
    minimumLicenseByTier: Object.fromEntries(getPackages().map((p) => [p.id, p.licenseRequirement])),
    frontlineUsersGet: 'Frontline (F3) when the frontline M365-license toggle is on.',
    licenses,
    priceBasis: pricing.m365Licenses?._note ?? null,
    requirementCheck:
      'A quote flags a license gap when the customer\'s CURRENT license ranks below the tier\'s minimum (rank map in packages.json.licenseTierRank). The gap is a warning, not a price change.',
  }
}

function calculationRules(pricing: PricingModel) {
  const months = appConfig.annualMonths ?? 12
  return {
    note: 'Follow these in order and the monthly total is reproducible from the catalog numbers alone. Every step rounds to 2 decimals.',
    steps: [
      '1. Standard users:  standardUsers × tier.perUnitRates.perUser',
      '2. Entra ID backup (optional):  standardUsers × entraBackup.cost × entraBackup.sellMultiplier',
      '3. Shared mailboxes:  sharedMailboxes × sharedMailbox.price',
      '4. Frontline users:  frontlineUsers × SUM(enabled frontline.components price)',
      '5. Windows PCs:  windowsPCs × tier.perUnitRates.perDevice',
      '6. Workstation backup (optional):  pcsToBackup × endpointBackup.price',
      '7. Servers (base monitoring):  serverCount × tier.perUnitRates.perServer',
      '8. Azure VM cloud backup (if any Azure VM needs backup):  ONE line = azureBackup band for the COMBINED provisioned TB, × sellMultiplier',
      '9. Sites:  locations × tier.perUnitRates.perSite',
      '10. Co-managed seat:  on TCT Ally, adminSeats × packages.comanaged.perComanagedAdmin.price; on a fully-managed tier, adminSeats × comanagedToolAccess.price but ONLY when the customer has internal IT AND wants tool access. adminSeats = max(itStaffCount, 1) when access is wanted, else itStaffCount.',
      '11. On-prem BCDR (if enabled):  ONE line = smallest model with tb >= protectedTB, its service cost at the chosen retention × dattoBackup.sellMultiplier. Appliance hardware MSRP goes to ONE-TIME.',
      '12. Business Line (comprehensive / complete / comanaged only):  max(businessLine.floor, businessLine.multiplier × (sum perCompanyComponents.cost + sum perDomainComponents.cost × domains))',
      `13. Monthly total = sum of the above. Annual = monthly × ${months}.`,
      '14. Microsoft 365 is a SEPARATE total (never inside the monthly managed figure): standardUsers × the tier minimum license price, plus frontlineUsers × Frontline (F3) price if that toggle is on — and only when TCT resells licensing.',
      '15. The Ally hourly labor rate is informational and adds $0 to the monthly total.',
    ],
    notIncludedInAnyStep: [
      'Volume discounts — none exist.',
      'Term-length discounts — none exist.',
      'Industry, vertical or compliance adjustments — none exist (recommendation engine only).',
      'Taxes, one-time onboarding/project labor (entered per quote), and Ally hourly labor.',
    ],
    allyWorkedExample: (() => {
      const c = pricing.packages?.comanaged ?? {}
      return {
        why: 'Ally is the tier people fail to reverse-engineer: it looks cheap because day-to-day labor is NOT in the monthly figure, and it carries two lines the other tiers do not (an internal-IT admin seat, and the Business Line).',
        monthlyFormula:
          `standardUsers × ${c.perUser?.price ?? '?'} + windowsPCs × ${c.perDevice?.price ?? '?'} + servers × ${c.perServer?.price ?? '?'} + ` +
          `locations × ${c.perSite?.price ?? '?'} + adminSeats × ${c.perComanagedAdmin?.price ?? '?'} + businessLine`,
        plus: `Labor billed at $${c.hourlyLabor?.rate ?? '?'}/hr, outside the monthly total.`,
      }
    })(),
  }
}

// ---------------------------------------------------------------------------
// Quote input mapping
// ---------------------------------------------------------------------------

const RETENTIONS = ['1-year', '7-year', 'Infinite'] as const
const DEPLOYMENTS = ['SIRIS Virtual', 'SIRIS Appliance', 'Endpoint Backup w/ DR (cloud, per 500GB)'] as const
const LICENSE_NAMES = (appConfig.options?.m365Licenses ?? ['Business Premium']) as string[]

export interface QuoteToolArgs {
  standardUsers: number
  windowsPCs: number
  locations?: number
  serverCount?: number
  industry?: string
  termMonths?: number
  domains?: number
  frontlineUsers?: number
  frontlinePrintix?: boolean
  sharedMailboxes?: number
  pcsToBackup?: number
  entraIdBackup?: boolean
  hasInternalIT?: boolean
  itStaffCount?: number
  internalItWantsToolAccess?: boolean
  licensingProvider?: string
  currentM365License?: string
  onPremBackupEnabled?: boolean
  onPremBackupDeployment?: string
  protectedTB?: number
  backupRetention?: string
  azureVmCount?: number
  azureProvisionedTB?: number
  azureRetention?: string
  oneTimeCost?: number
  oneTimePrice?: number
  packageId?: string
  includeLineItems?: boolean
  includeLabor?: boolean
}

/**
 * Tool args → DiscoveryInput, through the same normalizeSavedInput() the saved-quote
 * loader uses, so an input the connector builds is shaped exactly like one the
 * calculator page builds (missing fields take defaultInput() values).
 */
export function buildQuoteInput(args: QuoteToolArgs): DiscoveryInput {
  const def = defaultInput()
  const servers = Math.max(0, Math.trunc(args.serverCount ?? 0))
  const azureVMs = Math.max(0, Math.trunc(args.azureVmCount ?? 0))
  const azureTB = args.azureProvisionedTB ?? 0
  // Azure VMs are servers too: they get base monitoring like any other server,
  // and their provisioned TB drives the (single) Azure cloud-backup band.
  const perAzureTB = azureVMs > 0 ? azureTB / azureVMs : 0

  return normalizeSavedInput({
    company: {
      name: '',
      industry: args.industry ?? def.company.industry,
      locations: Math.max(0, Math.trunc(args.locations ?? 1)),
      domains: Math.max(0, Math.trunc(args.domains ?? 1)),
      tenants: 1,
      compliance: ['None'],
      securityPriority: false,
    },
    users: {
      standard: Math.max(0, Math.trunc(args.standardUsers)),
      frontline: Math.max(0, Math.trunc(args.frontlineUsers ?? 0)),
      sharedMailboxes: Math.max(0, Math.trunc(args.sharedMailboxes ?? 0)),
      frontlineToggles: { printix: args.frontlinePrintix === true },
    },
    devices: {
      windowsPCs: Math.max(0, Math.trunc(args.windowsPCs)),
      pcsToBackup: Math.max(0, Math.trunc(args.pcsToBackup ?? 0)),
    },
    servers: [
      ...Array.from({ length: servers }, (_, i) => ({
        id: `srv-${i + 1}`, type: 'Physical', backupRequired: true,
        retention: '1 year', os: 'Windows Server', provisionedTB: 0,
      })),
      ...Array.from({ length: azureVMs }, (_, i) => ({
        id: `azure-${i + 1}`, type: 'Azure VM', backupRequired: true,
        retention: '1 year', os: 'Windows Server', provisionedTB: perAzureTB,
      })),
    ],
    internalIT: {
      hasInternalIT: args.hasInternalIT ?? (args.itStaffCount ?? 0) > 0,
      itStaffCount: Math.max(0, Math.trunc(args.itStaffCount ?? 0)),
      comanagedAccess: args.internalItWantsToolAccess === true,
      autotaskAccess: false,
      documentationAccess: false,
      escalationSupport: false,
      afterHoursSupport: false,
    },
    licensing: {
      provider: args.licensingProvider ?? def.licensing.provider,
      currentLicense: args.currentM365License ?? def.licensing.currentLicense,
    },
    backup: {
      onPremEnabled: args.onPremBackupEnabled === true,
      deployment: args.onPremBackupDeployment ?? def.backup.deployment,
      protectedTB: args.protectedTB ?? 0,
      retention: args.backupRetention ?? def.backup.retention,
      azureRetention: args.azureRetention ?? def.backup.azureRetention,
      entraEnabled: args.entraIdBackup === true,
    },
    oneTime: { cost: args.oneTimeCost ?? 0, price: args.oneTimePrice ?? 0 },
    currentSpend: def.currentSpend,
  })
}

function lineItemOut(l: LineItem) {
  return {
    label: l.label,
    unit: l.unit,
    quantity: l.quantity,
    unitCost: l.unitCost,
    unitPrice: l.unitPrice,
    monthlyCost: l.cost,
    monthlyPrice: l.price,
    ...(l.informational ? { informational: true, note: 'Excluded from the monthly total.' } : {}),
  }
}

function quoteOut(
  q: PackageQuote,
  pkg: PackageDef | undefined,
  includeLineItems: boolean,
  input: DiscoveryInput,
  includeLabor: boolean
) {
  // Delivery labor + contribution margin + capacity impact. Additive: the
  // quoted prices above are untouched by this. marginPct is the TOOLING-ONLY
  // margin the engine reports; trueMargin below is the one to quote internally.
  const labor = includeLabor ? laborForQuote(q, input, undefined) : null
  return {
    id: q.packageId,
    name: q.packageName,
    monthlyPrice: q.monthlyPrice,
    annualPrice: q.annualPrice,
    monthlyCost: q.monthlyCost,
    annualCost: q.annualCost,
    monthlyMargin: q.monthlyMargin,
    marginPct: Math.round(q.marginPct * 1000) / 10,
    marginPctBasis: 'TOOLING ONLY — vendor cost vs price, no labor. See trueMargin for the real figure.',
    ...(labor
      ? {
          trueMargin: {
            endpoints: labor.endpoints,
            hoursPerEndpointPerMonth: labor.hoursPerEndpointPerMonth,
            hoursAreEstimated: labor.hoursAreProxied,
            estimatedFromTier: labor.proxiedFrom,
            deliveryHoursPerMonth: labor.deliveryHoursPerMonth,
            laborCostPerMonth: labor.laborCostPerMonth,
            vendorCostPerMonth: labor.vendorCostPerMonth,
            variableCostPerMonth: labor.variableCostPerMonth,
            contributionPerMonth: labor.contributionPerMonth,
            contributionPerYear: labor.contributionPerYear,
            contributionMarginPct: labor.contributionMarginPct,
            toolingOnlyMarginPct: labor.toolingOnlyMarginPct,
            breakevenEndpointsAtThisTier: labor.breakevenEndpointsAtThisTier,
            fixedPoolPerMonth: labor.fixedPoolPerMonth,
            caveats: labor.caveats,
          },
          capacity: labor.capacity,
        }
      : {}),
    supportModel: pkg?.supportModel ?? null,
    microsoft365: {
      billedSeparately: true,
      resoldByTct: q.m365Resold,
      minimumLicense: q.licenseRequirement,
      monthlyPrice: q.m365MonthlyPrice,
      monthlyCost: q.m365MonthlyCost,
      meetsRequirement: q.meetsLicenseRequirement,
      gap: q.licenseGapMessage,
      ...(includeLineItems ? { lineItems: q.m365LineItems.map(lineItemOut) } : {}),
    },
    oneTime: { price: q.oneTimePrice, cost: q.oneTimeCost },
    monthlyPriceByUnit: q.revenueByBucket,
    warnings: q.warnings,
    ...(includeLineItems ? { lineItems: q.lineItems.map(lineItemOut) } : {}),
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSalesPricingTools(server: any) {
  server.registerTool(
    'sales_pricing_catalog',
    {
      title: 'TCT sales pricing: complete catalog (read-only)',
      description:
        'LIVE, COMPLETE read of Triple Cities Tech\'s OWN managed-services pricing model — the exact numbers the staff Sales Calculator at /admin/sales-calculator quotes from. ' +
        'Use this instead of asking the user to paste pricing, and instead of trying to fetch the admin pages (they are behind staff auth and disallow crawling). ' +
        'Returns EVERY tier by its real name (TCT Basic Care, TCT Standard Care, TCT Comprehensive Care, TCT Complete Care, TCT Ally (Co-Managed)) with per-unit COST and SELL rates broken out by unit type (per standard user, per Windows PC, per server, per site/location, per internal-IT admin seat, per company), the Ally hourly labor rate, all add-ons (workstation backup, shared mailboxes, Entra ID backup, frontline stack, Azure VM cloud backup bands, Datto BCDR model/retention tables, co-managed tool access), Microsoft 365 license requirements and rates per tier FLAGGED AS BILLED SEPARATELY, and the complete calculation rules including the Business Line floor/multiplier, rounding and the fact that there are NO volume, term-length, industry or compliance price modifiers. ' +
        'Effective pricing = src/config/sales-calculator/pricing.json defaults + the latest sales_calc_pricing_overrides row, and the response says which paths are currently overridden and when. ' +
        'To PRICE a specific customer, call sales_pricing_quote instead of doing the arithmetic by hand. READ-ONLY: the connector has no way to change pricing — edits happen only at /admin/sales-calculator/pricing by a staff user with the system_settings permission. ' +
        INTERNAL_ONLY,
      inputSchema: {
        section: z
          .enum(['all', 'tiers', 'modifiers', 'addOns', 'microsoft365', 'calculationRules', 'laborModel'])
          .optional()
          .describe('Return one section instead of everything (default all). Provenance is always included.'),
        includeServiceLists: z
          .boolean()
          .optional()
          .describe('Include each tier\'s included / billed-hourly / not-available service lists (default true).'),
        includeAnnotations: z
          .boolean()
          .optional()
          .describe('Include pricing.json\'s own provenance and caveat comments, e.g. which figures are still PLACEHOLDER (default true).'),
      },
    },
    async ({ section, includeServiceLists, includeAnnotations }: { section?: string; includeServiceLists?: boolean; includeAnnotations?: boolean }) => {
      try {
        const { record, unavailable } = await loadOverridesOrDegrade()
        const { pricing, applied, overriddenPaths, ignoredPaths } = buildEffectivePricing(record.overrides)
        const which = section ?? 'all'
        const withServices = includeServiceLists !== false
        const services = getServices()

        const tiers = getPackages().map((p) => {
          const entry = tierEntry(p, pricing, services)
          if (!withServices) {
            const { services: _drop, ...rest } = entry
            return rest
          }
          return entry
        })

        const annotations = pricingAnnotations(pricing)
        const out: Record<string, unknown> = {
          internalOnly: INTERNAL_ONLY,
          pricingSource: pricingSourceInfo(record, applied, overriddenPaths, unavailable),
          ...(ignoredPaths.length ? { overridesIgnored: ignoredPaths } : {}),
        }

        if (which === 'all' || which === 'tiers') {
          out.tierCount = tiers.length
          out.tiers = tiers
          out.unitTypes = UNIT_TYPES
        }
        if (which === 'all' || which === 'modifiers') out.modifiers = modifiersSection(pricing)
        if (which === 'all' || which === 'addOns') out.addOns = addOnsSection(pricing)
        if (which === 'all' || which === 'microsoft365') out.microsoft365 = m365Section(pricing)
        if (which === 'all' || which === 'calculationRules') {
          out.calculationRules = calculationRules(pricing)
          out.quoteToolHint = 'sales_pricing_quote runs these rules for you — prefer it over hand arithmetic.'
        }
        if (which === 'all' || which === 'laborModel') {
          out.laborModel = laborModelProvenance()
          out.laborModelNote =
            'COST TO SERVE, not sell price. The per-unit rates above cover vendor tooling only, so the margins they imply ' +
            '(85-93%) are tooling margins, NOT profit. This block adds the delivery-labor side: hours per endpoint per month ' +
            'by tier, and a blended loaded cost per delivery hour. sales_pricing_quote applies it and returns trueMargin ' +
            'per tier. Hours scale with the tier as you would hope — Complete Care consumes roughly 3x the labor per ' +
            'endpoint that Standard Care does.'
        }
        if (includeAnnotations !== false) {
          out.configAnnotations = annotations
          out.needsConfirmation = annotations.filter((a) => a.path.endsWith('_flag'))
        }

        return ok(out)
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'sales_pricing_quote',
    {
      title: 'TCT sales pricing: quote a customer across all tiers (read-only)',
      description:
        'Run TCT\'s OWN Sales Calculator: give discovery inputs (standard users, Windows PCs, locations, servers, add-ons) and get the computed MONTHLY and ANNUAL price for EVERY tier — TCT Basic Care, Standard Care, Comprehensive Care, Complete Care and TCT Ally (Co-Managed) — plus cost, margin, the per-line breakdown, and Microsoft 365 licensing shown SEPARATELY. ' +
        'This is the same engine (src/lib/sales-calculator/calc.ts) and the same live pricing the staff calculator at /admin/sales-calculator uses, so the numbers match a quote generated in the UI. Use it instead of multiplying rates by hand from sales_pricing_catalog — the model has lines that are easy to miss (a per-company Business Line charge on Comprehensive/Complete/Ally, a per-internal-IT-admin seat, and one-line-for-all backup sizing), which is why hand-derived totals usually come out short. ' +
        'ALSO RETURNS TRUE MARGIN AND CAPACITY. Each tier carries a trueMargin block (delivery labor + vendor cost vs price = contribution) and a capacity block (hours this deal consumes vs spare delivery capacity). The plain marginPct field is TOOLING-ONLY and reads far too high — quote trueMargin.contributionMarginPct internally, never marginPct. ' +
        'Only inputs that affect money are accepted. industry and termMonths are accepted and echoed but DO NOT change price — there are no industry, volume or term-length modifiers in this model. ' +
        'STATELESS AND READ-ONLY: nothing is saved, no quote record is created, and pricing cannot be changed through the connector. ' +
        INTERNAL_ONLY,
      inputSchema: {
        standardUsers: z.number().int().min(0).describe('Standard users — people with email. REQUIRED (no default: an omitted count would silently price the wrong company).'),
        windowsPCs: z.number().int().min(0).describe('Windows workstations + laptops. REQUIRED. Macs/tablets/phones are not priced by this model.'),
        locations: z.number().int().min(0).optional().describe('Sites / locations / networks (default 1).'),
        serverCount: z.number().int().min(0).optional().describe('Non-Azure servers, for base monitoring (default 0). Azure VMs go in azureVmCount.'),
        industry: z.string().optional().describe('Echoed for the record. Does NOT affect price — recommendation engine input only.'),
        termMonths: z.number().int().min(1).optional().describe('Echoed for the record. Does NOT affect price — there is no term-length discount.'),
        domains: z.number().int().min(0).optional().describe('Email domains (default 1). Feeds the Business Line cost only.'),
        frontlineUsers: z.number().int().min(0).optional().describe('Frontline / deskless users with NO email (default 0).'),
        frontlinePrintix: z.boolean().optional().describe('Add Printix to the frontline stack (default false).'),
        sharedMailboxes: z.number().int().min(0).optional().describe('Billable shared mailboxes (default 0).'),
        pcsToBackup: z.number().int().min(0).optional().describe('Windows PCs getting workstation backup (default 0).'),
        entraIdBackup: z.boolean().optional().describe('Add Entra ID backup per standard user (default false).'),
        hasInternalIT: z.boolean().optional().describe('Customer has their own IT staff (default: true when itStaffCount > 0).'),
        itStaffCount: z.number().int().min(0).optional().describe('Internal IT staff needing access to TCT tooling (default 0).'),
        internalItWantsToolAccess: z.boolean().optional().describe('Internal IT wants co-managed access to TCT PSA/documentation. On a fully-managed tier this is what turns the co-managed tool-access seat on (default false).'),
        licensingProvider: z.enum(['Customer purchases directly', 'Triple Cities Tech resells licensing']).optional().describe('Default: Triple Cities Tech resells licensing. "Customer purchases directly" adds $0 of M365.'),
        currentM365License: z.enum(LICENSE_NAMES as [string, ...string[]]).optional().describe('The customer\'s CURRENT license, for the requirement check (default Business Premium).'),
        onPremBackupEnabled: z.boolean().optional().describe('Enable on-prem Datto BCDR sizing (default false).'),
        onPremBackupDeployment: z.enum(DEPLOYMENTS).optional().describe('BCDR deployment (default SIRIS Virtual).'),
        protectedTB: z.number().min(0).optional().describe('Protected TB for on-prem BCDR sizing.'),
        backupRetention: z.enum(RETENTIONS).optional().describe('On-prem BCDR retention (default 1-year).'),
        azureVmCount: z.number().int().min(0).optional().describe('Azure VMs (default 0). Counted as servers for base monitoring AND banded for Azure cloud backup.'),
        azureProvisionedTB: z.number().min(0).optional().describe('COMBINED provisioned TB across all Azure VMs — this drives the band.'),
        azureRetention: z.enum(RETENTIONS).optional().describe('Azure backup retention (default 1-year).'),
        oneTimeCost: z.number().min(0).optional().describe('One-time project/onboarding cost to TCT.'),
        oneTimePrice: z.number().min(0).optional().describe('One-time project/onboarding price to the customer.'),
        packageId: z.enum(['basic', 'standard', 'comprehensive', 'complete', 'comanaged']).optional().describe('Return only this tier (default: all five).'),
        includeLineItems: z.boolean().optional().describe('Include the per-line breakdown for each tier (default true). Set false for totals only.'),
        includeLabor: z.boolean().optional().describe('Include delivery-labor cost, TRUE contribution margin and the capacity impact (default true). Set false for the tooling-only view.'),
      },
    },
    async (args: QuoteToolArgs) => {
      try {
        const { record, unavailable } = await loadOverridesOrDegrade()
        const input = buildQuoteInput(args)
        // Synchronous critical section — see withEffectivePricing().
        const { value: quotes, applied } = withEffectivePricing(record.overrides, () => buildAllQuotes(input))
        const packages = getPackages()
        const includeLineItems = args.includeLineItems !== false
        const selected = args.packageId ? quotes.filter((q) => q.packageId === args.packageId) : quotes

        return ok({
          internalOnly: INTERNAL_ONLY,
          inputsUsed: {
            standardUsers: input.users.standard,
            frontlineUsers: input.users.frontline,
            sharedMailboxes: input.users.sharedMailboxes,
            windowsPCs: input.devices.windowsPCs,
            pcsToBackup: input.devices.pcsToBackup,
            locations: input.company.locations,
            domains: input.company.domains,
            servers: input.servers.length,
            azureVMs: input.servers.filter((s) => s.type === 'Azure VM').length,
            internalItStaff: input.internalIT.itStaffCount,
            internalItWantsToolAccess: input.internalIT.comanagedAccess,
            entraIdBackup: input.backup.entraEnabled,
            onPremBackup: input.backup.onPremEnabled
              ? { deployment: input.backup.deployment, protectedTB: input.backup.protectedTB, retention: input.backup.retention }
              : false,
            licensingProvider: input.licensing.provider,
            currentM365License: input.licensing.currentLicense,
            industry: input.company.industry,
            termMonths: args.termMonths ?? null,
          },
          inputsThatDoNotAffectPrice: [
            'industry / vertical — recommendation engine only',
            'termMonths / contract length — no term-length discount exists',
            'compliance selections and the security-priority flag — recommendation engine only',
            'total user count — there are no volume breaks; per-unit rates are flat',
          ],
          pricingSource: pricingSourceInfo(record, applied, undefined, unavailable),
          tiers: selected.map((q) =>
            quoteOut(q, packages.find((p) => p.id === q.packageId), includeLineItems, input, args.includeLabor !== false)
          ),
          ...(args.includeLabor !== false ? { laborModel: laborModelProvenance() } : {}),
          reminders: [
            'marginPct on each tier is TOOLING-ONLY (vendor cost vs price). trueMargin.contributionMarginPct is the real figure — it includes delivery labor.',
            'Contribution excludes the fixed cost pool. A deal is worth taking when contribution is positive; the company is profitable when total contribution exceeds the fixed pool.',
            'Check capacity.fitsInIdleCapacity before promising delivery — idle capacity is thin, and the runway is mostly internal work that would have to be given up.',
            'Managed monthly/annual totals EXCLUDE Microsoft 365 licensing — quote it as its own line.',
            'TCT Ally monthly EXCLUDES day-to-day labor; helpdesk, moves/adds/changes and projects bill hourly on top.',
            'Comprehensive Care includes the monitoring/security stack but bills remediation hourly; Complete Care includes it.',
          ],
        })
      } catch (e) { return fail(e) }
    }
  )
}
