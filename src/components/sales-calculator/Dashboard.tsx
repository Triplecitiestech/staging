"use client";
import React from "react";
import { PackageQuote } from "@/lib/sales-calculator/types";
import { getServiceCategories } from "@/lib/sales-calculator/config";
import { currency, pct } from "@/lib/sales-calculator/format";
import { Card, StatCard } from "./ui";

const bucketLabels: Record<string, string> = {
  perUser: "Users", perFrontlineUser: "Frontline Users", perDevice: "Devices",
  perServer: "Servers", perSite: "Sites", perDomain: "Domains", perComanagedAdmin: "Co-Managed Admins",
};

export function Dashboard({ quote }: { quote: PackageQuote }) {
  const cats = getServiceCategories();
  const bucketEntries = Object.entries(quote.revenueByBucket).filter(([, v]) => v > 0);
  const catEntries = Object.entries(quote.revenueByCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxBucket = Math.max(1, ...bucketEntries.map(([, v]) => v));
  const maxCat = Math.max(1, ...catEntries.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Monthly Recurring Revenue" value={currency(quote.monthlyPrice)} tone="brand" />
        <StatCard label="Annual Recurring Revenue" value={currency(quote.annualPrice)} tone="brand" />
        <StatCard label="Monthly Cost" value={currency(quote.monthlyCost)} />
        <StatCard label="Annual Cost" value={currency(quote.annualCost)} />
        <StatCard label="Gross Profit (mo)" value={currency(quote.monthlyMargin)} tone="ok" />
        <StatCard label="Gross Margin %" value={pct(quote.marginPct)} tone={quote.marginPct >= 0.6 ? "ok" : "warn"} />
        <StatCard label="Microsoft 365 (mo, separate)" value={currency(quote.m365MonthlyPrice)} sub={quote.m365Resold ? "TCT resells" : "Customer direct"} />
        <StatCard label="One-Time Charges" value={currency(quote.oneTimePrice)} sub={quote.oneTimePrice > 0 ? "Onboarding" : "None"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Revenue by Billing Bucket" subtitle="How the monthly recurring revenue is composed.">
          <div className="space-y-2.5">
            {bucketEntries.length === 0 && <p className="text-sm text-muted">No revenue yet — complete discovery.</p>}
            {bucketEntries.map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm mb-1"><span className="text-ink">{bucketLabels[k] || k}</span><span className="font-medium">{currency(v)}</span></div>
                <div className="h-2 rounded-full bg-surfaceAlt overflow-hidden"><div className="h-full bg-brand-accent" style={{ width: `${(v / maxBucket) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Revenue by Service Category" subtitle="Estimated allocation across bundled services (Security, Backup, etc.).">
          <div className="space-y-2.5">
            {catEntries.map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm mb-1"><span className="text-ink">{cats[k] || k}</span><span className="font-medium">{currency(v)}</span></div>
                <div className="h-2 rounded-full bg-surfaceAlt overflow-hidden"><div className="h-full bg-brand" style={{ width: `${(v / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">Because pricing is bundled per unit, category figures are an estimated split of each bundle across its included services.</p>
        </Card>
      </div>
    </div>
  );
}

export function LineItemsTable({ quote, showInternal }: { quote: PackageQuote; showInternal: boolean }) {
  return (
    <Card title={`${quote.packageName} — Line Items`} subtitle={showInternal ? "Internal view: costs, prices and margins." : "Customer view: prices only."}>
      <div className="overflow-x-auto tct-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-2 pr-3 font-medium">Line Item</th>
              <th className="py-2 px-3 font-medium text-right">Qty</th>
              {showInternal && <th className="py-2 px-3 font-medium text-right">Unit Cost</th>}
              <th className="py-2 px-3 font-medium text-right">Unit Price</th>
              {showInternal && <th className="py-2 px-3 font-medium text-right">Cost</th>}
              <th className="py-2 px-3 font-medium text-right">Price</th>
              {showInternal && <th className="py-2 px-3 font-medium text-right">Profit</th>}
              {showInternal && <th className="py-2 pl-3 font-medium text-right">Margin %</th>}
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((l) => (
              <tr key={l.key} className={"border-b border-line" + (l.informational ? " text-muted italic" : "")}>
                <td className="py-2 pr-3 text-ink">{l.label}</td>
                <td className="py-2 px-3 text-right">{l.informational ? "—" : l.quantity}</td>
                {showInternal && <td className="py-2 px-3 text-right text-muted">{l.informational ? "—" : currency(l.unitCost, { cents: true })}</td>}
                <td className="py-2 px-3 text-right">{currency(l.unitPrice, { cents: true })}{l.informational ? "/hr" : ""}</td>
                {showInternal && <td className="py-2 px-3 text-right text-muted">{l.informational ? "—" : currency(l.cost)}</td>}
                <td className="py-2 px-3 text-right font-medium">{l.informational ? "—" : currency(l.price)}</td>
                {showInternal && <td className="py-2 px-3 text-right text-ok">{l.informational ? "—" : currency(l.margin)}</td>}
                {showInternal && <td className="py-2 pl-3 text-right">{l.informational ? "—" : pct(l.marginPct)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-ink border-t-2 border-line">
              <td className="py-2 pr-3">Total (Managed, monthly)</td>
              <td></td>
              {showInternal && <td></td>}
              <td></td>
              {showInternal && <td className="py-2 px-3 text-right">{currency(quote.monthlyCost)}</td>}
              <td className="py-2 px-3 text-right">{currency(quote.monthlyPrice)}</td>
              {showInternal && <td className="py-2 px-3 text-right text-ok">{currency(quote.monthlyMargin)}</td>}
              {showInternal && <td className="py-2 pl-3 text-right">{pct(quote.marginPct)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {quote.m365LineItems.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium text-ink mb-1">Microsoft 365 licensing <span className="text-muted font-normal">— billed separately, excluded from managed margin</span></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-1.5 pr-3 font-medium">License</th>
                <th className="py-1.5 px-3 font-medium text-right">Seats</th>
                <th className="py-1.5 px-3 font-medium text-right">Unit Price</th>
                <th className="py-1.5 pl-3 font-medium text-right">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {quote.m365LineItems.map((l) => (
                <tr key={l.key} className="border-b border-line">
                  <td className="py-1.5 pr-3 text-ink">{l.label}</td>
                  <td className="py-1.5 px-3 text-right">{l.quantity}</td>
                  <td className="py-1.5 px-3 text-right">{currency(l.unitPrice, { cents: true })}</td>
                  <td className="py-1.5 pl-3 text-right font-medium">{currency(l.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink">
                <td className="py-1.5 pr-3">Microsoft 365 total</td>
                <td></td>
                <td></td>
                <td className="py-1.5 pl-3 text-right">{currency(quote.m365MonthlyPrice)}/mo</td>
              </tr>
            </tfoot>
          </table>
          {quote.oneTimePrice > 0 && <div className="mt-2 text-sm text-muted">One-time: <span className="font-medium text-ink">{currency(quote.oneTimePrice)}</span></div>}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted">
          Microsoft 365: <span className="font-medium text-ink">{quote.m365Resold ? `${currency(quote.m365MonthlyPrice)}/mo` : "customer provides licensing directly"}</span>
          {quote.oneTimePrice > 0 && <> · One-time: <span className="font-medium text-ink">{currency(quote.oneTimePrice)}</span></>}
        </div>
      )}
      {quote.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {quote.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[12px] bg-accent/10 ring-1 ring-accent/25 text-body2 text-xs p-2.5">
              <span className="text-accent mt-0.5">ⓘ</span><span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
