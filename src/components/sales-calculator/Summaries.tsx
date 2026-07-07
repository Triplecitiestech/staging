"use client";
import React from "react";
import { DiscoveryInput, PackageQuote, RecommendationResult } from "@/lib/sales-calculator/types";
import { theme } from "@/lib/sales-calculator/config";
import { currency, pct } from "@/lib/sales-calculator/format";
import { currentSpendTotals } from "@/lib/sales-calculator/calc";
import { Card, Pill } from "./ui";

export function Summaries({ input, quote, rec, mode }:
  { input: DiscoveryInput; quote: PackageQuote; rec: RecommendationResult; mode: "internal" | "customer" | "executive" }) {
  const co = theme.company;
  const compliance = input.company.compliance.filter((c) => c !== "None");
  const users = input.users.standard + input.users.frontline;

  if (mode === "executive") {
    return (
      <Card title="Executive Summary" subtitle="For decision-makers.">
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs uppercase text-muted">Recommended Package</div>
            <div className="text-lg font-semibold text-ink">{rec.recommendedPackageName}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted mb-1">Why</div>
            <ul className="space-y-1">{rec.rationale.map((r, i) => <li key={i} className="flex gap-2"><span className="text-brand-accent">•</span>{r}</li>)}</ul>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Box label="Monthly Investment" value={currency(quote.monthlyPrice)} />
            <Box label="Annual Investment" value={currency(quote.annualPrice)} />
            <Box label="Microsoft 365 (sep.)" value={`${currency(quote.m365MonthlyPrice)}/mo`} />
          </div>
          {input.currentSpend.enabled && currentSpendTotals(input).total > 0 && (() => {
            const cur = currentSpendTotals(input).total;
            const tct = Math.round((quote.monthlyPrice + quote.m365MonthlyPrice) * 100) / 100;
            const delta = Math.round((cur - tct) * 100) / 100;
            return (
              <div>
                <div className="text-xs uppercase text-muted mb-1">Current IT Spend vs TCT</div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Box label="Current / mo" value={currency(cur)} />
                  <Box label="TCT / mo" value={currency(tct)} />
                  <Box label={delta >= 0 ? "Savings / mo" : "Increase / mo"} value={currency(Math.abs(delta))} />
                </div>
              </div>
            );
          })()}
          <div>
            <div className="text-xs uppercase text-muted mb-1">Risk & Gap Observations</div>
            <ul className="space-y-1">
              <li className="flex gap-2"><span className="text-brand-accent">•</span>{compliance.length ? `Compliance scope: ${compliance.join(", ")}.` : "No compliance requirements indicated."}</li>
              <li className="flex gap-2"><span className="text-brand-accent">•</span>{quote.meetsLicenseRequirement ? "Microsoft licensing meets the recommended package requirement." : `Licensing gap: ${quote.licenseRequirement} required.`}</li>
              <li className="flex gap-2"><span className="text-brand-accent">•</span>{input.servers.length ? `${input.servers.length} server(s) in scope — verify backup/DR coverage.` : "No servers in scope."}</li>
            </ul>
          </div>
        </div>
      </Card>
    );
  }

  const showInternal = mode === "internal";
  return (
    <Card title={showInternal ? "Internal Summary" : "Customer Summary"}
      subtitle={showInternal ? "Full cost breakdown — INTERNAL ONLY." : "No vendor names or internal costs."}>
      <div className="text-sm space-y-1 mb-4">
        <div><span className="text-muted">Prepared for:</span> <span className="font-medium text-ink">{input.company.name || "(customer)"}</span></div>
        <div><span className="text-muted">Industry:</span> {input.company.industry} · <span className="text-muted">Locations:</span> {input.company.locations} · <span className="text-muted">Users:</span> {users}</div>
        <div><span className="text-muted">Package:</span> <span className="font-medium text-ink">{quote.packageName}</span></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Box label="Monthly" value={currency(quote.monthlyPrice)} />
        <Box label="Annual" value={currency(quote.annualPrice)} />
        {showInternal ? <Box label="Margin" value={`${currency(quote.monthlyMargin)} (${pct(quote.marginPct)})`} /> : <Box label="M365 (separate)" value={`${currency(quote.m365MonthlyPrice)}/mo`} />}
      </div>
      <div className="text-sm font-medium text-ink mb-2">Included Services</div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        {quote.includedServices.map((s) => <div key={s} className="text-sm text-ink flex gap-2"><span className="text-ok">✓</span>{s}</div>)}
      </div>
      {quote.billableServices.length > 0 && (
        <>
          <div className="text-sm font-medium text-ink mt-4 mb-2">Available on Request — billed hourly (T&amp;M)</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {quote.billableServices.map((s) => <div key={s} className="text-sm text-body2 flex gap-2"><span className="text-accent">⏱</span>{s}</div>)}
          </div>
        </>
      )}
      {quote.licenseGapMessage && (
        <div className="mt-4 rounded-[12px] bg-danger/15 text-danger ring-1 ring-danger/30 text-sm p-3 font-semibold">{quote.licenseGapMessage}</div>
      )}
      {!showInternal && (
        <p className="mt-4 text-xs text-muted">Microsoft 365 licensing is billed separately at {currency(quote.m365MonthlyPrice)}/mo. {co.name} · {co.phone}</p>
      )}
    </Card>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surfaceAlt p-3"><div className="text-xs uppercase text-muted">{label}</div><div className="text-base font-semibold text-ink">{value}</div></div>;
}
