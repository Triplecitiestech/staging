"use client";
import React from "react";
import { DiscoveryInput, PackageQuote } from "@/lib/sales-calculator/types";
import { currentSpendTotals } from "@/lib/sales-calculator/calc";
import { currency } from "@/lib/sales-calculator/format";
import { Card, StatCard } from "./ui";

// "What they spend today vs the TCT quote" — competitive comparison for proposals.
export function CostComparison({ input, quote }: { input: DiscoveryInput; quote: PackageQuote }) {
  const cs = input.currentSpend;
  const cur = currentSpendTotals(input);
  const tctManaged = quote.monthlyPrice;
  const tctM365 = quote.m365MonthlyPrice;
  const tctMonthly = Math.round((tctManaged + tctM365) * 100) / 100;
  const curMonthly = cur.total;
  const delta = Math.round((curMonthly - tctMonthly) * 100) / 100; // positive = TCT is cheaper
  const cheaper = delta >= 0;

  if (!cs.enabled || curMonthly === 0) {
    return (
      <Card title="Current vs TCT" subtitle="Compare their current IT spend with the TCT quote.">
        <p className="text-sm text-muted">
          Turn on <span className="text-ink font-medium">&ldquo;Capture current IT spend&rdquo;</span> in the
          Licensing &amp; Onboarding step and enter what they pay today (tools + internal IT labor). This panel
          will then compare it against the <span className="text-ink font-medium">{quote.packageName}</span> quote.
        </p>
      </Card>
    );
  }

  const curRows: [string, number][] = ([
    ["RMM / monitoring", cs.rmm],
    ["Antivirus / EDR", cs.endpointSecurity],
    ["Backup / BCDR", cs.backup],
    ["Network monitoring", cs.networkMonitoring],
    ["Email / Microsoft 365", cs.emailM365],
    ["Other security / tools", cs.otherTools],
  ] as [string, number][]).filter(([, v]) => v > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Current Spend (mo)" value={currency(curMonthly)} />
        <StatCard label={`TCT Quote (mo) — ${quote.packageName}`} value={currency(tctMonthly)} tone="brand" />
        <StatCard label={cheaper ? "Monthly Savings w/ TCT" : "Monthly Increase w/ TCT"} value={currency(Math.abs(delta))} tone={cheaper ? "ok" : "warn"} />
        <StatCard label={cheaper ? "Annual Savings w/ TCT" : "Annual Increase w/ TCT"} value={currency(Math.abs(delta) * 12)} tone={cheaper ? "ok" : "warn"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="What they spend today" subtitle="Tools we'd consolidate + internal IT labor.">
          <table className="w-full text-sm">
            <tbody>
              {curRows.map(([k, v]) => (
                <tr key={k} className="border-b border-line"><td className="py-1.5 text-body2">{k}</td><td className="py-1.5 text-right text-ink">{currency(v)}</td></tr>
              ))}
              <tr className="border-b border-line"><td className="py-1.5 text-body2">Tools subtotal</td><td className="py-1.5 text-right font-medium text-ink">{currency(cur.tools)}</td></tr>
              {cur.labor > 0 && <tr className="border-b border-line"><td className="py-1.5 text-body2">Internal IT labor</td><td className="py-1.5 text-right text-ink">{currency(cur.labor)}</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold text-ink"><td className="py-2">Current total / mo</td><td className="py-2 text-right">{currency(curMonthly)}</td></tr>
            </tfoot>
          </table>
        </Card>

        <Card title={`With TCT — ${quote.packageName}`} subtitle="Managed services + Microsoft 365.">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-line"><td className="py-1.5 text-body2">Managed services (all-in)</td><td className="py-1.5 text-right text-ink">{currency(tctManaged)}</td></tr>
              <tr className="border-b border-line"><td className="py-1.5 text-body2">Microsoft 365</td><td className="py-1.5 text-right text-ink">{currency(tctM365)}</td></tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold text-ink"><td className="py-2">TCT total / mo</td><td className="py-2 text-right">{currency(tctMonthly)}</td></tr>
            </tfoot>
          </table>
          <p className="text-xs text-muted mt-3">
            {cheaper
              ? `Consolidating under ${quote.packageName} runs about ${currency(Math.abs(delta))}/mo (${currency(Math.abs(delta) * 12)}/yr) less than their current spend — before counting reclaimed internal IT time and reduced risk.`
              : `${quote.packageName} runs about ${currency(Math.abs(delta))}/mo more than current spend — position it as added coverage (24/7 monitoring, SOC, tested backups) and reclaimed internal IT time, not just tools.`}
          </p>
        </Card>
      </div>
    </div>
  );
}
