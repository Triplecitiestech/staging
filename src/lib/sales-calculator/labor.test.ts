// src/lib/sales-calculator/labor.test.ts
//
// Locks the delivery-labor / contribution / capacity layer.
//
// The single most important assertion here is the LAST one: adding labor must
// not move a quoted price by a cent. The labor layer is a cost view composed on
// top of a finished quote, and if it ever changed calc.ts's output the parity
// with the source spreadsheet would be silently broken.

import { describe, it, expect } from "vitest";
import { buildAllQuotes } from "./calc";
import { defaultInput } from "./defaults";
import { endpointCount, laborForQuote, laborModelConfig } from "./labor";
import { DiscoveryInput } from "./types";

function input(over: { users?: number; pcs?: number; servers?: number; sites?: number } = {}): DiscoveryInput {
  const i = defaultInput();
  i.users.standard = over.users ?? 133;
  i.devices.windowsPCs = over.pcs ?? 132;
  i.company.locations = over.sites ?? 3;
  i.servers = Array.from({ length: over.servers ?? 6 }, (_, n) => ({
    id: `srv-${n}`, type: "Physical", backupRequired: true,
    retention: "1 year", os: "Windows Server", provisionedTB: 0,
  }));
  return i;
}

const quoteFor = (id: string, i: DiscoveryInput) => buildAllQuotes(i).find((q) => q.packageId === id)!;

describe("the derived model itself", () => {
  it("carries the observed hours-per-endpoint figures, rising with tier", () => {
    const h = laborModelConfig.hoursPerEndpointPerMonth;
    expect(h.standard).toBeCloseTo(0.239, 3);
    expect(h.comprehensive).toBeCloseTo(0.442, 3);
    expect(h.complete).toBeCloseTo(0.697, 3);
    // The whole premise: richer tiers really do cost more labor per endpoint.
    expect(h.standard).toBeLessThan(h.comprehensive);
    expect(h.comprehensive).toBeLessThan(h.complete);
    // Complete Care ~3x Standard Care.
    expect(h.complete / h.standard).toBeGreaterThan(2.5);
  });

  it("marks the two tiers with no live customers as proxied, so their labor is never read as measured", () => {
    expect(laborModelConfig.hoursProxiedFrom).toEqual({ basic: "standard", comanaged: "comprehensive" });
    for (const id of ["basic", "comanaged"]) {
      const r = laborForQuote(quoteFor(id, input()), input());
      expect(r.hoursAreProxied).toBe(true);
      expect(r.caveats.join(" ")).toMatch(/borrowed from/);
    }
    for (const id of ["standard", "comprehensive", "complete"]) {
      expect(laborForQuote(quoteFor(id, input()), input()).hoursAreProxied).toBe(false);
    }
  });

  it("excludes the advisory retainer from the delivery rate", () => {
    // Owner-confirmed: not a billable resource. Folding a ~$4k/mo fixed fee into
    // ~4.7 logged hours/month would put the blended rate near $43/hr and triple
    // every tier's labor cost.
    expect(laborModelConfig.deliveryCostPerHour).toBeCloseTo(13.6, 2);
    expect(laborModelConfig.deliveryCostPerHour).toBeLessThan(20);
  });
});

describe("endpointCount", () => {
  it("counts Windows PCs plus servers, matching how the hours were measured", () => {
    expect(endpointCount(input({ pcs: 132, servers: 6 }))).toBe(138);
    expect(endpointCount(input({ pcs: 0, servers: 0 }))).toBe(0);
  });
});

describe("labor, contribution and capacity", () => {
  const i = input(); // 133 users, 132 PCs, 6 servers, 3 sites -> 138 endpoints

  it("computes labor from endpoints x hours x blended rate", () => {
    const r = laborForQuote(quoteFor("complete", i), i);
    expect(r.endpoints).toBe(138);
    expect(r.deliveryHoursPerMonth).toBeCloseTo(138 * 0.697, 2);
    // Costed from the ROUNDED hour figure, so the reported hours and the
    // reported cost always reconcile for whoever checks the arithmetic.
    expect(r.laborCostPerMonth).toBeCloseTo(r.deliveryHoursPerMonth * 13.6, 2);
  });

  it("reports contribution well below the tooling-only margin the engine shows", () => {
    for (const id of ["standard", "comprehensive", "complete", "comanaged"]) {
      const q = quoteFor(id, i);
      const r = laborForQuote(q, i);
      expect(r.contributionMarginPct, id).toBeLessThan(r.toolingOnlyMarginPct);
      expect(r.contributionPerMonth, id).toBeLessThan(q.monthlyPrice - q.monthlyCost);
      // Contribution is price minus everything that scales with the deal.
      expect(r.contributionPerMonth, id).toBeCloseTo(
        q.monthlyPrice - q.monthlyCost - r.laborCostPerMonth, 1
      );
      expect(r.contributionPerYear, id).toBeCloseTo(r.contributionPerMonth * 12, 1);
    }
  });

  it("still shows healthy contribution — labor per endpoint is genuinely cheap", () => {
    const r = laborForQuote(quoteFor("complete", i), i);
    expect(r.contributionMarginPct).toBeGreaterThan(70);
    expect(r.contributionMarginPct).toBeLessThan(95);
  });

  it("flags a deal that does not fit in idle capacity instead of quietly promising it", () => {
    const r = laborForQuote(quoteFor("complete", i), i);
    // 138 endpoints x 0.697 h ~ 96 h/month against ~22.6 h of idle time.
    expect(r.capacity.fitsInIdleCapacity).toBe(false);
    expect(r.capacity.idleHoursRemaining).toBeLessThan(0);
    expect(r.caveats.join(" ")).toMatch(/idle capacity/);
  });

  it("confirms a small deal fits, and reports the remaining headroom", () => {
    const small = input({ users: 10, pcs: 10, servers: 0, sites: 1 });
    const r = laborForQuote(quoteFor("standard", small), small);
    expect(r.endpoints).toBe(10);
    expect(r.capacity.fitsInIdleCapacity).toBe(true);
    expect(r.capacity.idleHoursRemaining).toBeGreaterThan(0);
    expect(r.capacity.additionalEndpointsOnIdle).toBeGreaterThan(r.endpoints);
    // Redirecting internal work buys materially more room than idle time alone.
    expect(r.capacity.additionalEndpointsIfInternalRedirected).toBeGreaterThan(
      r.capacity.additionalEndpointsOnIdle * 3
    );
  });

  it("gives a break-even endpoint count that falls as the tier gets richer", () => {
    const be = (id: string) => laborForQuote(quoteFor(id, i), i).breakevenEndpointsAtThisTier;
    expect(be("complete")).toBeLessThan(be("comprehensive"));
    expect(be("comprehensive")).toBeLessThan(be("standard"));
    expect(be("standard")).toBeGreaterThan(100);
  });

  it("handles a user-only quote without dividing by zero", () => {
    const noDevices = input({ users: 5, pcs: 0, servers: 0, sites: 1 });
    const r = laborForQuote(quoteFor("standard", noDevices), noDevices);
    expect(r.endpoints).toBe(0);
    expect(r.laborCostPerMonth).toBe(0);
    expect(r.breakevenEndpointsAtThisTier).toBe(0);
    expect(Number.isFinite(r.contributionMarginPct)).toBe(true);
    expect(r.caveats.join(" ")).toMatch(/No endpoints/);
  });
});

describe("the labor layer never moves a quoted price", () => {
  it("leaves every tier's monthly and annual price byte-identical", () => {
    const i = input();
    const before = buildAllQuotes(i).map((q) => [q.packageId, q.monthlyPrice, q.annualPrice, q.monthlyCost]);
    // Run the labor layer over every tier, then re-quote.
    for (const q of buildAllQuotes(i)) laborForQuote(q, i);
    const after = buildAllQuotes(i).map((q) => [q.packageId, q.monthlyPrice, q.annualPrice, q.monthlyCost]);
    expect(after).toEqual(before);
    // And the published Wilmar comparison still holds exactly.
    const w = input({ users: 133, pcs: 132, servers: 6, sites: 3 });
    w.users.sharedMailboxes = 70;
    const totals = Object.fromEntries(buildAllQuotes(w).map((q) => [q.packageId, q.monthlyPrice]));
    expect(totals).toEqual({
      basic: 10525, standard: 10675, comprehensive: 16995, complete: 21940, comanaged: 12250,
    });
  });
});
