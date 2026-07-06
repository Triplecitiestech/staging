"use client";
import React from "react";
import { getServices } from "@/lib/sales-calculator/config";
import { PackageQuote } from "@/lib/sales-calculator/types";
import { Card, Pill } from "./ui";
import { Check, X } from "lucide-react";

const unitLabels: Record<string, string> = {
  perUser: "Per User",
  perDevice: "Per Device / Endpoint",
  perSite: "Per Site / Location",
  perServer: "Per Server",
  perDomain: "Per Domain",
  perTenant: "Per Company (tenant)",
  service: "Included for all clients",
};
const unitOrder = ["perDevice", "perUser", "perSite", "perServer", "perDomain", "perTenant", "service"];

export function Catalog({ showInternal, quote }: { showInternal: boolean; quote: PackageQuote }) {
  const services = getServices();
  const grouped: Record<string, typeof services> = {};
  for (const s of services) (grouped[s.unit] = grouped[s.unit] || []).push(s);

  const includedCount = services.filter((s) => s.include?.[quote.packageId]).length;

  return (
    <Card
      title="Service Catalog"
      subtitle={`${quote.packageName} — ${includedCount} of ${services.length} capabilities included. ${showInternal ? "Internal view shows products & vendors." : "Customer-facing capabilities."}`}
    >
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
        {unitOrder.filter((u) => grouped[u]).map((unit) => (
          <div key={unit}>
            <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">{unitLabels[unit] || unit}</div>
            <ul className="space-y-1.5">
              {grouped[unit].map((s) => {
                const inc = !!s.include?.[quote.packageId];
                return (
                  <li key={s.id} className={"flex items-start gap-2 text-sm " + (inc ? "text-ink" : "text-faint")}>
                    {inc ? <Check size={15} className="text-ok mt-0.5 shrink-0" /> : <X size={14} className="text-faint mt-0.5 shrink-0" />}
                    <span>
                      {s.externalName}
                      {showInternal && <span className="text-muted"> — {s.internalName} ({s.vendor})</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
