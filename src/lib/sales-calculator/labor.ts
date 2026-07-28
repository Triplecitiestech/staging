// src/lib/sales-calculator/labor.ts
//
// Delivery-labor and capacity layer over a computed quote.
//
// WHY THIS IS SEPARATE FROM calc.ts: calc.ts is the verified quote engine (its
// output is locked by parity checks against the source spreadsheet), and the
// project rule is that pricing changes happen in config, not in that engine.
// Labor is a COST-TO-SERVE question, not a sell-price question, so it composes
// on top of a finished PackageQuote instead of being threaded through it. The
// quoted monthly and annual prices are therefore provably unchanged by this
// module — it only adds a cost view.
//
// WHAT IT ANSWERS
//   1. "What does this deal actually cost us to serve?"  — vendor tooling
//      (already in the quote) PLUS delivery labor (this module).
//   2. "What is the real margin?"  — contribution, not tooling-only margin.
//   3. "Can we support it?"        — hours consumed vs spare capacity.
//
// WHY CONTRIBUTION RATHER THAN FULLY-ABSORBED COST: fully-absorbed cost per
// endpoint FALLS as the customer base grows, so the same deal would price as
// unprofitable today and profitable next quarter. That makes absorption useless
// for a quote. Contribution (price − costs that actually scale with the deal) is
// stable, and the fixed pool is handled once, as a break-even endpoint count.
// Company-level absorption belongs on the CFO dashboard, not in a quote.

import laborJson from "@/config/sales-calculator/labor.json";
import { DiscoveryInput, PackageQuote } from "./types";

export const laborModelConfig = laborJson as LaborModel;

export interface LaborModel {
  derivedOn: string;
  sourceWindow: { from: string; to: string; months: number; timeEntries: number; customerFacingHoursPerMonth: number };
  deliveryCostPerHour: number;
  hoursPerEndpointPerMonth: Record<string, number>;
  hoursProxiedFrom?: Record<string, string>;
  /** Per tier: 'hourly' | 'hourly-remediation' | 'included' — whether labor is recovered as T&M. */
  laborBillingModel?: Record<string, string>;
  observed?: Record<string, { companies: number; endpoints: number; hoursPerMonth: number }>;
  capacity: {
    scalableDeliveryHoursPerMonth: number;
    loggedHoursPerMonth: number;
    idleHoursPerMonth: number;
    internalHoursPerMonth: number;
  };
  monthlyFixedPool: number;
  _flags?: string[];
}

export interface LaborResult {
  /** Managed endpoints this deal adds: Windows PCs + servers (matches how the source hours were measured). */
  endpoints: number;
  hoursPerEndpointPerMonth: number;
  /** True when this tier has no observed hours and borrowed another tier's figure. */
  hoursAreProxied: boolean;
  proxiedFrom: string | null;

  deliveryHoursPerMonth: number;
  laborCostPerMonth: number;
  /** Vendor/tooling cost, taken from the quote itself (excludes Microsoft 365 by policy). */
  vendorCostPerMonth: number;
  /** Everything that scales with this deal. */
  variableCostPerMonth: number;

  monthlyPrice: number;
  contributionPerMonth: number;
  contributionPerYear: number;
  /** Contribution ÷ price, as a percentage. */
  contributionMarginPct: number;
  /** The tooling-only margin the quote reports on its own — kept so the two can be compared. */
  toolingOnlyMarginPct: number;

  capacity: {
    scalableDeliveryHoursPerMonth: number;
    idleHoursPerMonth: number;
    internalHoursPerMonth: number;
    /** Hours this deal consumes per month. */
    thisDealHoursPerMonth: number;
    /** Idle hours left if this deal is won. Negative means it does not fit without freeing time. */
    idleHoursRemaining: number;
    fitsInIdleCapacity: boolean;
    /** Endpoints of THIS tier that still fit, on idle time alone / after redirecting internal work. */
    additionalEndpointsOnIdle: number;
    additionalEndpointsIfInternalRedirected: number;
  };

  fixedPoolPerMonth: number;
  /** Endpoints of this tier needed to cover the fixed pool from contribution alone. */
  breakevenEndpointsAtThisTier: number;

  /** How this tier recovers labor: 'hourly' | 'hourly-remediation' | 'included'. */
  laborBillingModel: string;
  /**
   * True when this tier bills labor as T&M, so the labor cost charged above is
   * substantially recovered as revenue and contribution here is UNDERSTATED.
   * The recovery is not modelled — see labor.json _billableCaptureFinding.
   */
  laborIsRecoverable: boolean;

  caveats: string[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Managed endpoints for a discovery input. Windows PCs + servers, because the
 * observed hours-per-endpoint figures were measured against Datto RMM device
 * counts, which include servers. Counting only workstations here would inflate
 * hours per endpoint and overstate labor cost.
 */
export function endpointCount(input: DiscoveryInput): number {
  return Math.max(0, input.devices.windowsPCs || 0) + (input.servers?.length || 0);
}

/**
 * Labor cost, contribution margin and capacity impact for one already-computed
 * quote. Pure: no I/O, no mutation of the quote or the model.
 */
export function laborForQuote(
  quote: PackageQuote,
  input: DiscoveryInput,
  model: LaborModel = laborModelConfig
): LaborResult {
  const endpoints = endpointCount(input);
  const proxiedFrom = model.hoursProxiedFrom?.[quote.packageId] ?? null;
  const hoursPerEndpoint = model.hoursPerEndpointPerMonth[quote.packageId] ?? 0;

  const deliveryHours = round2(endpoints * hoursPerEndpoint);
  const laborCost = round2(deliveryHours * model.deliveryCostPerHour);
  const vendorCost = round2(quote.monthlyCost);
  const variableCost = round2(laborCost + vendorCost);

  const price = round2(quote.monthlyPrice);
  const contribution = round2(price - variableCost);

  const cap = model.capacity;
  const idleRemaining = round2(cap.idleHoursPerMonth - deliveryHours);
  const perEndpoint = hoursPerEndpoint > 0 ? hoursPerEndpoint : Infinity;

  const billingModel = model.laborBillingModel?.[quote.packageId] ?? 'included';
  const recoverable = billingModel === 'hourly' || billingModel === 'hourly-remediation';

  const caveats: string[] = [
    "Contribution excludes the fixed cost pool (staff, overhead) — that is covered once, via breakevenEndpointsAtThisTier, not charged per deal.",
    "Microsoft 365 licensing is excluded from both price and cost here, matching the quote's own policy.",
  ];
  if (proxiedFrom) {
    caveats.push(
      `No customer is on this tier yet, so hours per endpoint are borrowed from "${proxiedFrom}". Treat the labor figure as an estimate.`
    );
  }
  if (recoverable) {
    caveats.push(
      billingModel === 'hourly'
        ? 'This tier bills labor at the hourly rate, so most of the labor cost above is recovered as T&M revenue — contribution here is a FLOOR, not the expected figure. The recovery is not modelled because the source billable flags do not track the tier\'s commercial model.'
        : 'This tier includes the monitoring/security stack but bills REMEDIATION hourly, so part of the labor cost above is recovered as T&M revenue and contribution is somewhat understated.'
    );
  }
  if (endpoints === 0) {
    caveats.push("No endpoints in this input, so labor cost is zero — a user-only quote consumes no measured delivery time.");
  }
  if (deliveryHours > cap.idleHoursPerMonth) {
    caveats.push(
      `This deal needs ${deliveryHours} h/month but only ${cap.idleHoursPerMonth} h/month of idle capacity exists. ` +
        `It fits only by freeing some of the ${cap.internalHoursPerMonth} h/month currently spent on internal work, or by adding capacity.`
    );
  }

  return {
    endpoints,
    hoursPerEndpointPerMonth: hoursPerEndpoint,
    hoursAreProxied: proxiedFrom !== null,
    proxiedFrom,

    deliveryHoursPerMonth: deliveryHours,
    laborCostPerMonth: laborCost,
    vendorCostPerMonth: vendorCost,
    variableCostPerMonth: variableCost,

    monthlyPrice: price,
    contributionPerMonth: contribution,
    contributionPerYear: round2(contribution * 12),
    contributionMarginPct: price > 0 ? Math.round((contribution / price) * 1000) / 10 : 0,
    toolingOnlyMarginPct: Math.round(quote.marginPct * 1000) / 10,

    capacity: {
      scalableDeliveryHoursPerMonth: cap.scalableDeliveryHoursPerMonth,
      idleHoursPerMonth: cap.idleHoursPerMonth,
      internalHoursPerMonth: cap.internalHoursPerMonth,
      thisDealHoursPerMonth: deliveryHours,
      idleHoursRemaining: idleRemaining,
      fitsInIdleCapacity: idleRemaining >= 0,
      additionalEndpointsOnIdle: Math.floor(cap.idleHoursPerMonth / perEndpoint) || 0,
      additionalEndpointsIfInternalRedirected:
        Math.floor((cap.idleHoursPerMonth + cap.internalHoursPerMonth) / perEndpoint) || 0,
    },

    fixedPoolPerMonth: model.monthlyFixedPool,
    breakevenEndpointsAtThisTier:
      contribution > 0 && endpoints > 0
        ? Math.ceil(model.monthlyFixedPool / (contribution / endpoints))
        : 0,

    laborBillingModel: billingModel,
    laborIsRecoverable: recoverable,

    caveats,
  };
}

/** Provenance block for the MCP tools, so a caller can see how old the model is. */
export function laborModelProvenance(model: LaborModel = laborModelConfig) {
  return {
    derivedOn: model.derivedOn,
    sourceWindow: model.sourceWindow,
    deliveryCostPerHour: model.deliveryCostPerHour,
    hoursPerEndpointPerMonth: model.hoursPerEndpointPerMonth,
    hoursProxiedFrom: model.hoursProxiedFrom ?? {},
    laborBillingModel: model.laborBillingModel ?? {},
    observedByTier: model.observed ?? {},
    capacity: model.capacity,
    monthlyFixedPool: model.monthlyFixedPool,
    configFile: "src/config/sales-calculator/labor.json",
    knownLimitations: model._flags ?? [],
    note:
      "Cost-to-serve model, derived from Autotask time entries joined to Datto RMM endpoint counts. " +
      "Aggregate figures only — no individual pay rates. Re-derive when the delivery team or the customer mix changes.",
  };
}
