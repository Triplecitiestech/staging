"use client";
import React from "react";
import { getServices, getPackages, serviceDisplayState } from "@/lib/sales-calculator/config";
import { PackageQuote } from "@/lib/sales-calculator/types";
import { Card } from "./ui";
import { Check, X, Clock, Users } from "lucide-react";

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
  const pkg = getPackages().find((p) => p.id === quote.packageId);
  const grouped: Record<string, typeof services> = {};
  for (const s of services) (grouped[s.unit] = grouped[s.unit] || []).push(s);

  const includedCount = services.filter((s) => serviceDisplayState(s, quote.packageId) === "included").length;
  const billableCount = services.filter((s) => serviceDisplayState(s, quote.packageId) === "billable").length;
  const sharedCount = services.filter((s) => serviceDisplayState(s, quote.packageId) === "shared").length;

  return (
    <Card
      title="Service Catalog"
      subtitle={`${quote.packageName} — ${includedCount} of ${services.length} capabilities included${billableCount ? `, ${billableCount} available hourly (T&M)` : ""}${sharedCount ? `, ${sharedCount} shared with your internal IT` : ""}. ${showInternal ? "Internal view shows products & vendors." : "Customer-facing capabilities."}`}
    >
      {pkg?.supportModel && (
        <div className="mb-5 rounded-[12px] bg-accent/10 ring-1 ring-accent/25 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-0.5">Support model — {pkg.supportModel.label}</div>
          <p className="text-sm text-body2">{pkg.supportModel.detail}</p>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
        {unitOrder.filter((u) => grouped[u]).map((unit) => (
          <div key={unit}>
            <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">{unitLabels[unit] || unit}</div>
            <ul className="space-y-1.5">
              {grouped[unit].map((s) => {
                const state = serviceDisplayState(s, quote.packageId);
                return (
                  <li key={s.id} className={"flex items-start gap-2 text-sm " + (state === "none" ? "text-faint" : "text-ink")}>
                    {state === "included" && <Check size={15} className="text-ok mt-0.5 shrink-0" />}
                    {state === "billable" && <Clock size={14} className="text-accent mt-0.5 shrink-0" />}
                    {state === "shared" && <Users size={15} className="text-teal2 mt-0.5 shrink-0" />}
                    {state === "none" && <X size={14} className="text-faint mt-0.5 shrink-0" />}
                    <span>
                      {s.externalName}
                      {state === "billable" && <span className="text-accent"> — billed hourly (T&M)</span>}
                      {state === "shared" && <span className="text-teal2"> — shared with your internal IT</span>}
                      {showInternal && <span className="text-muted"> — {s.internalName} ({s.vendor})</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1"><Check size={12} className="text-ok" /> Included</span>
        <span className="inline-flex items-center gap-1"><Clock size={12} className="text-accent" /> Available — billed hourly (T&amp;M)</span>
        {sharedCount > 0 && <span className="inline-flex items-center gap-1"><Users size={12} className="text-teal2" /> Shared — delivered jointly with your internal IT</span>}
        <span className="inline-flex items-center gap-1"><X size={12} className="text-faint" /> Not available</span>
      </p>
    </Card>
  );
}
