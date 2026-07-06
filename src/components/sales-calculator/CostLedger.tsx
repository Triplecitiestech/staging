"use client";
import React from "react";
import { costsConfig } from "@/lib/sales-calculator/config";
import { currency } from "@/lib/sales-calculator/format";
import { Card, Pill } from "./ui";

export function CostLedger() {
  const lines = costsConfig.lines as any[];
  const labels = costsConfig.unitLabels as Record<string, string>;
  const order = ["perDevice", "perUser", "perSite", "perServer", "perDomain", "perTenant"];
  const grouped: Record<string, any[]> = {};
  for (const l of lines) (grouped[l.unit] = grouped[l.unit] || []).push(l);

  return (
    <div className="space-y-5">
      <Card title="Line-Item Cost Ledger" subtitle="What TCT actually pays per unit (for verification). Quote math uses package bundle totals; this view is to confirm every cost is captured and accurate.">
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <Pill tone="ok">Confirmed (invoice)</Pill>
          <Pill tone="warn">Verify against invoice</Pill>
          <Pill tone="danger">Missing cost</Pill>
        </div>
        {order.filter((u) => grouped[u]).map((unit) => {
          const items = grouped[unit];
          const known = items.filter((i) => typeof i.cost === "number");
          const subtotal = known.reduce((a, i) => a + i.cost, 0);
          return (
            <div key={unit} className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-semibold text-accent">{labels[unit] || unit}</div>
                <div className="text-xs text-muted">subtotal (known): <span className="text-ink font-medium">{currency(subtotal, { cents: true })}</span></div>
              </div>
              <div className="overflow-x-auto tct-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-line">
                      <th className="py-1.5 pr-3 font-medium">Product</th>
                      <th className="py-1.5 px-3 font-medium">Vendor</th>
                      <th className="py-1.5 px-3 font-medium text-right">Unit Cost</th>
                      <th className="py-1.5 pl-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-b border-line align-top">
                        <td className="py-1.5 pr-3 text-ink">
                          {i.product}
                          {(i.covers || i.note) && <div className="text-xs text-faint">{i.covers || i.note}</div>}
                        </td>
                        <td className="py-1.5 px-3 text-muted">{i.vendor}</td>
                        <td className="py-1.5 px-3 text-right">{typeof i.cost === "number" ? currency(i.cost, { cents: true }) : <span className="text-danger">—</span>}</td>
                        <td className="py-1.5 pl-3">
                          {typeof i.cost !== "number" ? <Pill tone="danger">Missing</Pill> : i.verify ? <Pill tone="warn">Verify</Pill> : <Pill tone="ok">Confirmed</Pill>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </Card>

      <Card title="TCT Overhead (cost-to-serve)" subtitle="Vendor costs that are NOT billed per customer — TCT operational tooling. Useful for blended margin, not for the quote.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-1.5 pr-3 font-medium">Item</th>
              <th className="py-1.5 px-3 font-medium">Vendor</th>
              <th className="py-1.5 pl-3 font-medium text-right">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {(costsConfig.overhead as any[]).map((o, idx) => (
              <tr key={idx} className="border-b border-line align-top">
                <td className="py-1.5 pr-3 text-ink">{o.product}<div className="text-xs text-faint">{o.note}</div></td>
                <td className="py-1.5 px-3 text-muted">{o.vendor}</td>
                <td className="py-1.5 pl-3 text-right text-ink">{currency(o.monthly, { cents: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
